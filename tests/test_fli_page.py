"""Google's outbound page as fli reads it, at the commit pyproject.toml pins: the contract pipeline/fli_page.py leans
on, held by pages Google sent (tests/pages/: the script of each page that holds its flights, the rest cut)."""

import datetime as dt
from pathlib import Path

import pytest
from fli.models import FlightResult, FlightSearchFilters
from fli.search import SearchFlights
from fli.search.client import Client
from fli.search.exceptions import SearchHTTPError

from pipeline import fli_page
from tests.fakes import no_wait

PAGES = Path(__file__).parent / 'pages'
# the searches the pages answer, as fli asks for them: Bergen to Lisbon for any flight, to Aberdeen for direct flights
LISBON = (
    'https://www.google.com/travel/flights?tfs=CBwQAhoeEgoyMDI2LTEyLTExagcIARIDQkdPcgcIARIDTElTGh4SCjIwMjYtMTItMTRqBwgB'
    'EgNMSVNyBwgBEgNCR09AAUgBcAGYAQE&hl=en&gl=US&curr=EUR'
)
ABERDEEN = (
    'https://www.google.com/travel/flights?tfs=CBwQAhogEgoyMDI2LTExLTIwKABqBwgBEgNCR09yBwgBEgNBQloaIBIKMjAyNi0xMS0yMygAag'
    'cIARIDQUJacgcIARIDQkdPQAFIAXABmAEB&hl=en&gl=US&curr=EUR'
)


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
    rows = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14), direct=False)
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


def test_flights_google_lists_with_no_price_are_ways_out_with_none(monkeypatch: pytest.MonkeyPatch) -> None:
    served(monkeypatch, ABERDEEN, (PAGES / 'google-bgo-abz-direct.html').read_text())
    rows = fli_page.page('BGO', 'ABZ', dt.date(2026, 11, 20), dt.date(2026, 11, 23), direct=True)
    assert rows == (fli_page.Row(None, 0, ('Widerøe',)), fli_page.Row(None, 0, ('Widerøe',)))


def test_a_page_with_no_flight_is_no_way_out(monkeypatch: pytest.MonkeyPatch) -> None:
    def none(*_args: object, **_kwargs: object) -> list[FlightResult] | None:
        return None  # fli's answer for a page with no flight row

    monkeypatch.setattr(SearchFlights, '_fetch_flights', none)
    assert fli_page.page('BGO', 'ABZ', dt.date(2026, 11, 20), dt.date(2026, 11, 23), direct=True) == ()


@pytest.mark.parametrize(
    ('status', 'why'), [(429, fli_page.REFUSED), (500, 'fli: no')], ids=['refused', 'another error']
)
def test_a_refused_search_and_a_failed_one_are_no_page(status: int, why: str, monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[str] = []

    def get(_client: Client, address: str, **_kwargs: object) -> Sent:
        sent.append(address)
        raise SearchHTTPError('no', status_code=status)

    monkeypatch.setattr(fli_page.OneTry, 'get', get)
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14), direct=False)
    assert failed == fli_page.Failed(why)
    assert isinstance(failed, fli_page.Failed)
    assert failed.refused is (status == 429)
    assert sent == [LISBON]


def test_a_page_fli_cannot_read_is_a_failed_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr('fli.search._tfs._sleep', no_wait)
    served(monkeypatch, LISBON, '<html>a consent page</html>')
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14), direct=False)
    assert isinstance(failed, fli_page.Failed)
    assert failed.why.startswith('fli: Search page carried no ds:1 payload')


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
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14), direct=False)
    assert failed == fli_page.Failed('fli gave a price in SEK, not the EUR it was asked')


def test_a_request_google_refuses_is_sent_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """fli's client tries a request three times, a second and two apart; refused, the search is not asked again."""
    sent: list[str] = []

    def refused(_session: object, url: str, **_kwargs: object) -> Sent:
        sent.append(url)
        raise SearchHTTPError('refused', status_code=429)

    monkeypatch.setattr('curl_cffi.requests.Session.get', refused)
    failed = fli_page.page('BGO', 'LIS', dt.date(2026, 12, 11), dt.date(2026, 12, 14), direct=False)
    assert isinstance(failed, fli_page.Failed)
    assert sent == [LISBON]
