"""When a festival weekend's fare is searched again, what each search keeps, and the fares the site shows."""

import datetime as dt
import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

import pytest
from pydantic import BaseModel

from pipeline import fare_store, fare_weekends, fares, fli_page, web
from pipeline.calls import Declined
from pipeline.enums import CallCause, FareMode, FareOutcome, FareTicket, FareVendor
from pipeline.records import Offer, Search, digest, now, today
from tests.fakes import no_wait

FRIDAY = dt.date(2026, 11, 6)  # a festival weekend's
PAGES = Path(__file__).parent / 'pages'
HOME = 'BGO'  # the committed airports' home


pytestmark = pytest.mark.usefixtures('home_airports')


def test_closer_weekends_are_searched_more_often() -> None:
    assert [fares.interval(d) for d in (4, 35, 36, 91, 120, 182, 200, 330)] == [7, 7, 14, 14, 28, 28, 42, 42]


def test_weekends_google_doesnt_sell_yet_wait() -> None:
    assert fares.interval(331) is None


def test_weekdays_spread_over_the_week() -> None:
    friday = dt.date(2026, 11, 6)
    days = [
        fares.weekday_of(a, friday + dt.timedelta(weeks=w)) for a in ('OSL', 'GLA', 'LIS', 'BCN') for w in range(20)
    ]
    assert set(days) == set(range(7))
    assert max(days.count(d) for d in range(7)) < 25


def offer(price: float, ticket: FareTicket = FareTicket.ONE_TICKET, stops: int = 1) -> Offer:
    return Offer(price=price, ticket=ticket, stops_out=stops, stops_back=None, airlines=('KLM',))


def kept(
    airport: str,
    friday: dt.date,
    at: dt.datetime,
    outcome: FareOutcome = FareOutcome.OFFERS,
    *,
    offers: tuple[Offer, ...] | None = None,
    mode: FareMode = FareMode.ANY,
    vendor: FareVendor = FareVendor.GOOGLE,
    origin: str = HOME,
) -> Search:
    """A search of the history."""
    found = (offer(80),) if offers is None and outcome == FareOutcome.OFFERS else offers or ()
    return Search(
        id=digest(f'{origin} {airport} {friday} {mode} {vendor} {at}'),
        at=at,
        origin=origin,
        airport=airport,
        depart=friday,
        mode=mode,
        vendor=vendor,
        outcome=outcome,
        note='refused' if outcome == FareOutcome.FAILED else None,
        offers=found,
    )


def one_weekend(today: dt.date) -> dict[tuple[str, dt.date], bool]:
    return {('GLA', FRIDAY): True}


def first_in_queue(monkeypatch: pytest.MonkeyPatch, history: Sequence[Search], day: dt.date) -> fares.Weekend:
    monkeypatch.setattr(fare_weekends, 'weekends', one_weekend)
    return fares.queue(dt.datetime.combine(day, dt.time(6), dt.UTC), history)[0]


def test_never_searched_is_due_any_day(monkeypatch: pytest.MonkeyPatch) -> None:
    assert first_in_queue(monkeypatch, [], dt.date(2026, 10, 26)).due


def test_due_again_on_its_own_weekday_only(monkeypatch: pytest.MonkeyPatch) -> None:
    # GLA on 6 Nov is weekly; searched a week before its weekday in the week of 26 Oct
    its_day = dt.date(2026, 10, 26) + dt.timedelta(days=fares.weekday_of('GLA', FRIDAY))
    last = dt.datetime.combine(its_day - dt.timedelta(days=7), dt.time(6), dt.UTC)
    history = [kept('GLA', FRIDAY, last)]

    def due(day: dt.date) -> bool:
        return first_in_queue(monkeypatch, history, day).due

    assert due(its_day)
    assert not due(its_day + dt.timedelta(days=1))  # a day late is not its weekday
    assert due(its_day + dt.timedelta(days=8))  # past twice the interval: no longer waits for its day


