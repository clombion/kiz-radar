"""Fare searches, when each festival weekend is searched again, and the fares the site shows.

Every search is kept with the offers it saw in the fare history (pipeline/fare_offers/, pipeline/fare_store.py): the
run's file is written after each search, so a run stopped half way keeps what it found. What a weekend's searches from
home say of its fare is its standing (pipeline/fare_weekends.py standing): priced, listed, no flight, unanswered
(searched, and taught nothing), or not asked. The queue reads it here, and the build and the site read it for the fares
they show (fare_weekends current): the card's fare is the cheapest offer on one ticket of the search its standing is of.

Only festival weekends are searched: the Friday-to-Monday return from home to the airports of each upcoming festival
(pipeline/airports.py: every airport within MAX_AIRPORT_KM of its city), once per airport and weekend however many
festivals share it. A weekend is due again after an interval that grows with how far away it is (WEEKS_APART), and it is
searched on its own weekday, fixed by the airport and the date, so each day's run checks about a seventh of the
weekends. A weekend that has never been searched, or is overdue by twice its interval, doesn't wait for its weekday.
Weekends further ahead than Google sells (SELLS_DAYS) wait. A weekend whose latest searches taught nothing (each failed,
or said none of priced, listed or no flight: its standing's since, a no price kept before the history among them) is
due again after a wait that doubles with each of them, a day after the first (the next run), two after the second,
capped at its interval; it waits for no weekday. So a weekend comes back the next run after its first search that
teaches nothing, and one that keeps teaching nothing costs a search an interval at most.

Every weekend is searched for any flight. A festival's first airport (its nearest, called so below: its city's first
decided one, else the nearest within MAX_AIRPORT_KM, fare_weekends) is searched at that interval; its other airports
(extras), a way round the nearest, EXTRA_SLOWER times less often, and after every weekend of the nearest airports due,
within the run's budget: the nearest due on their interval first, then those due after their wait, then the extras the
same. An airport that is the nearest of any festival that weekend is searched as the nearest.

Google is read on its outbound page, one request a search (pipeline/fli_page.py): its price is the return's, its stops
those out. Google sometimes refuses a search (HTTP 429), so a refused search is tried once more after a minute; refused
again, it stops the run, as do MOST_DECLINED searches in a row Google gives no answer to. A search with no answer is
kept as failed, teaches its weekend nothing, and is named at the run's end. A page Google gave is kept as it lists:
offers, flights with no price, or none, an empty page with how many nearby dates it priced, which decides nothing
(pipeline/fli_page.py). Every page is an answer of Google's server: it counts in the run's budget, and not among the
searches in a row Google gave no answer to. The run fails only when it was stopped so, or when Google gave no page to
any search it made: a search with no answer now and then is a later run's to make. Each weekend Google gave a page for
is asked of Kiwi.com's flight search the same (kiwi), its trips kept with the airlines flying them and the tickets they
are booked on (ticket), and the search of Google's it was asked with: its cheapest self-transfer, when cheaper, is added
to the weekend's Flights; its cheapest on one ticket is the card's where Google priced none (flights listed with no
price, Widerøe's, which it leaves to the airline, or an empty page); and with Google's empty page, its answer of no trip
is what makes the standing of a weekend near enough no flight (fare_weekends.SCHEDULED_DAYS). Its price is a
reseller's, and the site says so; its failure fails no run.

    mise run fares -- refresh --budget 20      # what the GitHub Action runs
    mise run fares -- plan                     # show what is due, without searching
    mise run fares -- show --airport LIS       # the searches kept, the latest first
    mise run fares -- accuracy                 # write pipeline/fare_accuracy.md, from the pairs (fare_accuracy)
"""

import argparse
import datetime as dt
import json
import sys
import time
import zlib
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError, model_validator

from pipeline import airports, calls, fare_accuracy, fare_store, fare_weekends, fli_page, web
from pipeline.calls import Declined
from pipeline.enums import FareMode, FareOutcome, FareStanding, FareTicket, FareVendor
from pipeline.fare_weekends import NIGHTS, NOT_ASKED, Standing, current, standings
from pipeline.records import Offer, Search, digest, now

