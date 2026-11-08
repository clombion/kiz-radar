"""Fare searches, when each festival weekend is searched again, and the fares the site shows.

Every search is kept with the offers it saw in the fare history (pipeline/fare_offers/, pipeline/fare_store.py): the
run's file is written after each search, so a run stopped half way keeps what it found. The site's fares are derived
from it in the build (pipeline/fare_weekends.py current): for each festival weekend still to come, the latest search
from home that did not fail gives the card its fare, the cheapest offer on one ticket. A search that found no price
drops the weekend's fare; one that failed is no search of it.

Only festival weekends are searched: the Friday-to-Monday return from home to the airports of each upcoming festival
(pipeline/airports.py: every airport within MAX_AIRPORT_KM of its city), once per airport and weekend however many
festivals share it. A weekend is due again after an interval that grows with how far away it is (WEEKS_APART), and it is
searched on its own weekday, fixed by the airport and the date, so each day's run checks about a seventh of the
weekends. A weekend that has never been searched, or is overdue by twice its interval, doesn't wait for its weekday.
Weekends further ahead than Google sells (SELLS_DAYS) wait.

A festival's nearest airport is searched for any flight, at that interval. Its other airports (extras) are a way round
the nearest, worth it only by a direct flight: they are searched for direct flights alone, EXTRA_SLOWER times less
often, and after every weekend of the nearest airports that is due, within the run's budget. An extra that has no direct
flight that weekend is not searched as an extra again for any weekend for NO_DIRECT_DAYS, unless one of its weekends has
a direct flight: a route from home runs most weeks of a season or not at all, and most airports within reach of a
festival have none. An airport that is the nearest of any festival that weekend is searched as the nearest.

Google is read on its outbound page, one request a search (pipeline/fli_page.py): its price is the return's, its stops
those out. Google sometimes refuses a search (HTTP 429), so a refused search is tried once more after a minute; refused
again, it stops the run. A search fli fails on is kept as failed, and the run fails at its end naming it. Each weekend
Google answered is asked of Kiwi.com's flight search the same (kiwi), its trips kept with the airlines flying them and
the tickets they are booked on (ticket): its cheapest self-transfer, when cheaper, is added to the weekend's Flights,
and its cheapest on one ticket is the card's where Google lists flights with no price (Widerøe's, which it leaves to the
airline). Its price is a reseller's, and the site says so; its failure fails no run.

    mise run fares -- refresh --budget 20      # what the GitHub Action runs
    mise run fares -- plan                     # show what is due, without searching
    mise run fares -- show --airport LIS       # the searches kept, the latest first
"""

import argparse
import datetime as dt
import json
import sys
import time
import zlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import NamedTuple, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from pipeline import airports, calls, fare_store, fare_weekends, fli_page, web
from pipeline.calls import Declined
from pipeline.enums import FareMode, FareOutcome, FareTicket, FareVendor
from pipeline.fare_weekends import NIGHTS, current, direct_found, latest
from pipeline.records import Offer, Search, digest, now

SELLS_DAYS = 330  # Google sells about 11 months ahead
# (days until the Friday, days between searches): weekly when it is close, every six weeks when it is far
WEEKS_APART = [(35, 7), (91, 14), (182, 28), (SELLS_DAYS, 42)]
EXTRA_SLOWER = 2  # an extra airport's weekend is searched this many times less often than a nearest airport's
PAUSE = 10  # seconds between searches; Google refused after 22 requests 10 seconds apart (2026-11-08)
RETRY_AFTER = 60  # seconds to wait before trying a refused search once more
KIWI_PAUSE = 3  # seconds between a weekend's search of Google and the reseller's
NOTE_LENGTH = 200  # a search's note is cut to this many characters
DAY = 86400  # seconds
# airlines have their flights on sale this far ahead: a weekend further on may lack one that will fly
SCHEDULED_DAYS = 91
NO_DIRECT_DAYS = 182  # an airport with no direct flight from home is searched as an extra again a season on
NEVER = 99  # how overdue a weekend never searched counts as, in intervals


class Answer(BaseModel):
    """The reseller's answer, as far as it is read."""

    model_config = ConfigDict(extra='ignore', frozen=True)


# A reseller: Kiwi.com's flight search, open to all with no key. Its price is above the airline's own, and the site
# says so.
RESELLER = web.Https('mcp.kiwi.com', '/')
RESELLER_HEADERS = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}


class ResoldFlight(Answer):
    airline: str = Field(alias='carrierName')


