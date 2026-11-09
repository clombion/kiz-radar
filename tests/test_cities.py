"""The cities festivals are in (pipeline/cities.py): one for each real city, however the source spells it, kept as it
was first written, in the country it is in; and the cities step, which adds them."""

import pytest

from pipeline import cities, claims, data, export
from pipeline import db as sqlite_db
from pipeline.claims import PlaceClaim
from pipeline.records import City, Place, Spelling, Spot
from tests.exports import EXPORT, festival, placed, run, shaped
from tests.fakes import AT


def place(city: str, country: str | None, lat: float, lon: float, name: str) -> Place:
    return Place(city=city, country=country, found=Spot(lat=lat, lon=lon, name=name))


MUNICH = place('Munich', 'Germany', 48.137, 11.575, 'Munich, Bavaria, Germany')
MUENCHEN = place('München', 'Germany', 48.137, 11.575, 'Munich, Bavaria, Germany')
COPENHAGEN = place('Copenhagen', 'Denmark', 55.687, 12.570, 'Copenhagen, Capital Region of Denmark, Denmark')
FREDERIKSBERG = place('Frederiksberg', 'Denmark', 55.678, 12.533, 'Frederiksberg, Capital Region of Denmark, Denmark')
CORSICA = place('Porto', 'France', 42.268, 8.694, 'Porto, Ota, Corsica, Metropolitan France, France')
PORTO = place('Porto', 'Portugal', 41.150, -8.610, 'Porto, Portugal')
POINTE = place('Pointe-à-Pitre', 'Guadeloupe', 16.241, -61.533, 'Pointe-à-Pitre, Guadeloupe, France')
TBILISI = place('Tbilisi', None, 41.693, 44.802, 'Tbilisi, Georgia')  # a name codes() does not take for a country
NOWHERE = Place(city='Atlantis', country=None, found=None)
LISTED_UNDER_FRANCE = PlaceClaim(field='place', city='Porto', country='France', is_in='PT', made_at=AT, note='n')


def geo(*places: Place) -> dict[Spelling, Place]:
    return {Spelling(p.city, p.country): p for p in places}


def spelt(*places: Place) -> list[Spelling]:
    return [Spelling(p.city, p.country) for p in places]


def test_spellings_of_one_city_are_one_city_named_as_nominatim_names_it() -> None:
    """München and Munich are 0 km apart: one city, named by the spelling Nominatim writes in English, whatever order
    they come in; Frederiksberg, 2.5 km from Copenhagen, is a city of its own."""
    found = (MUENCHEN, MUNICH, COPENHAGEN, FREDERIKSBERG)
    made = cities.added(spelt(*found), geo(*found), {}, []).cities
    assert [(c.key, c.name, c.country_code) for c in made] == [
        ('copenhagen-dk', 'Copenhagen', 'DK'),
        ('frederiksberg-dk', 'Frederiksberg', 'DK'),
        ('munich-de', 'Munich', 'DE'),
    ]
    index = cities.Cities(made, geo(*found), {})
    assert index.of('München', 'Germany') == index.of('Munich', 'Germany') == made[2]


def test_a_city_once_written_stays_whatever_spellings_come_later() -> None:
    """A second run adds nothing; a spelling that would have named the city, come later, joins it as it is."""
    first = cities.added(spelt(MUENCHEN), geo(MUENCHEN), {}, []).cities
    assert [(c.key, c.name) for c in first] == [('munchen-de', 'München')]
    assert cities.added(spelt(MUENCHEN, MUNICH), geo(MUENCHEN, MUNICH), {}, first).cities == []
    assert cities.Cities(first, geo(MUENCHEN, MUNICH), {}).of('Munich', 'Germany') == first[0]


