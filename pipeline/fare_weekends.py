"""The festival weekends, and what the fare history (pipeline/fare_store.py) says of each: the weekends a trip from
home leaves on, to the airports a festival can fly to (weekends_of), and each one's latest search from home and the fare
the site shows for it (current). What the build reads of the fares, apart from the searching (pipeline/fares.py), whose
dependency group the build has not.
"""

import datetime as dt
import functools
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass

from pipeline import airports, cities, claims, export
from pipeline.enums import FareMode, FareOutcome, FareTicket, FareVendor, Listing
from pipeline.records import Offer, Record, Search, day_of

NIGHTS = 3  # a weekend's flight is out on the Friday and back on the Monday, the one place this is said

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
    it is the first of any festival then, searched for any flight; the others are searched for direct flights."""
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
    """Whether the vendor gave the search a page or an answer it could read (it did not fail), whether or not it holds
    an answer a fare can be of (answered)."""
    return s.outcome != FareOutcome.FAILED


def answered(s: Search) -> bool:
    """Whether a search holds an answer its weekend's fare can be of: it did not fail (paged), and it is no "no price"
    kept before this history was (backfill), which there also meant a timeout, an answer that could not be read, or a
    sweep that failed."""
    return paged(s) and not (s.backfill is not None and s.outcome == FareOutcome.NONE)


def from_home(history: Iterable[Search]) -> list[Search]:
    """Google's searches from home, in the order they were made."""
    home = airports.home()
    return [s for s in sorted(history, key=lambda s: s.at) if s.origin == home and s.vendor == FareVendor.GOOGLE]


def latest(history: Iterable[Search]) -> dict[tuple[str, dt.date], Search]:
    """Each weekend's latest search of Google from home that holds an answer (answered): the one its fare is of."""
    return {(s.airport, s.depart): s for s in from_home(history) if answered(s)}


def direct_found(s: Search) -> bool | None:
    """For a search of direct flights alone that holds an answer (answered), whether it found one (priced or not); None
    for any flight's, and for one that holds no answer."""
    return None if s.mode == FareMode.ANY or not answered(s) else s.outcome != FareOutcome.NONE


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
class Priced:
    """An offer, and the search that saw it."""

    offer: Offer
    search: Search


@dataclass(frozen=True)
class Current:
    """A festival weekend as the site shows it: its latest search from home (searched); the card's fare, the cheapest
    offer on one ticket of that search, or of the reseller's asked with it when Google listed no price; and the
    reseller's cheapest self-transfer, when it is cheaper than that fare or there is none, which its Flights add."""

    searched: Search
    fare: Priced | None
    transfer: Priced | None


def cheapest(s: Search | None, ticket: FareTicket) -> Priced | None:
    offers = [o for o in s.offers if o.ticket == ticket] if s else []
    return Priced(min(offers, key=lambda o: o.price), s) if s and offers else None


def current(history: Sequence[Search], live: Collection[tuple[str, dt.date]]) -> dict[tuple[str, dt.date], Current]:
    """Each festival weekend still to come that has been searched from home, with its fare (Current); the reseller's
    search is the one asked with Google's (resellers)."""
    resold = resellers(history)
    out: dict[tuple[str, dt.date], Current] = {}
    for key, s in latest(history).items():
        if key not in live:
            continue
        k = resold.get(s.id)
        # the reseller's on the card only where Google listed flights with no price
        priced = {FareOutcome.OFFERS: s, FareOutcome.LISTED: k}.get(s.outcome)
        fare = cheapest(priced, FareTicket.ONE_TICKET)
        transfer = cheapest(k, FareTicket.SELF_TRANSFER)
        cheaper = transfer is not None and (fare is None or transfer.offer.price < fare.offer.price)
        out[key] = Current(s, fare, transfer if cheaper else None)
    return out