class ResoldLeg(Answer):
    stops: int
    segments: tuple[ResoldFlight, ...]


class ResoldTrip(Answer):
    """A trip of the reseller's: its price, its legs, and its id, a part for each flight (out, then back) that starts
    with the fare component the flight is booked in."""

    id: str
    price: float
    outbound: ResoldLeg
    inbound: ResoldLeg

    @model_validator(mode='after')
    def a_part_per_flight(self) -> Self:
        if len(self.id.split('|')) != len(self.outbound.segments) + len(self.inbound.segments):
            raise ValueError(f'the trip {self.id} has not one part per flight')
        return self


class Resold(Answer):
    """The reseller's answer: its trips."""

    itineraries: tuple[ResoldTrip, ...] = ()


class RpcText(Answer):
    text: str = ''


class RpcResult(Answer):
    content: tuple[RpcText, ...] = ()
    failed: bool = Field(default=False, alias='isError')


class Rpc(Answer):
    result: RpcResult | None = None


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

    @property
    def mode(self) -> FareMode:
        return FareMode.ANY if self.nearest else FareMode.DIRECT


def interval(days_away: int, *, nearest: bool = True) -> int | None:
    every = next((every for until, every in WEEKS_APART if days_away <= until), None)
    return every if every is None or nearest else every * EXTRA_SLOWER


def weekday_of(airport: str, friday: dt.date) -> int:
    """The weekday (0 = Monday) a weekend is searched on: fixed, and spread evenly across the week."""
    return zlib.crc32(f'{airport} {friday}'.encode()) % 7


def queue(t: dt.datetime | None = None, history: Sequence[Search] | None = None) -> list[Weekend]:
    """Every festival weekend with its interval and whether it is due today: the nearest airports' due first, the most
    overdue first, then the extras'. An extra is in it no more while its airport has no direct flight (no_direct)."""
    t = t or now()
    today = t.date()
    last = latest(fare_store.read() if history is None else history)
    none = no_direct(last.values(), t)
    q: list[Weekend] = []
    for (airport, friday), nearest in fare_weekends.weekends(today).items():
        s = last.get((airport, friday))
        if not nearest and (airport in none or (s is not None and direct_found(s) is False)):
            continue
        days_away = (friday - today).days
        every = interval(days_away, nearest=nearest)
        age = (t - s.at).total_seconds() / DAY if s is not None else None
        on_day = weekday_of(airport, friday) == today.weekday()
        due = every is not None and (age is None or (age >= every and on_day) or age >= 2 * every)
        q.append(Weekend(airport, friday, nearest, days_away, every, age, due))
    return sorted(q, key=lambda w: (not w.due, not w.nearest, -w.overdue, w.friday, w.airport))


def no_direct(searches: Iterable[Search], t: dt.datetime) -> set[str]:
    """The airports searched for direct flights in the last NO_DIRECT_DAYS, for a weekend within SCHEDULED_DAYS of the
    search, with none, none of whose weekends has one."""
    searches = list(searches)
    found = {s.airport for s in searches if direct_found(s)}
    recent = dt.timedelta(days=NO_DIRECT_DAYS)
    return {
        s.airport
        for s in searches
        if direct_found(s) is False and t - s.at < recent and (s.depart - s.at.date()).days <= SCHEDULED_DAYS
    } - found


class Asked(NamedTuple):
    """What a search asks: the Friday-to-Monday return from origin to airport, for which flights."""

    origin: str
    airport: str
    friday: dt.date
    mode: FareMode


def search(asked: Asked, vendor: FareVendor, found: tuple[Offer, ...] | str, *, listed: bool = False) -> Search:
    """A search made now: its offers (none when there is no price, listed when flights were, with none), or the
    words of its failure."""
    at = now()
    failed = isinstance(found, str)
    outcome = (
        FareOutcome.FAILED
        if failed
        else FareOutcome.OFFERS
        if found
        else FareOutcome.LISTED
        if listed
        else FareOutcome.NONE
    )
    return Search(
        id=digest(f'{" ".join(map(str, asked))} {vendor} {at.isoformat()}'),
        at=at,
        origin=asked.origin,
        airport=asked.airport,
        depart=asked.friday,
        mode=asked.mode,
        vendor=vendor,
        outcome=outcome,
        note=found[:NOTE_LENGTH] if failed else None,
        offers=() if failed else found,
    )