def test_a_spelling_stays_in_the_first_city_near_it_when_a_nearer_one_is_added() -> None:
    """A spelling 0.9 km from its city and 0.2 km from a city added later (1.1 km from the first) stays in the first:
    the claims on its key still apply to its festivals."""
    first = City(key='a-xx', name='A', country_code='DE', lat=50.0, lon=10.0)
    later = City(key='b-xx', name='B', country_code='DE', lat=50.0, lon=10.0154)  # 1.1 km east
    spot = place('Edge', 'Germany', 50.0, 10.0126, 'Edge, Germany')  # 0.9 km from A, 0.2 km from B
    assert cities.Cities([first, later], geo(spot), {}).of('Edge', 'Germany') == first


@pytest.mark.parametrize(('lon', 'joined'), [(10.0139, True), (10.0141, False)])  # 0.99 km and 1.01 km east
def test_a_spelling_joins_a_city_within_a_kilometre_of_it_and_no_further(lon: float, joined: bool) -> None:
    city = City(key='a-de', name='A', country_code='DE', lat=50.0, lon=10.0)
    near = place('Near', 'Germany', 50.0, lon, 'Near, Germany')
    assert (cities.Cities([city], geo(near), {}).of('Near', 'Germany') == city) is joined
    assert len(cities.added(spelt(near), geo(near), {}, [city]).cities) == (0 if joined else 1)


def test_a_place_claim_moves_a_spelling_to_the_country_it_is_in() -> None:
    """Porto listed under France is looked for in Portugal, and is Porto there, not the village in Corsica, even when
    the village was made a city before the claim."""
    claimed: cities.Claimed = {Spelling('Porto', 'France'): LISTED_UNDER_FRANCE}
    assert cities.asked(Spelling('Porto', 'France'), claimed) == Spelling('Porto', 'Portugal')
    village = cities.added(spelt(CORSICA), geo(CORSICA), {}, []).cities
    made = cities.added(spelt(CORSICA), geo(CORSICA, PORTO), claimed, village).cities
    assert [(c.key, c.lat) for c in made] == [('porto-pt', 41.150)]
    assert cities.Cities([*village, *made], geo(CORSICA, PORTO), claimed).of('Porto', 'France') == made[0]


def test_a_city_is_in_the_country_nominatim_names_and_a_territory_stays_itself() -> None:
    """Nominatim names Guadeloupe France: listed under Guadeloupe, the city is in Guadeloupe; with no country
    Nominatim names that the site knows, the one it was asked in."""
    assert cities.country(Spot(lat=0, lon=0, name='Pointe-à-Pitre, Guadeloupe, France'), 'Guadeloupe') == 'GP'
    assert cities.country(Spot(lat=0, lon=0, name='Konstanz, Germany'), 'Switzerland') == 'DE'
    assert cities.country(Spot(lat=0, lon=0, name='Улаанбаатар, Монгол улс'), 'Mongolia') == 'MN'
    assert cities.country(Spot(lat=0, lon=0, name='Somewhere, Nowhere'), None) is None
    made = cities.added(spelt(POINTE), geo(POINTE), {}, []).cities
    assert [(c.key, c.country_code) for c in made] == [('pointe-a-pitre-gp', 'GP')]


def test_a_new_city_s_key_is_its_plain_name_and_country_and_never_one_taken() -> None:
    assert cities.key('Pointe-à-Pitre', 'GP', []) == 'pointe-a-pitre-gp'
    assert cities.key('Springfield', 'US', ['springfield-us']) == 'springfield-2-us'
    assert cities.key('Springfield', 'US', ['springfield-us', 'springfield-2-us']) == 'springfield-3-us'
    assert cities.key('İstanbul', 'TR', []) == 'istanbul-tr'
    one = place('Springfield', 'United States', 39.8, -89.6, 'Springfield, Illinois, United States')
    two = place('Springfield', None, 37.2, -93.3, 'Springfield, Missouri, United States')
    assert [c.key for c in cities.added(spelt(one, two), geo(one, two), {}, []).cities] == [
        'springfield-us',
        'springfield-2-us',
    ]


