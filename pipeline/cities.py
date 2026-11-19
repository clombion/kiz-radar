"""The cities festivals are in (records.City, pipeline/cities.csv): one for each real city, however the source DB
spells it, and the one owner of a city's point.

A spelling is a city as the export names it, with the country it is listed under. It is looked for where it says, or,
when a place claim says it is in another country (claims.PlaceClaim: Porto, listed under France), there (asked):
pipeline/geocode.py asks Nominatim for each, and the spelling is in the first city within JOIN_KM of what it found
(Cities.of). A spelling no city is that near makes a new city (added), named as that spelling and keyed by its name and
country; a city keeps its key, its name and its point from then on, whatever spellings come later, as claims name it by
its key.

    mise run cities
"""

import argparse
import math
import re
import sys
import unicodedata as ud
from collections.abc import Iterable, Mapping, Sequence
from typing import NamedTuple

from pydantic import BaseModel

from pipeline import claims, export
from pipeline.claims import PlaceClaim
from pipeline.countries import NAMES, codes, nation
from pipeline.db import Reader
from pipeline.records import City, Place, Spelling, Spot

# how near two spellings' points are when they are one city: München and Munich are 0 km apart, Konstanz's three 0.5 km;
# Frederiksberg, a town of its own beside Copenhagen, 2.5 km
JOIN_KM = 1
EARTH_KM = 6371  # the Earth's radius

type Claimed = Mapping[Spelling, PlaceClaim]  # the place claims, by city and country as listed
type Geo = Mapping[Spelling, Place]  # the places asked of Nominatim, by city and country asked


def km(a: float, b: float, c: float, d: float) -> float:
    """How far apart two points are (latitude, longitude, latitude, longitude), in km."""
    a, b, c, d = map(math.radians, (a, b, c, d))
    return (
        EARTH_KM
        * 2
        * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2 + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))
    )


class Listed(BaseModel):
    city: str
    country: str | None


def spellings(db: Reader) -> list[Spelling]:
    """Every city the export's events name."""
    found = db.rows(
        Listed, "select distinct city, nullif(country, '') as country from events where city != '' order by 1, 2"
    )
    return [Spelling(s.city, s.country) for s in found]


def asked(s: Spelling, claimed: Claimed) -> Spelling:
    """Where a spelling is looked for: in the country a place claim says it is in, else where it is listed."""
    c = claimed.get(s)
    return s if c is None else Spelling(s.city, NAMES[c.is_in])


def country(spot: Spot, asked_in: str | None) -> str | None:
    """The country a place Nominatim found is in, by the last part of its name for it (in English), else the one it was
    asked in; the one asked when it is part of that one (Guadeloupe, which Nominatim names France)."""
    said = codes(spot.name.rpartition(', ')[2])
    listed = codes(asked_in)
    if listed and said and nation(listed[0]) == said[0]:
        return listed[0]
    return (said or listed or [None])[0]


def key(name: str, code: str, taken: Iterable[str]) -> str:
    """A new city's key: its name in plain lower-case letters and digits, then its country's code (munich-de); a second
    city of one name in one country, a number before the code (springfield-2-us)."""
    plain = ud.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    stem = '-'.join(re.findall(r'[a-z0-9]+', plain)) or 'city'
    taken = set(taken)
    n = 1
    while (k := f'{stem}{"" if n == 1 else f"-{n}"}-{code.lower()}') in taken:
        n += 1
    return k