def google(asked: Asked) -> Search | Declined:
    """Google's outbound page for a Friday-to-Monday return (pipeline/fli_page.py): each way out priced, an offer on
    one ticket with its stops out; flights with no price listed; or why there is no page."""
    origin, airport, friday, mode = asked
    page = fli_page.page(origin, airport, friday, friday + dt.timedelta(days=NIGHTS), direct=mode == FareMode.DIRECT)
    if isinstance(page, Declined):
        return page
    offers = tuple(
        Offer(price=r.price, ticket=FareTicket.ONE_TICKET, stops_out=r.stops, stops_back=None, airlines=r.airlines)
        for r in page
        if r.price
    )
    return search(asked, FareVendor.GOOGLE, offers, listed=bool(page))


def kiwi(asked: Asked) -> Search:
    """The reseller's Friday-to-Monday returns (direct flights alone in direct mode), each an offer; failed, with
    why, when it gave no answer."""
    origin, airport, friday, mode = asked
    args = {
        'flyFrom': origin,
        'flyTo': airport,
        'departureDate': friday.strftime('%d/%m/%Y'),
        'returnDate': (friday + dt.timedelta(days=NIGHTS)).strftime('%d/%m/%Y'),
        'currency': 'EUR',
        'sort': 'price',
        **({'max_sector_stopovers': 0} if mode == FareMode.DIRECT else {}),
    }
    call = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'search-flight', 'arguments': args}}
    body = web.post(RESELLER, json.dumps(call).encode(), RESELLER_HEADERS)
    found = body.why if isinstance(body, Declined) else kiwi_offers(body.decode(errors='replace'))
    return search(asked, FareVendor.KIWI, found)


def kiwi_offers(answer: str) -> tuple[Offer, ...] | str:
    """The trips of the reseller's answer (server-sent events, the JSON on a data: line) as offers; or why it can't
    be read."""
    data = next(
        (line.removeprefix('data:').strip() for line in answer.splitlines() if line.startswith('data:')), answer
    )
    try:
        result = Rpc.model_validate_json(data).result
        if result is None or result.failed or not result.content:
            return f'the reseller gave no result: {answer[:NOTE_LENGTH]}'
        trips = Resold.model_validate_json(result.content[0].text).itineraries
    except ValidationError as e:
        return f'the reseller wrote what cannot be read: {calls.why(e)}'
    return tuple(
        Offer(
            price=t.price,
            ticket=ticket(t),
            stops_out=t.outbound.stops,
            stops_back=t.inbound.stops,
            airlines=tuple(s.airline for leg in (t.outbound, t.inbound) for s in leg.segments),
        )
        for t in trips
    )


def ticket(trip: ResoldTrip) -> FareTicket:
    """How the reseller's trip is booked: each part of its id starts with the fare component its flight is booked in
    (the part before its last _), so a way out or back whose flights are in more than one is on separate tickets, a
    self-transfer. A way out and a way back each on a ticket of its own is no self-transfer: no flight waits for
    another booked apart. The id's form is undocumented; tests/test_fares.py reads answers the reseller gave."""
    parts = [p.rsplit('_', 1)[0] for p in trip.id.split('|')]
    out = len(trip.outbound.segments)
    split = len(set(parts[:out])) > 1 or len(set(parts[out:])) > 1
    return FareTicket.SELF_TRANSFER if split else FareTicket.ONE_TICKET


@dataclass(frozen=True)
class Searched:
    """A weekend's searches, Google's first, and why Google gave no answer, when it gave none."""

    searches: tuple[Search, ...]
    declined: Declined | None = None


def searched(item: Weekend) -> Searched:
    """A weekend's search from home, tried once more after a minute when Google refuses it, kept as failed when it
    gives no answer; and when Google answered, the reseller's search of it too, KIWI_PAUSE later: its self-transfers
    for the weekend's Flights, and its fare on one ticket where Google listed flights with no price. The reseller's
    failure is kept, and fails nothing."""
    asked = Asked(airports.home(), item.airport, item.friday, item.mode)
    found = google(asked)
    if isinstance(found, Declined) and found.why == fli_page.REFUSED:
        time.sleep(RETRY_AFTER)
        found = google(asked)
    if isinstance(found, Declined):
        return Searched((search(asked, FareVendor.GOOGLE, found.why),), found)
    time.sleep(KIWI_PAUSE)
    return Searched((found, kiwi(asked)))


