"""One parser of the countries a field names (countries.codes), for festivals and line-ups alike."""

import collections
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from pipeline import build_site_db, countries
from pipeline.enums import HomeBasis

# what codes() gives every country field the export held when it was written (tests/countries.json), so that a change
# of the parser shows each field it reads otherwise
SNAPSHOT = TypeAdapter(dict[str, list[str]]).validate_json((Path(__file__).parent / 'countries.json').read_bytes())


@pytest.mark.parametrize(('code', 'name'), sorted(countries.NAMES.items()))
def test_a_countrys_own_name_names_it_alone(code: str, name: str) -> None:
    assert countries.codes(name) == [code]


def test_every_field_the_export_held_reads_as_it_did() -> None:
    assert {v: countries.codes(v) for v in SNAPSHOT} == SNAPSHOT


@pytest.mark.parametrize(
    ('written', 'found'),
    [
        ('Trinidad-and-Tobago', ['TT']),  # a name with a separator, matched whole, not "and" as Andorra
        ('Bosnia and Herzegovina', ['BA']),
        ('Saint-Nazaire (France)', ['FR']),
        ('SXM-French Guyana / Romania', ['GF', 'MF', 'RO']),
        ('🇵🇹🇪🇦', ['PT', 'ES']),  # Ceuta and Melilla's flag is Spain's
        ('Wakanda', []),
    ],
)
def test_a_field_names_the_countries_it_writes(written: str, found: list[str]) -> None:
    assert countries.codes(written) == found


def test_a_territory_overseas_is_of_its_nation() -> None:
    assert [countries.nation(c) for c in ('GP', 'MQ', 'FR', 'PT')] == ['FR', 'FR', 'FR', 'PT']


@pytest.mark.parametrize(
    ('given', 'stated', 'expected'),
    [
        ('PT', {'AO': 3}, ('PT', HomeBasis.GIVEN)),  # given by hand, whatever line-ups say
        (None, {'AO': 3, 'PT': 1}, ('AO', HomeBasis.STATED)),  # the country stated most often
        (None, {'AO': 2, 'PT': 2}, (None, HomeBasis.CONTESTED)),  # none more often: no home
        (None, {}, (None, None)),  # where they are booked says nothing of it
    ],
)
def test_a_home_is_only_what_a_source_states(
    given: str | None, stated: dict[str, int], expected: tuple[str | None, HomeBasis | None]
) -> None:
    assert build_site_db.home(given, collections.Counter(stated)) == expected
