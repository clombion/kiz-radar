"""How long a trip by public transport from an airport into a festival city takes (pipeline/measure.py), as Transitous
answers (pipeline/transitous.py): an airport's station, the screen, the route search, and the step that keeps each
answer as it comes, adds the airports a city is reached from, and goes on from where a run stopped."""

import csv
import datetime as dt
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from pipeline import data, export, measure, transitous, web
from pipeline import db as sqlite_db
from pipeline.calls import Declined
from pipeline.enums import CallCause, GroundMode
from pipeline.records import Airport, City, Place, Routed, Screened, Spot, Station, Stop, Way
from pipeline.transitous import Leg, Near, Point
from tests.exports import festival, run, shaped
from tests.fakes import no_wait

BERN = City(key='bern-ch', name='Bern', country_code='CH', lat=46.948, lon=7.447)
HOME = Airport(code='OSL', name='Oslo', city='Oslo', country_code='NO', lat=60.194, lon=11.1, home=True)


def near(stop_id: str, importance: float, *modes: str) -> Near:
    return Near(stopId=stop_id, name=stop_id, lat=46.0, lon=7.0, importance=importance, modes=modes)


def test_an_airport_s_station_is_the_most_used_stop_near_it_that_is_not_a_flight_s() -> None:
    found = transitous.station([near('gate', 9, 'AIRPLANE'), near('bus', 1, 'BUS'), near('rail', 5, 'REGIONAL_RAIL')])
    assert found == Stop(id='rail', name='rail', lat=46.0, lon=7.0)
    assert transitous.station([near('gate', 9, 'AIRPLANE')]) is None
    assert transitous.station([]) is None


def test_a_trip_s_vehicles_are_its_legs_but_on_foot_and_a_kind_not_known_is_refused() -> None:
    legs = [Leg(mode='WALK'), Leg(mode='LONG_DISTANCE'), Leg(mode='WALK'), Leg(mode='TRAM')]
    assert transitous.vehicles(legs) == (GroundMode.LONG_DISTANCE, GroundMode.TRAM)
    refused = transitous.vehicles([Leg(mode='HOVERCRAFT')])
    assert isinstance(refused, Declined)
    assert refused.cause == CallCause.STRUCTURAL


@dataclass
class Transitous:
    """Transitous as the fake answers it: each airport's stops by its point, the screen's seconds and transfers by the
    point a trip starts at, the route search's trips by where it starts; and what it was asked, by search."""

    stops: Mapping[Point, list[Mapping[str, object]]]
    screens: Mapping[Point, list[tuple[float, int]]]
    routes: Mapping[str, list[Mapping[str, object]]]
    asked: list[str] = field(default_factory=list[str])
    failing: list[Declined] = field(default_factory=list[Declined])  # answered first, one each, in order

    def get(self, address: web.Https, query: Mapping[str, str], headers: Mapping[str, str]) -> bytes | Declined:
        assert headers == web.AGENT
        self.asked.append(address.path)
        if self.failing:
            return self.failing.pop(0)
        if address == transitous.STOPS:
            low = [float(x) for x in query['min'].split(',')]
            centre = Point(round(low[0] + measure.STATION_DEGREES, 3), round(low[1] + measure.STATION_DEGREES, 3))
            return json.dumps(self.stops.get(centre, [])).encode()
        assert query['transitModes'] == transitous.TRANSIT  # never a flight
        if address == transitous.SCREEN:
            assert query['arriveBy'] == 'true'
            starts = [Point(*map(float, s.split(';'))) for s in query['many'].split(',')]
            sets = [[{'duration': d, 'transfers': t} for d, t in self.screens.get(s, [])] for s in starts]
            return json.dumps({'street_durations': [{} for _ in starts], 'transit_durations': sets}).encode()
        assert address == transitous.ROUTE
        return json.dumps({'itineraries': self.routes.get(query['fromPlace'], [])}).encode()


def itinerary(minutes: int, transfers: int, *modes: str) -> Mapping[str, object]:
    return {'duration': minutes * 60, 'transfers': transfers, 'legs': [{'mode': m} for m in modes]}