SELLS_DAYS = 330  # Google sells about 11 months ahead
# (days until the Friday, days between searches): weekly when it is close, every six weeks when it is far
WEEKS_APART = [(35, 7), (91, 14), (182, 28), (SELLS_DAYS, 42)]
EXTRA_SLOWER = 2  # an extra airport's weekend is searched this many times less often than a nearest airport's
PAUSE = 10  # seconds between searches; Google refused after 22 requests 10 seconds apart (2026-11-08)
RETRY_AFTER = 60  # seconds to wait before trying a refused search once more
# Google gives no page to this many searches in a row: the run stops, as Google is likely blocking it (a search with
# no page counts in no budget, so the run would otherwise go on through its whole queue)
MOST_DECLINED = 3
KIWI_PAUSE = 3  # seconds between a weekend's search of Google and the reseller's
# A share of each run's budget goes to searching weekends Google priced from home that day from another city as well,
# so that a report (mise run fares -- accuracy) can tell how well home's price predicts theirs: Oslo
# the most, Stavanger and Trondheim on a few, by weight.
PAIR_SHARE = 0.25
PAIR_ORIGINS = (('OSL', 4), ('SVG', 1), ('TRD', 1))
NOTE_LENGTH = 200  # a search's note is cut to this many characters
DAY = 86400  # seconds
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
        """A part per flight, out then back; parts after the last flight's (a trip of SAS's back from Geneva has three
        for two flights) must be of its fare component, or which flight a part is of cannot be told."""
        parts = [p.rsplit('_', 1)[0] for p in self.id.split('|')]
        flights = len(self.outbound.segments) + len(self.inbound.segments)
        if len(parts) < flights or set(parts[flights:]) - {parts[flights - 1]}:
            raise ValueError(f'the trip {self.id} has not one part per flight')
        return self


class Resold(Answer):
    """The reseller's answer: its trips, each read on its own (readable), as one it writes otherwise must not lose
    the others."""

    itineraries: tuple[JsonValue, ...] = ()


def readable(trips: Iterable[JsonValue]) -> tuple[ResoldTrip, ...]:
    """The trips that can be read: one whose id has a part more for a flight elsewhere than after the last cannot say
    how it is booked (ticket), and is left out."""
    out: list[ResoldTrip] = []
    for t in trips:
        try:
            out.append(ResoldTrip.model_validate(t))
        except ValidationError:
            continue
    return tuple(out)


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
    nearest: bool  # the nearest airport of a festival that weekend; else an extra, searched less often
    days_away: int
    every: int | None  # None: further ahead than Google sells
    age: float | None  # in days since the search its standing is of; None when no search taught one
    tries: int  # its latest searches that taught nothing (Standing.since)
    due: bool

    @property
    def again(self) -> bool:
        """Whether its latest search taught nothing, so that it is due after a wait (backoff), not on its interval."""
        return self.tries > 0

    @property
    def overdue(self) -> float:
        """How many intervals since it was searched."""
        return self.age / self.every if self.age is not None and self.every else NEVER


def interval(days_away: int, *, nearest: bool = True) -> int | None:
    every = next((every for until, every in WEEKS_APART if days_away <= until), None)
    return every if every is None or nearest else every * EXTRA_SLOWER


def weekday_of(airport: str, friday: dt.date) -> int:
    """The weekday (0 = Monday) a weekend is searched on: fixed, and spread evenly across the week."""
    return zlib.crc32(f'{airport} {friday}'.encode()) % 7


def backoff(tries: int, every: int) -> int:
    """The days a weekend waits after its latest search, when its latest tries taught nothing: one after the first,
    doubling with each, at most its interval."""
    return min(1 << (tries - 1), every)


def due(st: Standing, every: int | None, age: float | None, t: dt.datetime, *, on_day: bool) -> bool:
    """Whether a weekend of this standing, interval and age (in days since the search its standing is of) is due at t:
    never when Google doesn't sell it yet; after its backoff, counted in days of the calendar, when its latest searches
    taught nothing; else on its weekday once its interval has passed since the search its standing is of, any day once
    twice that has, or at once when it was never searched."""
    if every is None:
        return False
    if st.since:
        return (t.date() - st.since[-1].at.date()).days >= backoff(len(st.since), every)
    return age is None or (age >= every and on_day) or age >= 2 * every


