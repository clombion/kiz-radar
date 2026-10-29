"""Fare store and refresh scheduler.

docs/data/fares.csv      one row per (airport, Friday out, Monday back): price in EUR and when it was fetched
pipeline/fare_jobs.csv   one row per festival weekend (airport, Friday): when it was last searched and how it went

Only festival weekends are searched: the Friday-to-Monday return from home to the airport of each upcoming festival,
once per airport and weekend however many festivals share it. A weekend is due again after an interval that grows
with how far away it is (WEEKS_APART), and it is searched on its own weekday, fixed by the airport and the date, so
each day's run checks about a seventh of the weekends. A weekend that has never been searched, or is overdue by
twice its interval, doesn't wait for its weekday. Weekends further ahead than Google sells (SELLS_DAYS) wait.

Past weekends, and weekends no upcoming festival uses any more, leave both files. A weekend Google returns no price
for is recorded as such, its old fare dropped, and tried again at its next interval. A search that gives no answer
(pipeline/calls.py: fli timed out, or wrote what can't be read) records nothing, so the weekend is tried again on the
next run, which fails naming it. Google sometimes refuses a single search (HTTP 429), so a refused search is tried once
more after a minute; refused again, it stops the run. Both files are saved after every search, so a run stopped half
way keeps what it found. The weekends are the festivals' in the export, by the flight rule of pipeline/airports.py.

    mise run fares -- refresh --budget 20      # what the GitHub Action runs
    mise run fares -- plan                     # show what is due, without searching
"""

import argparse
import datetime as dt
import functools
import os
import shlex
import subprocess
import sys
import time
import zlib
from collections.abc import Mapping
from dataclasses import dataclass
from typing import NamedTuple

from pydantic import BaseModel, ConfigDict, ValidationError

from pipeline import airports, calls, export
from pipeline.calls import Declined
from pipeline.enums import CallCause, FareSearch, Listing
from pipeline.records import Date, Fare, Job, Record, day_of, now

FLI_SHA = '881aee5ff4321e81ea2157cb44be94ce6a21dc1b'  # punitarani/fli, the only place the version is pinned
FLI = os.environ.get('FLI_CMD', f'uvx -q --from git+https://github.com/punitarani/fli@{FLI_SHA} fli')
SELLS_DAYS = 330  # Google sells about 11 months ahead
# (days until the Friday, days between searches): weekly when it is close, every six weeks when it is far
WEEKS_APART = [(35, 7), (91, 14), (182, 28), (SELLS_DAYS, 42)]
PAUSE = 10  # seconds between searches; Google refuses after about 20 searches 5 seconds apart
RETRY_AFTER = 60  # seconds to wait before trying a refused search once more
TIMEOUT = 300  # seconds a search may take
REFUSED = 'Google refused the search (HTTP 429)'
NOTE_LENGTH = 200  # a search's note is cut to this many characters
DAY = 86400  # seconds
NEVER = 99  # how overdue a weekend never searched counts as, in intervals


class Missed(NamedTuple):
    """A search Google answered with no fare, and fli's words."""

    note: str


class Fli(BaseModel):
    """fli's answer, as far as it is read."""

    model_config = ConfigDict(extra='ignore', frozen=True)


class FliDate(Fli):
    price: float | None = None
    departure_date: Date | None = None
    return_date: Date | None = None
    currency: str = 'EUR'  # the one asked for, which a Fare holds


class FliError(Fli):
    message: str = ''


class FliAnswer(Fli):
    success: bool = False
    dates: tuple[FliDate, ...] = ()
    error: FliError | None = None


@dataclass(frozen=True)
class Weekend:
    """A festival weekend in the queue: when it is, how often it is searched, how long since it was, and whether it
    is due today."""

    airport: str
    friday: dt.date
    days_away: int
    every: int | None  # None: further ahead than Google sells
    age: float | None  # in days; None when it was never searched
    due: bool

    @property
    def overdue(self) -> float:
        """How many intervals since it was searched."""
        return self.age / self.every if self.age is not None and self.every else NEVER