def test_a_route_is_the_quickest_trip_answered_and_none_when_there_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    trips = [itinerary(135, 0, 'LONG_DISTANCE', 'WALK'), itinerary(131, 1, 'LONG_DISTANCE', 'WALK', 'TRAM')]
    fake = Transitous({}, {}, {'s': trips, 'walk': [itinerary(20, 0, 'WALK')]})
    monkeypatch.setattr(web, 'get', fake.get)
    leaving = dt.datetime(2026, 11, 20, 15, tzinfo=dt.UTC)
    way = transitous.route(Stop(id='s', name='s', lat=0, lon=0), Point(46.9, 7.4), leaving)
    assert way == Way(minutes=131, changes=1, modes=(GroundMode.LONG_DISTANCE, GroundMode.TRAM))
    assert transitous.route(Stop(id='walk', name='w', lat=0, lon=0), Point(46.9, 7.4), leaving) is None  # on foot
    assert transitous.route(Point(1, 2), Point(46.9, 7.4), leaving) is None


def test_a_screen_says_the_quickest_trip_from_each_start_in_order(monkeypatch: pytest.MonkeyPatch) -> None:
    a, b = Point(1, 1), Point(2, 2)
    monkeypatch.setattr(web, 'get', Transitous({}, {a: [(6900, 0), (6720, 1)]}, {}).get)
    assert transitous.screen(Point(0, 0), [a, b], dt.datetime(2026, 11, 20, 17, tzinfo=dt.UTC)) == [112, None]


# Bern's airports, as OurAirports lists them: Bern's own, Zurich's, Geneva's, Basel's (in France), and Rome's, too far
OURAIRPORTS = [
    ('BRN', 46.914, 7.499, 'CH'),
    ('ZRH', 47.458, 8.548, 'CH'),
    ('GVA', 46.238, 6.109, 'CH'),
    ('BSL', 47.59, 7.529, 'FR'),
    ('FCO', 41.8, 12.251, 'IT'),
]


def ourairports(tmp_path: Path) -> Path:
    path = tmp_path / 'ourairports.csv'
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(
            [
                'iata_code',
                'name',
                'municipality',
                'iso_country',
                'type',
                'scheduled_service',
                'latitude_deg',
                'longitude_deg',
            ]
        )
        for code, lat, lon, country in OURAIRPORTS:
            w.writerow([code, f'{code} Airport', code.title(), country, 'large_airport', 'yes', lat, lon])
    return path


def a_festival_in_bern() -> None:
    City.write([BERN])
    Place.write(
        [Place(city='Bern', country='Switzerland', found=Spot(lat=46.948, lon=7.447, name='Bern, Switzerland'))]
    )
    Airport.write([HOME])
    Station.write([])
    Screened.write([])
    Routed.write([])
    path = data(export.SOURCE) / 'source.sqlite'
    path.parent.mkdir(parents=True)
    with sqlite_db.opened(path, 'rwc') as con, shaped(con).transaction() as tx:
        festival(tx, 1, city='Bern', country='Switzerland')


GVA_RAIL = {
    'stopId': 'gva-rail',
    'name': 'Genève-Aéroport',
    'lat': 46.2327,
    'lon': 6.112,
    'importance': 5,
    'modes': ['REGIONAL_RAIL'],
}

BERN_STOP = {'stopId': 'bern', 'name': 'Bern', 'lat': 46.949, 'lon': 7.439, 'importance': 7, 'modes': ['LONG_DISTANCE']}


def bern_transitous() -> Transitous:
    """Geneva has its station; the others start at their own point. Bern's own airport is a bus ride, Zurich's a
    train ride, Geneva's two hours of trains; Basel's screen is over MOST_MINUTES and it is not among the nearest."""
    return Transitous(
        stops={
            Point(46.238, 6.109): [GVA_RAIL, {**GVA_RAIL, 'stopId': 'gate', 'importance': 9, 'modes': ['AIRPLANE']}],
            Point(46.948, 7.447): [{**BERN_STOP, 'tz': 'Europe/Zurich'}],
        },
        screens={
            Point(46.914, 7.499): [(1800, 0)],
            Point(47.458, 8.548): [(6900, 0)],
            Point(46.2327, 6.112): [(8000, 1)],
            Point(47.59, 7.529): [(16000, 2)],
        },
        routes={
            '46.914,7.499': [itinerary(25, 0, 'WALK', 'BUS', 'WALK')],
            '47.458,8.548': [itinerary(79, 0, 'LONG_DISTANCE')],
            'gva-rail': [itinerary(131, 1, 'LONG_DISTANCE', 'TRAM')],
        },
    )


def bern(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Transitous]:
    """A festival in Bern, OurAirports' list, and Transitous as bern_transitous answers, the nearest airport alone
    routed whatever its screen: the list's path, and the fake."""
    a_festival_in_bern()
    fake = bern_transitous()
    monkeypatch.setattr(web, 'get', fake.get)
    monkeypatch.setattr('time.sleep', no_wait)
    monkeypatch.setattr(measure, 'NEAREST', 1)
    return ourairports(tmp_path), fake


