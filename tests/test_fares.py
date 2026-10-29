"""When a festival weekend's fare is searched again."""

import datetime as dt
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path

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


def one_weekend(today: dt.date) -> set[tuple[str, dt.date]]:
    return {('GLA', FRIDAY)}


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


def fli(stdout: str, stderr: str = '') -> Callable[..., subprocess.CompletedProcess[str]]:
    """subprocess.run, as fli answers: these words on its outputs."""

    def run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        assert cmd[-4:] == ['--currency', 'EUR', '--format', 'json']
        return subprocess.CompletedProcess(cmd, 0, stdout, stderr)

    return run


PRICED = '{"success": true, "dates": [{"price": 123.4, "departure_date": "2026-11-06", "return_date": "2026-11-09"}]}'


@pytest.mark.parametrize(
    ('stdout', 'stderr', 'expected'),
    [
        (f'searching…\n{PRICED}', '', ('priced', 123)),
        ('{"success": false, "error": {"message": "no flights"}}', '', ('no price', 'no flights')),
        ('', 'Traceback…\nHTTP 429 Too Many Requests', (CallCause.TRANSIENT, fares.REFUSED)),
        ('not json', 'it broke\nfor good', (CallCause.TRANSIENT, 'fli wrote no answer: for good')),
        ('{"success": true, "dates": [{"price": 99, "departure_date": "2026-11-13"}]}', '', ('no price', '')),
        (
            PRICED.replace('"return_date"', '"currency": "SEK", "return_date"'),
            '',
            (CallCause.STRUCTURAL, 'fli gave a price in SEK, not the EUR it was asked'),
        ),
        (
            PRICED.replace('2026-11-09', '2026-11-08'),
            '',
            (CallCause.STRUCTURAL, f'fli gave a return on 2026-11-08, not {fares.NIGHTS} nights later'),
        ),
    ],
    ids=['priced', 'no flights', 'refused', 'no answer', 'another friday only', 'another currency', 'another return'],
)
def test_a_search_reads_fli_s_answer(
    stdout: str, stderr: str, expected: tuple[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(subprocess, 'run', fli(stdout, stderr))
    found = fares.search('GLA', FRIDAY)
    match found:
        case fares.Fare():
            got: tuple[str, object] = ('priced', found.price)
        case fares.Missed():
            got = ('no price', found.note)
        case Declined():
            got = (found.cause, found.why)
    assert got == expected


def test_a_search_that_takes_too_long_gives_no_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    def run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(cmd, fares.TIMEOUT)

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


def two_weekends(_: dt.date) -> set[tuple[str, dt.date]]:
    return {('GLA', SOON), ('LIS', SOON)}


type Searched = fares.Fare | fares.Missed | Declined


def searched(found: dict[str, Searched]) -> Callable[[str, dt.date], Searched]:
    return lambda airport, _: found[airport]


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

    def refused(airport: str, friday: str) -> Declined:
        tries.append(airport)
        return Declined(CallCause.TRANSIENT, fares.REFUSED)

    monkeypatch.setattr(fares, 'search', refused)
    with pytest.raises(SystemExit, match='Google refused the search'):
        fares.refresh(budget=5, max_seconds=60)
    assert len(tries) == 2  # the first weekend, twice; the second waits
    assert fares.Job.read() == []  # a refused search is no search


def test_the_plan_lists_the_weekends_due(weekends: Path, capsys: pytest.CaptureFixture[str]) -> None:
    fares.plan()
    out = capsys.readouterr().out
    assert out.startswith('2 of 2 festival weekends due today\n')
    assert f'GLA {SOON}: 10 days away, every 7 days, never searched' in out