def queue(t: dt.datetime | None = None, history: Sequence[Search] | None = None) -> list[Weekend]:
    """Every festival weekend with its interval and whether it is due today: the nearest airports' first, those due
    on their interval before those due after their backoff, the most overdue first; then the extras' the same."""
    t = t or now()
    today = t.date()
    history = fare_store.read() if history is None else history
    known = standings(history)
    q: list[Weekend] = []
    for (airport, friday), nearest in fare_weekends.weekends(today).items():
        st = known.get((airport, friday), NOT_ASKED)
        days_away = (friday - today).days
        every = interval(days_away, nearest=nearest)
        age = (t - st.searched.at).total_seconds() / DAY if st.searched is not None else None
        on_day = weekday_of(airport, friday) == today.weekday()
        is_due = due(st, every, age, t, on_day=on_day)
        q.append(Weekend(airport, friday, nearest, days_away, every, age, len(st.since), is_due))
    return sorted(q, key=lambda w: (not w.due, not w.nearest, w.again, -w.overdue, w.friday, w.airport))


class Asked(NamedTuple):
    """What a search asks: the Friday-to-Monday return from origin to airport, for any flight."""

    origin: str
    airport: str
    friday: dt.date


def search(
    asked: Asked, vendor: FareVendor, found: tuple[Offer, ...] | str, *, listed: bool = False, nearby: int | None = None
) -> Search:
    """A search made now, for any flight: its offers (none when the vendor listed no flight, then with the nearby
    dates Google's page priced, or listed when flights were, with no price), or the words of its failure."""
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
        mode=FareMode.ANY,
        vendor=vendor,
        outcome=outcome,
        note=found[:NOTE_LENGTH] if failed else None,
        offers=() if failed else found,
        nearby=nearby,
    )


def google(asked: Asked) -> Search | Declined:
    """Google's outbound page for a Friday-to-Monday return (pipeline/fli_page.py): each way out priced, an offer on
    one ticket with its stops out; flights with no price listed; an empty page none, with the nearby dates it priced;
    or why there is no page."""
    origin, airport, friday = asked
    page = fli_page.page(origin, airport, friday, friday + dt.timedelta(days=NIGHTS))
    if isinstance(page, Declined):
        return page
    if isinstance(page, fli_page.Empty):
        return search(asked, FareVendor.GOOGLE, (), nearby=page.nearby)
    offers = tuple(
        Offer(price=r.price, ticket=FareTicket.ONE_TICKET, stops_out=r.stops, stops_back=None, airlines=r.airlines)
        for r in page
        if r.price
    )
    return search(asked, FareVendor.GOOGLE, offers, listed=bool(page))


def kiwi(asked: Asked, google: Search) -> Search:
    """The reseller's Friday-to-Monday returns, each an offer, asked with this search of Google's; failed, with why,
    when it gave no answer."""
    origin, airport, friday = asked
    args = {
        'flyFrom': origin,
        'flyTo': airport,
        'departureDate': friday.strftime('%d/%m/%Y'),
        'returnDate': (friday + dt.timedelta(days=NIGHTS)).strftime('%d/%m/%Y'),
        'currency': 'EUR',
        'sort': 'price',
    }
    call = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'search-flight', 'arguments': args}}
    body = web.post(RESELLER, json.dumps(call).encode(), RESELLER_HEADERS)
    found = body.why if isinstance(body, Declined) else kiwi_offers(body.decode(errors='replace'))
    # validated as it is made, with the id it names (Search's shape)
    return Search.model_validate(search(asked, FareVendor.KIWI, found).model_dump() | {'asked_with': google.id})


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
        written = Resold.model_validate_json(result.content[0].text).itineraries
    except ValidationError as e:
        return f'the reseller wrote what cannot be read: {calls.why(e)}'
    trips = readable(written)
    if written and not trips:
        return f'the reseller wrote no trip that can be read, of {len(written)}'
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


