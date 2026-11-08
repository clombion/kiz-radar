"""The festival weekends, and what the fare history (pipeline/fare_store.py) says of each: the weekends a trip from
home leaves on, to the airports a festival can fly to (weekends_of), and each one's latest search from home and the fare
the site shows for it (current). What the build reads of the fares, apart from the searching (pipeline/fares.py), whose
dependency group the build has not.
"""

import datetime as dt
import functools
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass

from pipeline import airports, export
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
    of its airports other than home (pipeline/airports.py), and whether it is the nearest of any festival then."""
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


def latest(history: Iterable[Search], vendor: FareVendor = FareVendor.GOOGLE) -> dict[tuple[str, dt.date], Search]:
    """Each weekend's latest search from home of the vendor's that did not fail: the one its fare is of."""
    home = airports.home()
    out: dict[tuple[str, dt.date], Search] = {}
    for s in sorted(history, key=lambda s: s.at):
        if s.origin == home and s.vendor == vendor and s.outcome != FareOutcome.FAILED:
            out[(s.airport, s.depart)] = s
    return out


def direct_found(s: Search) -> bool | None:
    """For a search of direct flights alone, whether it found one (priced or not); None for any flight's."""
    return None if s.mode == FareMode.ANY else s.outcome != FareOutcome.NONE


@dataclass(frozen=True)
class Priced:
    """An offer, and the search that saw it."""

    offer: Offer
    search: Search


@dataclass(frozen=True)
class Current:
    """A festival weekend as the site shows it: its latest search from home (searched), and the card's fare, the
    cheapest offer on one ticket of that search, or of the reseller's asked with it when Google listed no price."""

    searched: Search
    fare: Priced | None


def cheapest(s: Search | None, ticket: FareTicket) -> Priced | None:
    offers = [o for o in s.offers if o.ticket == ticket] if s else []
    return Priced(min(offers, key=lambda o: o.price), s) if s and offers else None


def current(history: Sequence[Search], live: Collection[tuple[str, dt.date]]) -> dict[tuple[str, dt.date], Current]:
    """Each festival weekend still to come that has been searched from home, with its fare (Current); the reseller's
    search is the one asked with Google's, none older."""
    resold = latest(history, FareVendor.KIWI)
    out: dict[tuple[str, dt.date], Current] = {}
    for key, s in latest(history).items():
        if key not in live:
            continue
        k = resold.get(key)
        k = k if k is not None and k.at >= s.at else None
        fare = cheapest(s if s.outcome == FareOutcome.OFFERS else k, FareTicket.ONE_TICKET)
        out[key] = Current(s, fare)
    return out
