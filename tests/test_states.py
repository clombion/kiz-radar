"""The closed world of states (pipeline/STATES.md): the table checks itself, everything built from it holds exactly
its states, and each function that chooses between states reaches every one of them."""
import dataclasses, json, re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from pipeline import exceptions, states
from pipeline.extract import prices
from pipeline.states import Disposition, Link, People, Price, Sales, State, Waiting

ROOT = Path(__file__).parent.parent
SCHEMAS = sorted(ROOT.glob('pipeline/*/schemas/*.json'))


@pytest.mark.parametrize('make', [
    lambda: State('price', 'priced', 'x'),                                  # a field missing
    lambda: State('price', 'priced', 'x', 'card'),                          # a disposition that is a string
    lambda: State('price', 'priced', 'x', Disposition.CARD, wording=3),     # wording that is no string
    lambda: State('price', 'priced', 'x', Disposition.CARD, link='page'),   # a link that is no Link
    lambda: State('price', 'priced', 'x', Disposition.CARD, forms=3),       # forms that are no mapping
])
def test_a_row_with_a_missing_or_wrong_typed_field_fails(make):
    with pytest.raises(TypeError):
        make()


@pytest.mark.parametrize('extra', [
    State('price', 'priced', 'again', Disposition.CARD),                    # two states with one key
    State('no_point', 'x', 'x', Disposition.KEPT),                          # a state of no point
    State('genre', 'x', 'x', Disposition.KEPT, under='tango'),          # under no style
    State('genre', 'y', 'x', Disposition.KEPT),                         # a genre under nothing
    State('price', 'z', 'x', Disposition.CARD, under='kizomba'),        # under, for a point that falls under none
    State('price', 'z', 'x', Disposition.NOTE),                         # a note without words
    State('price', 'z', 'x', Disposition.FILTER),                       # a filter without words
    State('price', 'z', 'x', Disposition.WAITS),                        # waiting with no one to act
])
def test_a_table_with_a_clash_or_a_dangling_state_fails(extra):
    with pytest.raises(ValueError):
        states.check(states.POINTS, (*states.ROWS, extra))


def test_every_enum_reference_in_the_code_is_a_state():
    """A member named in the code that the table doesn't have fails here, naming it."""
    enums = {name: getattr(states, name) for name in dir(states) if isinstance(getattr(states, name), type)
             and issubclass(getattr(states, name), states.StrEnum) and getattr(states, name) is not states.StrEnum}
    found = [f'{path.relative_to(ROOT)}: {e}.{m}' for path in sorted(ROOT.glob('pipeline/**/*.py'))
             for e, m in re.findall(rf"\b({'|'.join(enums)})\.([A-Z_]+)\b", path.read_text()) if m not in enums[e].__members__]
    assert found == []


@pytest.mark.parametrize('path', SCHEMAS, ids=lambda p: p.name)
def test_every_schema_with_its_states_filled_is_a_valid_schema(path):
    Draft202012Validator.check_schema(states.schema(path))


def test_a_reference_to_no_point_fails(tmp_path):
    (tmp_path / 's.json').write_text(json.dumps({'properties': {'k': {'$ref': '#/$defs/no_point'}}}))
    with pytest.raises(ValueError, match='no_point'):
        states.schema(tmp_path / 's.json')


def test_a_rows_forms_cannot_be_changed():
    with pytest.raises(TypeError):
        states.state('role', 'dj').forms['singular'] = 'Deejay'


def test_a_link_and_a_form_reach_the_site():
    js = states.js_module()
    assert '"link": "page"' in js and '"singular": "DJ"' in js and 'export const LINK = {"PAGE": "page"' in js
    assert {s.link for s in states.ROWS} - {None} == set(Link)


def test_a_schema_enum_holds_the_states_its_producer_makes():
    passes = states.schema(ROOT / 'pipeline/extract/schemas/prices.json')
    assert passes['$defs']['pass_kind']['enum'] == list(states.keys('pass_kind'))
    features = states.schema(ROOT / 'pipeline/extract/schemas/extract.json')['$defs']['feature']['enum']
    assert 'promo_code' not in features and set(features) < set(states.keys('feature'))


def test_the_log_says_each_page_read_state():
    log = states.schema(ROOT / 'pipeline/tickets/schemas/log.json')
    said = [s for branch in log['oneOf'] for v in [branch['properties']['status']] for s in v.get('enum', [v.get('const')])]
    assert sorted(said) == sorted(states.keys('page_read'))