class Listed(Record):
    """A festival of the export still listed and not cancelled: its city and its first day."""

    city: str | None
    country: str | None
    start_date: str


@functools.cache
def weekends(today: dt.date) -> set[tuple[str, dt.date]]:
    """(airport, Friday) of every festival still listed and not cancelled, a trip to which leaves after today, to an
    airport other than home (pipeline/airports.py)."""
    with export.opened('ro') as db:
        listed = db.rows(
            Listed,
            "select nullif(city, '') as city, nullif(country, '') as country, start_date from events"
            ' where cancelled is not 1 and listing = ?',
            (Listing.LISTED,),
        )
    geo, to, home = airports.places(), airports.known(), airports.home()
    out: set[tuple[str, dt.date]] = set()
    for e in listed:
        friday = airports.weekend_friday(day_of(e.start_date))
        if (p := airports.placed(e.city, e.country, geo, to)) and p.airport and p.airport != home and friday > today:
            out.add((p.airport, friday))
    return out


def interval(days_away: int) -> int | None:
    return next((every for until, every in WEEKS_APART if days_away <= until), None)


def weekday_of(airport: str, friday: dt.date) -> int:
    """The weekday (0 = Monday) a weekend is searched on: fixed, and spread evenly across the week."""
    return zlib.crc32(f'{airport} {friday}'.encode()) % 7


def queue(t: dt.datetime | None = None) -> list[Weekend]:
    """Every festival weekend with its interval and whether it is due today, the most overdue first."""
    t = t or now()
    today = t.date()
    jobs = {(j.airport, j.depart): j for j in Job.read()}
    fetched: dict[tuple[str, dt.date], dt.datetime] = {}
    for f in Fare.read():  # a weekend priced before it had a job counts as searched then
        k = (f.airport, f.depart)
        fetched[k] = max(fetched.get(k, f.fetched_at), f.fetched_at)
    q: list[Weekend] = []
    for airport, friday in weekends(today):
        days_away = (friday - today).days
        every = interval(days_away)
        job = jobs.get((airport, friday))
        last = job.last_run if job else fetched.get((airport, friday))
        age = (t - last).total_seconds() / DAY if last is not None else None
        on_day = weekday_of(airport, friday) == today.weekday()
        due = every is not None and (age is None or (age >= every and on_day) or age >= 2 * every)
        q.append(Weekend(airport, friday, days_away, every, age, due))
    return sorted(q, key=lambda w: (not w.due, -w.overdue, w.friday))


def search(airport: str, friday: dt.date) -> Fare | Missed | Declined:
    """One Friday-to-Monday return: its fare, Google's answer that it has none, or why there is no answer (refused,
    the one transient cause the run stops on)."""
    day = friday.isoformat()
    args = ['dates', airports.home(), airport, '--from', day, '--to', day, '-d', '3', '--round', '--friday']
    cmd = [*shlex.split(FLI), *args, '--currency', 'EUR', '--format', 'json']
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT, check=False)  # noqa: S603 (fli, pinned in FLI, with arguments of ours)
    except subprocess.TimeoutExpired:
        return Declined(CallCause.TRANSIENT, f'fli took over {TIMEOUT} s')
    if 'HTTP 429' in p.stderr or '"http_status": 429' in p.stdout:
        return Declined(CallCause.TRANSIENT, REFUSED)
    try:
        d = FliAnswer.model_validate_json(p.stdout[p.stdout.index('{') :])
    except (ValueError, ValidationError):
        why = (p.stderr.strip().splitlines() or ['no output'])[-1][:NOTE_LENGTH]
        return Declined(CallCause.TRANSIENT, f'fli wrote no answer: {why}')
    x = next((x for x in d.dates if x.price and x.departure_date == friday), None)
    if not d.success or not x or x.price is None or x.return_date is None:
        return Missed((d.error.message if d.error else '')[:NOTE_LENGTH])
    if x.currency != 'EUR':
        return Declined(CallCause.STRUCTURAL, f'fli gave a price in {x.currency}, not the EUR it was asked')
    return Fare(
        airport=airport,
        depart=friday,
        return_=x.return_date,
        price=round(x.price),
        currency='EUR',
        fetched_at=now(),
    )


