"""How long a trip by public transport from each airport near a festival city into it takes, measured with Transitous
(pipeline/transitous.py): the evidence a research session decides the city's gateways from (claims.CityClaim,
docs/guides/city-airports.md). The build never reads it.

For each city of a festival to come (airports.festival_cities), every airport with scheduled service within SCREEN_KM
of it (OurAirports' airports.csv, as the airports step reads it) is:

1. given its station (records.Station, pipeline/stations.csv), once: the most used stop near it that is not a
   flight's, as an airport's own point can be too far from every stop for a search to start there (Geneva);
2. screened (records.Screened, pipeline/screened.csv), all of a city's airports in one many-to-one search for each of
   ARRIVALS, on a Friday evening; the quickest of them stands, as the search counts waiting as travel;
3. routed (records.Routed, pipeline/routed.csv): a route search from its station leaving on a Friday afternoon, for
   the airports screened within MOST_MINUTES and the NEAREST nearest whatever their screen, for the time the trip
   takes and the vehicles it takes.

An airport routed within MOST_MINUTES that airports.csv has not yet is added to it. A run asks Transitous at most
--most times, one request a second, so the first pass takes days, as agreed with the Transitous team; each answer is
kept as it comes, so a run stopped keeps what it found and the next goes on from there, and a city measured is not
asked about again. A transient failure is waited out once; a second, or a structural one, stops the run naming it.

    mise run measure -- <OurAirports' airports.csv> --most N
"""

import argparse
import datetime as dt
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path

from pipeline import airports, transitous
from pipeline.airports import Offered
from pipeline.calls import Declined
from pipeline.cities import km
from pipeline.countries import NAMES
from pipeline.enums import CallCause
from pipeline.records import Airport, City, Routed, Screened, Station, Stop, today
from pipeline.transitous import Point

SCREEN_KM = 300  # how far from a city an airport may be to be measured
MOST_MINUTES = 240  # the longest trip into a city an airport is a gateway with
NEAREST = 6  # the airports routed whatever their screen: a screen can miss a trip a route search finds
STATION_DEGREES = 0.02  # how far from an airport's point its station may be, in degrees (about 2 km)
ARRIVALS = tuple(dt.time(18, m) for m in range(0, 60, 10))  # the Friday evening times a screen arrives by
LEAVING = dt.time(15)  # the Friday afternoon time a route search leaves at
BACKOFF = 30  # seconds waited after a transient failure, before trying once more
MOST_REQUESTS = 300  # a run's requests, by default
LEAD_DAYS = 7  # the Friday measured is the first at least this many days ahead, within the timetables Transitous has


class SpentError(Exception):
    """The run has asked Transitous as many times as it may."""


class Asker:
    """Transitous's searches as a run asks them: at most `most` requests, one a second, a transient failure waited out
    once; a second failure, or a structural one, stops the run."""

    def __init__(self, most: int) -> None:
        self.left = most

    def can(self, n: int) -> None:
        """SpentError unless n more requests may be asked: the searches that stand only together are asked together."""
        if self.left < n:
            raise SpentError

    def ask[T](self, search: Callable[[], T | Declined]) -> T:
        for attempt in range(2):
            if self.left == 0:
                raise SpentError
            self.left -= 1
            time.sleep(transitous.PAUSE)
            match search():
                case Declined(cause=CallCause.TRANSIENT) as d if attempt == 0:
                    print(f'{d.why}: waiting {BACKOFF} s, then once more', file=sys.stderr)
                    time.sleep(BACKOFF)
                case Declined() as d:
                    sys.exit(f'{d.why}: stopped, keeping what was found')
                case found:
                    return found
        raise AssertionError  # unreachable: the second attempt returns or exits


def friday(after: dt.date) -> dt.date:
    """The first Friday at least LEAD_DAYS after a day."""
    first = after + dt.timedelta(days=LEAD_DAYS)
    return first + dt.timedelta(days=(airports.FRIDAY - first.weekday()) % 7)


class Clock:
    """The time of day where a city is, by the time zone of the stops near it, asked of Transitous the first time a
    search needs it; UTC, said, when no stop near it names one (and a search there finds no trip)."""

    def __init__(self, city: City, asker: 'Asker', day: dt.date) -> None:
        self.city, self.asker, self.day = city, asker, day
        self.zone: dt.tzinfo | None = None

    def at(self, time_of_day: dt.time) -> dt.datetime:
        if self.zone is None:
            to = Point(self.city.lat, self.city.lon)
            found = transitous.zone(self.asker.ask(lambda: transitous.stops(to, STATION_DEGREES)))
            if found is None:
                print(f'{self.city.key}: no stop near it names its time zone: measured in UTC', file=sys.stderr)
            self.zone = dt.UTC if found is None else found
        return dt.datetime.combine(self.day, time_of_day, self.zone)


