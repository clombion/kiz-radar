"""When a festival weekend's fare is searched again."""
import datetime as dt, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'pipeline'))
import fares


def test_closer_weekends_are_searched_more_often():
    assert [fares.interval(d) for d in (4, 35, 36, 91, 120, 182, 200, 330)] == [7, 7, 14, 14, 28, 28, 42, 42]


def test_weekends_google_doesnt_sell_yet_wait():
    assert fares.interval(331) is None


def test_weekdays_spread_over_the_week():
    friday = dt.date(2026, 11, 6)
    days = [fares.weekday_of(a, (friday + dt.timedelta(weeks=w)).isoformat()) for a in ('OSL', 'GLA', 'LIS', 'BCN') for w in range(20)]
    assert set(days) == set(range(7)) and max(days.count(d) for d in range(7)) < 25


def run_queue(tmp_path, monkeypatch, jobs, today):
    monkeypatch.setattr(fares, 'JOBS', str(tmp_path / 'jobs.csv'))
    monkeypatch.setattr(fares, 'FARES', str(tmp_path / 'fares.csv'))
    monkeypatch.setattr(fares, 'weekends', lambda t: {('GLA', '2026-11-06')})
    fares.write(fares.JOBS, fares.JOB_FIELDS, jobs, key=lambda r: r['depart'])
    return fares.queue(dt.datetime.combine(today, dt.time(6), dt.timezone.utc))[0]


def test_never_searched_is_due_any_day(tmp_path, monkeypatch):
    assert run_queue(tmp_path, monkeypatch, [], dt.date(2026, 10, 26))['due']


def test_due_again_on_its_own_weekday_only(tmp_path, monkeypatch):
    # GLA on 6 Nov is weekly; searched a week before its weekday in the week of 26 Oct
    its_day = dt.date(2026, 10, 26) + dt.timedelta(days=fares.weekday_of('GLA', '2026-11-06'))
    last = (its_day - dt.timedelta(days=7)).isoformat() + 'T06:00:00+00:00'
    job = dict(airport='GLA', depart='2026-11-06', last_run=last, status='priced', note='')
    due = lambda day: run_queue(tmp_path, monkeypatch, [job], day)['due']
    assert due(its_day)
    assert not due(its_day + dt.timedelta(days=1))     # a day late is not its weekday
    assert due(its_day + dt.timedelta(days=8))         # past twice the interval: no longer waits for its day