def refresh(budget: int, max_seconds: int) -> None:
    """Search the weekends due today, most overdue first, saving both files after each; exits 1 naming the searches
    that gave no answer, a refusal or a stop first."""
    start, today = time.time(), now().date()
    live = weekends(today)
    fares = {(r.airport, r.depart, r.return_): r for r in Fare.read() if (r.airport, r.depart) in live}
    jobs = {(j.airport, j.depart): j for j in Job.read() if (j.airport, j.depart) in live}
    save(fares, jobs)  # past weekends and ones no festival uses any more leave both files
    done, declined = 0, list[tuple[str, Declined]]()
    for item in queue():
        if not item.due or done >= budget or time.time() - start > max_seconds:
            break
        found = search(item.airport, item.friday)
        if isinstance(found, Declined) and found.why == REFUSED:
            time.sleep(RETRY_AFTER)
            found = search(item.airport, item.friday)
        where = f'{item.airport} {item.friday}'
        match found:
            case Declined():
                print(f'{where} ({item.days_away} days away): no answer: {found.why}', flush=True)
                declined.append((where, found))
                if found.why == REFUSED or found.stops:
                    break
                continue
            case Fare():
                fares[(found.airport, found.depart, found.return_)] = found
                status, note, said = FareSearch.PRICED, '', f'{found.price} EUR'
            case Missed(note):
                fares = {k: f for k, f in fares.items() if (f.airport, f.depart) != (item.airport, item.friday)}
                status, said = FareSearch.NO_PRICE, note
        print(f'{where} ({item.days_away} days away): {status} {said}', flush=True)
        jobs[(item.airport, item.friday)] = Job(
            airport=item.airport, depart=item.friday, last_run=now(), status=status, note=note
        )
        save(fares, jobs)
        done += 1
        time.sleep(PAUSE)
    print(f'{done} searches; {len(fares)} fares stored for {len(live)} festival weekends')
    if why := calls.failed('searches', declined):
        sys.exit(why)


def save(fares: Mapping[tuple[str, dt.date, dt.date], Fare], jobs: Mapping[tuple[str, dt.date], Job]) -> None:
    Fare.write(sorted(fares.values(), key=lambda f: (f.airport, f.depart, f.return_)))
    Job.write(sorted(jobs.values(), key=lambda j: (j.airport, j.depart)))


def plan() -> None:
    q = queue()
    due = [x for x in q if x.due]
    print(f'{len(due)} of {len(q)} festival weekends due today')
    for x in due:
        seen = f'searched {x.age:.0f} days ago' if x.age is not None else 'never searched'
        print(f'{x.airport} {x.friday}: {x.days_away} days away, every {x.every} days, {seen}')


class Args(argparse.Namespace):
    cmd: str = ''
    budget: int = 20
    max_seconds: int = 1200


def main() -> None:
    ap = argparse.ArgumentParser(description='Search Friday-to-Monday fares for festival weekends that are due.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('refresh', help='search the weekends due today and save the fares')
    _ = r.add_argument('--budget', type=int, default=20, help='most searches in this run')
    _ = r.add_argument('--max-seconds', type=int, default=1200, help='stop starting searches after this long')
    _ = sub.add_parser('plan', help='list the weekends due today, without searching')
    a = ap.parse_args(namespace=Args())
    if a.cmd == 'refresh':
        refresh(a.budget, a.max_seconds)
    else:
        plan()


if __name__ == '__main__':
    main()
