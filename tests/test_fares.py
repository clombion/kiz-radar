"""When a festival weekend's fare is searched again."""

import datetime as dt
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Protocol

import pytest

from pipeline import fares
from pipeline.calls import Declined
from pipeline.enums import CallCause
from pipeline.records import Airport, now, today
from tests.exports import committed
from tests.fakes import no_wait

FRIDAY = dt.date(2026, 11, 6)  # a festival weekend's


@pytest.fixture(autouse=True)
def airports() -> None:
    """The committed airports, home among them, where every search leaves from."""
    committed(Airport.FILE)


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


def one_weekend(today: dt.date) -> dict[tuple[str, dt.date], bool]:
    return {('GLA', FRIDAY): True}


def run_queue(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, jobs: Sequence[fares.Job], today: dt.date
) -> fares.Weekend:
    monkeypatch.setattr(fares, 'weekends', one_weekend)
    fares.Job.write(jobs)
    fares.Fare.write([])
    return fares.queue(dt.datetime.combine(today, dt.time(6), dt.UTC))[0]


def test_never_searched_is_due_any_day(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assert run_queue(tmp_path, monkeypatch, [], dt.date(2026, 10, 26)).due


def test_due_again_on_its_own_weekday_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # GLA on 6 Nov is weekly; searched a week before its weekday in the week of 26 Oct
    its_day = dt.date(2026, 10, 26) + dt.timedelta(days=fares.weekday_of('GLA', FRIDAY))
    last = dt.datetime.combine(its_day - dt.timedelta(days=7), dt.time(6), dt.UTC)
    job = fares.Job(airport='GLA', depart=FRIDAY, last_run=last)

    def due(day: dt.date) -> bool:
        return run_queue(tmp_path, monkeypatch, [job], day).due

    assert due(its_day)
    assert not due(its_day + dt.timedelta(days=1))  # a day late is not its weekday
    assert due(its_day + dt.timedelta(days=8))  # past twice the interval: no longer waits for its day


type Run = Callable[..., subprocess.CompletedProcess[str]]


def ran(cmd: list[str], capture_output: bool, text: bool, timeout: float, check: bool) -> None:
    """How fares.search runs fli: its outputs read as text, for TIMEOUT seconds at most, its exit status its own to
    read; run otherwise, the test fails."""
    assert (capture_output, text, timeout, check) == (True, True, fares.TIMEOUT, False), cmd


def fli(stdout: str, stderr: str = '', *, direct: bool = False) -> Run:
    """subprocess.run, as fli answers a search for the cheapest return from home to GLA on FRIDAY, back NIGHTS later
    (direct flights alone when direct): these words on its outputs; asked anything else, the test fails."""

    def run(
        cmd: list[str], *, capture_output: bool, text: bool, timeout: float, check: bool
    ) -> subprocess.CompletedProcess[str]:
        ran(cmd, capture_output, text, timeout, check)
        back = (FRIDAY + dt.timedelta(days=fares.NIGHTS)).isoformat()
        asked = ['GLA', FRIDAY.isoformat(), '--return', back, '--sort', 'CHEAPEST', '--top-n', '1']
        assert cmd[cmd.index('flights') + 2 :][:-4] == asked + (['--stops', 'NON_STOP'] if direct else [])
        assert cmd[-4:] == ['--currency', 'EUR', '--format', 'json']
        return subprocess.CompletedProcess(cmd, 0, stdout, stderr)

    return run


# fli's flights answer, as its serializer writes a return trip: the price on it, the stops out and back together
TRIP = '{"price": 123.4, "currency": "EUR", "duration": 300, "stops": 1, "outbound": {}, "return": {}}'
DIRECT = '{"price": 150, "currency": "EUR", "duration": 240, "stops": 0, "outbound": {}, "return": {}}'
PRICED = f'{{"success": true, "flights": [{DIRECT}, {TRIP}]}}'


@pytest.mark.parametrize(
    ('stdout', 'stderr', 'expected'),
    [
        (f'searching…\n{PRICED}', '', ('priced', (123, 1))),
        ('{"success": false, "error": {"message": "no flights"}}', '', ('no price', 'no flights')),
        ('{"success": true, "flights": []}', '', ('no price', '')),
        ('', 'Traceback…\nHTTP 429 Too Many Requests', (CallCause.TRANSIENT, fares.REFUSED)),
        ('not json', 'it broke\nfor good', (CallCause.TRANSIENT, 'fli wrote no answer: for good')),
        (
            PRICED.replace('"EUR"', '"SEK"'),
            '',
            (CallCause.STRUCTURAL, 'fli gave a price in SEK, not the EUR it was asked'),
        ),
    ],
    ids=['priced, the cheaper', 'no flights', 'none found', 'refused', 'no answer', 'another currency'],
)
def test_a_search_reads_fli_s_answer(
    stdout: str, stderr: str, expected: tuple[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(subprocess, 'run', fli(stdout, stderr))
    found = fares.search('GLA', FRIDAY)
    match found:
        case fares.Fare():
            got: tuple[str, object] = ('priced', (found.price, found.stops))
        case fares.Missed():
            got = ('no price', found.note)
        case Declined():
            got = (found.cause, found.why)
    assert got == expected


def test_a_search_that_takes_too_long_gives_no_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    def run(
        cmd: list[str], *, capture_output: bool, text: bool, timeout: float, check: bool
    ) -> subprocess.CompletedProcess[str]:
        ran(cmd, capture_output, text, timeout, check)
        raise subprocess.TimeoutExpired(cmd, timeout)

    monkeypatch.setattr(subprocess, 'run', run)
    assert fares.search('GLA', FRIDAY) == Declined(CallCause.TRANSIENT, f'fli took over {fares.TIMEOUT} s')


AT = dt.datetime(2026, 10, 27, 6, tzinfo=dt.UTC)  # when a fare was found
LONG_AGO = now() - dt.timedelta(days=60)  # a fare found so long ago that its weekend is due again
SOON = today() + dt.timedelta(days=10)  # due, weekly, never searched


@pytest.fixture
def weekends(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two festival weekends due, a fare kept for a weekend no festival has any more, and no wait between searches."""
    monkeypatch.setattr(fares, 'weekends', two_weekends)
    monkeypatch.setattr('time.sleep', no_wait)
    fares.Job.write([])
    gone = fares.Fare(airport='OSL', depart=dt.date(2026, 1, 2), price=1, fetched_at=AT)
    fares.Fare.write([gone])
    return tmp_path


def two_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    return {('GLA', SOON): True, ('LIS', SOON): True}


type Searched = fares.Fare | fares.Missed | Declined


class Search(Protocol):
    def __call__(self, airport: str, friday: dt.date, *, direct: bool) -> Searched: ...


def searched(found: dict[str, Searched]) -> Search:
    """fares.search, as it answers for each airport the weekend two_weekends gives; asked another, the test fails."""

    def search(airport: str, friday: dt.date, *, direct: bool) -> Searched:
        assert (friday, direct) == (SOON, False)
        return found[airport]

    return search


def test_a_refresh_keeps_the_fares_found_and_logs_every_search(weekends: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fare = fares.Fare(airport='GLA', depart=SOON, price=80, fetched_at=AT)
    monkeypatch.setattr(fares, 'search', searched({'GLA': fare, 'LIS': fares.Missed('none')}))
    monkeypatch.setattr('sys.argv', ['fares', 'refresh'])
    fares.main()
    assert fares.Fare.read() == [fare]  # the weekend gone took its fare with it
    assert {j.airport for j in fares.Job.read()} == {'GLA', 'LIS'}


def test_a_weekend_with_no_price_now_loses_its_old_fare_and_one_with_no_answer_keeps_all(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    old = [fares.Fare(airport=a, depart=SOON, price=80, fetched_at=LONG_AGO) for a in ('GLA', 'LIS')]
    fares.Fare.write(old)
    late = Declined(CallCause.TRANSIENT, 'fli took over 300 s')
    monkeypatch.setattr(fares, 'search', searched({'GLA': fares.Missed('none'), 'LIS': late}))
    with pytest.raises(SystemExit, match=r'1 searches gave no answer \(transient 1\): LIS'):
        fares.refresh(budget=5, max_seconds=60)
    assert fares.Fare.read() == [old[1]]
    assert [j.airport for j in fares.Job.read()] == ['GLA']  # LIS: tried next run


def test_a_refused_search_is_tried_once_more_then_the_rest_waits(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tries: list[str] = []

    def refused(airport: str, friday: dt.date, *, direct: bool) -> Declined:
        assert friday == SOON
        tries.append(airport)
        return Declined(CallCause.TRANSIENT, fares.REFUSED)

    monkeypatch.setattr(fares, 'search', refused)
    with pytest.raises(SystemExit, match='Google refused the search'):
        fares.refresh(budget=5, max_seconds=60)
    assert len(tries) == 2  # the first weekend, twice; the second waits
    assert fares.Job.read() == []  # a refused search is no search


class KilledError(Exception):
    """A run stopped where it stood (the runner's timeout, a crash)."""


def test_a_run_stopped_half_way_keeps_the_fares_it_found(weekends: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    found: list[str] = []

    def search(airport: str, friday: dt.date, *, direct: bool) -> fares.Fare:
        if found:
            raise KilledError
        found.append(airport)
        return fares.Fare(airport=airport, depart=friday, price=80, fetched_at=AT)

    monkeypatch.setattr(fares, 'search', search)
    with pytest.raises(KilledError):
        fares.refresh(budget=5, max_seconds=60)
    assert [(f.airport, f.price) for f in fares.Fare.read()] == [(found[0], 80)]
    assert [j.airport for j in fares.Job.read()] == found


def test_a_save_stopped_between_its_files_leaves_the_weekend_to_search_again(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The fares are written before the searches: a fare written whose search is not is searched again; a search
    written whose fare is not would keep the old fare (or none) as if it were the new one."""
    fare = fares.Fare(airport='GLA', depart=SOON, price=80, fetched_at=AT)

    def killed(rows: object) -> None:
        raise KilledError

    monkeypatch.setattr(fares.Job, 'write', killed)
    with pytest.raises(KilledError):
        fares.save({('GLA', SOON): fare}, {('GLA', SOON): fares.Job(airport='GLA', depart=SOON, last_run=now())})
    assert fares.Fare.read() == [fare]
    assert [w.due for w in fares.queue() if w.airport == 'GLA'] == [True]


def test_the_plan_lists_the_weekends_due(weekends: Path, capsys: pytest.CaptureFixture[str]) -> None:
    fares.plan()
    out = capsys.readouterr().out
    assert out.startswith('2 of 2 festival weekends due today\n')
    assert f'GLA {SOON}: 10 days away, every 7 days, never searched' in out


# ----- a festival's other airports -----
def three_airports(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """Glasgow's weekend: GLA its nearest, PIK and ABZ beside it; and Lisbon's, LIS its nearest."""
    return {('GLA', SOON): True, ('PIK', SOON): False, ('ABZ', SOON): False, ('LIS', SOON): True}


def aberdeen_nearest(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """ABZ the nearest airport of a festival that weekend."""
    return {('ABZ', SOON): True}


def test_the_other_airports_are_searched_less_often_and_after_every_nearest_due(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert [fares.interval(d, nearest=False) for d in (4, 36, 120, 200, 331)] == [14, 28, 56, 84, None]
    monkeypatch.setattr(fares, 'weekends', three_airports)
    asked: list[tuple[str, bool]] = []

    def search(airport: str, friday: dt.date, *, direct: bool) -> Searched:
        asked.append((airport, direct))
        return fares.Fare(airport=airport, depart=friday, price=90, fetched_at=AT, stops=0)

    monkeypatch.setattr(fares, 'search', search)
    fares.refresh(budget=3, max_seconds=60)
    # the two nearest first, then one extra, for direct flights alone, within the budget of three
    assert asked == [('GLA', False), ('LIS', False), ('ABZ', True)]
    assert {j.airport: j.direct for j in fares.Job.read()} == {'GLA': None, 'LIS': None, 'ABZ': True}


def two_aberdeen_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
    """Glasgow's weekend and the next: GLA their nearest, ABZ beside it."""
    nxt = SOON + dt.timedelta(days=7)
    return {('GLA', SOON): True, ('ABZ', SOON): False, ('GLA', nxt): True, ('ABZ', nxt): False}


def test_an_other_airport_with_no_direct_flight_is_not_searched_again_for_any_weekend_for_a_season(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fares, 'weekends', two_aberdeen_weekends)
    asked: list[tuple[str, dt.date, bool]] = []

    def search(airport: str, friday: dt.date, *, direct: bool) -> Searched:
        asked.append((airport, friday, direct))
        return fares.Missed('' if direct else 'no flights')

    monkeypatch.setattr(fares, 'search', search)
    fares.refresh(budget=9, max_seconds=60)
    # ABZ's first weekend has no direct flight, so its second is not searched, in this run or the next ones
    assert [(a, d) for a, _, d in asked] == [('GLA', False), ('GLA', False), ('ABZ', True)]
    later = now() + dt.timedelta(days=60)  # every weekend due again by then
    assert {w.airport for w in fares.queue(later)} == {'GLA'}
    # a season on, the airport is tried again
    assert 'ABZ' in {w.airport for w in fares.queue(now() + dt.timedelta(days=fares.NO_DIRECT_DAYS + 1))}
    # an airport that becomes a festival's nearest is searched again, for any flight
    monkeypatch.setattr(fares, 'weekends', aberdeen_nearest)
    assert [(w.airport, w.nearest) for w in fares.queue(later)] == [('ABZ', True)]


def test_an_airport_with_a_direct_flight_one_weekend_is_searched_on_its_other_weekends(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    nxt, third = SOON + dt.timedelta(days=7), SOON + dt.timedelta(days=14)
    fares.Job.write(
        [
            fares.Job(airport='ABZ', depart=SOON, last_run=now(), direct=False),
            fares.Job(airport='ABZ', depart=nxt, last_run=now(), direct=True),
        ]
    )

    def three_weekends(_: dt.date) -> dict[tuple[str, dt.date], bool]:
        return {('ABZ', SOON): False, ('ABZ', nxt): False, ('ABZ', third): False}

    monkeypatch.setattr(fares, 'weekends', three_weekends)
    later = now() + dt.timedelta(days=60)
    # all but the weekend found with none, the one never searched among them
    assert sorted(w.friday for w in fares.queue(later)) == [nxt, third]


def test_a_direct_flight_google_gives_no_price_for_is_still_a_direct_flight(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Widerøe's Bergen–Aberdeen, as Google lists it: the flights, with no price
    unpriced = '{"success": true, "flights": [{"price": null, "stops": 0, "outbound": {}, "return": {}}]}'
    monkeypatch.setattr(subprocess, 'run', fli(unpriced, direct=True))
    assert fares.search('GLA', FRIDAY, direct=True) == fares.Missed('', listed=True)
    monkeypatch.setattr(fares, 'weekends', two_aberdeen_weekends)

    def unpriced_if_direct(_airport: str, _friday: dt.date, *, direct: bool) -> Searched:
        return fares.Missed('', listed=direct)

    monkeypatch.setattr(fares, 'search', unpriced_if_direct)
    fares.refresh(budget=9, max_seconds=60)
    assert {(j.airport, j.direct) for j in fares.Job.read()} == {('GLA', None), ('ABZ', True)}
    assert 'ABZ' not in fares.no_direct(fares.Job.read(), now())


def test_a_weekend_further_ahead_than_flights_are_on_sale_rules_out_that_weekend_alone(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    far = SOON + dt.timedelta(days=fares.SCHEDULED_DAYS)
    fares.Job.write([fares.Job(airport='ABZ', depart=far, last_run=now(), direct=False)])

    def near_and_far(_: dt.date) -> dict[tuple[str, dt.date], bool]:
        return {('ABZ', SOON): False, ('ABZ', far): False}

    monkeypatch.setattr(fares, 'weekends', near_and_far)
    assert fares.no_direct(fares.Job.read(), now()) == set()
    assert [w.friday for w in fares.queue(now() + dt.timedelta(days=60))] == [SOON]
