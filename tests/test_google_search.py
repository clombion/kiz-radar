"""Google Flights' answer to its search page as fli reads it, at the commit pyproject.toml pins: the contract
pipeline/google_search.py leans on, held by answers Google sent a headless Chromium, each whole as it came
(tests/pages/google-*.txt), and by answers made here from them, each said so where it is made (sent); and what a page's
load gets, each outcome said once (answered), through fakes that wait as Patchright waits. No test starts a browser."""

import contextlib
import datetime as dt
import json
from collections.abc import Callable
from pathlib import Path
from types import TracebackType
from typing import TYPE_CHECKING, cast

import pytest
from fli.search._wire import iter_wrb_chunks
from patchright.sync_api import Error
from patchright.sync_api import TimeoutError as TimedOut

from pipeline import google_search, read_page
from pipeline.calls import Declined
from pipeline.enums import CallCause
from pipeline.google_search import Row

if TYPE_CHECKING:
    from fli.models import FlightResult
    from patchright.sync_api import Browser, Page

PAGES = Path(__file__).parent / 'pages'
# Bergen to Lyon, 18 to 21 December 2026, for any flight: ten ways out, nine priced, the cheapest €341, which the page
# drew as its cheapest; its two chunks list the same ways out
PRICED = (PAGES / 'google-bgo-lys-priced.txt').read_bytes()
# Bergen to Paris Orly, 18 to 21 December 2026: an answer listing no way out, which suggests Charles de Gaulle, Brussels
# and Luxembourg nearby, each with a token naming the answer noresults
NO_FLIGHT = (PAGES / 'google-bgo-ory-no-flight.txt').read_bytes()
# Bergen to Marseille, 5 to 8 February 2027: Google's error 13, signed by the page as every request is; asked again,
# the search was priced at €265
ERROR_13 = (PAGES / 'google-error-13.txt').read_bytes()
LYON = (
    'https://www.google.com/travel/flights?tfs=CBwQAhoeEgoyMDI2LTEyLTE4agcIARIDQkdPcgcIARIDTFlTGh4SCjIwMjYtMTItMjFqBwgB'
    'EgNMWVNyBwgBEgNCR09AAUgBcAGYAQE&hl=en&gl=US&curr=EUR'
)
FRIDAY, BACK = dt.date(2026, 12, 18), dt.date(2026, 12, 21)

# The day the answers were recorded: fli refuses a travel date before yesterday by its clock, and reads that clock
# through one function, which it names as the seam for tests (fli.models.google_flights.base.utc_today).
CAPTURED = dt.date(2026, 11, 22)


@pytest.fixture(autouse=True)
def captured_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr('fli.models.google_flights.base.utc_today', lambda: CAPTURED)


def inner(body: bytes) -> list[object]:
    """The first chunk's inner JSON of a recorded answer, to be changed and sent again (sent)."""
    chunk = cast('list[list[object]]', json.loads(body.decode().split('\n')[3]))
    return cast('list[object]', json.loads(cast('str', chunk[0][2])))


def sent(payload: object) -> bytes:
    """An answer holding this inner JSON, framed as Google frames it: an answer made here, not sent."""
    chunk = json.dumps([['wrb.fr', None, json.dumps(payload)]])
    return f")]}}'\n\n{len(chunk) + 2}\n{chunk}\n".encode()


def ways_out(payload: list[object]) -> list[list[object]]:
    """The rows of an answer's two lists of ways out (inner[2][0], then inner[3][0])."""
    return [row for i in (2, 3) for row in cast('list[list[list[list[object]]]]', payload)[i][0]]


def with_rows(rows: list[list[object]]) -> bytes:
    """Lyon's answer, its ways out these rows alone: an answer made here."""
    payload = inner(PRICED)
    payload[2], payload[3] = [rows], None
    return sent(payload)


def test_an_answer_is_its_first_chunk_s_ways_out_each_with_the_return_s_price() -> None:
    assert len(list(iter_wrb_chunks(PRICED))) == 2  # the second repeats the first's ways out
    rows = google_search.parsed(PRICED)
    assert isinstance(rows, tuple)
    assert len(rows) == 10
    assert rows[0] == Row(341.0, 1, ('Lufthansa Cargo', 'Discover Airlines'))  # fli's name for LH
    assert min(r.price for r in rows if r.price is not None) == 341.0  # the cheapest the page drew
    assert rows[-1] == Row(None, 2, ('Scandinavian Airlines',) * 3)  # listed with no price


def test_an_answer_whose_ways_out_have_no_price_lists_them_with_none() -> None:
    """No answer recorded lists only ways out with no price: this one is Lyon's with its way out with no price alone."""
    unpriced = ways_out(inner(PRICED))[-1]
    assert google_search.parsed(with_rows([unpriced])) == (Row(None, 2, ('Scandinavian Airlines',) * 3),)