class Cities:
    """The cities spellings are in: each spelling Nominatim found is in the first city of cities.csv within JOIN_KM of
    where it found it. cities.csv only grows and a city never moves, so a spelling stays in its city while its own
    point stays put; only a place claim, which moves it, moves it to another."""

    def __init__(self, have: Sequence[City], geo: Geo, claimed: Claimed) -> None:
        self.have = have
        self.geo = geo
        self.claimed = claimed

    def spot(self, s: Spelling) -> Spot | None:
        """Where Nominatim puts a spelling, when it found it."""
        p = self.geo.get(asked(s, self.claimed))
        return None if p is None else p.found

    def near(self, spot: Spot) -> City | None:
        """The first city written within JOIN_KM of a point."""
        return next((c for c in self.have if km(spot.lat, spot.lon, c.lat, c.lon) <= JOIN_KM), None)

    def of(self, city: str | None, country: str | None) -> City | None:
        """The city a festival's city and country, as listed, are in; none when it names none, Nominatim did not find
        it, or no city is near it yet (orphans: the cities step adds it)."""
        spot = None if city is None else self.spot(Spelling(city, country))
        return None if spot is None else self.near(spot)

    def orphans(self, named: Iterable[Spelling]) -> list[Spelling]:
        """The spellings Nominatim found that no city is near: those the cities step has not added yet."""
        return [s for s in named if (spot := self.spot(s)) is not None and self.near(spot) is None]

    def named(self, written: str) -> tuple[City, ...]:
        """The cities a person may mean, "City" or "City, Country" (a people.csv home): those of that name, or that a
        spelling of that name is in, in that country when it says one (by its name or its code)."""
        name, _, said = written.rpartition(', ') if ', ' in written else (written, '', '')
        spelt = {c.key for (city, _), p in self.geo.items() if city == name and p.found and (c := self.near(p.found))}
        found = [c for c in self.have if c.name == name or c.key in spelt]
        wanted = {nation(k) for k in codes(said)} | set(codes(said))
        return tuple(c for c in found if not said or c.country_code in wanted)


class Added(NamedTuple):
    """What the cities step found: the cities to add, and the spellings it could not add a city for: found where no
    country the site knows is named (a place claim says which), not asked of Nominatim yet (geocode asks), or not
    found."""

    cities: list[City]
    stateless: list[Spelling]
    unasked: list[Spelling]
    not_found: list[Spelling]


def added(named: Iterable[Spelling], geo: Geo, claimed: Claimed, have: Sequence[City]) -> Added:
    """The cities to add for the spellings no city is near, in order: a spelling as Nominatim names the place first
    (Munich before München), then by city and country, so that a city's first spelling names it; with the spellings
    it could not add (Added)."""
    out = list(have)
    now = Cities(out, geo, claimed)
    named = list(named)
    found = [(s, spot) for s in named if (spot := now.spot(s)) is not None]
    stateless: list[Spelling] = []
    for s, spot in sorted(
        found, key=lambda f: (f[1].name.partition(', ')[0] != f[0].city, f[0].city, f[0].country or '')
    ):
        if now.near(spot) is not None:
            continue
        if (code := country(spot, asked(s, claimed).country)) is None:
            stateless.append(s)
            continue
        city = City(
            key=key(s.city, code, (c.key for c in out)), name=s.city, country_code=code, lat=spot.lat, lon=spot.lon
        )
        out.append(city)
    return Added(
        cities=out[len(have) :],
        stateless=stateless,
        unasked=[s for s in named if asked(s, claimed) not in geo],
        not_found=[s for s in named if (p := geo.get(asked(s, claimed))) is not None and p.found is None],
    )


def places() -> dict[Spelling, Place]:
    """Every place asked of Nominatim (pipeline/geocode.csv), by city and country asked."""
    return {Spelling(p.city, p.country): p for p in Place.read()}


def known() -> list[City]:
    return City.read()


def index() -> Cities:
    """The cities as the steps have them: cities.csv, geocode.csv and the admin's place claims."""
    return Cities(known(), places(), claims.places())


def said(s: Spelling) -> str:
    return f'{s.city}, {s.country or "no country"}'


def main() -> None:
    ap = argparse.ArgumentParser(description='Add to pipeline/cities.csv a city for each city the export names anew.')
    _ = ap.parse_args()
    with export.opened('ro') as db:
        named = spellings(db)
    have = known()
    made = added(named, places(), claims.places(), have)
    for c in made.cities:
        print(f'added {c.key}: {c.name}, {c.country_code}')
    City.write([*have, *made.cities])
    print(f'{len(made.cities)} cities added; {len(have) + len(made.cities)} in {City.FILE}')
    for s in made.not_found:
        print(f'{said(s)}: not found by Nominatim, so in no city', file=sys.stderr)
    for s in made.unasked:
        print(f'{said(s)}: not asked of Nominatim yet (mise run geocode), so in no city yet', file=sys.stderr)
    if made.stateless:
        sys.exit(
            '\n'.join(
                f'{said(s)}: found where no country the site knows is named: a place claim (claims.write) says which'
                for s in made.stateless
            )
        )


if __name__ == '__main__':
    main()