def test_a_prompt_lists_the_states_its_producer_makes():
    text = states.definitions('feature')
    assert '`taxi_dancers`:' in text and '`promo_code`' not in text


def test_a_prompt_lists_the_states_in_key_order_and_genres_under_their_style():
    """So reordering the table (a view's order) asks nothing again."""
    listed = re.findall(r'`(\w+)`:', states.definitions('feature'))
    assert listed == sorted(listed)
    genres = states.definitions('genre')
    assert genres.index('`semba`') < genres.index('`zouk`') and 'Kizomba' in genres


def test_total_names_what_a_map_misses_or_has_too_many_of():
    with pytest.raises(LookupError, match='closed'):
        states.total('sales', {s: 1 for s in Sales if s != Sales.CLOSED}, 'here')
    with pytest.raises(LookupError, match='soon'):
        states.total('sales', {s: 1 for s in Sales} | {'soon': 1}, 'here')


def passes(*kinds, **k):
    return [{'kind': kind, 'style': None, 'group_size': 1, 'days': None, 'includes_hotel': False, 'tiers': [{'amount': 9}]} | k
            for kind in kinds]


PRICE_CASES = [
    ((passes('full'), None, None), Price.PRICED),
    ((passes('package', includes_hotel=True), None, None), Price.PRICED),
    ((passes('package'), None, None), Price.OTHER_PASSES_ONLY),             # a package without a hotel
    ((passes('day', 'party'), Sales.CLOSED, None), Price.OTHER_PASSES_ONLY),
    ((passes('full', group_size=2), None, None), Price.OTHER_PASSES_ONLY),
    ((passes('full', includes_hotel=True), None, None), Price.OTHER_PASSES_ONLY),
    (([], Sales.SHOP, 'https://shop.example'), Price.PAGE_UNREAD),
    (([], None, 'https://shop.example'), Price.PAGE_UNREAD),
    (([], Sales.NOT_YET, None), Price.NOT_YET),
    (([], Sales.OFFLINE, None), Price.OFFLINE),
    (([], Sales.CLOSED, None), Price.CLOSED),
    (([], Sales.NONE_FOUND, None), Price.NONE_FOUND),
    (([], None, None), Price.NOT_LOOKED),
]


@pytest.mark.parametrize('args, state', PRICE_CASES)
def test_every_price_state(args, state):
    assert prices.price_state(*args) == state


def test_the_price_states_tested_are_all_of_them():
    assert {state for _, state in PRICE_CASES} == set(Price)


def test_the_card_prices_the_kizomba_full_pass_then_the_longest_then_the_cheapest_package_with_hotel():
    mixed = passes('full', style='zouk') + passes('full', style='kizomba') + passes('full', days=3) + passes('full')
    assert prices.card_pass(mixed) == 1
    assert prices.card_pass(passes('full', style='zouk') + passes('full', days=3)) == 1     # all styles before one
    assert prices.card_pass(passes('full', days=3) + passes('full', days=4)) == 1
    assert prices.card_pass(passes('full', days=3) + passes('full')) == 1    # a length not stated is the whole festival
    hotel = dict(includes_hotel=True)
    assert prices.card_pass(passes('package', tiers=[{'amount': 900}], **hotel)
                            + passes('package', tiers=[{'amount': 700}], **hotel)) == 1
    assert prices.card_pass(passes('package', group_size=None, **hotel)) is None    # priced per room
    assert prices.card_pass(passes('package')) is None                           # no hotel
    assert prices.card_pass(passes('package', **hotel) + passes('full')) == 1     # a full pass first


PEOPLE_CASES = [((1, 'full'), People.ONE), ((None, 'full'), People.ONE), ((None, 'package'), People.PER_ROOM),
                ((2, 'party'), People.COUPLE), ((4, 'full'), People.GROUP)]


@pytest.mark.parametrize('args, people', PEOPLE_CASES)
def test_every_people_state(args, people):
    group_size, kind = args
    assert prices.people({'group_size': group_size, 'kind': kind}) == people


def test_the_people_states_tested_are_all_of_them():
    assert {p for _, p in PEOPLE_CASES} == set(People)


def test_an_override_is_typed_dated_and_changes_something():
    o = exceptions.OVERRIDES[0]
    with pytest.raises(TypeError):
        dataclasses.replace(o, then='later')                    # no state of waits_for
    with pytest.raises(ValueError):
        dataclasses.replace(o, decided_on='26 Oct')
    with pytest.raises(ValueError):
        dataclasses.replace(o, then=Waiting.RECIPE)             # an override from a state to itself
