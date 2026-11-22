"""Google Flights' search for a return flight, read in a headless Chromium: the search page is loaded as a person's
browser loads it, and the answer its scripts receive (the GetShoppingResults call, which Google serves only to a request
the page's own scripts sign) is read through fli (punitarani/fli, pinned in pyproject.toml's fares group). The page that
a plain request gets lists no flight for most weekends that the browser finds priced, so the browser is the one reader.

The answer lists the ways out, each priced as the cheapest return that leaves by it ("From N euros round trip total"),
with the stops it makes on the way out; the ways back are never read. fli builds the page's address (_tfs.build_tfs,
_tfs.page_url) and reads the answer (_wire.iter_wrb_chunks, then _decoders.parse_flight_row over the first chunk's
inner[2] and inner[3], as fli reads the page's own data): private names at the commit pinned, which
tests/test_google_search.py reads recorded answers through, so a pin that moves them fails there.

What the browser gets is kept apart from what an answer says (answered): an answer is its ways out, priced or listed
with no price, or none, which is written only for an answer that says itself it has none (says_none: the tokens of
the airports it suggests nearby name it noresults); an answer with no way out that does not say so is of a shape not
known, and no answer. Everything else is no answer too: an error Google answers with (its error 13, INTERNAL, comes and
goes whatever the search: tried once more, pipeline/fares.py), a refusal (HTTP 429, or Google's sorry page), its consent
page, which the page's own document says before any answer is waited for (turned_away), no answer within WAIT_SECONDS,
or the browser failing. A browser that does not start is structural: no search can be made, and the run stops.

Each search has a context of its own, with fli's consent cookie (SOCS) and an English locale, so that nothing a
refusal or a consent page leaves carries into the next search; one browser serves the run (Reader).
"""

import base64
import binascii
import contextlib
import datetime as dt
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, cast

from fli.core import build_flight_segments, resolve_airport
from fli.models import FlightSearchFilters, MaxStops, PassengerInfo, SortBy
from fli.search._decoders import parse_flight_row
from fli.search._tfs import build_tfs, page_url
from fli.search._wire import iter_wrb_chunks
from fli.search.client import SOCS_COOKIE
from fli.search.exceptions import SearchRejectedError
from patchright.sync_api import Error
from patchright.sync_api import TimeoutError as TimedOut

from pipeline import read_page
from pipeline.calls import Declined, why
from pipeline.enums import CallCause

if TYPE_CHECKING:
    from patchright.sync_api import Browser, Page, Request, Response

REFUSED = 'Google refused the search (HTTP 429)'
TOO_MANY = 429
OK = 200
RPC = 'GetShoppingResults'  # the call whose answer the page's results are drawn from
# seconds a search waits for the answer, from the page starting to load to the answer's last byte: the slowest priced
# answer measured came 22 s after the page started loading
WAIT_SECONDS = 45
CURRENCY = 'EUR'
# what the tokens of an answer with no way out (in its inner[6], the airports it suggests nearby) name it, decoded; an
# answer with ways out names them otherwise (microflex)
NO_RESULTS = b'noresults'
NEARBY = 6  # the place in an answer of the airports it suggests nearby
# an answer with no way out that does not say it has none (says_none): Google has moved its rows, or sent a placeholder
UNKNOWN = f'Google sent a {RPC} answer of a shape not known: no way out, and no word that it has none'


def rejected(code: int | None) -> str:
    """The note of a search Google answered with an error: its gRPC code."""
    return f'Google answered error {code}'


# Google's INTERNAL, which comes and goes whatever the search, and is never "no flight"
INTERNAL = rejected(13)


@dataclass(frozen=True)
class Row:
    """A way out of the answer: the return's price in EUR (none when Google lists it with no price), its stops on the
    way out and the airlines flying them, in order, by fli's names for their codes."""

    price: float | None
    stops: int
    airlines: tuple[str, ...]


def filters(origin: str, airport: str, friday: dt.date, back: dt.date) -> FlightSearchFilters:
    """The search: one adult, out on the Friday and back on the day given, for any flight, the cheapest first."""
    segments, trip = build_flight_segments(
        resolve_airport(origin), resolve_airport(airport), friday.isoformat(), back.isoformat()
    )
    return FlightSearchFilters(
        trip_type=trip,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=segments,
        stops=MaxStops.ANY,
        sort_by=SortBy.CHEAPEST,
    )