def test_what_the_step_cannot_add_a_city_for_is_kept_apart_and_in_no_city() -> None:
    """Not found by Nominatim, not asked yet, or found where no country the site knows is named: no city for any, and
    each said apart; a festival there is in no city, and one found is an orphan the step has not added."""
    asked_later = Spelling('Bergen', 'Norway')
    made = cities.added([*spelt(NOWHERE, TBILISI, MUNICH), asked_later], geo(NOWHERE, TBILISI, MUNICH), {}, [])
    assert [c.key for c in made.cities] == ['munich-de']
    assert (made.not_found, made.unasked, made.stateless) == (spelt(NOWHERE), [asked_later], spelt(TBILISI))
    index = cities.Cities(made.cities, geo(NOWHERE, TBILISI, MUNICH), {})
    assert [index.of(s.city, s.country) for s in (*spelt(NOWHERE, TBILISI), asked_later)] == [None, None, None]
    assert index.of(None, None) is None
    assert index.orphans([*spelt(NOWHERE, TBILISI, MUNICH), asked_later]) == spelt(TBILISI)


def test_the_cities_step_adds_what_it_can_then_stops_on_a_country_no_claim_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Munich is added; Tbilisi, found where no country the site knows is named, stops the step naming the fix; a
    second run adds nothing more and stops alike."""
    Place.write([MUNICH, TBILISI])
    City.write([])
    path = data(export.SOURCE) / 'source.sqlite'
    path.parent.mkdir(parents=True)
    with sqlite_db.opened(path, 'rwc') as con, shaped(con).transaction() as tx:
        festival(tx, 1, city='Munich', country='Germany')
        festival(tx, 2, city='Tbilisi', country=None)
    for _ in range(2):
        with pytest.raises(SystemExit, match=r'Tbilisi, no country: .* a place claim \(claims.write\) says which'):
            run(cities.main, monkeypatch)
        assert [c.key for c in City.read()] == ['munich-de']


@pytest.mark.parametrize(
    ('written', 'keys'),
    [
        ('Copenhagen', ['copenhagen-dk']),
        ('Copenhagen, Denmark', ['copenhagen-dk']),
        ('Copenhagen, DK', ['copenhagen-dk']),  # by its code
        ('Copenhagen, Sweden', []),  # no Copenhagen there
        ('Porto', ['porto-fr', 'porto-pt']),  # two cities of the name: which one is not said
        ('Porto, Portugal', ['porto-pt']),
        ('Lisboa', ['lisbon-pt']),  # a spelling of a city of another name
        ('Atlantis', []),
    ],
)
def test_a_person_names_a_city_by_its_name_or_spelling_and_its_country_when_two_share_it(
    written: str, keys: list[str]
) -> None:
    corsica = City(key='porto-fr', name='Porto', country_code='FR', lat=42.268, lon=8.694)
    porto = City(key='porto-pt', name='Porto', country_code='PT', lat=41.150, lon=-8.610)
    copenhagen = City(key='copenhagen-dk', name='Copenhagen', country_code='DK', lat=55.687, lon=12.570)
    lisbon = City(key='lisbon-pt', name='Lisbon', country_code='PT', lat=38.708, lon=-9.137)
    lisboa = place('Lisboa', 'Portugal', 38.708, -9.137, 'Lisbon, Portugal')
    index = cities.Cities([corsica, porto, copenhagen, lisbon], geo(lisboa, NOWHERE), {})
    assert [c.key for c in index.named(written)] == keys


def test_the_place_claims_are_the_admin_s() -> None:
    claims.write([LISTED_UNDER_FRANCE])
    assert claims.places() == {Spelling('Porto', 'France'): LISTED_UNDER_FRANCE}


def test_every_city_the_committed_export_names_and_nominatim_found_is_in_a_city() -> None:
    """The committed cities.csv has a city for every spelling geocode.csv found: no festival is off the map for want of
    mise run cities (the build only says such a spelling, as Publish runs whatever the cities step did)."""
    placed()
    with export.opened('ro', EXPORT) as db:
        named = cities.spellings(db)
    assert cities.index().orphans(named) == []