def test_the_step_measures_each_airport_near_a_festival_city_and_adds_those_it_is_reached_from(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Every airport within SCREEN_KM is given its station and screened; the nearest and those screened within
    MOST_MINUTES are routed; those routed within it are added to airports.csv. A second run asks nothing."""
    source, fake = bern(tmp_path, monkeypatch)
    run(measure.main, monkeypatch, source)
    stations = {s.airport: s.found for s in Station.read()}
    assert stations == {
        'BRN': None,
        'BSL': None,
        'GVA': Stop(id='gva-rail', name='Genève-Aéroport', lat=46.2327, lon=6.112),
        'ZRH': None,
    }  # FCO is beyond SCREEN_KM
    assert {s.airport: s.minutes for s in Screened.read()} == {'BRN': 30, 'ZRH': 115, 'GVA': 133, 'BSL': 267}
    routed = {r.airport: r.found for r in Routed.read()}
    assert routed == {
        'BRN': Way(minutes=25, changes=0, modes=(GroundMode.BUS,)),
        'ZRH': Way(minutes=79, changes=0, modes=(GroundMode.LONG_DISTANCE,)),
        'GVA': Way(minutes=131, changes=1, modes=(GroundMode.LONG_DISTANCE, GroundMode.TRAM)),
    }  # BSL: neither near nor screened within MOST_MINUTES
    assert [a.code for a in Airport.read()] == ['OSL', 'BRN', 'ZRH', 'GVA']
    asked = len(fake.asked)
    assert asked == 4 + 1 + len(measure.ARRIVALS) + 3
    run(measure.main, monkeypatch, source)
    assert len(fake.asked) == asked


def test_a_run_stops_at_its_requests_and_the_next_goes_on_from_there(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """With too few requests left for a city's screens, none is asked: a screen stands only with all its times."""
    source, fake = bern(tmp_path, monkeypatch)
    run(measure.main, monkeypatch, source, '--most', 5)
    assert 'cities left for the next run' in capsys.readouterr().out
    assert len(Station.read()) == 4
    assert Screened.read() == []
    run(measure.main, monkeypatch, source)
    assert len(Screened.read()) == 4
    assert len(Routed.read()) == 3
    assert len(fake.asked) == 4 + 1 + len(measure.ARRIVALS) + 3  # nothing asked twice


def test_a_failure_is_waited_out_once_and_a_second_stops_the_run_keeping_what_was_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, fake = bern(tmp_path, monkeypatch)
    fake.failing = [Declined(CallCause.TRANSIENT, 'timed out')]
    run(measure.main, monkeypatch, source)
    assert len(Routed.read()) == 3  # waited out
    Station.write([])
    fake.failing = [Declined(CallCause.TRANSIENT, 'timed out'), Declined(CallCause.TRANSIENT, 'timed out again')]
    with pytest.raises(SystemExit, match='timed out again: stopped, keeping what was found'):
        run(measure.main, monkeypatch, source)
    fake.failing = [Declined(CallCause.STRUCTURAL, 'HTTP 400')]
    with pytest.raises(SystemExit, match='HTTP 400: stopped'):
        run(measure.main, monkeypatch, source)
    assert len(Routed.read()) == 3


def test_the_friday_measured_is_a_week_ahead_at_the_hour_of_the_city_s_zone(monkeypatch: pytest.MonkeyPatch) -> None:
    """The zone is asked once, of the stops near the city; with none naming one, the hour is UTC's."""
    assert measure.friday(dt.date(2026, 11, 9)) == dt.date(2026, 11, 20)  # a Monday: the Friday after next
    assert measure.friday(dt.date(2026, 11, 13)) == dt.date(2026, 11, 20)  # a Friday: the next
    fake = bern_transitous()
    monkeypatch.setattr(web, 'get', fake.get)
    monkeypatch.setattr('time.sleep', no_wait)
    clock = measure.Clock(BERN, measure.Asker(10), dt.date(2026, 11, 20))
    assert clock.at(dt.time(18)).astimezone(dt.UTC) == dt.datetime(2026, 11, 20, 17, tzinfo=dt.UTC)
    assert clock.at(dt.time(15)).astimezone(dt.UTC).hour == 14
    assert len(fake.asked) == 1
    nowhere = City(key='atlantis-pt', name='Atlantis', country_code='PT', lat=30.0, lon=-30.0)
    assert measure.Clock(nowhere, measure.Asker(10), dt.date(2026, 11, 20)).at(dt.time(18)).tzinfo == dt.UTC
