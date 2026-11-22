"""Google's outbound page as fli reads it, at the commit pyproject.toml pins: the contract pipeline/fli_page.py leans
on, held by pages Google sent (tests/pages/: the script of each page that holds its flights, the rest cut)."""

import datetime as dt
import importlib.util
import json
import re
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING, cast

import pytest
from fli.models import FlightResult, FlightSearchFilters, MaxStops
from fli.search import SearchFlights
from fli.search.client import Client
from fli.search.exceptions import SearchHTTPError

from pipeline import ROOT, fli_page
from pipeline.calls import Declined
from pipeline.enums import CallCause
from tests.fakes import no_wait

if TYPE_CHECKING:
    from collections.abc import Callable

PAGES = Path(__file__).parent / 'pages'
# the searches the pages answer, as fli asks for them: Bergen to Lisbon for any flight, to Aberdeen for direct flights
LISBON = (
    'https://www.google.com/travel/flights?tfs=CBwQAhoeEgoyMDI2LTEyLTExagcIARIDQkdPcgcIARIDTElTGh4SCjIwMjYtMTItMTRqBwgB'
    'EgNMSVNyBwgBEgNCR09AAUgBcAGYAQE&hl=en&gl=US&curr=EUR'
)
# Bergen to Lyon, 18 to 21 December 2026, for any flight: a page with no flight row that names the route's airlines and
# prices nearby dates, sent alike twice and a third time with gl=NO, within 13 minutes, while a browser showed flights
# for the search from €333: an empty page is no proof of no flight
LYON = (
    'https://www.google.com/travel/flights?tfs=CBwQAhoeEgoyMDI2LTEyLTE4agcIARIDQkdPcgcIARIDTFlTGh4SCjIwMjYtMTItMjFqBwgB'
    'EgNMWVNyBwgBEgNCR09AAUgBcAGYAQE&hl=en&gl=US&curr=EUR'
)
ABERDEEN = (
    'https://www.google.com/travel/flights?tfs=CBwQAhogEgoyMDI2LTExLTIwKABqBwgBEgNCR09yBwgBEgNBQloaIBIKMjAyNi0xMS0yMygAag'
    'cIARIDQUJacgcIARIDQkdPQAFIAXABmAEB&hl=en&gl=US&curr=EUR'
)


# The day the pages were captured: fli refuses a travel date before yesterday by its clock, and reads that clock through
# one function, which it names as the seam for tests (fli.models.google_flights.base.utc_today). The searches' dates are
# the pages' own, in their addresses, so the clock is pinned instead of the dates moved.
CAPTURED = dt.date(2026, 11, 19)


@pytest.fixture(autouse=True)
def captured_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr('fli.models.google_flights.base.utc_today', lambda: CAPTURED)


class Sent:
    """A page as fli's client gives it: sent with a 200."""

    def __init__(self, text: str) -> None:
        self.text = text

    def raise_for_status(self) -> None:
        """A 200 raises nothing."""


def served(monkeypatch: pytest.MonkeyPatch, url: str, page: str, asked: list[str] | None = None) -> None:
    """fli's client, sending this page when asked for this address; asked another, the test fails."""

    def get(_client: Client, address: str, **_kwargs: object) -> Sent:
        assert address == url
        if asked is not None:
            asked.append(address)
        return Sent(page)

    monkeypatch.setattr(fli_page.OneTry, 'get', get)


def test_the_page_is_its_ways_out_cheapest_first_each_with_the_return_s_price(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[str] = []
    served(monkeypatch, LISBON, (PAGES / 'google-bgo-lis.html').read_text(), asked)
    rows = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14))
    assert isinstance(rows, tuple)
    assert asked == [LISBON]  # one request
    # €221 is what Google's booking page asked for this trip that day
    assert rows[:3] == (
        fli_page.Row(221.0, 1, ('KLM', 'KLM')),
        fli_page.Row(283.0, 1, ('KLM', 'Transavia Airlines')),
        fli_page.Row(325.0, 1, ('Lufthansa Cargo', 'Lufthansa Cargo')),  # fli's name for LH
    )
    assert len(rows) == 12
    prices = [r.price for r in rows if r.price is not None]
    assert prices == sorted(prices)
    assert [r.price for r in rows[len(prices) :]] == [None]  # listed with no price, after the priced


def aberdeen(monkeypatch: pytest.MonkeyPatch, page: str) -> tuple[fli_page.Row, ...] | fli_page.Empty | Declined:
    """The page sent for the search for direct flights alone it answers, asked through fli's own filters (the pipeline
    asks for any flight alone), as fli_page reads it."""
    served(monkeypatch, ABERDEEN, page)
    direct = fli_page.filters('BGO', 'ABZ', dt.date(2026, 11, 20), dt.date(2026, 11, 23))
    return fli_page.read(direct.model_copy(update={'stops': MaxStops.NON_STOP}))