def test_an_answer_that_says_it_has_no_way_out_lists_no_flight() -> None:
    assert google_search.parsed(NO_FLIGHT) == ()


def without_nearby() -> list[object]:
    payload = inner(NO_FLIGHT)
    payload[google_search.NEARBY] = None
    return payload


@pytest.mark.parametrize(
    'body',
    [
        sent([None] * 32),
        sent([]),
        sent({}),
        sent('x'),
        sent([1]),
        sent([None, None, list[object](), list[object]()]),
        sent([None, None, [None], None]),
        sent(without_nearby()),
        sent([None] * 32) + ERROR_13.split(b'\n', 2)[2],
    ],
    ids=[
        'nulls',
        'an empty list',
        'an object',
        'a string',
        'a number',
        'empty lists of ways out',
        'a null list of ways out',
        'Orly without its nearby airports',
        'nulls, then error 13',
    ],
)
def test_an_answer_with_no_way_out_that_does_not_say_so_is_no_answer(body: bytes) -> None:
    assert google_search.parsed(body) == Declined(CallCause.TRANSIENT, google_search.UNKNOWN)


def test_google_s_error_13_is_no_answer() -> None:
    assert google_search.parsed(ERROR_13) == Declined(CallCause.TRANSIENT, 'Google answered error 13')
    assert google_search.INTERNAL == 'Google answered error 13'


def test_an_answer_with_nothing_that_can_be_read_is_no_answer() -> None:
    got = google_search.parsed(b")]}'\n\n4\n[]\n")
    assert isinstance(got, Declined)
    assert got.cause == CallCause.TRANSIENT


def test_ways_out_that_cannot_be_read_are_no_answer_and_one_among_others_is_left_out() -> None:
    rows = ways_out(inner(PRICED))
    short: list[object] = [[None, None, []], [[100], 'token']]  # fli reads past its end
    assert google_search.parsed(with_rows([[None], ['half'], [], short])) == Declined(
        CallCause.TRANSIENT, 'none of the 4 rows Google answered with can be read'
    )
    kept = google_search.parsed(with_rows([[None], [], short, rows[0]]))
    assert kept == (Row(341.0, 1, ('Lufthansa Cargo', 'Discover Airlines')),)


def test_a_price_whose_currency_cannot_be_read_is_no_answer() -> None:
    """A price is kept in EUR or not at all: every priced way out recorded (69, in 11 answers) names EUR in its
    token."""
    rows = ways_out(inner(PRICED))
    unread, unpriced = (cast('list[list[object]]', row) for row in (rows[0], rows[-1]))
    unread[1][1] = '!'  # its price's token, which names the currency
    assert google_search.parsed(with_rows([rows[1], rows[0]])) == Declined(
        CallCause.TRANSIENT, 'Google gave a price of 341 whose currency cannot be read'
    )
    assert unpriced[1][1] is not None
    unpriced[1][1] = '!'  # a way out with no price needs no currency
    assert google_search.parsed(with_rows([rows[-1]])) == (Row(None, 2, ('Scandinavian Airlines',) * 3),)


def test_a_price_in_another_currency_is_structural(monkeypatch: pytest.MonkeyPatch) -> None:
    real = google_search.parse_flight_row

    def in_sek(row: object) -> 'FlightResult':
        r = real(row)
        r.currency = 'SEK'
        return r

    monkeypatch.setattr(google_search, 'parse_flight_row', in_sek)
    assert google_search.parsed(PRICED) == Declined(
        CallCause.STRUCTURAL, 'Google gave a price in SEK, not the EUR it was asked'
    )


OK = 200
ANSWER = (OK, PRICED)
SEARCHED = LYON.replace('www.google.com/travel/flights', 'www.google.com/travel/flights/search')
SORRY = 'https://www.google.com/sorry/index?continue=x'
CONSENT = 'https://consent.google.com/m?continue=x'


@pytest.mark.parametrize(
    ('status', 'url', 'rpc', 'why'),
    [
        (429, LYON, None, google_search.REFUSED),
        (200, SORRY, None, google_search.REFUSED),
        (200, SEARCHED, (429, b''), google_search.REFUSED),
        (200, CONSENT, None, 'Google showed its consent page: https://consent.google'),
        (200, SEARCHED, None, 'no GetShoppingResults answer within 45 s (HTTP 200)'),
        (None, LYON, None, 'no GetShoppingResults answer within 45 s (HTTP None)'),
        (200, SEARCHED, (500, b'oops'), 'Google answered GetShoppingResults with HTTP 500'),
    ],
    ids=['document 429', 'sorry page', 'answer 429', 'consent page', 'no answer', 'no load', 'answer not a 200'],
)
def test_a_load_that_got_no_answer_says_why(
    status: int | None, url: str, rpc: tuple[int, bytes] | None, why: str
) -> None:
    got = google_search.answered(status, url, rpc)
    assert isinstance(got, Declined)
    assert (got.cause, got.why[: len(why)]) == (CallCause.TRANSIENT, why)


