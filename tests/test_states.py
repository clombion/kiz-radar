"""The closed world of states (pipeline/STATES.md): the table checks itself, everything built from it holds exactly
its states, and each function that chooses between states reaches every one of them."""

import ast
import dataclasses
import json
import re
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest
from pydantic import ValidationError

from pipeline import enums, exceptions, generate, prompt, states
from pipeline.enums import PassKind, People, Price, Sales, Style, Waiting
from pipeline.extract import prices
from pipeline.records import LOG_ENTRY, PricedPass, PricedTier
from pipeline.states import Disposition, Link, State

ROOT = Path(__file__).parent.parent


@pytest.mark.parametrize(
    'make',
    [
        lambda: State('price', 'priced', 'x'),  # a field missing  # pyright: ignore[reportCallIssue]
        lambda: State('price', 'priced', 'x', 'card'),  # a disposition that is a string  # pyright: ignore[reportArgumentType]
        lambda: State('price', 'priced', 'x', Disposition.CARD, wording=3),  # wording that is no string  # pyright: ignore[reportArgumentType]
        lambda: State('price', 'priced', 'x', Disposition.CARD, link='page'),  # a link that is no Link  # pyright: ignore[reportArgumentType]
        lambda: State('price', 'priced', 'x', Disposition.CARD, forms=3),  # forms that are no mapping  # pyright: ignore[reportArgumentType]
    ],
)
def test_a_row_with_a_missing_or_wrong_typed_field_fails(make: Callable[[], State]) -> None:
    with pytest.raises(ValidationError):
        _ = make()


@pytest.mark.parametrize(
    'extra',
    [
        State('price', 'priced', 'again', Disposition.CARD),  # two states with one key
        State('no_point', 'x', 'x', Disposition.KEPT),  # a state of no point
        State('genre', 'x', 'x', Disposition.KEPT, under='tango'),  # under no style
        State('genre', 'y', 'x', Disposition.KEPT),  # a genre under nothing
        State('price', 'z', 'x', Disposition.CARD, under='kizomba'),  # under, for a point that falls under none
        State('price', 'z', 'x', Disposition.NOTE),  # a note without words
        State('price', 'z', 'x', Disposition.FILTER),  # a filter without words
        State('price', 'z', 'x', Disposition.WAITS),  # waiting with no one to act
    ],
)
def test_a_table_with_a_clash_or_a_dangling_state_fails(extra: State) -> None:
    with pytest.raises(ValueError, match=re.escape(extra.point)):
        states.check(states.POINTS, (*states.ROWS, extra))


def test_a_rows_forms_cannot_be_changed() -> None:
    with pytest.raises(TypeError):
        states.state('role', 'dj').forms['singular'] = 'Deejay'  # pyright: ignore[reportIndexIssue]


def test_a_link_and_a_form_reach_the_site() -> None:
    js = states.js_module()
    assert '"link": "page"' in js
    assert '"singular": "DJ"' in js
    assert 'export const LINK = {"PAGE": "page"' in js
    assert {s.link for s in states.ROWS} - {None} == set(Link)


def test_a_records_enum_holds_the_states_its_producer_makes() -> None:
    assert [str(k) for k in PassKind] == list(states.keys('pass_kind'))
    features = [str(k) for k in enums.ExtractedFeature]
    assert 'promo_code' not in features
    assert set(features) < set(states.keys('feature'))
    assert [str(k) for k in enums.Feature] == list(states.keys('feature'))


def test_the_schema_a_model_answers_names_its_enums_states() -> None:
    text = json.dumps(prompt.current('prices').schema)
    assert all(f'"{k}"' in text for k in states.keys('pass_kind'))


def test_a_prompt_lists_the_states_its_producer_makes() -> None:
    text = states.definitions('feature')
    assert '`taxi_dancers`:' in text
    assert '`promo_code`' not in text


