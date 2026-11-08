"""The airports a festival can fly to (records.Airport), and the flight a trip to it takes: from home (the airport
marked home), to an airport within MAX_AIRPORT_KM of its city (its candidates, the nearest first: the one it flies to
until a fare elsewhere is worth the way from there, which the site decides), on the Friday of its weekend. The one rule
for the site's events and for the weekends fares searches."""

import argparse
import csv
import datetime as dt
import math
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import NamedTuple

from pipeline import export
from pipeline.countries import NAMES
from pipeline.enums import Listing
from pipeline.records import Airport, Place, Record, today

MAX_AIRPORT_KM = 250
EARTH_KM = 6371  # the Earth's radius
FRIDAY, LATEST_START = 4, 3  # a Friday's weekday; a trip leaves on the Friday after a start this many days before


def known() -> list[Airport]:
    return Airport.read()


def home() -> str:
    """The airport flights leave from: the one airports.csv marks home."""
    marked = [a.code for a in known() if a.home]
    if len(marked) != 1:
        sys.exit(f'airports.csv: {len(marked)} airports marked home: one is where flights leave from')
    return marked[0]


def km(a: float, b: float, c: float, d: float) -> float:
    a, b, c, d = map(math.radians, (a, b, c, d))
    return (
        EARTH_KM
        * 2
        * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2 + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))
    )


def places() -> dict[tuple[str, str | None], Place]:
    """Every geocoded (city, country) (pipeline/geocode.csv)."""
    return {(p.city, p.country): p for p in Place.read()}


class Candidate(NamedTuple):
    """An airport a festival can fly to, and how far it is from the festival's city, in whole km."""

    airport: str
    km: int


class Placed(NamedTuple):
    """Where a festival is, the airport it flies to first with how far it is, when one is near enough, and every
    airport near enough (candidates), the nearest first."""

    lat: float
    lon: float
    airport: str | None
    km: int | None
    candidates: tuple[Candidate, ...]


def placed(
    city: str | None, country: str | None, geo: Mapping[tuple[str, str | None], Place], to: Sequence[Airport]
) -> Placed | None:
    """The festival's place when its city is geocoded, with every airport of to within MAX_AIRPORT_KM of it, the
    nearest first (by code when two are as far): it flies to the nearest until the site finds a fare elsewhere worth
    the way (site/fares.ts best)."""
    g = None if city is None else geo.get((city, country))
    if not (g and g.found):
        return None
    near = tuple(
        Candidate(code, round(dist))
        for dist, code in sorted((km(g.found.lat, g.found.lon, a.lat, a.lon), a.code) for a in to)
        if dist <= MAX_AIRPORT_KM
    )
    first = near[0] if near else None
    return Placed(g.found.lat, g.found.lon, first and first.airport, first and first.km, near)


def weekend_friday(start: dt.date) -> dt.date:
    """The Friday a Fri→Mon trip would leave on: the event's own Friday, or the next one for a Wed/Thu start."""
    off = (FRIDAY - start.weekday()) % 7
    return start + dt.timedelta(days=off if off <= LATEST_START else off - 7)


# an airport OurAirports (ourairports.com/data, public domain) lists that a festival can fly to: a large or medium one,
# with an IATA code and scheduled service, as Google Flights searches
SERVED = {'large_airport', 'medium_airport'}
IATA = re.compile(r'[A-Z]{3}')


class Listed(Record):
    """A festival still to come, listed and not cancelled: its city."""

    city: str | None
    country: str | None


class Offered(NamedTuple):
    """An airport as OurAirports lists it, not yet checked: only those near a festival become Airport records, so an
    airport far away with a country the site does not know never stops the step."""

    code: str
    name: str
    city: str
    country_code: str
    lat: float
    lon: float


def served(rows: Iterable[Mapping[str, str]]) -> list[Offered]:
    """The airports of OurAirports' airports.csv rows that have scheduled service and an IATA code."""
    return [
        Offered(
            code=r['iata_code'],
            name=r['name'],
            city=r['municipality'] or r['name'],
            country_code=r['iso_country'],
            lat=round(float(r['latitude_deg']), 3),
            lon=round(float(r['longitude_deg']), 3),
        )
        for r in rows
        if r['type'] in SERVED and r['scheduled_service'] == 'yes' and IATA.fullmatch(r['iata_code'])
    ]


def wanted(
    cities: Iterable[tuple[str | None, str | None]],
    geo: Mapping[tuple[str, str | None], Place],
    have: Sequence[Airport],
    offered: Sequence[Offered],
) -> list[Airport]:
    """The airports of offered within MAX_AIRPORT_KM of a festival's city that airports.csv has not yet, by code; one in
    a country the site does not name (Jersey, Gibraltar …) is left out, as no festival's own country is that."""
    have_codes = {a.code for a in have}
    out: dict[str, Airport] = {}
    for city, country in cities:
        g = None if city is None else geo.get((city, country))
        if not (g and g.found):
            continue
        for a in offered:
            if (
                a.code not in have_codes
                and a.country_code in NAMES
                and km(g.found.lat, g.found.lon, a.lat, a.lon) <= MAX_AIRPORT_KM
            ):
                out[a.code] = Airport(
                    code=a.code, name=a.name, city=a.city, country_code=a.country_code, lat=a.lat, lon=a.lon, home=False
                )
    return sorted(out.values(), key=lambda a: a.code)


def add(source: Path) -> None:
    """Add to airports.csv every airport with scheduled service (OurAirports' airports.csv, at source) within
    MAX_AIRPORT_KM of a festival to come, naming each; the airports there stay as they are."""
    with export.opened('ro') as db:
        cities = db.rows(
            Listed,
            "select distinct nullif(city, '') as city, nullif(country, '') as country from events"
            ' where cancelled is not 1 and listing = ? and start_date >= ?',
            (Listing.LISTED, today().isoformat()),
        )
    with source.open(encoding='utf-8', newline='') as f:
        offered = served(csv.DictReader(f))
    have = known()
    new = wanted(((c.city, c.country) for c in cities), places(), have, offered)
    for a in new:
        print(f'added {a.code} {a.name} ({a.city}, {a.country_code})')
    Airport.write([*have, *new])
    print(f'{len(new)} airports added; {len(have) + len(new)} in airports.csv')


class Args(argparse.Namespace):
    source: Path = Path()


def main() -> None:
    ap = argparse.ArgumentParser(description='Add the airports festivals to come can fly to, from OurAirports.')
    _ = ap.add_argument('source', type=Path, help="OurAirports' airports.csv (ourairports.com/data), downloaded")
    add(ap.parse_args(namespace=Args()).source)


if __name__ == '__main__':
    main()
