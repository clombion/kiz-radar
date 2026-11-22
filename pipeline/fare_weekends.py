"""The festival weekends, and what the fare history (pipeline/fare_store.py) says of each: the weekends a trip from
home leaves on, to the airports a festival can fly to (weekends_of); each one's standing, the one rule of what its
searches from home say of its fare, which the searching (pipeline/fares.py), the build and the site read (standing);
and the fare the site shows for it (current). What the build reads of the fares, apart from the searching, whose
dependency group the build has not.
"""

import datetime as dt
import functools
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from pipeline import airports, cities, claims, export
from pipeline.enums import FareMode, FareOutcome, FareStanding, FareTicket, FareVendor, Listing
from pipeline.records import Offer, Record, Search, day_of

NIGHTS = 3  # a weekend's flight is out on the Friday and back on the Monday, the one place this is said
# airlines have their flights on sale this far ahead: a weekend further on may lack a flight that will fly, so a search
# made further ahead that finds none teaches no flight of it (taught)
SCHEDULED_DAYS = 91

type Weekends = Mapping[tuple[str, dt.date], bool]


class Listed(Record):
    """A festival of the export still listed and not cancelled: its city and its first day."""

    city: str | None
    country: str | None
    start_date: str


# the festivals of an events table (the export's, or the one the build attaches as src) that weekends_of reads
LISTED = (
    "select nullif(city, '') as city, nullif(country, '') as country, start_date from {events}"
    ' where cancelled is not 1 and listing = ?'
)


@functools.cache
def weekends(today: dt.date) -> Weekends:
    """The festival weekends of the export's festivals (weekends_of)."""
    with export.opened('ro') as db:
        return weekends_of(db.rows(Listed, LISTED.format(events='events'), (Listing.LISTED,)), today)


def weekends_of(listed: Iterable[Listed], today: dt.date) -> Weekends:
    """(airport, Friday) of every festival still listed and not cancelled, a trip to which leaves after today, to each
    of its airports other than home (airports.flown: its city's decided ones, else every one near enough), and whether
    it is the first of any festival then, its nearest (an extra otherwise, searched less often and after the nearest:
    pipeline/fares.py)."""
    index, to, home, decided = cities.index(), airports.known(), airports.home(), claims.gateways()
    out: dict[tuple[str, dt.date], bool] = {}
    for e in listed:
        friday = airports.weekend_friday(day_of(e.start_date))
        city = index.of(e.city, e.country)
        p = airports.placed(city, to)
        if city is None or p is None or friday <= today or p.airport == home:
            continue  # a festival flown to from home needs no flight
        for i, c in enumerate(airports.flown(city, to, decided.get(city.key), p.candidates)):
            if c.airport != home:
                out[(c.airport, friday)] = out.get((c.airport, friday), False) or i == 0
    return out


def paged(s: Search) -> bool:
    """Whether the vendor gave the search a page or an answer it could read: it did not fail. What a page says of its
    weekend is its standing's to say (taught)."""
    return s.outcome != FareOutcome.FAILED


def from_home(history: Iterable[Search]) -> list[Search]:
    """Google's searches from home, in the order they were made."""
    home = airports.home()
    return [s for s in sorted(history, key=lambda s: s.at) if s.origin == home and s.vendor == FareVendor.GOOGLE]


def resellers(history: Iterable[Search]) -> dict[str, Search]:
    """The reseller's search each search of Google's was asked with, by that one's id: the reseller's search naming it
    (Search.asked_with). One kept before a reseller's search named it is paired by time, the one place it is: it was
    asked with the search of Google's made last before it from the same origin to the same airport, for the same
    Friday and flights (asked a few seconds after it, fares.KIWI_PAUSE; each of the history's is, within a minute)."""
    ordered = sorted(history, key=lambda s: s.at)
    out: dict[str, Search] = {}
    last: dict[tuple[str, str, dt.date, FareMode], Search] = {}
    for s in ordered:
        if s.vendor == FareVendor.GOOGLE:
            last[(s.origin, s.airport, s.depart, s.mode)] = s
        elif s.asked_with is not None:
            out[s.asked_with] = s
        elif (g := last.get((s.origin, s.airport, s.depart, s.mode))) is not None:
            out[g.id] = s
    return out


@dataclass(frozen=True)
class Ask:
    """A search of Google from home, and the reseller's asked with it: none when it was not asked (Google gave no page,
    the search was kept before the fare history was, or the reseller's search was lost)."""

    google: Search
    resold: Search | None


def on_one_ticket(s: Search | None) -> bool:
    return s is not None and any(o.ticket == FareTicket.ONE_TICKET for o in s.offers)


