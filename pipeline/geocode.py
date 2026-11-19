"""Geocode every city the source DB names with OpenStreetMap Nominatim, 1 request/s: each where it is listed, or where
a place claim says it is (cities.asked). pipeline/geocode.csv keeps the places asked, so reruns only ask for new ones,
and drops those no spelling asks for any more. The file is saved after every place found, so a run stopped half way
keeps them; a place Nominatim gave no answer for (pipeline/calls.py) is left for the next run, which this one fails
naming. A transient failure is waited out once before the next place; a structural one (a refused request) stops the
run.

    mise run geocode
"""

import argparse
import sys
import time
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, TypeAdapter

from pipeline import calls, cities, claims, export, web
from pipeline.calls import Declined
from pipeline.records import Place, Spot

SEARCH = web.Https('nominatim.openstreetmap.org', '/search')
PAUSE, BACKOFF = 1.1, 5  # seconds between requests (Nominatim allows one a second), and after a failure


class Found(BaseModel):
    """A place as Nominatim answers it."""

    model_config = ConfigDict(extra='ignore', frozen=True)

    lat: float
    lon: float
    display_name: str


FOUND: TypeAdapter[list[Found]] = TypeAdapter(list[Found])


def search(query: dict[str, str]) -> list[Found] | Declined:
    return web.answer(SEARCH, query, FOUND)


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


def kept(known: Mapping[tuple[str, str | None], Place]) -> None:
    """geocode.csv, holding these places, by country then city."""
    Place.write(sorted(known.values(), key=lambda p: (p.country or '', p.city)))


def main() -> None:
    ap = argparse.ArgumentParser(description="Geocode the source DB's cities with OpenStreetMap Nominatim.")
    _ = ap.parse_args()
    with export.opened('ro') as db:
        named = cities.spellings(db)
    if not named:  # an export with no city would drop every place found, which Nominatim would be asked for again
        sys.exit(f'{export.path()}: no festival names a city, so no place is asked for: is it the export?')
    claimed = claims.places()
    wanted = dict.fromkeys(cities.asked(s, claimed) for s in named)
    had = Place.read()
    known = {(p.city, p.country): p for p in had if (p.city, p.country) in wanted}
    if dropped := len(had) - len(known):
        print(dropped, 'places no city asks for any more dropped')
    declined: list[tuple[str, Declined]] = []
    for city, country in wanted:
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
                kept(known)
                time.sleep(PAUSE)
    kept(known)  # the places no city asks for any more dropped
    print(len(known), 'places;', sum(1 for p in known.values() if p.found is None), 'not found')
    if why := calls.failed('places', declined):
        sys.exit(why)


if __name__ == '__main__':
    main()