def test_a_prompt_lists_the_states_in_key_order_and_genres_under_their_style() -> None:
    """So reordering the table (a view's order) asks nothing again."""
    listed = re.findall(r'`(\w+)`:', states.definitions('feature'))
    assert listed == sorted(listed)
    genres = states.definitions('genre')
    assert genres.index('`semba`') < genres.index('`zouk`')
    assert 'Kizomba' in genres


def test_the_files_written_from_the_table_say_what_it_does() -> None:
    assert {p: p.read_text(encoding='utf-8') for p in generate.FILES} == {p: b() for p, b in generate.FILES.items()}


def test_total_names_what_a_map_misses_or_has_too_many_of() -> None:
    with pytest.raises(LookupError, match='closed'):
        _ = states.total('sales', {s: 1 for s in Sales if s != Sales.CLOSED}, 'here')
    with pytest.raises(LookupError, match='soon'):
        _ = states.total('sales', {str(s): 1 for s in Sales} | {'soon': 1}, 'here')


def passes(
    *kinds: PassKind,
    style: Style | None = None,
    group_size: int | None = 1,
    days: int | None = None,
    includes_hotel: bool = False,
    amount: float = 9,
) -> list[PricedPass]:
    t = PricedTier(
        amount=amount,
        currency='EUR',
        fee=None,
        alt=None,
        from_=None,
        until=None,
        quantity=None,
        door=False,
        sold_out=False,
        current=False,
        quote=f'{amount:g}',
    )
    return [
        PricedPass(
            kind=kind,
            style=style,
            label_quote=None,
            group_size=group_size,
            days=days,
            includes_hotel=includes_hotel,
            tiers=(t,),
        )
        for kind in kinds
    ]


FULL, PACKAGE = PassKind.FULL, PassKind.PACKAGE
PRICE_CASES: list[tuple[tuple[Sequence[PricedPass], Sales | None, str | None], Price]] = [
    ((passes(FULL), None, None), Price.PRICED),
    ((passes(PACKAGE, includes_hotel=True), None, None), Price.PRICED),
    ((passes(PACKAGE), None, None), Price.OTHER_PASSES_ONLY),  # a package without a hotel
    ((passes(PassKind.DAY, PassKind.PARTY), Sales.CLOSED, None), Price.OTHER_PASSES_ONLY),
    ((passes(FULL, group_size=2), None, None), Price.OTHER_PASSES_ONLY),
    ((passes(FULL, includes_hotel=True), None, None), Price.OTHER_PASSES_ONLY),
    (([], Sales.SHOP, 'https://shop.example'), Price.PAGE_UNREAD),
    (([], None, 'https://shop.example'), Price.PAGE_UNREAD),
    (([], Sales.NOT_YET, None), Price.NOT_YET),
    (([], Sales.OFFLINE, None), Price.OFFLINE),
    (([], Sales.CLOSED, None), Price.CLOSED),
    (([], Sales.NONE_FOUND, None), Price.NONE_FOUND),
    (([], None, None), Price.NOT_LOOKED),
]


@pytest.mark.parametrize(('args', 'state'), PRICE_CASES)
def test_every_price_state(args: tuple[Sequence[PricedPass], Sales | None, str | None], state: Price) -> None:
    assert prices.price_state(*args) == state


def test_the_price_states_tested_are_all_of_them() -> None:
    assert {state for _, state in PRICE_CASES} == set(Price)


def test_the_card_prices_the_kizomba_full_pass_then_the_longest_then_the_cheapest_package_with_hotel() -> None:
    mixed = passes(FULL, style=Style.ZOUK) + passes(FULL, style=Style.KIZOMBA) + passes(FULL, days=3) + passes(FULL)
    assert prices.card_pass(mixed) == 1
    assert prices.card_pass(passes(FULL, style=Style.ZOUK) + passes(FULL, days=3)) == 1  # all styles before one
    assert prices.card_pass(passes(FULL, days=3) + passes(FULL, days=4)) == 1
    assert prices.card_pass(passes(FULL, days=3) + passes(FULL)) == 1  # a length not stated is the whole festival
    hotel = passes(PACKAGE, amount=900, includes_hotel=True) + passes(PACKAGE, amount=700, includes_hotel=True)
    assert prices.card_pass(hotel) == 1
    assert prices.card_pass(passes(PACKAGE, group_size=None, includes_hotel=True)) is None  # priced per room
    assert prices.card_pass(passes(PACKAGE)) is None  # no hotel
    assert prices.card_pass(passes(PACKAGE, includes_hotel=True) + passes(FULL)) == 1  # a full pass first