def test_flights_google_lists_with_no_price_are_ways_out_with_none(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = aberdeen(monkeypatch, (PAGES / 'google-bgo-abz-direct.html').read_text())
    assert rows == (fli_page.Row(None, 0, ('Widerøe',)), fli_page.Row(None, 0, ('Widerøe',)))


def lyon(monkeypatch: pytest.MonkeyPatch, page: str) -> tuple[fli_page.Row, ...] | fli_page.Empty | Declined:
    served(monkeypatch, LYON, page)
    return fli_page.page('BGO', 'LYS', dt.date(2026, 12, 18), dt.date(2026, 12, 21))


EMPTY = (PAGES / 'google-bgo-lys-empty.html').read_text()


def test_a_page_with_no_flight_is_empty_with_the_nearby_dates_it_prices(monkeypatch: pytest.MonkeyPatch) -> None:
    assert lyon(monkeypatch, EMPTY) == fli_page.Empty(nearby=8)


def payload_of(page: str) -> list[object]:
    """A page's ds:1 payload, to be changed and sent again (sent)."""
    data = re.search(r'data:(.*), sideChannel', page, re.DOTALL)
    assert data is not None
    return cast('list[object]', json.loads(data.group(1)))


def sent(payload: object) -> str:
    """A page holding this ds:1 payload, as Google sends it."""
    return f"<script>AF_initDataCallback({{key: 'ds:1', hash: '9', data:{json.dumps(payload)}, sideChannel: {{}}}});"


def changed(*, airlines: bool, dates: bool) -> str:
    """Lyon's empty page Google sent, its airlines, its nearby dates or both taken out: pages made here, not sent."""
    payload = payload_of(EMPTY)
    if not airlines:
        cast('list[object]', fli_page.at(payload, 7, 1))[1] = []
    if not dates:
        cast('list[object]', fli_page.at(payload, 6, 0, 4))[0] = []
    return sent(payload)


@pytest.mark.parametrize(
    ('airlines', 'dates', 'nearby'),
    [(False, False, 0), (True, False, 0), (False, True, 8)],
    ids=['neither', 'airlines alone', 'nearby dates alone'],
)
def test_an_empty_page_is_empty_whatever_airlines_or_nearby_dates_it_names(
    airlines: bool, dates: bool, nearby: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert lyon(monkeypatch, changed(airlines=airlines, dates=dates)) == fli_page.Empty(nearby)


TRIAL = ROOT / 'scripts' / 'fare_reader_trial.py'


def trial() -> ModuleType:
    """scripts/fare_reader_trial.py, which reads the nearby dates as fli_page does without importing it."""
    spec = importlib.util.spec_from_file_location('fare_reader_trial', TRIAL)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize(
    ('airlines', 'dates'),
    [(True, True), (False, False), (True, False), (False, True)],
    ids=['as sent', 'neither', 'airlines alone', 'nearby dates alone'],
)
def test_the_reader_trial_counts_an_empty_page_s_nearby_dates_as_the_pipeline_does(
    airlines: bool, dates: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    page = EMPTY if airlines and dates else changed(airlines=airlines, dates=dates)
    found = lyon(monkeypatch, page)
    assert isinstance(found, fli_page.Empty)
    script = trial()
    assert cast('Callable[[object], int]', script.nearby_dates)(payload_of(page)) == found.nearby
    if airlines and dates:
        assert found.nearby == cast('int', script.EMPTY_NEARBY)  # the count its selftest asks of the page


def test_a_direct_search_s_page_names_airlines_that_only_connect_so_with_no_row_it_is_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = payload_of((PAGES / 'google-bgo-abz-direct.html').read_text())
    named = {cast('list[object]', a)[0] for a in fli_page.items(fli_page.at(payload, 7, 1, 1))}
    assert {'AF', 'AY', 'KL'} <= named  # Air France, Finnair and KLM fly no direct flight from Bergen to Aberdeen
    payload[3] = None  # its two rows, Widerøe's, taken out: a page made here of a direct search with no row
    assert aberdeen(monkeypatch, sent(payload)) == fli_page.Empty(nearby=0)


@pytest.mark.parametrize(
    ('status', 'why'), [(429, fli_page.REFUSED), (500, 'fli: no')], ids=['refused', 'another error']
)
def test_a_refused_search_and_a_failed_one_are_no_page(status: int, why: str, monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[str] = []

    def get(_client: Client, address: str, **_kwargs: object) -> Sent:
        sent.append(address)
        raise SearchHTTPError('no', status_code=status)

    monkeypatch.setattr(fli_page.OneTry, 'get', get)
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14))
    assert failed == Declined(CallCause.TRANSIENT, why)
    assert sent == [LISBON]


def test_a_page_fli_cannot_read_is_a_failed_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr('fli.search._tfs._sleep', no_wait)
    served(monkeypatch, LISBON, '<html>a consent page</html>')
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14))
    assert isinstance(failed, Declined)
    assert (failed.cause, failed.why[:40]) == (CallCause.TRANSIENT, 'fli: Search page carried no ds:1 payload')


def test_a_price_in_another_currency_is_a_failed_search(monkeypatch: pytest.MonkeyPatch) -> None:
    page = (PAGES / 'google-bgo-lis.html').read_text()
    served(monkeypatch, LISBON, page)
    real = SearchFlights._fetch_flights

    def in_sek(
        self: SearchFlights,
        filters: FlightSearchFilters,
        *,
        currency: str | None,
        language: str | None,
        country: str | None,
        capture_session: bool,
    ) -> list[FlightResult] | None:
        rows = real(
            self, filters, currency=currency, language=language, country=country, capture_session=capture_session
        )
        for r in rows or []:
            r.currency = 'SEK'
        return rows

    monkeypatch.setattr(SearchFlights, '_fetch_flights', in_sek)
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14))
    assert failed == Declined(CallCause.STRUCTURAL, 'fli gave a price in SEK, not the EUR it was asked')


def test_a_request_google_refuses_is_sent_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """fli's client tries a request three times, a second and two apart; refused, the search is not asked again."""
    sent: list[str] = []

    def refused(_session: object, url: str, **_kwargs: object) -> Sent:
        sent.append(url)
        raise SearchHTTPError('refused', status_code=429)

    monkeypatch.setattr('curl_cffi.requests.Session.get', refused)
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14))
    assert failed == Declined(CallCause.TRANSIENT, fli_page.REFUSED)
    assert sent == [LISBON]
