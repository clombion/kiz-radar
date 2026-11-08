"""How well home's fare predicts another city's: the pairs of the fare history, the model scored on later weeks, and
the report."""

import datetime as dt

import pytest

from pipeline import fare_accuracy, fare_store, fares
from pipeline.enums import FareFamily, FareMode, FareOutcome, FareTicket, FareVendor
from pipeline.records import Offer, Search, digest

FRIDAY = dt.date(2027, 2, 5)
MONDAY = dt.datetime(2026, 11, 9, 6, tzinfo=dt.UTC)  # a week's first day; its pairs, ISO week 46


pytestmark = pytest.mark.usefixtures('home_airports')


def searched(
    origin: str,
    price: float | None,
    at: dt.datetime,
    *,
    airport: str = 'LIS',
    stops: int = 1,
    mode: FareMode = FareMode.ANY,
    vendor: FareVendor = FareVendor.GOOGLE,
    ticket: FareTicket = FareTicket.ONE_TICKET,
) -> Search:
    offers = (
        () if price is None else (Offer(price=price, ticket=ticket, stops_out=stops, stops_back=None, airlines=()),)
    )
    return Search(
        id=digest(f'{origin} {airport} {at} {vendor} {price}'),
        at=at,
        origin=origin,
        airport=airport,
        depart=FRIDAY,
        mode=mode,
        vendor=vendor,
        outcome=FareOutcome.OFFERS if offers else FareOutcome.NONE,
        offers=offers,
    )


def week(n: int, hours: int = 0) -> dt.datetime:
    return MONDAY + dt.timedelta(weeks=n, hours=hours)


def test_a_pair_is_a_weekend_searched_from_home_and_another_city_the_same_day_for_the_same_flights() -> None:
    history = [
        searched('BGO', 200, week(0)),
        searched('OSL', 150, week(0, 1)),  # paired
        searched('SVG', 190, week(0, 2)),  # paired too
        searched('TRD', 170, week(1)),  # no search from home that day
        searched('OSL', 160, week(0, 3), airport='GLA'),  # nor of that airport
        searched('BGO', 100, week(2), stops=0, mode=FareMode.DIRECT),
        searched('OSL', 120, week(2, 1)),  # not for the same flights
        searched('OSL', 130, week(2, 2), mode=FareMode.DIRECT),  # paired, direct out from home
        searched('OSL', 90, week(2, 3), mode=FareMode.DIRECT, vendor=FareVendor.KIWI),  # Google's alone
        searched('BGO', None, week(3)),
        searched('OSL', 140, week(3, 1)),  # home had no fare
        searched('BGO', 300, week(4)),
        searched('OSL', 250, week(4, 1), ticket=FareTicket.SELF_TRANSFER),  # on one ticket alone
    ]
    assert [(p.origin, p.family, p.home, p.there) for p in fare_accuracy.pairs(history)] == [
        ('OSL', FareFamily.CONNECTING, 200, 150),
        ('SVG', FareFamily.CONNECTING, 200, 190),
        ('OSL', FareFamily.DIRECT, 100, 130),
    ]


def test_each_week_is_predicted_from_the_weeks_before_it_alone() -> None:
    # Oslo is 50 cheaper the first week, 30 the second, 10 cheaper twice the third
    history = [
        s
        for n, (home, there) in enumerate([(200, 150), (200, 170), (200, 190)])
        for s in (searched('BGO', home, week(n)), searched('OSL', there, week(n, 1)))
    ]
    history += [searched('BGO', 300, week(2, 2), airport='GLA'), searched('OSL', 290, week(2, 3), airport='GLA')]
    (s,) = fare_accuracy.scored(fare_accuracy.pairs(history))
    assert (s.origin, s.family, s.n, s.offset) == ('OSL', FareFamily.CONNECTING, 4, -20)
    # week 0: nothing before it; week 1: -50 before it, 30 off; week 2: the median of -50 and -30, -40, 30 off each
    assert s.errors == (20, 30, 30)
    assert (s.within, s.shown) == (1, False)  # all within €40, but fewer than SHOWN_N scored


@pytest.mark.parametrize(
    ('errors', 'shown'),
    [((10.0,) * 16 + (50.0,) * 4, True), ((10.0,) * 15 + (50.0,) * 5, False), ((10.0,) * 19, False)],
    ids=['80% of 20 within', '75% within', '19 scored'],
)
def test_a_city_is_shown_once_enough_pairs_are_scored_and_near_enough(errors: tuple[float, ...], shown: bool) -> None:
    assert fare_accuracy.Scored('OSL', FareFamily.DIRECT, 30, 0, errors).shown is shown


def test_the_report_has_a_row_for_each_city_and_family_and_says_when_there_are_no_pairs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr('sys.argv', ['fares', 'accuracy'])
    fares.main()
    assert fare_accuracy.data(fare_accuracy.REPORT).read_text().endswith('\n\nNo pairs yet.\n')
    history = [searched('BGO', 200, week(0)), searched('OSL', 150, week(0, 1))]
    history += [searched('BGO', 210, week(1)), searched('OSL', 170, week(1, 1))]
    fare_store.write(fare_store.run_file(week(1)), history)
    fares.main()
    lines = fare_accuracy.data(fare_accuracy.REPORT).read_text().splitlines()
    assert 'Pairs searched from 2026-11-09 to 2026-11-16.' in ' '.join(lines)
    assert lines[-3:] == [
        '| City | Family | Pairs | Offset (€) | Scored | Median error (€) | Within €40 | Shown |',
        '| -- | -- | -- | -- | -- | -- | -- | -- |',
        '| OSL | connecting | 2 | -45 | 1 | 10 | 100% | no |',
    ]