def address(asked: FlightSearchFilters) -> str:
    """The search page's address, its prices in EUR."""
    return page_url(build_tfs(asked), CURRENCY, None, None)


def items(value: object) -> list[object]:
    """A value that is a list, else an empty one."""
    return cast('list[object]', value) if isinstance(value, list) else []


def strings(value: object) -> Iterator[str]:
    """The strings in a value, in lists nested at any depth."""
    if isinstance(value, str):
        yield value
    for item in items(value):
        yield from strings(item)


def decoded(token: str) -> bytes:
    """A token's bytes, as base64 of either alphabet; none when it is not base64."""
    try:
        return base64.b64decode(token.replace('-', '+').replace('_', '/') + '=' * (-len(token) % 4))
    except (binascii.Error, ValueError):
        return b''


def says_none(inner: list[object]) -> bool:
    """Whether an answer says itself that it has no way out: a token of the airports it suggests nearby (inner[6]) names
    it NO_RESULTS."""
    return len(inner) > NEARBY and any(NO_RESULTS in decoded(s) for s in strings(inner[NEARBY]))


def parsed(body: bytes) -> tuple[Row, ...] | Declined:
    """An answer's ways out, as Google lists them, each priced in EUR or listed with no price; none when it lists no
    way out and says so (says_none). An error it answers with, an answer of a shape not known (no way out, and no word
    that it has none), an answer whose rows cannot be read or a price whose currency cannot be read is transient; a
    price in another currency is structural, as the search asks for EUR."""
    try:
        first = next(iter_wrb_chunks(body), None)
    except SearchRejectedError as e:
        return Declined(CallCause.TRANSIENT, rejected(e.code))
    if first is None:
        return Declined(CallCause.TRANSIENT, f'Google sent a {RPC} answer with nothing in it that can be read')
    inner = items(first)
    # the second chunk repeats the first's ways out, so the first alone is read
    raw = [row for i in (2, 3) if i < len(inner) for row in items(next(iter(items(inner[i])), None))]
    rows = read(raw)
    if isinstance(rows, Declined):
        return rows
    if not rows and not says_none(inner):
        return Declined(CallCause.TRANSIENT, UNKNOWN)
    return rows


def read(raw: list[object]) -> tuple[Row, ...] | Declined:
    """An answer's rows, as fli reads them, each priced in EUR or listed with no price, a half-filled one left out; why
    they cannot be read when none can, or a price is in no currency that can be read (transient) or in another one
    (structural)."""
    rows: list[Row] = []
    for row in raw:
        try:
            r = parse_flight_row(row)
        except (AttributeError, IndexError, KeyError, ValueError, TypeError):
            continue  # a half-filled row, which Google sends for a placement: fli skips it so
        if r.price is not None and r.currency is None:
            # a price is kept in EUR or not at all: the history is written once, and a later run asks again
            return Declined(CallCause.TRANSIENT, f'Google gave a price of {r.price:.0f} whose currency cannot be read')
        if r.price is not None and r.currency != CURRENCY:
            return Declined(CallCause.STRUCTURAL, f'Google gave a price in {r.currency}, not the EUR it was asked')
        rows.append(Row(r.price, r.stops, tuple(leg.airline.value for leg in r.legs)))
    if raw and not rows:
        return Declined(CallCause.TRANSIENT, f'none of the {len(raw)} rows Google answered with can be read')
    return tuple(rows)


def turned_away(status: int | None, url: str) -> Declined | None:
    """Why a page's document alone, from its HTTP status and the address it ended at, says no answer will come, each
    transient: refused (HTTP 429, or Google's sorry page), or its consent page; none when it says nothing so."""
    if status == TOO_MANY or '/sorry/' in url:
        return Declined(CallCause.TRANSIENT, REFUSED)
    if 'consent.google.' in url:
        return Declined(CallCause.TRANSIENT, f'Google showed its consent page: {url}')
    return None


