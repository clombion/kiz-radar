"""Geocode every (city, country) in the source DB with OpenStreetMap Nominatim, 1 request/s, keeping already-known
places in pipeline/geocode.csv so reruns only ask for new cities.

    uv run -m pipeline.geocode source/<events>.sqlite
"""

import argparse
import sys
import time
import urllib.parse
from pathlib import Path

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from pipeline import db as sqlite_db
from pipeline import web
from pipeline.records import Place

CACHE = Path(__file__).parent / 'geocode.csv'
SEARCH = 'https://nominatim.openstreetmap.org/search?'
HEADERS = {'User-Agent': 'kiz-radar/0.1 (https://github.com/clombion/kiz-radar)'}
PAUSE, BACKOFF = 1.1, 5  # seconds between requests (Nominatim allows one a second), and after a failure


class Found(BaseModel):
    """A place as Nominatim answers it."""

    model_config = ConfigDict(extra='ignore', frozen=True)

    lat: str
    lon: str
    display_name: str = ''


FOUND: TypeAdapter[list[Found]] = TypeAdapter(list[Found])


def search(query: dict[str, str]) -> list[Found]:
    return FOUND.validate_json(web.get(SEARCH + urllib.parse.urlencode(query), HEADERS))


def located(city: str, country: str) -> Place:
    """The place as Nominatim finds it: by city and country, or by country alone, and else as free text (a district's
    name, say)."""
    found = search(
        {'format': 'json', 'limit': '1', 'accept-language': 'en'}
        | ({'city': city, 'country': country} if city else {'country': country})
    )
    if not found and city:
        time.sleep(PAUSE)
        found = search({'format': 'json', 'limit': '1', 'q': f'{city}, {country}'})
    first = found[0] if found else Found(lat='', lon='')
    return Place(city=city, country=country, lat=first.lat, lon=first.lon, osm_name=first.display_name)


def main() -> None:
    ap = argparse.ArgumentParser(description="Geocode the source DB's cities with OpenStreetMap Nominatim.")
    sqlite_db.source_arg(ap)
    db = sqlite_db.connect(ap.parse_args(namespace=sqlite_db.Source()).src, 'ro')
    known = {(p.city, p.country): p for p in Place.read(CACHE)}
    places: list[tuple[str, str]] = db.execute(
        "select distinct coalesce(city, ''), coalesce(country, '') from events"
    ).fetchall()
    for city, country in places:
        if (city, country) in known or not (city or country):
            continue
        try:
            known[(city, country)] = located(city, country)
        except (OSError, ValidationError) as e:
            print('failed', city, country, e, file=sys.stderr)
            time.sleep(BACKOFF)
            continue
        time.sleep(PAUSE)
    Place.write(CACHE, sorted(known.values(), key=lambda p: (p.country, p.city)))
    print(len(known), 'places;', sum(1 for p in known.values() if not p.lat), 'not found')


if __name__ == '__main__':
    main()