def test_a_load_that_got_an_answer_gives_its_body() -> None:
    assert google_search.answered(200, SEARCHED, ANSWER) == PRICED


def test_a_search_asks_the_page_of_the_return_for_any_flight_in_eur(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[str] = []

    def answer(_reader: google_search.Reader, url: str) -> bytes:
        asked.append(url)
        return PRICED

    monkeypatch.setattr(google_search.Reader, 'answer', answer)
    with google_search.Reader() as reader:
        rows = reader.search('BGO', 'LYS', FRIDAY, BACK)
    assert asked == [LYON]
    assert rows == google_search.parsed(PRICED)


def test_a_browser_that_does_not_start_is_structural(monkeypatch: pytest.MonkeyPatch) -> None:
    def none(_browsers: read_page.Browsers, *, visible: bool) -> 'Browser':
        raise read_page.NoBrowserError("Executable doesn't exist")

    monkeypatch.setattr(read_page.Browsers, 'get', none)
    with google_search.Reader() as reader:
        got = reader.search('BGO', 'LYS', FRIDAY, BACK)
    assert got == Declined(CallCause.STRUCTURAL, "no browser would start: Executable doesn't exist")
    assert isinstance(got, Declined)
    assert got.stops


CLOSED = 'Target page, context or browser has been closed'


class Context:
    """A browser context, its page loading as the test says; its cookies refused as Patchright refuses them."""

    def __init__(self, page: object, *, fails: bool = False) -> None:
        self.page, self.fails, self.closed, self.cookies = page, fails, False, list[dict[str, str]]()

    def add_cookies(self, cookies: list[dict[str, str]]) -> None:
        for c in cookies:
            if not ('url' in c or ('domain' in c and 'path' in c)):
                raise Error('Cookie should have a url or a domain/path pair')
        self.cookies += cookies

    def new_page(self) -> object:
        if self.fails:
            raise Error(CLOSED)
        return self.page

    def close(self) -> None:
        self.closed = True


class Started:
    """A browser that started, its contexts made as the test says (none: it has crashed)."""

    version = '156.0.8078.4'

    def __init__(self, context: Context | None) -> None:
        self.context = context
        self.locales: list[str] = []

    def new_context(self, *, locale: str) -> Context:
        self.locales.append(locale)
        if self.context is None:
            raise Error(CLOSED)
        return self.context


def started(monkeypatch: pytest.MonkeyPatch, context: Context | None) -> Started:
    browser = Started(context)

    def get(_browsers: read_page.Browsers, *, visible: bool) -> 'Browser':
        assert not visible
        return cast('Browser', browser)

    monkeypatch.setattr(read_page.Browsers, 'get', get)
    return browser


def test_each_search_has_a_context_of_its_own_with_the_consent_cookie_and_the_browser_s_version_said_once(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    context = Context(page=object())
    browser = started(monkeypatch, context)
    pages: list[object] = []

    def loaded(page: 'Page', url: str) -> bytes:
        pages.append(page)
        return PRICED

    monkeypatch.setattr(google_search, 'loaded', loaded)
    with google_search.Reader() as reader:
        assert reader.answer(LYON) == PRICED
        assert reader.answer(LYON) == PRICED
    assert browser.locales == ['en-US', 'en-US']
    consent = {'name': 'SOCS', 'value': google_search.SOCS_COOKIE, 'domain': '.google.com', 'path': '/'}
    assert context.cookies == [consent, consent]
    assert context.closed
    assert capsys.readouterr().out == 'Chromium 156.0.8078.4\n'


def test_a_browser_that_fails_during_a_search_is_no_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    context = Context(page=object(), fails=True)
    _ = started(monkeypatch, context)
    with google_search.Reader() as reader:
        got = reader.answer(LYON)
    assert got == Declined(CallCause.TRANSIENT, f'the browser failed: Error: {CLOSED}')
    assert context.closed


def test_a_browser_that_crashed_is_no_answer_and_stops_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    _ = started(monkeypatch, None)
    with google_search.Reader() as reader:
        got = reader.answer(LYON)
    assert got == Declined(CallCause.TRANSIENT, f'the browser failed: Error: {CLOSED}')
    assert isinstance(got, Declined)
    assert not got.stops


class Wait(contextlib.AbstractContextManager['Wait']):
    """A wait a page sets for an event, as Patchright's (EventContextManager): at its end the event is waited for, and
    TimedOut when it has not come; cancelled, unwaited, when what it holds raises."""

    def __init__(self, page: 'Loading', event: str, came: Callable[[], object | None]) -> None:
        self.page, self.event, self.came = page, event, came

    def __exit__(self, kind: type[BaseException] | None, error: BaseException | None, _: TracebackType | None) -> None:
        if error is not None:
            self.page.cancelled.append(self.event)
            return
        self.page.waited.append(self.event)
        if self.came() is None:
            raise TimedOut(f'Timeout 45000ms exceeded while waiting for event "{self.event}"')

    @property
    def value(self) -> object:
        came = self.came()
        assert came is not None
        return came


class Message:
    """A request or a response: its address, and a response's status."""

    def __init__(self, url: str, status: int = OK) -> None:
        self.url, self.status = url, status


RPC_URL = f'https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/{google_search.RPC}?x'


def never(_: Message) -> bool:
    return False


class Loading:
    """A page loading a search: its document's status and the address it ends at (none: it does not load in time), and
    the answer it gets as it loads (none: it does not come; finished: its last byte comes; document: the load gives a
    response). Each response that comes is put to the waits' own tests, as Patchright puts it."""

    def __init__(
        self,
        status: int | None,
        url: str | None,
        rpc: tuple[int, bytes] | None,
        *,
        finished: bool = True,
        document: bool = True,
    ) -> None:
        self.status, self.ends_at, self.rpc, self.finished, self.document = status, url, rpc, finished, document
        self.url = 'about:blank'
        self.armed: list[str] = []
        self.waited: list[str] = []
        self.cancelled: list[str] = []
        self.responses: Callable[[Message], bool] = never
        self.ends: Callable[[Message], bool] = never
        self.got: Answer | None = None
        self.ended = False

    def goto(self, url: str, *, wait_until: str, timeout: int) -> 'Loading | None':
        assert (url, wait_until, timeout) == (LYON, 'domcontentloaded', google_search.WAIT_SECONDS * 1000)
        assert self.armed == ['response', 'requestfinished']  # both set before the page loads
        if self.ends_at is None:
            raise TimedOut('Timeout 45000ms exceeded.')
        self.url = self.ends_at
        assert not self.responses(Message(LYON, self.status or OK))
        assert not self.ends(Message(LYON))
        if self.rpc is not None:
            if self.responses(Message(RPC_URL, self.rpc[0])):
                self.got = Answer(*self.rpc)
            self.ended = self.finished and self.ends(Message(RPC_URL))
        return self if self.document else None

    def expect_response(self, matches: Callable[[Message], bool], *, timeout: int) -> Wait:
        assert timeout == google_search.WAIT_SECONDS * 1000
        self.responses = matches
        self.armed.append('response')
        return Wait(self, 'response', lambda: self.got)

    def expect_event(self, event: str, matches: Callable[[Message], bool], *, timeout: int) -> Wait:
        assert (event, timeout) == ('requestfinished', google_search.WAIT_SECONDS * 1000)
        self.ends = matches
        self.armed.append(event)
        return Wait(self, event, lambda: self.ended or None)


class Answer:
    """The answer a page got: its status and body."""

    def __init__(self, status: int, body: bytes) -> None:
        self.status, self.answered = status, body

    def body(self) -> bytes:
        return self.answered


NO_ANSWER = 'no GetShoppingResults answer within 45 s'


@pytest.mark.parametrize(
    ('loading', 'expected', 'waited'),
    [
        (Loading(200, SEARCHED, ANSWER), PRICED, True),
        (Loading(200, SEARCHED, (500, b'')), 'Google answered GetShoppingResults with HTTP 500', True),
        (Loading(200, SEARCHED, None), f'{NO_ANSWER} (HTTP 200)', True),
        (Loading(200, SEARCHED, ANSWER, finished=False), f'{NO_ANSWER} (HTTP 200)', True),
        (Loading(200, SEARCHED, (429, b''), finished=False), google_search.REFUSED, True),
        (Loading(None, None, None), f'{NO_ANSWER} (HTTP None): about:blank', False),
        (Loading(None, SEARCHED, None, document=False), f'{NO_ANSWER} (HTTP None)', True),
        (Loading(429, LYON, None), google_search.REFUSED, False),
        (Loading(429, SORRY, None), google_search.REFUSED, False),
        (Loading(200, CONSENT, None), 'Google showed its consent page', False),
    ],
    ids=[
        'answered',
        'answer not a 200',
        'no answer',
        'an answer that never ends',
        'an answer 429 that never ends',
        'no load',
        'no document',
        'refused',
        'sorry page',
        'consent page',
    ],
)
def test_a_loaded_page_gives_the_answer_it_got_and_waits_for_none_its_document_turned_away(
    loading: Loading, expected: bytes | str, *, waited: bool
) -> None:
    got = google_search.loaded(cast('Page', loading), LYON)
    assert (got if isinstance(got, bytes) else got.why[: len(cast('str', expected))]) == expected
    assert bool(loading.waited) == waited
