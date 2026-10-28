"""Geocode every (city, country) in the source DB with OpenStreetMap Nominatim, 1 request/s, keeping already-known
places in pipeline/geocode.csv so reruns only ask for new cities.

    mise run geocode
"""

import argparse
import sys
import time

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from pipeline import export, web
from pipeline.records import Place, Spot

SEARCH = web.Https('nominatim.openstreetmap.org', '/search')
HEADERS = {'User-Agent': 'kiz-radar/0.1 (https://github.com/clombion/kiz-radar)'}
PAUSE, BACKOFF = 1.1, 5  # seconds between requests (Nominatim allows one a second), and after a failure


class Found(BaseModel):
    """A place as Nominatim answers it."""

    model_config = ConfigDict(extra='ignore', frozen=True)

    lat: float
    lon: float
    display_name: str


FOUND: TypeAdapter[list[Found]] = TypeAdapter(list[Found])


def search(query: dict[str, str]) -> list[Found]:
    return FOUND.validate_json(web.get(SEARCH, query, HEADERS))


def located(city: str, country: str | None) -> Place:
    """The city as Nominatim finds it: by city and country, and else as free text (a district's name, say)."""
    named = {'city': city} | ({} if country is None else {'country': country})
    found = search({'format': 'json', 'limit': '1', 'accept-language': 'en'} | named)
    if not found:
        time.sleep(PAUSE)
        found = search({'format': 'json', 'limit': '1', 'q': ', '.join(named.values())})
    spot = Spot(lat=found[0].lat, lon=found[0].lon, name=found[0].display_name) if found else None
    return Place(city=city, country=country, found=spot)


class Located(BaseModel):
    city: str
    country: str | None


def main() -> None:
    ap = argparse.ArgumentParser(description="Geocode the source DB's cities with OpenStreetMap Nominatim.")
    _ = ap.parse_args()
    with export.opened('ro') as db:
        known = {(p.city, p.country): p for p in Place.read()}
        # a country alone is no place on the map; one the export leaves empty is none
        places = db.rows(Located, "select distinct city, nullif(country, '') as country from events where city != ''")
        for city, country in ((p.city, p.country) for p in places):
            if (city, country) in known:
                continue
            try:
                known[(city, country)] = located(city, country)
            except (OSError, ValidationError) as e:
                print('failed', city, country, e, file=sys.stderr)
                time.sleep(BACKOFF)
                continue
            time.sleep(PAUSE)
        Place.write(sorted(known.values(), key=lambda p: (p.country or '', p.city)))
        print(len(known), 'places;', sum(1 for p in known.values() if p.found is None), 'not found')


if __name__ == '__main__':
    main()
