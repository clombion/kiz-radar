"""When a festival weekend's fare is searched again."""

import datetime as dt
import subprocess
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest

from pipeline import fares
from pipeline.enums import FareSearch


def test_closer_weekends_are_searched_more_often() -> None:
    assert [fares.interval(d) for d in (4, 35, 36, 91, 120, 182, 200, 330)] == [7, 7, 14, 14, 28, 28, 42, 42]


def test_weekends_google_doesnt_sell_yet_wait() -> None:
    assert fares.interval(331) is None


def test_weekdays_spread_over_the_week() -> None:
    friday = dt.date(2026, 11, 6)
    days = [
        fares.weekday_of(a, (friday + dt.timedelta(weeks=w)).isoformat())
        for a in ('OSL', 'GLA', 'LIS', 'BCN')
        for w in range(20)
    ]
    assert set(days) == set(range(7))
    assert max(days.count(d) for d in range(7)) < 25


def one_weekend(today: dt.date) -> set[tuple[str, str]]:
    return {('GLA', '2026-11-06')}


def run_queue(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, jobs: Sequence[fares.Job], today: dt.date
) -> fares.Weekend:
    monkeypatch.setattr(fares, 'JOBS', tmp_path / 'jobs.csv')
    monkeypatch.setattr(fares, 'FARES', tmp_path / 'fares.csv')
    monkeypatch.setattr(fares, 'weekends', one_weekend)
    fares.Job.write(fares.JOBS, jobs)
    return fares.queue(dt.datetime.combine(today, dt.time(6), dt.UTC))[0]


def test_never_searched_is_due_any_day(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assert run_queue(tmp_path, monkeypatch, [], dt.date(2026, 10, 26)).due


def test_due_again_on_its_own_weekday_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # GLA on 6 Nov is weekly; searched a week before its weekday in the week of 26 Oct
    its_day = dt.date(2026, 10, 26) + dt.timedelta(days=fares.weekday_of('GLA', '2026-11-06'))
    last = (its_day - dt.timedelta(days=7)).isoformat() + 'T06:00:00+00:00'
    job = fares.Job(airport='GLA', depart='2026-11-06', last_run=last, status=FareSearch.PRICED, note='')

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
        ('{"success": false, "error": {"message": "no flights"}}', '', (FareSearch.NO_PRICE, 'no flights')),
        ('', 'Traceback…\nHTTP 429 Too Many Requests', (FareSearch.REFUSED, 'HTTP 429')),
        ('not json', 'it broke\nfor good', (FareSearch.NO_PRICE, 'for good')),
        ('{"success": true, "dates": [{"price": 99, "departure_date": "2026-11-13"}]}', '', (FareSearch.NO_PRICE, '')),
    ],
    ids=['priced', 'no flights', 'refused', 'no answer', 'another friday only'],
)
def test_a_search_reads_fli_s_answer(
    stdout: str, stderr: str, expected: tuple[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(subprocess, 'run', fli(stdout, stderr))
    found = fares.search('GLA', '2026-11-06')
    got = ('priced', found.price) if isinstance(found, fares.Fare) else (found.status, found.note)
    assert got == expected


def test_a_search_that_takes_too_long_finds_no_price(monkeypatch: pytest.MonkeyPatch) -> None:
    def run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(cmd, fares.TIMEOUT)

    monkeypatch.setattr(subprocess, 'run', run)
    assert fares.search('GLA', '2026-11-06') == fares.Missed(FareSearch.NO_PRICE, 'timeout')


AT = '2026-10-27T06:00:00+00:00'  # when a fare was found
SOON = (dt.datetime.now(dt.UTC).date() + dt.timedelta(days=10)).isoformat()  # due, weekly, never searched


@pytest.fixture
def weekends(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two festival weekends due, a fare kept for a weekend no festival has any more, and no wait between searches."""
    monkeypatch.setattr(fares, 'JOBS', tmp_path / 'jobs.csv')
    monkeypatch.setattr(fares, 'FARES', tmp_path / 'fares.csv')
    monkeypatch.setattr(fares, 'weekends', two_weekends)
    monkeypatch.setattr('time.sleep', no_wait)
    fares.Job.write(fares.JOBS, [])
    gone = fares.Fare(airport='OSL', depart='2026-01-02', return_='2026-01-05', price=1, currency='EUR', fetched_at=AT)
    fares.Fare.write(fares.FARES, [gone])
    return tmp_path


def two_weekends(_: dt.date) -> set[tuple[str, str]]:
    return {('GLA', SOON), ('LIS', SOON)}


def no_wait(_: float) -> None:
    """time.sleep, without the wait."""


def searched(found: dict[str, fares.Fare | fares.Missed]) -> Callable[[str, str], fares.Fare | fares.Missed]:
    return lambda airport, _: found[airport]


def test_a_refresh_keeps_the_fares_found_and_logs_every_search(weekends: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fare = fares.Fare(airport='GLA', depart=SOON, return_=SOON, price=80, currency='EUR', fetched_at=AT)
    monkeypatch.setattr(fares, 'search', searched({'GLA': fare, 'LIS': fares.Missed(FareSearch.NO_PRICE, 'none')}))
    monkeypatch.setattr('sys.argv', ['fares', 'refresh'])
    fares.main()
    assert fares.Fare.read(fares.FARES) == [fare]  # the weekend gone took its fare with it
    assert {(j.airport, j.status, j.note) for j in fares.Job.read(fares.JOBS)} == {
        ('GLA', FareSearch.PRICED, ''),
        ('LIS', FareSearch.NO_PRICE, 'none'),
    }


def test_a_refused_search_is_tried_once_more_then_the_rest_waits(
    weekends: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tries: list[str] = []

    def refused(airport: str, friday: str) -> fares.Missed:
        tries.append(airport)
        return fares.Missed(FareSearch.REFUSED, 'HTTP 429')

    monkeypatch.setattr(fares, 'search', refused)
    with pytest.raises(SystemExit, match='Google refused a search'):
        fares.refresh(budget=5, max_seconds=60)
    assert len(tries) == 2  # the first weekend, twice; the second waits
    assert fares.Job.read(fares.JOBS) == []  # a refused search is no search


def test_the_plan_lists_the_weekends_due(weekends: Path, capsys: pytest.CaptureFixture[str]) -> None:
    fares.plan()
    out = capsys.readouterr().out
    assert out.startswith('2 of 2 festival weekends due today\n')
    assert f'GLA {SOON}: 10 days away, every 7 days, never searched' in out