def searched(asked: Asked, *, resold: bool) -> Searched:
    """A weekend's search, tried once more after a minute when Google refuses it, kept as failed when it gives no
    answer; and when Google answered and resold is asked (a search from home), the reseller's search of it too,
    KIWI_PAUSE later: its self-transfers for the weekend's Flights, and its fare on one ticket where Google priced
    none (fare_weekends.priced_by). The reseller's failure is kept, and fails nothing."""
    found = google(asked)
    if isinstance(found, Declined) and found.why == fli_page.REFUSED:
        time.sleep(RETRY_AFTER)
        found = google(asked)
    if isinstance(found, Declined):
        return Searched((search(asked, FareVendor.GOOGLE, found.why),), found)
    if not resold:
        return Searched((found,))
    time.sleep(KIWI_PAUSE)
    return Searched((found, kiwi(asked, found)))


def said(found: Searched) -> str:
    """What a weekend's searches found, in a line of the run's log."""
    g, *rest = found.searches
    match g.outcome:
        case FareOutcome.FAILED:
            words = f'no answer: {g.note}'
        case FareOutcome.OFFERS:
            words = f'{min(o.price for o in g.offers):.0f} EUR, {len(g.offers)} offers'
        case FareOutcome.LISTED:
            words = 'flights with no price'
        case FareOutcome.NONE:
            words = 'no flight listed' + (f', {g.nearby} nearby dates priced' if g.nearby else '')
    for k in rest:
        priced = f'{min(o.price for o in k.offers):.0f} EUR' if k.offers else str(k.outcome)
        words += f'; the reseller: {priced}' + (f' ({k.note})' if k.note else '')
    return words


def pair_origin(asked: Asked, day: dt.date) -> str:
    """The city a weekend searched from home is searched from as well that day: Oslo most days, Stavanger or Trondheim
    on a few, fixed by the weekend and the day (PAIR_ORIGINS)."""
    weights = [origin for origin, n in PAIR_ORIGINS for _ in range(n)]
    return weights[zlib.crc32(f'{asked.airport} {asked.friday} {day}'.encode()) % len(weights)]


@dataclass
class Run:
    """A refresh under way: its file, when it stops starting searches (until, by time.time()), the searches it made,
    those Google gave no answer to (no page), and how many it gave none to in a row, the last ones."""

    path: Path
    until: float
    kept: list[Search] = field(default_factory=list[Search])
    declined: list[tuple[str, Declined]] = field(default_factory=list[tuple[str, Declined]])
    declined_in_a_row: int = 0

    def search(self, asked: Asked, *, resold: bool, days_away: int) -> Searched:
        """One weekend's searches, kept in the run's file at once, and said."""
        found = searched(asked, resold=resold)
        self.kept += found.searches
        fare_store.write(self.path, self.kept)
        where = f'{asked.origin}→{asked.airport} {asked.friday}'
        print(f'{where} ({days_away} days away): {said(found)}', flush=True)
        if found.declined is not None:
            self.declined.append((where, found.declined))
        self.declined_in_a_row = 0 if found.declined is None else self.declined_in_a_row + 1
        return found

    @property
    def stopped(self) -> bool:
        """Whether Google or fli stopped the run: Google refused the last search twice or gave no answer to
        MOST_DECLINED in a row, or a search can never succeed as made."""
        last = self.declined[-1][1] if self.declined else None
        refused = last is not None and (last.stops or last.why == fli_page.REFUSED)
        return refused or self.declined_in_a_row >= MOST_DECLINED

    @property
    def over(self) -> bool:
        """Whether the run starts no more searches: its time is up, or it was stopped."""
        return time.time() > self.until or self.stopped

    @property
    def failed(self) -> bool:
        """Whether the run failed at its work: it was stopped, or it searched Google and got no page for any search
        (fare_weekends.paged): an empty page is an answer of Google's server as much as one that lists flights."""
        google = [s for s in self.kept if s.vendor == FareVendor.GOOGLE]
        return self.stopped or (bool(google) and not any(fare_weekends.paged(s) for s in google))


class Paged(NamedTuple):
    """A weekend searched from home this run that Google gave a page for, and that search of Google's."""

    weekend: Weekend
    google: Search