def test_a_failed_search_is_no_search_of_its_weekend(monkeypatch: pytest.MonkeyPatch) -> None:
    day = dt.date(2026, 10, 27)
    failed = kept('GLA', FRIDAY, dt.datetime.combine(day, dt.time(5), dt.UTC), FareOutcome.FAILED)
    assert first_in_queue(monkeypatch, [failed], day).age is None
    assert fare_weekends.current([failed], {('GLA', FRIDAY)}) == {}


AT = dt.datetime(2026, 10, 27, 6, tzinfo=dt.UTC)  # when a fare was found
SOON = today() + dt.timedelta(days=10)  # due, weekly, never searched


@pytest.fixture
def weekends(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Two festival weekends due, no wait between searches, no pairs (test_pairs sets them), and a reseller with no
    trip, which keeps the airports it was asked for."""
    monkeypatch.setattr(fare_weekends, 'weekends', two_weekends)
    monkeypatch.setattr('time.sleep', no_wait)
    monkeypatch.setattr(fares, 'PAIR_SHARE', 0)
    resold: list[str] = []

    def post(address: web.Https, body: bytes, headers: Mapping[str, str]) -> bytes:
        resold.append(str(Sent.model_validate_json(body).params.arguments['flyTo']))
        return resold_answer().encode()

    monkeypatch.setattr(web, 'post', post)
    return resold


def two_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    return {('GLA', SOON): True, ('LIS', SOON): True}


type Google = Callable[[fares.Asked], Search | Declined]


def answering(found: Mapping[str, tuple[Offer, ...] | Declined | str]) -> Google:
    """fares.google, as it answers for each airport, from wherever: its offers (none: no price; 'listed': flights
    with none), or why there is no page."""

    def google(asked: fares.Asked) -> Search | Declined:
        f = found[asked.airport]
        if isinstance(f, Declined):
            return f
        listed = f == 'listed'
        return fares.search(asked, FareVendor.GOOGLE, () if isinstance(f, str) else f, listed=listed)

    return google


def kept_now() -> list[Search]:
    return fare_store.read()


def test_a_refresh_keeps_every_search_with_its_offers_in_the_run_s_file(
    weekends: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fares, 'google', answering({'GLA': (offer(80), offer(95, stops=0)), 'LIS': ()}))
    monkeypatch.setattr('sys.argv', ['fares', 'refresh'])
    fares.main()
    assert weekends == ['GLA', 'LIS']  # the reseller asked of each weekend Google answered
    found = {s.airport: s for s in kept_now() if s.vendor == FareVendor.GOOGLE}
    assert len(fare_store.kept()) == 1  # the run's file
    assert [o.price for o in found['GLA'].offers] == [80, 95]
    assert found['LIS'].outcome == FareOutcome.NONE
    live = fare_weekends.current(kept_now(), two_weekends(today()))
    assert {k: c.fare and c.fare.offer.price for k, c in live.items()} == {('GLA', SOON): 80, ('LIS', SOON): None}


def test_a_search_with_no_answer_is_kept_as_failed_and_the_run_fails_naming_it(
    weekends: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    broke = Declined(CallCause.TRANSIENT, 'fli: Search page carried no ds:1 payload')
    monkeypatch.setattr(fares, 'google', answering({'GLA': (offer(80),), 'LIS': broke}))
    with pytest.raises(SystemExit, match=r'1 searches gave no answer \(transient 1\): BGO→LIS'):
        fares.refresh(budget=5, max_seconds=60)
    found = {s.airport: s for s in kept_now() if s.vendor == FareVendor.GOOGLE}
    assert (found['LIS'].outcome, found['LIS'].note) == (FareOutcome.FAILED, broke.why)
    assert weekends == ['GLA']  # the reseller is not asked of a search Google gave no answer to
    assert [w.airport for w in fares.queue() if w.due] == ['LIS']  # tried again on the next run


@pytest.mark.usefixtures('weekends')
def test_the_reseller_is_asked_a_few_seconds_after_google_and_the_next_search_waits_longer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    waits: list[float] = []
    monkeypatch.setattr('time.sleep', waits.append)
    monkeypatch.setattr(fares, 'google', answering({'GLA': (offer(80),), 'LIS': (offer(90),)}))
    fares.refresh(budget=5, max_seconds=60)
    assert waits == [fares.KIWI_PAUSE, fares.PAUSE] * 2


@pytest.mark.usefixtures('weekends')
def test_a_refused_search_is_tried_once_more_then_the_rest_waits(monkeypatch: pytest.MonkeyPatch) -> None:
    tries: list[str] = []

    def refused(asked: fares.Asked) -> Declined:
        tries.append(asked.airport)
        return Declined(CallCause.TRANSIENT, fli_page.REFUSED)

    monkeypatch.setattr(fares, 'google', refused)
    with pytest.raises(SystemExit, match='Google refused the search'):
        fares.refresh(budget=5, max_seconds=60)
    assert len(tries) == 2  # the first weekend, twice; the second waits
    assert [s.outcome for s in kept_now()] == [FareOutcome.FAILED]


class KilledError(Exception):
    """A run stopped where it stood (the runner's timeout, a crash)."""


@pytest.mark.usefixtures('weekends')
def test_a_run_stopped_half_way_keeps_the_searches_it_made(monkeypatch: pytest.MonkeyPatch) -> None:
    asked: list[str] = []

    def google(a: fares.Asked) -> Search:
        if asked:
            raise KilledError
        asked.append(a.airport)
        return fares.search(a, FareVendor.GOOGLE, (offer(80),))

    monkeypatch.setattr(fares, 'google', google)
    with pytest.raises(KilledError):
        fares.refresh(budget=5, max_seconds=60)
    assert [(s.airport, s.vendor, s.offers[0].price if s.offers else None) for s in kept_now()] == [
        (asked[0], FareVendor.GOOGLE, 80),
        (asked[0], FareVendor.KIWI, None),
    ]


@pytest.mark.usefixtures('weekends')
def test_the_plan_lists_the_weekends_due(capsys: pytest.CaptureFixture[str]) -> None:
    fares.plan()
    out = capsys.readouterr().out
    assert out.startswith('2 of 2 festival weekends due today\n')
    assert f'GLA {SOON}: 10 days away, every 7 days, never searched' in out


def test_show_lists_the_searches_kept_the_latest_first(capsys: pytest.CaptureFixture[str]) -> None:
    later = AT + dt.timedelta(days=1)
    fare_store.write(fare_store.run_file(AT), [kept('LIS', FRIDAY, AT, offers=(offer(221), offer(300)))])
    fare_store.write(fare_store.run_file(later), [kept('GLA', FRIDAY, later, FareOutcome.NONE)])
    monkeypatch_argv = ['fares', 'show', '--limit', '1']
    with pytest.MonkeyPatch.context() as m:
        m.setattr('sys.argv', monkeypatch_argv)
        fares.main()
    assert capsys.readouterr().out.splitlines() == [
        '2 searches kept, the latest 1',
        f'2026-10-28 06:00 google BGO→GLA {FRIDAY} any: none',
    ]
    fares.show('LIS', HOME, 5)
    assert capsys.readouterr().out.splitlines()[1:] == [
        f'2026-10-27 06:00 google BGO→LIS {FRIDAY} any: offers',
        '    221 EUR, one_ticket, stops 1 out: KLM',
        '    300 EUR, one_ticket, stops 1 out: KLM',
    ]


# ----- what a search of Google keeps
type Page = tuple[fli_page.Row, ...] | Declined


def page(rows: Page) -> Callable[..., Page]:
    """fli_page.page, as it reads Google's page for GLA on FRIDAY, back NIGHTS later; asked anything else, the test
    fails."""

    def read(origin: str, airport: str, friday: dt.date, back: dt.date, *, direct: bool) -> Page:
        assert (origin, airport, friday, back, direct) == (HOME, 'GLA', FRIDAY, FRIDAY + dt.timedelta(days=3), False)
        return rows

    return read


@pytest.mark.parametrize(
    ('rows', 'expected'),
    [
        (
            (fli_page.Row(221.0, 1, ('KLM', 'KLM')), fli_page.Row(None, 0, ('Widerøe',))),
            (FareOutcome.OFFERS, [(221.0, 1, None)]),
        ),
        ((fli_page.Row(None, 0, ('Widerøe',)),), (FareOutcome.LISTED, list[tuple[float, int, None]]())),
        ((), (FareOutcome.NONE, list[tuple[float, int, None]]())),
    ],
    ids=['priced, the unpriced left out', 'listed with no price', 'no flight'],
)
def test_a_search_keeps_each_way_out_priced_as_an_offer_on_one_ticket(
    rows: tuple[fli_page.Row, ...],
    expected: tuple[FareOutcome, list[tuple[float, int, None]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(fli_page, 'page', page(rows))
    found = fares.google(fares.Asked(HOME, 'GLA', FRIDAY, FareMode.ANY))
    assert isinstance(found, Search)
    assert (found.outcome, [(o.price, o.stops_out, o.stops_back) for o in found.offers]) == expected
    assert {o.ticket for o in found.offers} <= {FareTicket.ONE_TICKET}


def test_a_page_google_would_not_give_is_no_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    refused = Declined(CallCause.TRANSIENT, fli_page.REFUSED)
    monkeypatch.setattr(fli_page, 'page', page(refused))
    assert fares.google(fares.Asked(HOME, 'GLA', FRIDAY, FareMode.ANY)) == refused


# ----- pairs: a weekend searched from home searched from another city too
def only(these: fare_weekends.Weekends) -> Callable[[dt.date], fare_weekends.Weekends]:
    """fare_weekends.weekends, giving these festival weekends whatever the day."""

    def weekends(_: dt.date) -> fare_weekends.Weekends:
        return these

    return weekends


def five_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """Five festival weekends due, each to its nearest airport."""
    return {(a, SOON): True for a in ('AMS', 'BCN', 'GLA', 'LIS', 'PRG')}


def test_pairs_take_a_quarter_of_the_budget_after_the_searches_from_home_in_their_mode(
    weekends: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fares, 'PAIR_SHARE', 0.25)
    monkeypatch.setattr(fare_weekends, 'weekends', five_weekends)
    asked: list[fares.Asked] = []
    broke = Declined(CallCause.TRANSIENT, 'fli: no page')

    def google(a: fares.Asked) -> Search | Declined:
        asked.append(a)
        if a.airport == 'AMS' and a.origin == HOME:
            return broke  # a weekend Google gave no answer to from home is paired with nothing
        return fares.search(a, FareVendor.GOOGLE, (offer(100),))

    monkeypatch.setattr(fares, 'google', google)
    with pytest.raises(SystemExit, match='AMS'):
        fares.refresh(budget=8, max_seconds=60)  # six answered from home, two pairs
    home = [a for a in asked if a.origin == HOME]
    assert [a.airport for a in home] == ['AMS', 'BCN', 'GLA', 'LIS', 'PRG']  # all there were
    day = now().date()
    assert asked[len(home) :] == [
        fares.Asked(fares.pair_origin(a, day), a.airport, a.friday, a.mode) for a in home[1:3]
    ]
    assert weekends == ['BCN', 'GLA', 'LIS', 'PRG']  # the reseller asked of home's alone
    kept = [s for s in kept_now() if s.origin != HOME]
    assert [(s.airport, s.outcome) for s in kept] == [('BCN', FareOutcome.OFFERS), ('GLA', FareOutcome.OFFERS)]
    # with fewer searches than weekends due, the pairs' share is kept for them: three answered from home, one pair
    asked.clear()
    monkeypatch.setattr(
        fare_weekends,
        'weekends',
        only({(a, SOON + dt.timedelta(days=7)): True for a in ('MAD', 'NCE', 'OPO', 'MUC')}),
    )
    monkeypatch.setattr(fares, 'google', answering(dict.fromkeys(('MAD', 'NCE', 'OPO', 'MUC'), (offer(100),))))
    fares.refresh(budget=4, max_seconds=60)
    later = [s for s in kept_now() if s.vendor == FareVendor.GOOGLE and s.depart > SOON]
    assert [(s.origin == HOME, s.airport) for s in later] == [
        (True, 'MAD'),
        (True, 'MUC'),
        (True, 'NCE'),
        (False, 'MAD'),
    ]
    assert fare_weekends.current(kept_now(), five_weekends(day))[('BCN', SOON)].searched.origin == HOME


def test_a_pair_of_an_extra_airport_is_searched_for_direct_flights_too(
    weekends: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fares, 'PAIR_SHARE', 0.25)
    monkeypatch.setattr(fare_weekends, 'weekends', only({('ABZ', SOON): False}))
    monkeypatch.setattr(fares, 'google', answering({'ABZ': 'listed'}))
    fares.refresh(budget=4, max_seconds=60)
    assert [(s.origin != HOME, s.vendor, s.mode) for s in kept_now()] == [
        (False, FareVendor.GOOGLE, FareMode.DIRECT),
        (False, FareVendor.KIWI, FareMode.DIRECT),
        (True, FareVendor.GOOGLE, FareMode.DIRECT),
    ]


def test_pairs_are_mostly_from_oslo_and_a_few_from_stavanger_and_trondheim() -> None:
    day = dt.date(2026, 11, 9)
    origins = [
        fares.pair_origin(fares.Asked(HOME, a, SOON + dt.timedelta(weeks=w), FareMode.ANY), day)
        for a in ('GLA', 'LIS', 'BCN', 'PRG', 'AMS')
        for w in range(20)
    ]
    assert {o: origins.count(o) > 0 for o in ('OSL', 'SVG', 'TRD')} == {'OSL': True, 'SVG': True, 'TRD': True}
    assert origins.count('OSL') > origins.count('SVG') + origins.count('TRD')


def test_a_weekend_to_the_city_a_pair_would_leave_from_is_not_paired(
    weekends: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    day = now().date()
    friday = next(
        f
        for f in (SOON + dt.timedelta(weeks=w) for w in range(50))
        if fares.pair_origin(fares.Asked(HOME, 'OSL', f, FareMode.ANY), day) == 'OSL'
    )
    monkeypatch.setattr(fares, 'PAIR_SHARE', 0.25)
    monkeypatch.setattr(fare_weekends, 'weekends', only({('OSL', friday): True}))
    monkeypatch.setattr(fares, 'google', answering({'OSL': (offer(60),)}))
    fares.refresh(budget=4, max_seconds=60)
    assert [s.origin for s in kept_now() if s.vendor == FareVendor.GOOGLE] == [HOME]


# ----- a festival's other airports
def three_airports(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """Glasgow's weekend: GLA its nearest, PIK and ABZ beside it; and Lisbon's, LIS its nearest."""
    return {('GLA', SOON): True, ('PIK', SOON): False, ('ABZ', SOON): False, ('LIS', SOON): True}


def aberdeen_nearest(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """ABZ the nearest airport of a festival that weekend."""
    return {('ABZ', SOON): True}


@pytest.mark.usefixtures('weekends')
def test_the_other_airports_are_searched_less_often_and_after_every_nearest_due(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert [fares.interval(d, nearest=False) for d in (4, 36, 120, 200, 331)] == [14, 28, 56, 84, None]
    monkeypatch.setattr(fare_weekends, 'weekends', three_airports)
    asked: list[tuple[str, FareMode]] = []

    def google(a: fares.Asked) -> Search:
        asked.append((a.airport, a.mode))
        return fares.search(a, FareVendor.GOOGLE, (offer(90, stops=0),))

    monkeypatch.setattr(fares, 'google', google)
    fares.refresh(budget=3, max_seconds=60)
    # the two nearest first, then one extra, for direct flights alone, within the budget of three
    assert asked == [('GLA', FareMode.ANY), ('LIS', FareMode.ANY), ('ABZ', FareMode.DIRECT)]
    assert {s.airport: fare_weekends.direct_found(s) for s in kept_now() if s.vendor == FareVendor.GOOGLE} == {
        'GLA': None,
        'LIS': None,
        'ABZ': True,
    }


def two_aberdeen_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """Glasgow's weekend and the next: GLA their nearest, ABZ beside it."""
    nxt = SOON + dt.timedelta(days=7)
    return {('GLA', SOON): True, ('ABZ', SOON): False, ('GLA', nxt): True, ('ABZ', nxt): False}


@pytest.mark.usefixtures('weekends')
def test_an_other_airport_with_no_direct_flight_is_not_searched_again_for_any_weekend_for_a_season(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(fare_weekends, 'weekends', two_aberdeen_weekends)
    asked: list[tuple[str, dt.date, FareMode]] = []

    def google(a: fares.Asked) -> Search:
        asked.append((a.airport, a.friday, a.mode))
        return fares.search(a, FareVendor.GOOGLE, ())

    monkeypatch.setattr(fares, 'google', google)
    fares.refresh(budget=9, max_seconds=60)
    # ABZ's first weekend has no direct flight, so its second is not searched, in this run or the next ones
    assert [(a, m) for a, _, m in asked] == [('GLA', FareMode.ANY), ('GLA', FareMode.ANY), ('ABZ', FareMode.DIRECT)]
    later = now() + dt.timedelta(days=60)  # every weekend due again by then
    assert {w.airport for w in fares.queue(later)} == {'GLA'}
    # a season on, the airport is tried again
    assert 'ABZ' in {w.airport for w in fares.queue(now() + dt.timedelta(days=fares.NO_DIRECT_DAYS + 1))}
    # an airport that becomes a festival's nearest is searched again, for any flight
    monkeypatch.setattr(fare_weekends, 'weekends', aberdeen_nearest)
    assert [(w.airport, w.nearest) for w in fares.queue(later)] == [('ABZ', True)]


def test_an_airport_with_a_direct_flight_one_weekend_is_searched_on_its_other_weekends(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    nxt, third = SOON + dt.timedelta(days=7), SOON + dt.timedelta(days=14)
    history = [
        kept('ABZ', SOON, now(), FareOutcome.NONE, mode=FareMode.DIRECT),
        kept('ABZ', nxt, now(), FareOutcome.LISTED, mode=FareMode.DIRECT),
    ]

    def three_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
        return {('ABZ', SOON): False, ('ABZ', nxt): False, ('ABZ', third): False}

    monkeypatch.setattr(fare_weekends, 'weekends', three_weekends)
    later = now() + dt.timedelta(days=60)
    # all but the weekend found with none, the one never searched among them
    assert sorted(w.friday for w in fares.queue(later, history)) == [nxt, third]


def test_a_weekend_further_ahead_than_flights_are_on_sale_rules_out_that_weekend_alone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    far = SOON + dt.timedelta(days=fares.SCHEDULED_DAYS)
    history = [kept('ABZ', far, now(), FareOutcome.NONE, mode=FareMode.DIRECT)]

    def near_and_far(_: dt.date) -> dict[tuple[str, dt.date], bool]:
        return {('ABZ', SOON): False, ('ABZ', far): False}

    monkeypatch.setattr(fare_weekends, 'weekends', near_and_far)
    assert fares.no_direct(history, now()) == set()
    assert [w.friday for w in fares.queue(now() + dt.timedelta(days=60), history)] == [SOON]


# ----- the reseller
class Params(BaseModel):
    arguments: dict[str, object]


class Sent(BaseModel):
    """The reseller's call as sent: its tool's arguments under params."""

    params: Params


def resold_answer(*trips: tuple[float, int, tuple[str, ...]]) -> str:
    """The reseller's answer, as it sends it (server-sent events): each trip its price, stops out (none back) and the
    airlines of its flights, out then back, all on one ticket."""

    def leg(stops: int, names: Sequence[str]) -> dict[str, object]:
        return {'stops': stops, 'segments': [{'carrierName': n, 'carrier': 'XX'} for n in names]}

    found = {
        'itineraries': [
            {
                'id': '|'.join(f'aa_{i}' for i in range(len(names))),
                'price': price,
                'outbound': leg(stops, names[:-1]),
                'inbound': leg(0, names[-1:]),
            }
            for price, stops, names in trips
        ]
    }
    rpc = {'jsonrpc': '2.0', 'id': 1, 'result': {'content': [{'type': 'text', 'text': json.dumps(found)}]}}
    return f'event: message\ndata: {json.dumps(rpc)}\n\n'


def test_a_reseller_s_trips_are_its_offers_each_by_the_tickets_it_is_booked_on() -> None:
    """Kiwi.com's answer for Bergen to Aberdeen, 20 to 23 November 2026 (tests/pages/): KLM out and Widerøe back are a
    ticket each way, Norwegian and easyJet out are two tickets one way, a self-transfer."""
    found = fares.kiwi_offers((PAGES / 'kiwi-bgo-abz.txt').read_text())
    assert isinstance(found, tuple)
    by_ticket = [(o.price, o.ticket, o.stops_out, o.stops_back) for o in found]
    assert by_ticket[:2] == [(349.0, FareTicket.SELF_TRANSFER, 1, 1), (359.0, FareTicket.ONE_TICKET, 1, 0)]
    assert [o.ticket for o in found].count(FareTicket.SELF_TRANSFER) == 5
    wideroe = next(o for o in found if o.airlines == ('Widerøe', 'Widerøe'))
    assert (wideroe.price, wideroe.ticket, wideroe.stops_out) == (438.0, FareTicket.ONE_TICKET, 0)
    norwegian = next(o for o in found if o.airlines[0] == 'Norwegian Air Shuttle')
    assert (norwegian.price, norwegian.ticket) == (481.0, FareTicket.SELF_TRANSFER)


@pytest.mark.parametrize(
    ('answer', 'expected'),
    [
        (resold_answer(), ()),
        ('data: {"jsonrpc": "2.0", "id": 1, "result": {"isError": true, "content": []}}', 'no result'),
        ('data: {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"text": "{}x"}]}}', 'cannot be read'),
        (
            resold_answer((359, 1, ('KLM', 'KLM', 'Widerøe'))).replace('aa_0|aa_1|aa_2', 'aa_0|aa_1'),
            'cannot be read',
        ),
    ],
    ids=['no trip', 'an error', 'unreadable', 'a trip whose id is not its flights'],
)
def test_a_reseller_s_answer_with_no_trip_or_none_to_read(answer: str, expected: tuple[()] | str) -> None:
    found = fares.kiwi_offers(answer)
    assert found == expected if isinstance(expected, tuple) else expected in str(found)


@pytest.mark.usefixtures('weekends')
def test_a_reseller_is_asked_each_weekend_the_same_and_priced_where_google_lists_no_price(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[dict[str, object]] = []

    def post(address: web.Https, body: bytes, headers: Mapping[str, str]) -> bytes:
        assert (address, headers) == (fares.RESELLER, fares.RESELLER_HEADERS)
        sent.append(Sent.model_validate_json(body).params.arguments)
        return resold_answer((438, 0, ('Widerøe', 'Widerøe'))).encode()

    monkeypatch.setattr(fare_weekends, 'weekends', three_airports)
    monkeypatch.setattr(fares, 'google', answering({'GLA': (), 'LIS': (), 'PIK': (), 'ABZ': 'listed'}))
    monkeypatch.setattr(web, 'post', post)
    fares.refresh(budget=9, max_seconds=60)
    # the reseller asked of each weekend searched, the same: ABZ for direct flights alone, Friday to Monday
    monday = SOON + dt.timedelta(days=fare_weekends.NIGHTS)
    assert [a['flyTo'] for a in sent] == ['GLA', 'LIS', 'ABZ', 'PIK']
    assert sent[2:3] == [
        {
            'flyFrom': HOME,
            'flyTo': 'ABZ',
            'departureDate': SOON.strftime('%d/%m/%Y'),
            'returnDate': monday.strftime('%d/%m/%Y'),
            'currency': 'EUR',
            'sort': 'price',
            'max_sector_stopovers': 0,
        }
    ]
    live = fare_weekends.current(kept_now(), three_airports(today()))
    abz = live[('ABZ', SOON)]
    assert abz.fare is not None
    assert (abz.fare.offer.price, abz.fare.search.vendor, abz.fare.offer.airlines) == (
        438,
        FareVendor.KIWI,
        ('Widerøe', 'Widerøe'),
    )
    assert fare_weekends.direct_found(abz.searched) is True


@pytest.mark.usefixtures('weekends')
def test_a_reseller_that_fails_is_kept_as_failed_and_the_run_goes_on(monkeypatch: pytest.MonkeyPatch) -> None:
    def down(address: web.Https, body: bytes, headers: Mapping[str, str]) -> Declined:
        return Declined(CallCause.TRANSIENT, 'mcp.kiwi.com: HTTP 503')

    monkeypatch.setattr(fares, 'google', answering({'GLA': 'listed', 'LIS': (offer(120),)}))
    monkeypatch.setattr(web, 'post', down)
    fares.refresh(budget=9, max_seconds=60)  # no exit: the reseller's failure fails no run
    kiwi = sorted((s for s in kept_now() if s.vendor == FareVendor.KIWI), key=lambda s: s.airport)
    assert [(s.airport, s.outcome, s.note) for s in kiwi] == [
        (a, FareOutcome.FAILED, 'mcp.kiwi.com: HTTP 503') for a in ('GLA', 'LIS')
    ]
    assert fare_weekends.current(kept_now(), two_weekends(today()))[('GLA', SOON)].fare is None


# ----- the fares the site shows
def test_the_card_s_fare_is_the_cheapest_on_one_ticket_of_the_weekend_s_latest_search() -> None:
    later = AT + dt.timedelta(days=7)
    history = [
        kept('LIS', FRIDAY, AT, offers=(offer(100),)),
        kept('LIS', FRIDAY, later, offers=(offer(150), offer(140, FareTicket.SELF_TRANSFER))),
        kept('GLA', FRIDAY, AT, offers=(offer(90),)),
        kept('GLA', FRIDAY, later, FareOutcome.NONE),  # the price is gone
        kept('OSL', FRIDAY, later, FareOutcome.FAILED),
        kept('BCN', FRIDAY, AT, offers=(offer(70),)),  # a weekend no festival has any more
        kept('LIS', FRIDAY, later + dt.timedelta(hours=1), origin='OSL', offers=(offer(60),)),  # not from home
    ]
    live = fare_weekends.current(history, {('LIS', FRIDAY), ('GLA', FRIDAY), ('OSL', FRIDAY)})
    assert {k[0]: c.fare and c.fare.offer.price for k, c in live.items()} == {'LIS': 150, 'GLA': None}


def test_the_flights_add_a_reseller_s_self_transfer_only_when_it_is_cheaper_than_the_fare() -> None:
    def with_resold(google: tuple[Offer, ...], resold: tuple[Offer, ...]) -> float | None:
        history = [
            kept('LIS', FRIDAY, AT, offers=google or None, outcome=FareOutcome.OFFERS if google else FareOutcome.NONE),
            kept('LIS', FRIDAY, AT, offers=resold, vendor=FareVendor.KIWI),
        ]
        t = fare_weekends.current(history, {('LIS', FRIDAY)})[('LIS', FRIDAY)].transfer
        return t and t.offer.price

    split = (offer(300, FareTicket.SELF_TRANSFER), offer(180, FareTicket.SELF_TRANSFER), offer(150))
    assert with_resold((offer(200),), split) == 180  # the cheapest self-transfer, a one-ticket one cheaper aside
    assert with_resold((offer(170),), split) is None  # dearer than the fare
    assert with_resold((), split) == 180  # no fare: any


def test_a_reseller_s_fare_is_taken_only_with_the_google_search_it_was_asked_with() -> None:
    later = AT + dt.timedelta(days=7)
    resold = (offer(438), offer(300, FareTicket.SELF_TRANSFER))
    history = [
        kept('ABZ', FRIDAY, AT, FareOutcome.LISTED, mode=FareMode.DIRECT),
        kept('ABZ', FRIDAY, AT, offers=resold, mode=FareMode.DIRECT, vendor=FareVendor.KIWI),
    ]
    found = fare_weekends.current(history, {('ABZ', FRIDAY)})[('ABZ', FRIDAY)]
    assert found.fare is not None
    assert found.fare.offer.price == 438  # on one ticket
    newer = [*history, kept('ABZ', FRIDAY, later, FareOutcome.LISTED, mode=FareMode.DIRECT)]
    assert fare_weekends.current(newer, {('ABZ', FRIDAY)})[('ABZ', FRIDAY)].fare is None  # the reseller's is older
