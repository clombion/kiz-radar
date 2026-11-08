"""Fare store and refresh scheduler.

pipeline/fares.csv       one row per (airport, Friday out): the price in EUR of the cheapest return NIGHTS later, its
                         stops (out and back together), and when it was fetched
pipeline/fare_jobs.csv   one row per festival weekend (airport, Friday): when it was last searched, and for an extra
                         airport whether it has a direct flight that weekend

Only festival weekends are searched: the Friday-to-Monday return from home to the airports of each upcoming festival
(pipeline/airports.py: every airport within MAX_AIRPORT_KM of its city), once per airport and weekend however many
festivals share it. A weekend is due again after an interval that grows with how far away it is (WEEKS_APART), and it
is searched on its own weekday, fixed by the airport and the date, so each day's run checks about a seventh of the
weekends. A weekend that has never been searched, or is overdue by twice its interval, doesn't wait for its weekday.
Weekends further ahead than Google sells (SELLS_DAYS) wait.

A festival's nearest airport is searched for any flight, at that interval. Its other airports (extras) are a way
round the nearest, worth it only by a direct flight: they are searched for direct flights alone, EXTRA_SLOWER times
less often, and after every weekend of the nearest airports that is due, within the run's budget. An extra that has no
direct flight that weekend is marked so (fare_jobs.direct 0), and the airport is not searched as an extra again for
any weekend for NO_DIRECT_DAYS, unless one of its weekends has a direct flight: a route from home runs most weeks of a
season or not at all, and most airports within reach of a festival have none. An airport that is the nearest of any
festival that weekend is searched as the nearest.

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
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import NamedTuple

from pydantic import BaseModel, ConfigDict, ValidationError

from pipeline import airports, calls, export
from pipeline.calls import Declined
from pipeline.enums import CallCause, Listing
from pipeline.records import Fare, Job, Record, day_of, now

FLI_SHA = '881aee5ff4321e81ea2157cb44be94ce6a21dc1b'  # punitarani/fli, the only place the version is pinned
FLI = os.environ.get('FLI_CMD', f'uvx -q --from git+https://github.com/punitarani/fli@{FLI_SHA} fli')
NIGHTS = 3  # a weekend's flight is out on the Friday and back on the Monday, the one place this is said
SELLS_DAYS = 330  # Google sells about 11 months ahead
# (days until the Friday, days between searches): weekly when it is close, every six weeks when it is far
WEEKS_APART = [(35, 7), (91, 14), (182, 28), (SELLS_DAYS, 42)]
EXTRA_SLOWER = 2  # an extra airport's weekend is searched this many times less often than a nearest airport's
PAUSE = 10  # seconds between searches; Google refuses after about 20 searches 5 seconds apart
RETRY_AFTER = 60  # seconds to wait before trying a refused search once more
TIMEOUT = 300  # seconds a search may take
REFUSED = 'Google refused the search (HTTP 429)'
NOTE_LENGTH = 200  # a search's note is cut to this many characters
DAY = 86400  # seconds
# airlines have their flights on sale this far ahead: a weekend further on may lack one that will fly
SCHEDULED_DAYS = 91
NO_DIRECT_DAYS = 182  # an airport with no direct flight from home is searched as an extra again a season on
NEVER = 99  # how overdue a weekend never searched counts as, in intervals


class Missed(NamedTuple):
    """A search Google answered with no fare, and fli's words; listed when it showed flights all the same, with no
    price (Widerøe's, which Google leaves to the airline to price)."""

    note: str
    listed: bool = False


class Fli(BaseModel):
    """fli's answer, as far as it is read."""

    model_config = ConfigDict(extra='ignore', frozen=True)


class FliTrip(Fli):
    """A return trip of fli's flights search: its price for both ways (Google puts it on the way out), and their stops
    together."""

    price: float | None = None
    currency: str = 'EUR'  # the one asked for, in which a Fare's price is
    stops: int | None = None


class FliError(Fli):
    message: str = ''


class FliAnswer(Fli):
    success: bool = False
    flights: tuple[FliTrip, ...] = ()
    error: FliError | None = None


@dataclass(frozen=True)
class Weekend:
    """A festival weekend in the queue: when it is, how often it is searched, how long since it was, and whether it
    is due today."""

    airport: str
    friday: dt.date
    nearest: bool  # the nearest airport of a festival that weekend; else an extra, searched for direct flights alone
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
def weekends(today: dt.date) -> dict[tuple[str, dt.date], bool]:
    """(airport, Friday) of every festival still listed and not cancelled, a trip to which leaves after today, to each
    of its airports other than home (pipeline/airports.py), and whether it is the nearest of any festival then."""
    with export.opened('ro') as db:
        listed = db.rows(
            Listed,
            "select nullif(city, '') as city, nullif(country, '') as country, start_date from events"
            ' where cancelled is not 1 and listing = ?',
            (Listing.LISTED,),
        )
    geo, to, home = airports.places(), airports.known(), airports.home()
    out: dict[tuple[str, dt.date], bool] = {}
    for e in listed:
        friday = airports.weekend_friday(day_of(e.start_date))
        p = airports.placed(e.city, e.country, geo, to)
        if p is None or friday <= today or p.airport == home:
            continue  # a festival flown to from home needs no flight
        for i, c in enumerate(p.candidates):
            if c.airport != home:
                out[(c.airport, friday)] = out.get((c.airport, friday), False) or i == 0
    return out


def interval(days_away: int, *, nearest: bool = True) -> int | None:
    every = next((every for until, every in WEEKS_APART if days_away <= until), None)
    return every if every is None or nearest else every * EXTRA_SLOWER


def weekday_of(airport: str, friday: dt.date) -> int:
    """The weekday (0 = Monday) a weekend is searched on: fixed, and spread evenly across the week."""
    return zlib.crc32(f'{airport} {friday}'.encode()) % 7


def queue(t: dt.datetime | None = None) -> list[Weekend]:
    """Every festival weekend with its interval and whether it is due today: the nearest airports' due first, the most
    overdue first, then the extras'. An extra is in it no more while its airport has no direct flight (no_direct)."""
    t = t or now()
    today = t.date()
    jobs = {(j.airport, j.depart): j for j in Job.read()}
    none = no_direct(jobs.values(), t)
    q: list[Weekend] = []
    for (airport, friday), nearest in weekends(today).items():
        job = jobs.get((airport, friday))
        if not nearest and (airport in none or (job is not None and job.direct is False)):
            continue
        days_away = (friday - today).days
        every = interval(days_away, nearest=nearest)
        last = job.last_run if job else None
        age = (t - last).total_seconds() / DAY if last is not None else None
        on_day = weekday_of(airport, friday) == today.weekday()
        due = every is not None and (age is None or (age >= every and on_day) or age >= 2 * every)
        q.append(Weekend(airport, friday, nearest, days_away, every, age, due))
    return sorted(q, key=lambda w: (not w.due, not w.nearest, -w.overdue, w.friday, w.airport))


def no_direct(jobs: Iterable[Job], t: dt.datetime) -> set[str]:
    """The airports searched as an extra in the last NO_DIRECT_DAYS, for a weekend within SCHEDULED_DAYS of the search,
    with no direct flight, none of whose weekends has one."""
    found = {j.airport for j in jobs if j.direct}
    recent = dt.timedelta(days=NO_DIRECT_DAYS)
    return {
        j.airport
        for j in jobs
        if j.direct is False and t - j.last_run < recent and (j.depart - j.last_run.date()).days <= SCHEDULED_DAYS
    } - found


def search(airport: str, friday: dt.date, *, direct: bool = False) -> Fare | Missed | Declined:
    """One Friday-to-Monday return, the cheapest (direct flights alone when asked): its fare and stops, Google's answer
    that it has none, or why there is no answer (refused, the one transient cause the run stops on). fli searches the
    cheapest way out, then its ways back (--top-n 1)."""
    back = (friday + dt.timedelta(days=NIGHTS)).isoformat()
    args = ['flights', airports.home(), airport, friday.isoformat(), '--return', back, '--sort', 'CHEAPEST']
    args += ['--top-n', '1', *(['--stops', 'NON_STOP'] if direct else [])]
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
    return fare_in(d, airport, friday)


def fare_in(d: FliAnswer, airport: str, friday: dt.date) -> Fare | Missed | Declined:
    """The cheapest return fli's answer gives for the weekend, with its stops: none, when Google has no price (or no
    flight of those asked for, or flights with no price); refused, when it is not in the EUR asked."""
    priced = [x for x in d.flights if x.price]
    if not d.success or not priced:
        return Missed((d.error.message if d.error else '')[:NOTE_LENGTH], listed=d.success and bool(d.flights))
    x = min(priced, key=lambda x: x.price or 0)
    if x.currency != 'EUR':
        return Declined(CallCause.STRUCTURAL, f'fli gave a price in {x.currency}, not the EUR it was asked')
    return Fare(airport=airport, depart=friday, price=round(x.price or 0), fetched_at=now(), stops=x.stops)


def refresh(budget: int, max_seconds: int) -> None:
    """Search the weekends due today, most overdue first, saving both files after each; exits 1 naming the searches
    that gave no answer, a refusal or a stop first."""
    start, today = time.time(), now().date()
    live = weekends(today)
    fares = {(r.airport, r.depart): r for r in Fare.read() if (r.airport, r.depart) in live}
    jobs = {(j.airport, j.depart): j for j in Job.read() if (j.airport, j.depart) in live}
    save(fares, jobs)  # past weekends and ones no festival uses any more leave both files
    done, declined = 0, list[tuple[str, Declined]]()
    for item in queue():
        if not item.due or done >= budget or time.time() - start > max_seconds:
            break
        if not item.nearest and item.airport in no_direct(jobs.values(), now()):
            continue  # found with no direct flight earlier in this run
        direct = not item.nearest
        found = search(item.airport, item.friday, direct=direct)
        if isinstance(found, Declined) and found.why == REFUSED:
            time.sleep(RETRY_AFTER)
            found = search(item.airport, item.friday, direct=direct)
        where = f'{item.airport} {item.friday}{"" if item.nearest else " direct"}'
        match found:
            case Declined():
                print(f'{where} ({item.days_away} days away): no answer: {found.why}', flush=True)
                declined.append((where, found))
                if found.why == REFUSED or found.stops:
                    break
                continue
            case Fare():
                fares[(found.airport, found.depart)] = found
                said = f'{found.price} EUR, {found.stops} stops'
            case Missed(note, listed):
                _ = fares.pop((item.airport, item.friday), None)
                said = f'no price {note}' if item.nearest or listed else 'no direct flight'
        print(f'{where} ({item.days_away} days away): {said}', flush=True)
        jobs[(item.airport, item.friday)] = Job(
            airport=item.airport,
            depart=item.friday,
            last_run=now(),
            direct=None if item.nearest else isinstance(found, Fare) or found.listed,
        )
        save(fares, jobs)
        done += 1
        time.sleep(PAUSE)
    print(f'{done} searches; {len(fares)} fares stored for {len(live)} festival weekends')
    if why := calls.failed('searches', declined):
        sys.exit(why)


def save(fares: Mapping[tuple[str, dt.date], Fare], jobs: Mapping[tuple[str, dt.date], Job]) -> None:
    """Both files, the fares first: a run stopped between them leaves a weekend's new fare beside its old search, so it
    is searched again, where the other order would keep its old fare (or none) as if the new search had found it."""
    Fare.write(sorted(fares.values(), key=lambda f: (f.airport, f.depart)))
    Job.write(sorted(jobs.values(), key=lambda j: (j.airport, j.depart)))


def plan() -> None:
    q = queue()
    due = [x for x in q if x.due]
    print(f'{len(due)} of {len(q)} festival weekends due today')
    for x in due:
        seen = f'searched {x.age:.0f} days ago' if x.age is not None else 'never searched'
        kind = '' if x.nearest else ', direct flights'
        print(f'{x.airport} {x.friday}: {x.days_away} days away, every {x.every} days{kind}, {seen}')


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