def from_home(run: Run, history: Sequence[Search], budget: int) -> list[Paged]:
    """Search the weekends due today, in the queue's order, within the budget, which each page Google gave counts in:
    those Google gave a page for (fare_weekends.paged)."""
    pages: list[Paged] = []
    for item in queue(history=history):
        if not item.due or len(pages) >= budget or run.over:
            break
        found = run.search(Asked(airports.home(), item.airport, item.friday), resold=True, days_away=item.days_away)
        if fare_weekends.paged(found.searches[0]):
            pages.append(Paged(item, found.searches[0]))
        time.sleep(PAUSE)
    return pages


def paired(run: Run, paged: Sequence[Paged], pairs: int, day: dt.date) -> None:
    """Search as many weekends as pairs of those searched from home this run that make one (fare_accuracy.pairable),
    in their order, each from its other city (pair_origin): Google alone."""
    for item, _ in [p for p in paged if fare_accuracy.pairable(p.google)][:pairs]:
        if run.over:
            break
        origin = pair_origin(Asked(airports.home(), item.airport, item.friday), day)
        if origin == item.airport:
            continue  # a festival flown to from that city needs no flight
        _ = run.search(Asked(origin, item.airport, item.friday), resold=False, days_away=item.days_away)
        time.sleep(PAUSE)


def refresh(budget: int, max_seconds: int) -> None:
    """Search the weekends due today, then pair a share of those Google priced (PAIR_SHARE of the budget, kept for
    them) with a search from another city, writing the run's file after each, and says how many pages Google gave,
    how many of them listed no flight, and how many festival weekends stand at each standing. It names the searches
    Google gave no answer to, a refusal or a stop first, and exits 1 when the run failed at its work (Run.failed): a
    search with no answer now and then is tried again in a later run, and fails none."""
    history, today = fare_store.read(), now().date()
    run, pairs = Run(fare_store.run_file(now()), time.time() + max_seconds), round(budget * PAIR_SHARE)
    paged = from_home(run, history, budget - pairs)
    paired(run, paged, pairs, today)
    live = fare_weekends.weekends(today)
    pages = [s for s in fare_weekends.from_home(run.kept) if fare_weekends.paged(s)]
    empty = sum(s.outcome == FareOutcome.NONE for s in pages)
    pairs_made = sum(s.origin != airports.home() for s in run.kept)
    print(
        f'{len(pages)} searches, {empty} of them listing no flight, and {pairs_made} pairs; '
        f'of {len(live)} festival weekends, {stood(current([*history, *run.kept], live).values())}'
    )
    why = calls.failed('searches', run.declined)
    if run.failed:
        sys.exit(why or 'Google gave no page to any search')
    if why:
        print(why)


def stood(weekends: Iterable[fare_weekends.Current]) -> str:
    """How many weekends stand at each standing, in the table's order: "12 priced, 0 listed, ..."."""
    counts = Counter(c.standing.state for c in weekends)
    return ', '.join(f'{counts[state]} {state}' for state in FareStanding)


def plan() -> None:
    q = queue()
    due = [x for x in q if x.due]
    print(f'{len(due)} of {len(q)} festival weekends due today')
    for x in due:
        tries = f'{x.tries} {"search" if x.tries == 1 else "searches"} that taught nothing'
        seen = (
            (f'{tries}, none that taught one' if x.age is None else f'taught {x.age:.0f} days ago, {tries} since')
            if x.again
            else 'never searched'
            if x.age is None
            else f'searched {x.age:.0f} days ago'
        )
        kind = '' if x.nearest else ', an extra'
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
    _ = sub.add_parser('accuracy', help=f"write {fare_accuracy.REPORT}: how well home's fare predicts other cities'")
    s = sub.add_parser('show', help='list the searches kept, the latest first')
    _ = s.add_argument('--airport', help='the searches to this airport alone')
    _ = s.add_argument('--origin', help='the searches from this airport alone')
    _ = s.add_argument('--limit', type=int, default=20, help='how many to list')
    a = ap.parse_args(namespace=Args())
    if a.cmd == 'refresh':
        refresh(a.budget, a.max_seconds)
    elif a.cmd == 'show':
        show(a.airport, a.origin, a.limit)
    elif a.cmd == 'accuracy':
        fare_accuracy.write(fare_store.read())
        print(f'wrote {fare_accuracy.REPORT}')
    else:
        plan()


if __name__ == '__main__':
    main()
