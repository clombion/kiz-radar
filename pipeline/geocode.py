"""Geocode every (city, country) in the source DB with OpenStreetMap Nominatim, 1 request/s, keeping already-known
places in pipeline/geocode.csv so reruns only ask for new cities. The file is saved after every place found, so a run
stopped half way keeps them; a place Nominatim gave no answer for (pipeline/calls.py) is left for the next run, which
this one fails naming. A transient failure is waited out once before the next place; a structural one (a refused
request) stops the run.

    mise run geocode
"""

import argparse
import sys
import time

from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from pipeline import calls, export, web
from pipeline.calls import Declined
from pipeline.enums import CallCause
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


def search(query: dict[str, str]) -> list[Found] | Declined:
    match web.get(SEARCH, query, HEADERS):
        case Declined() as d:
            return d
        case body:
            pass
    try:
        return FOUND.validate_json(body)
    except ValidationError as e:
        return Declined(CallCause.STRUCTURAL, f'{SEARCH.url()}: an answer of another shape: {e.errors()[0]["msg"]}')


def located(city: str, country: str | None) -> Place | Declined:
    """The city as Nominatim finds it: by city and country, and else as free text (a district's name, say)."""
    named = {'city': city} | ({} if country is None else {'country': country})
    found = search({'format': 'json', 'limit': '1', 'accept-language': 'en'} | named)
    if found == []:
        time.sleep(PAUSE)
        found = search({'format': 'json', 'limit': '1', 'q': ', '.join(named.values())})
    if isinstance(found, Declined):
        return found
    spot = Spot(lat=found[0].lat, lon=found[0].lon, name=found[0].display_name) if found else None
    return Place(city=city, country=country, found=spot)


class Located(BaseModel):
    city: str
    country: str | None


def main() -> None:
    ap = argparse.ArgumentParser(description="Geocode the source DB's cities with OpenStreetMap Nominatim.")
    _ = ap.parse_args()
    with export.opened('ro') as db:
        # a country alone is no place on the map; one the export leaves empty is none
        places = db.rows(Located, "select distinct city, nullif(country, '') as country from events where city != ''")
    known = {(p.city, p.country): p for p in Place.read()}
    declined: list[tuple[str, Declined]] = []
    for city, country in ((p.city, p.country) for p in places):
        if (city, country) in known:
            continue
        match located(city, country):
            case Declined() as d:
                declined.append((f'{city}, {country}', d))
                print(f'{city}, {country}: {d.cause}: {d.why}', file=sys.stderr)
                if d.stops:
                    break
                time.sleep(BACKOFF)
            case place:
                known[(city, country)] = place
                Place.write(sorted(known.values(), key=lambda p: (p.country or '', p.city)))
                time.sleep(PAUSE)
    print(len(known), 'places;', sum(1 for p in known.values() if p.found is None), 'not found')
    if why := calls.failed('places', declined):
        sys.exit(why)


if __name__ == '__main__':
    main()