def near(city: City, offered: Sequence[Offered]) -> list[Offered]:
    """The airports of offered within SCREEN_KM of a city, in a country the site names, the nearest first."""
    out = [(km(city.lat, city.lon, a.lat, a.lon), a.code, a) for a in offered if a.country_code in NAMES]
    return [a for d, _, a in sorted(out) if d <= SCREEN_KM]


def start(airport: Offered, stations: dict[str, Station]) -> Stop | Point:
    """Where a trip from an airport starts: its station, else its own point."""
    found = stations[airport.code].found
    return Point(airport.lat, airport.lon) if found is None else found


def point(of: Stop | Point) -> Point:
    return of if isinstance(of, Point) else Point(of.lat, of.lon)


def measure(city: City, candidates: Sequence[Offered], asker: Asker, day: dt.date) -> list[Airport]:
    """Measure a city's airports, keeping each answer as it comes (stations.csv, screened.csv, routed.csv): what is
    known already is not asked again. The airports it can be reached from within MOST_MINUTES."""
    stations = {s.airport: s for s in Station.read()}
    for a in candidates:
        if a.code not in stations:
            near_it = asker.ask(lambda a=a: transitous.stops(Point(a.lat, a.lon), STATION_DEGREES))
            stations[a.code] = Station(airport=a.code, found=transitous.station(near_it))
            stations[a.code].append()
    to, clock = Point(city.lat, city.lon), Clock(city, asker, day)
    screened = {s.airport: s for s in Screened.read() if s.city == city.key}
    unscreened = [a for a in candidates if a.code not in screened]
    if unscreened:
        starts = [point(start(a, stations)) for a in unscreened]
        asker.can(len(ARRIVALS) + 1)  # and the city's time zone, the first time
        times = [asker.ask(lambda at=at: transitous.screen(to, starts, clock.at(at))) for at in ARRIVALS]
        for i, a in enumerate(unscreened):
            found = [m for t in times if (m := t[i]) is not None]
            screened[a.code] = Screened(city=city.key, airport=a.code, minutes=min(found, default=None), on=today())
            screened[a.code].append()
    routed = {r.airport: r for r in Routed.read() if r.city == city.key}
    for n, a in enumerate(candidates):
        minutes = screened[a.code].minutes
        if a.code in routed or (n >= NEAREST and (minutes is None or minutes > MOST_MINUTES)):
            continue
        way = asker.ask(lambda a=a: transitous.route(start(a, stations), to, clock.at(LEAVING)))
        routed[a.code] = Routed(city=city.key, airport=a.code, found=way, on=today())
        routed[a.code].append()
    return [
        a.airport()
        for a in candidates
        if (r := routed.get(a.code)) is not None and r.found is not None and r.found.minutes <= MOST_MINUTES
    ]


class Args(argparse.Namespace):
    source: Path = Path()
    most: int = MOST_REQUESTS


def main() -> None:
    ap = argparse.ArgumentParser(
        description='Measure the trips by public transport from airports into festival cities.'
    )
    _ = ap.add_argument('source', type=Path, help="OurAirports' airports.csv (ourairports.com/data), downloaded")
    _ = ap.add_argument('--most', type=int, default=MOST_REQUESTS, help='requests to Transitous at most this run')
    args = ap.parse_args(namespace=Args())
    offered = airports.offers(args.source)
    asker, day = Asker(args.most), friday(today())
    festival = airports.festival_cities()
    done = 0
    try:
        for city in festival:
            reached = measure(city, near(city, offered), asker, day)
            have = airports.known()
            new = [a for a in reached if a.code not in {h.code for h in have}]
            if new:
                Airport.write([*have, *new])
                print(f'{city.key}: added {", ".join(a.code for a in new)} to {Airport.FILE}')
            done += 1
    except SpentError:
        print(f'{args.most} requests asked: {len(festival) - done} cities left for the next run')
        return
    print(f'every one of {len(festival)} festival cities measured; {args.most - asker.left} requests asked')


if __name__ == '__main__':
    main()
