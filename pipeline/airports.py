"""The airports a festival can fly to (records.Airport), and the flight a trip to it takes: from home (the airport
marked home), to the airport nearest its city within MAX_AIRPORT_KM, on the Friday of its weekend. The one rule for
the site's events and for the weekends fares searches."""

import datetime as dt
import math
from collections.abc import Mapping, Sequence
from typing import NamedTuple

from pipeline.records import Airport, Place

MAX_AIRPORT_KM = 250
EARTH_KM = 6371  # the Earth's radius
FRIDAY, LATEST_START = 4, 3  # a Friday's weekday; a trip leaves on the Friday after a start this many days before


def known() -> list[Airport]:
    return Airport.read()


def home() -> str:
    (code,) = [a.code for a in known() if a.home]
    return code


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


class Placed(NamedTuple):
    """Where a festival is, and the airport it flies to with how far it is, when one is near enough."""

    lat: float
    lon: float
    airport: str | None
    km: int | None


def placed(
    city: str | None, country: str | None, geo: Mapping[tuple[str, str | None], Place], to: Sequence[Airport]
) -> Placed | None:
    """The festival's place when its city is geocoded, flying to the nearest of to within MAX_AIRPORT_KM."""
    g = None if city is None else geo.get((city, country))
    if not (g and g.found):
        return None
    dist, code = min((km(g.found.lat, g.found.lon, a.lat, a.lon), a.code) for a in to)
    near = dist <= MAX_AIRPORT_KM
    return Placed(g.found.lat, g.found.lon, code if near else None, round(dist) if near else None)


def weekend_friday(start: dt.date) -> dt.date:
    """The Friday a Fri→Mon trip would leave on: the event's own Friday, or the next one for a Wed/Thu start."""
    off = (FRIDAY - start.weekday()) % 7
    return start + dt.timedelta(days=off if off <= LATEST_START else off - 7)