def said(found: Searched, item: Weekend) -> str:
    """What a weekend's searches found, in a line of the run's log."""
    g, *rest = found.searches
    match g.outcome:
        case FareOutcome.FAILED:
            words = f'no answer: {g.note}'
        case FareOutcome.OFFERS:
            words = f'{min(o.price for o in g.offers):.0f} EUR, {len(g.offers)} offers'
        case FareOutcome.LISTED:
            words = 'direct, no price' if not item.nearest else 'flights with no price'
        case FareOutcome.NONE:
            words = 'no direct flight' if not item.nearest else 'no price'
    for k in rest:
        priced = f'{min(o.price for o in k.offers):.0f} EUR' if k.offers else str(k.outcome)
        words += f'; the reseller: {priced}' + (f' ({k.note})' if k.note else '')
    return words


def refresh(budget: int, max_seconds: int) -> None:
    """Search the weekends due today, most overdue first, writing the run's file after each; exits 1 naming the
    searches that gave no answer, a refusal or a stop first."""
    start, history = time.time(), fare_store.read()
    path, kept = fare_store.run_file(now()), list[Search]()
    done, declined = 0, list[tuple[str, Declined]]()
    for item in queue(history=history):
        if not item.due or done >= budget or time.time() - start > max_seconds:
            break
        if not item.nearest and item.airport in no_direct(latest([*history, *kept]).values(), now()):
            continue  # found with no direct flight earlier in this run
        found = searched(item)
        kept += found.searches
        fare_store.write(path, kept)
        where = f'{item.airport} {item.friday}{"" if item.nearest else " direct"}'
        print(f'{where} ({item.days_away} days away): {said(found, item)}', flush=True)
        if found.declined is not None:
            declined.append((where, found.declined))
            if found.declined.stops or found.declined.why == fli_page.REFUSED:
                break
            continue
        done += 1
        time.sleep(PAUSE)
    live = fare_weekends.weekends(now().date())
    print(f'{done} searches; {len(current([*history, *kept], live))} of {len(live)} festival weekends searched')
    if why := calls.failed('searches', declined):
        sys.exit(why)


def plan() -> None:
    q = queue()
    due = [x for x in q if x.due]
    print(f'{len(due)} of {len(q)} festival weekends due today')
    for x in due:
        seen = f'searched {x.age:.0f} days ago' if x.age is not None else 'never searched'
        kind = '' if x.nearest else ', direct flights'
        print(f'{x.airport} {x.friday}: {x.days_away} days away, every {x.every} days{kind}, {seen}')


def show(airport: str | None, origin: str | None, limit: int) -> None:
    """The searches kept, the latest first, each with its cheapest offers."""
    kept = [
        s
        for s in reversed(fare_store.read())
        if (airport is None or s.airport == airport) and (origin is None or s.origin == origin)
    ]
    print(f'{len(kept)} searches kept' + (f', the latest {limit}' if len(kept) > limit else ''))
    for s in kept[:limit]:
        where = f'{s.at:%Y-%m-%d %H:%M} {s.vendor} {s.origin}→{s.airport} {s.depart} {s.mode}'
        print(f'{where}: {s.outcome}' + (f' ({s.note})' if s.note else '') + (f' [{s.backfill}]' if s.backfill else ''))
        for o in sorted(s.offers, key=lambda o: o.price)[:3]:
            stops = f'{o.stops_out} out' + ('' if o.stops_back is None else f', {o.stops_back} back')
            print(f'    {o.price:.0f} EUR, {o.ticket}, stops {stops}: {" + ".join(o.airlines)}')


class Args(argparse.Namespace):
    cmd: str = ''
    budget: int = 20
    max_seconds: int = 1200
    airport: str | None = None
    origin: str | None = None
    limit: int = 20


def main() -> None:
    ap = argparse.ArgumentParser(description='Search Friday-to-Monday fares for festival weekends that are due.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('refresh', help='search the weekends due today and keep the searches')
    _ = r.add_argument('--budget', type=int, default=20, help='most searches of Google in this run')
    _ = r.add_argument('--max-seconds', type=int, default=1200, help='stop starting searches after this long')
    _ = sub.add_parser('plan', help='list the weekends due today, without searching')
    s = sub.add_parser('show', help='list the searches kept, the latest first')
    _ = s.add_argument('--airport', help='the searches to this airport alone')
    _ = s.add_argument('--origin', help='the searches from this airport alone')
    _ = s.add_argument('--limit', type=int, default=20, help='how many to list')
    a = ap.parse_args(namespace=Args())
    if a.cmd == 'refresh':
        refresh(a.budget, a.max_seconds)
    elif a.cmd == 'show':
        show(a.airport, a.origin, a.limit)
    else:
        plan()


if __name__ == '__main__':
    main()
