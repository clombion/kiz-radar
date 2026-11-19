"""Transitous (transitous.org), the open journey planner for public transport that pipeline/measure.py asks how long a
trip from an airport into a festival city takes. Its terms: open-source, non-commercial use, the app named in each
request (web.AGENT), and no more than one request a second, which its team has asked us to stay well under: the caller
keeps a pause of PAUSE between requests. It names no fares.

Three of its searches: the stops near a point (stops); the many-to-one search (screen), one request for every airport
of a city, which counts a wait for the first vehicle as travel; and the route search (route), one request for one
airport, which says how long the trip takes and what it takes. Each answers with what it found, or why there is none
(pipeline/calls.py): an answer of another shape, or a vehicle of a kind GroundMode has no state for, is structural."""

import datetime as dt
from collections.abc import Sequence
from typing import NamedTuple
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from pipeline import web
from pipeline.calls import Declined
from pipeline.enums import CallCause, GroundMode
from pipeline.records import Stop, Way

API = 'api.transitous.org'
STOPS = web.Https(API, '/api/v6/map/stops')
SCREEN = web.Https(API, '/api/experimental/one-to-many-intermodal')
ROUTE = web.Https(API, '/api/v6/plan')
PAUSE = 6.0  # seconds between requests: one a second is too much for Transitous, its team told us
# the vehicles a trip may take: every kind of public transport but a flight (RAIL: every kind of train)
TRANSIT = 'TRAM,SUBWAY,FERRY,BUS,COACH,RAIL,FUNICULAR,AERIAL_LIFT,OTHER'
ON_FOOT = 'WALK'  # a leg between stops, or to the first and from the last: no vehicle
FLIGHT = 'AIRPLANE'  # a stop of flights only, which no trip by land starts from
SECONDS = 60  # in a minute


class Point(NamedTuple):
    lat: float
    lon: float

    def text(self, sep: str) -> str:
        return f'{self.lat}{sep}{self.lon}'


class Found(BaseModel):
    model_config = ConfigDict(extra='ignore', frozen=True)


class Near(Found):
    """A stop as the stops search answers it: how much it is used, against other stops, and the vehicles it serves."""

    stop_id: str = Field(alias='stopId')
    name: str
    lat: float
    lon: float
    importance: float
    modes: tuple[str, ...] = ()
    tz: str | None = None  # its time zone's name


class Entry(Found):
    """One of the quickest trips the many-to-one search found to an airport: in seconds, with its changes."""

    duration: float
    transfers: int


class Screen(Found):
    transit_durations: tuple[tuple[Entry, ...], ...]  # each airport's, in the order asked: none when it found none


class Leg(Found):
    mode: str


class Itinerary(Found):
    duration: int  # seconds
    transfers: int
    legs: tuple[Leg, ...]


class Plan(Found):
    itineraries: tuple[Itinerary, ...]


NEAR: TypeAdapter[list[Near]] = TypeAdapter(list[Near])
SCREENED: TypeAdapter[Screen] = TypeAdapter(Screen)
PLANNED: TypeAdapter[Plan] = TypeAdapter(Plan)


def stops(around: Point, degrees: float) -> list[Near] | Declined:
    """The stops within degrees of latitude and longitude of a point."""
    box = {
        'min': Point(around.lat - degrees, around.lon - degrees).text(','),
        'max': Point(around.lat + degrees, around.lon + degrees).text(','),
    }
    return web.answer(STOPS, box, NEAR)


def station(near: Sequence[Near]) -> Stop | None:
    """The stop a trip from an airport starts from: of the stops near it that a vehicle other than a flight serves, the
    most used; none when there is none."""
    served = [n for n in near if any(m != FLIGHT for m in n.modes)]
    if not served:
        return None
    best = max(served, key=lambda n: n.importance)
    return Stop(id=best.stop_id, name=best.name, lat=round(best.lat, 5), lon=round(best.lon, 5))


def zone(near: Sequence[Near]) -> ZoneInfo | None:
    """The time zone of the most used of these stops that names one; none when none does."""
    named = [n for n in near if n.tz is not None]
    return None if not named else ZoneInfo(max(named, key=lambda n: n.importance).tz or '')


def at_utc(at: dt.datetime) -> str:
    return at.astimezone(dt.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')


def screen(to: Point, starts: Sequence[Point], by: dt.datetime) -> list[int | None] | Declined:
    """For each start, in order, the minutes the quickest trip from it to the point takes, arriving by a time; none
    when there is none within the search's reach."""
    query = {
        'one': to.text(';'),
        'many': ','.join(s.text(';') for s in starts),
        'time': at_utc(by),
        'arriveBy': 'true',
        'transitModes': TRANSIT,
    }
    match web.answer(SCREEN, query, SCREENED):
        case Declined() as d:
            return d
        case found:
            pass
    if len(found.transit_durations) != len(starts):
        return Declined(
            CallCause.STRUCTURAL, f'{SCREEN.url()}: {len(found.transit_durations)} answers to {len(starts)}'
        )
    return [round(min(e.duration for e in s) / SECONDS) if s else None for s in found.transit_durations]


def vehicles(legs: Sequence[Leg]) -> tuple[GroundMode, ...] | Declined:
    """The vehicles legs take, in order (none on foot)."""
    out: list[GroundMode] = []
    for leg in legs:
        if leg.mode == ON_FOOT:
            continue
        try:
            out.append(GroundMode(leg.mode.lower()))
        except ValueError:
            return Declined(
                CallCause.STRUCTURAL, f'{ROUTE.url()}: a vehicle of a kind GroundMode has no state for: {leg.mode}'
            )
    return tuple(out)


def route(start: Stop | Point, to: Point, leaving: dt.datetime) -> Way | Declined | None:
    """The quickest trip from a stop (or a point) to a point leaving after a time, of those the route search answers;
    none when it answers none."""
    query = {
        'fromPlace': start.id if isinstance(start, Stop) else start.text(','),
        'toPlace': to.text(','),
        'time': at_utc(leaving),
        'transitModes': TRANSIT,
        'detailedLegs': 'false',
    }
    match web.answer(ROUTE, query, PLANNED):
        case Declined() as d:
            return d
        case found:
            pass
    ways: list[Way] = []
    for i in found.itineraries:
        match vehicles(i.legs):
            case Declined() as d:
                return d
            case ():
                continue  # on foot only: no trip by public transport
            case modes:
                ways.append(Way(minutes=round(i.duration / SECONDS), changes=i.transfers, modes=modes))
    return min(ways, key=lambda w: (w.minutes, w.changes), default=None)