def priced_by(ask: Ask) -> Search | None:
    """The search of the two whose cheapest offer on one ticket is the weekend's fare: Google's when its page priced a
    way out, else the reseller's when it found a trip on one ticket; none when neither did."""
    if ask.google.outcome == FareOutcome.OFFERS:
        return ask.google
    return ask.resold if on_one_ticket(ask.resold) else None


def taught(ask: Ask) -> FareStanding | None:
    """What one search says of its weekend's fare: priced (priced_by), listed or no flight, by those states' criteria
    (pipeline/states.py); None when it says none of them. Google's empty page alone says nothing: a browser was shown
    flights for a search whose page, as read, listed none (pipeline/fli_page.py). With the reseller's none, it says no
    flight of a weekend within SCHEDULED_DAYS of the search alone. A search for direct flights alone, which the history
    keeps from when an extra was searched so, says no flight of no weekend: a flight with stops may fly it."""
    g, k = ask.google, ask.resold
    if g.outcome == FareOutcome.FAILED:
        return None
    if priced_by(ask) is not None:
        return FareStanding.PRICED
    if g.outcome == FareOutcome.LISTED or (k is not None and k.outcome == FareOutcome.OFFERS):
        return FareStanding.LISTED
    scheduled = (g.depart - g.at.date()).days <= SCHEDULED_DAYS
    none = k is not None and k.outcome == FareOutcome.NONE and g.mode != FareMode.DIRECT and scheduled
    return FareStanding.NO_FLIGHT if none else None


@dataclass(frozen=True)
class Standing:
    """A festival weekend's fare as its searches from home say it (standing): its state; the search it is of, its
    latest that taught one (none when none did); and the searches of Google made since that taught nothing, in the
    order made (all of them when none taught one)."""

    state: FareStanding
    answer: Ask | None
    since: tuple[Search, ...]

    @property
    def searched(self) -> Search | None:
        """The search of Google's its state is of, which the site says the weekend was checked by; none when no search
        taught one."""
        return self.answer.google if self.answer is not None else None


NOT_ASKED = Standing(FareStanding.NOT_ASKED, None, ())


def standing(asks: Sequence[Ask]) -> Standing:
    """A weekend's standing from its searches from home, in the order made: that of the latest that taught one
    (taught); unanswered when it was searched and none did; not asked when it never was."""
    for i in range(len(asks) - 1, -1, -1):
        if (state := taught(asks[i])) is not None:
            return Standing(state, asks[i], tuple(a.google for a in asks[i + 1 :]))
    return Standing(FareStanding.UNANSWERED, None, tuple(a.google for a in asks)) if asks else NOT_ASKED


type Key = tuple[str, dt.date]  # a festival weekend: its airport and its Friday


def standings(history: Iterable[Search]) -> dict[Key, Standing]:
    """The standing of every weekend searched from home (standing), of its searches for any flight and for direct
    flights alone together (taught)."""
    history = list(history)
    resold = resellers(history)
    asks: dict[Key, list[Ask]] = {}
    for g in from_home(history):
        asks.setdefault((g.airport, g.depart), []).append(Ask(g, resold.get(g.id)))
    return {key: standing(a) for key, a in asks.items()}


@dataclass(frozen=True)
class Priced:
    """An offer, and the search that saw it."""

    offer: Offer
    search: Search


@dataclass(frozen=True)
class Current:
    """A festival weekend as the site shows it: where and when, its standing; the card's fare, the cheapest offer on
    one ticket of the search its standing is of (priced_by); and the reseller's cheapest self-transfer asked with that
    search, when it is cheaper than that fare or there is none, which its Flights add."""

    airport: str
    friday: dt.date
    standing: Standing
    fare: Priced | None
    transfer: Priced | None


def cheapest(s: Search | None, ticket: FareTicket) -> Priced | None:
    offers = [o for o in s.offers if o.ticket == ticket] if s else []
    return Priced(min(offers, key=lambda o: o.price), s) if s and offers else None


def current(history: Sequence[Search], live: Weekends) -> dict[Key, Current]:
    """Each festival weekend still to come, with its standing and its fare (Current)."""
    known = standings(history)
    out: dict[Key, Current] = {}
    for key in live:
        st = known.get(key, NOT_ASKED)
        fare = cheapest(priced_by(st.answer), FareTicket.ONE_TICKET) if st.answer is not None else None
        transfer = cheapest(st.answer.resold, FareTicket.SELF_TRANSFER) if st.answer is not None else None
        cheaper = transfer is not None and (fare is None or transfer.offer.price < fare.offer.price)
        out[key] = Current(*key, st, fare, transfer if cheaper else None)
    return out