PEOPLE_CASES: list[tuple[tuple[int | None, PassKind], People]] = [
    ((1, FULL), People.ONE),
    ((None, FULL), People.ONE),
    ((None, PACKAGE), People.PER_ROOM),
    ((2, PassKind.PARTY), People.COUPLE),
    ((4, FULL), People.GROUP),
]


@pytest.mark.parametrize(('args', 'people'), PEOPLE_CASES)
def test_every_people_state(args: tuple[int | None, PassKind], people: People) -> None:
    group_size, kind = args
    assert prices.people(passes(kind, group_size=group_size)[0]) == people


def test_the_people_states_tested_are_all_of_them() -> None:
    assert {p for _, p in PEOPLE_CASES} == set(People)


def test_an_override_is_typed_dated_and_changes_something() -> None:
    o = exceptions.OVERRIDES[0]
    with pytest.raises(ValidationError):
        _ = dataclasses.replace(o, then='later')  # no state of waits_for
    with pytest.raises(ValidationError):
        _ = dataclasses.replace(o, decided_on='26 Oct')
    with pytest.raises(ValueError, match='to itself'):
        _ = dataclasses.replace(o, then=Waiting.RECIPE)  # an override from a state to itself


def test_the_log_says_each_page_read_state() -> None:
    row = {'key': '1', 'name': 'n', 'price': '€9', 'amount': 9, 'currency': 'EUR', 'fee': None, 'sold_out': False}
    row |= {'alt_price': None, 'alt_amount': None, 'alt_currency': None}
    base = {'at': '2026-10-01T00:00:00+00:00', 'page': 'https://x.org', 'recipe': 'x@0123abcd'}
    for key in states.keys('page_read'):
        said = (
            {'status': key, 'url': 'https://x.org', 'http': 200, 'rows': [row]}
            if key == 'read'
            else {'status': key, 'why': 'w'}
        )
        assert LOG_ENTRY.validate_json(json.dumps(base | said)).status == key
    with pytest.raises(ValidationError):
        _ = LOG_ENTRY.validate_json(json.dumps(base | {'status': 'soon', 'why': 'w'}))


# the string Literals the code may have: vocabularies that are no data point's states (pipeline/states.py holds those)
LITERALS = {
    frozenset({'merge-review-v1', 'merge-review-v2'}),  # the merge review prompts' files, records.MergeReview
    frozenset({'address', 'html'}),  # where a recipe's widget finds its event id, records.Widget
    frozenset({'fr', 'es', 'pt'}),  # kizomba-world's translations
    frozenset({'extract', 'rooms_genres', 'prices'}),  # the extraction passes, prompt.PassName
    frozenset({'first_read'}),  # the prompt that is no pass, prompt.Name
    frozenset({'ro', 'rw', 'rwc'}),  # SQLite's open modes, db.connect
}


def literal_words(node: ast.AST) -> frozenset[str]:
    """The strings of a Literal[...] subscript; none for any other node."""
    if not (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name) and node.value.id == 'Literal'):
        return frozenset()
    items = node.slice.elts if isinstance(node.slice, ast.Tuple) else [node.slice]
    return frozenset(e.value for e in items if isinstance(e, ast.Constant) and isinstance(e.value, str))


def test_a_string_literal_is_no_set_of_states() -> None:
    modules = (ROOT / 'pipeline').rglob('*.py')
    found = {w for path in modules for node in ast.walk(ast.parse(path.read_text())) if (w := literal_words(node))}
    assert found == LITERALS
