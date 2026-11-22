"""Google's outbound search page for a return flight, read through fli (punitarani/fli, pinned in pyproject.toml's fares
group): one request per search.

The page lists the ways out, each priced as the cheapest return that leaves by it, with the stops it makes on the way
out; the ways back are on another page, never read. That price is the one Google's booking page asks for the trip: equal
on each of the 7 weekends from Bergen checked whose booking page gave a price. fli's public search also reads a page of
ways back for each way out it expands, so the page is read through its private SearchFlights._fetch_flights, at the
commit pinned, and the contract test (tests/test_fli_page.py) reads recorded pages through it.

What can go wrong is kept apart, never read as no price: Google refusing the search (HTTP 429), and fli failing (an
error, a page it can't read). A page with no flight is no price, unless it prices nearby dates (Withheld): there the
flights a browser is shown reach it by the page's scripts, through an RPC fli cannot sign, and the page as read holds
none of them. The airlines a page names are no such sign: its filters name those flying the route with any stops,
whatever the search asks. One with flights and none priced is listed.
"""

import datetime as dt
from dataclasses import dataclass
from typing import cast

from fli.core import build_flight_segments, resolve_airport
from fli.models import FlightSearchFilters, MaxStops, PassengerInfo, SortBy
from fli.search import SearchFlights
from fli.search._tfs import extract_payload
from fli.search.client import Client, Response
from fli.search.exceptions import SearchClientError, SearchHTTPError
from tenacity import stop_after_attempt

from pipeline.calls import Declined
from pipeline.enums import CallCause

REFUSED = 'Google refused the search (HTTP 429)'
TOO_MANY = 429


class OneTry(Client):
    """fli's client, each request sent once: its own retries would ask again at once a search Google has refused."""

    get = Client.get.retry_with(stop=stop_after_attempt(1))


class Kept:
    """The client fli's search is given: OneTry, keeping the text of the last page it got, which the search reads
    its flights from and drops."""

    def __init__(self) -> None:
        self.client = OneTry()
        self.text = ''

    def get(self, url: str, **kwargs: object) -> Response:
        response = OneTry.get(self.client, url, **kwargs)
        self.text = response.text
        return response


@dataclass(frozen=True)
class Row:
    """A way out of the page: the return's price in EUR (none when Google lists it with no price), its stops on the
    way out and the airlines flying them, in order, by fli's names for their codes."""

    price: float | None
    stops: int
    airlines: tuple[str, ...]


@dataclass(frozen=True)
class Withheld:
    """A page with no flight that still prices nearby dates: the search's flights did not reach the page as read, so
    it is no answer, never no price."""

    dates: int

    @property
    def why(self) -> str:
        return f'no flight on the page, which prices {self.dates} nearby dates'


def withheld(text: str) -> Withheld | None:
    """What a page with no flight row still says of the route, in its ds:1 payload as fli reads it: the nearby dates
    it prices ([6][0][4][0], each a way out, a way back and [[_, the price], a token naming the dates it searched with
    no result, noresults|agg]); None when it prices none, as for a route with no flight. The airlines its filters offer
    ([7][1][1]) are no sign: they are those flying the route with any stops, on a direct search's page too.
    tests/test_fli_page.py reads pages Google sent."""
    payload: object = extract_payload(text)
    dates = [d for d in items(at(payload, 6, 0, 4, 0)) if isinstance(at(d, 2, 0, 1), int | float)]
    return Withheld(len(dates)) if dates else None


def at(value: object, *path: int) -> object:
    """The value at this path of nested lists; None where there is none."""
    for i in path:
        here = items(value)
        if i >= len(here):
            return None
        value = here[i]
    return value


def items(value: object) -> list[object]:
    """A value that is a list, else an empty one."""
    return cast('list[object]', value) if isinstance(value, list) else []


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


def page(
    origin: str, airport: str, friday: dt.date, back: dt.date, *, direct: bool
) -> tuple[Row, ...] | Withheld | Declined:
    """The page's ways out, cheapest first (none when Google has no flight), each priced in EUR; a page with none
    that prices nearby dates, withheld; or why there is no page (pipeline/calls.py): refused, or fli failing, is
    transient; a price in another currency is structural."""
    search = SearchFlights()
    search.client = kept = Kept()
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
        return Declined(CallCause.TRANSIENT, REFUSED if e.status_code == TOO_MANY else f'fli: {e}')
    except SearchClientError as e:
        return Declined(CallCause.TRANSIENT, f'fli: {e}')
    if not found:
        return withheld(kept.text) or ()
    rows = found
    if wrong := {r.currency for r in rows if r.price is not None} - {'EUR'}:
        named = ', '.join(sorted(map(str, wrong)))
        return Declined(CallCause.STRUCTURAL, f'fli gave a price in {named}, not the EUR it was asked')
    return tuple(Row(r.price, r.stops, tuple(leg.airline.value for leg in r.legs)) for r in rows)
