"""Google's outbound search page for a return flight, read through fli (punitarani/fli, pinned in pyproject.toml's fares
group): one request per search.

The page lists the ways out, each priced as the cheapest return that leaves by it, with the stops it makes on the way
out; the ways back are on another page, never read. That price is the one Google's booking page asks for the trip: equal
on each of the 7 weekends from Bergen checked on 2026-11-08 whose booking page gave a price. fli's public search also
reads a page of ways back for each way out it expands, so the page is read through its private
SearchFlights._fetch_flights, at the commit pinned, and the contract test (tests/test_fli_page.py) reads recorded pages
through it.

What can go wrong is kept apart, never read as no price: Google refusing the search (HTTP 429), and fli failing (an
error, a page it can't read). A page with no flight is no price; one with flights and none priced is listed.
"""

import datetime as dt
from dataclasses import dataclass

from fli.core import build_flight_segments, resolve_airport
from fli.models import FlightSearchFilters, MaxStops, PassengerInfo, SortBy
from fli.search import SearchFlights
from fli.search.client import Client
from fli.search.exceptions import SearchClientError, SearchHTTPError
from tenacity import stop_after_attempt

REFUSED = 'Google refused the search (HTTP 429)'
TOO_MANY = 429


class OneTry(Client):
    """fli's client, each request sent once: its own retries would ask again at once a search Google has refused."""

    get = Client.get.retry_with(stop=stop_after_attempt(1))


@dataclass(frozen=True)
class Row:
    """A way out of the page: the return's price in EUR (none when Google lists it with no price), its stops on the
    way out and the airlines flying them, in order, by fli's names for their codes."""

    price: float | None
    stops: int
    airlines: tuple[str, ...]


@dataclass(frozen=True)
class Failed:
    """No page read: Google refused the search (refused), or fli failed, in its words."""

    why: str

    @property
    def refused(self) -> bool:
        return self.why == REFUSED


def filters(origin: str, airport: str, friday: dt.date, back: dt.date, *, direct: bool) -> FlightSearchFilters:
    """The search: one adult, out on the Friday and back on the day given, the cheapest first, direct flights alone
    when asked."""
    segments, trip = build_flight_segments(
        resolve_airport(origin), resolve_airport(airport), friday.isoformat(), back.isoformat()
    )
    return FlightSearchFilters(
        trip_type=trip,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=segments,
        stops=MaxStops.NON_STOP if direct else MaxStops.ANY,
        sort_by=SortBy.CHEAPEST,
    )


def page(origin: str, airport: str, friday: dt.date, back: dt.date, *, direct: bool) -> tuple[Row, ...] | Failed:
    """The page's ways out, cheapest first (none when Google has no flight), each priced in EUR; or why there is no
    page."""
    search = SearchFlights()
    search.client = OneTry()
    try:
        # the one call that reads the outbound page alone (the module's docstring)
        found = search._fetch_flights(
            filters(origin, airport, friday, back, direct=direct),
            currency='EUR',
            language=None,
            country=None,
            capture_session=False,
        )
    except SearchHTTPError as e:
        return Failed(REFUSED if e.status_code == TOO_MANY else f'fli: {e}')
    except SearchClientError as e:
        return Failed(f'fli: {e}')
    rows = found or []
    if wrong := {r.currency for r in rows if r.price is not None} - {'EUR'}:
        return Failed(f'fli gave a price in {", ".join(sorted(map(str, wrong)))}, not the EUR it was asked')
    return tuple(Row(r.price, r.stops, tuple(leg.airline.value for leg in r.legs)) for r in rows)