def answered(status: int | None, url: str, rpc: tuple[int, bytes] | None) -> bytes | Declined:
    """What a page's load got, from the page's own HTTP status, the address it ended at and the answer it received (its
    status and body; none when none came within WAIT_SECONDS): the answer's body to be read (parsed), or why there is
    none, each transient: the document turned the search away (turned_away), the answer was refused (HTTP 429), no
    answer came, or an answer that is not a 200."""
    if (away := turned_away(status, url)) is not None:
        return away
    if rpc is not None and rpc[0] == TOO_MANY:
        return Declined(CallCause.TRANSIENT, REFUSED)
    if rpc is None:
        return Declined(CallCause.TRANSIENT, f'no {RPC} answer within {WAIT_SECONDS} s (HTTP {status}): {url}')
    code, body = rpc
    if code != OK:
        return Declined(CallCause.TRANSIENT, f'Google answered {RPC} with HTTP {code}')
    return body


def is_rpc(message: 'Request | Response') -> bool:
    """Whether a request or a response is the answer's call."""
    return RPC in message.url


class TurnedAwayError(Exception):
    """The page's document turned the search away (turned_away): the waits for the answer end at once."""

    def __init__(self, declined: Declined) -> None:
        super().__init__(declined.why)
        self.declined = declined


def let_in(status: int | None, url: str) -> None:
    """TurnedAwayError when the page's document turned the search away (turned_away)."""
    if (away := turned_away(status, url)) is not None:
        raise TurnedAwayError(away)


def loaded(page: 'Page', url: str) -> bytes | Declined:
    """The page at this address loaded, and what it got (answered). The waits for the answer's response and for its
    last byte are set before the page loads, so neither can come before it is waited for, and each ends WAIT_SECONDS
    after: an answer whose body does not end is no answer, unless its status says why (a 429, its body or not). A
    document that turns the search away ends them at once."""
    timeout = WAIT_SECONDS * 1000
    status: int | None = None
    codes: list[int] = []  # the answer's status, once its response came

    def answer(response: 'Response') -> bool:
        if is_rpc(response):
            codes.append(response.status)
        return is_rpc(response)

    try:
        with (
            page.expect_response(answer, timeout=timeout) as caught,
            page.expect_event('requestfinished', is_rpc, timeout=timeout),
        ):
            document = page.goto(url, wait_until='domcontentloaded', timeout=timeout)
            status = document.status if document else None
            let_in(status, page.url)
        rpc = (caught.value.status, caught.value.body())
    except TurnedAwayError as e:
        return e.declined
    except TimedOut:
        # the page did not load, or got no whole answer: answered says which, and a status other than 200 says why
        rpc = (codes[0], b'') if codes and codes[0] != OK else None
    return answered(status, page.url, rpc)


class Reader(contextlib.AbstractContextManager['Reader']):
    """The run's browser (read_page.Browsers: started at the first search, closed with the run), every search in a
    context of its own. path: the Chromium to run (read_page's notes); version: the browser's, once started."""

    def __init__(self, path: str | None = None) -> None:
        self.browsers = read_page.Browsers(path)
        self.version: str | None = None

    def __exit__(self, *_: object) -> None:
        self.browsers.__exit__()

    def browser(self) -> 'Browser | Declined':
        """The run's browser, its version said once; structural when it would not start, as no search can be made."""
        try:
            b = self.browsers.get(visible=False)
        except read_page.NoBrowserError as e:
            return Declined(CallCause.STRUCTURAL, f'no browser would start: {e}')
        if self.version is None:
            self.version = b.version
            print(f'Chromium {self.version}', flush=True)
        return b

    def answer(self, url: str) -> bytes | Declined:
        """The answer the search page at this address got (loaded), in a context of its own; transient when the browser
        failed (crashed, or closed what it was asked to use)."""
        b = self.browser()
        if isinstance(b, Declined):
            return b
        try:
            context = b.new_context(locale='en-US')
        except Error as e:
            return Declined(CallCause.TRANSIENT, f'the browser failed: {why(e)}')
        try:
            # fli's consent cookie, which skips the consent page Google shows in Europe
            context.add_cookies([{'name': 'SOCS', 'value': SOCS_COOKIE, 'domain': '.google.com', 'path': '/'}])
            return loaded(context.new_page(), url)
        except Error as e:
            return Declined(CallCause.TRANSIENT, f'the browser failed: {why(e)}')
        finally:
            with contextlib.suppress(Error):
                context.close()

    def search(self, origin: str, airport: str, friday: dt.date, back: dt.date) -> tuple[Row, ...] | Declined:
        """The ways out Google answers the search (filters) with (parsed), or why there is no answer."""
        got = self.answer(address(filters(origin, airport, friday, back)))
        return got if isinstance(got, Declined) else parsed(got)
