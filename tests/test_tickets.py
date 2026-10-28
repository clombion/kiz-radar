"""Ticket-page prices: rows to passes by key, the first read's checks, recording, changes, re-reads and agreement."""

import collections
import contextlib
import dataclasses
import datetime as dt
import json
import re
import sqlite3
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest

from pipeline import ROOT, data, exceptions, prompt, spend, tickets
from pipeline.enums import FirstRead as FirstReadState
from pipeline.enums import PassKind, Price, Recheck, Sales, SkipReason, Status, Style, Waiting
from pipeline.extract import answers, load_extract, prices
from pipeline.records import (
    JSON,
    RECIPE,
    Dispute,
    Failed,
    FirstRead,
    FirstReadAnswer,
    FoundRow,
    FromJson,
    FromPage,
    FromText,
    Json,
    PageRecipe,
    PageRow,
    Priced,
    PricedPass,
    PricedTier,
    PriceRow,
    Rate,
    Read,
    ReadPass,
    ReadTier,
    Row,
    Skip,
    StatusRow,
    Widget,
    real_day,
)
from tests import jsons
from tests.exports import committed
from tests.fakes import AT, Client, Memory

LATER = dt.datetime(2026, 11, 3, 5, tzinfo=dt.UTC)
DAY = dt.date(2026, 11, 1)  # a day after the reads
PAGE = 'https://my.weezevent.com/x'
SITE = tickets.sites()['weezevent']


def stamp(day: int) -> dt.datetime:
    return dt.datetime(2026, 10, day, tzinfo=dt.UTC)


def row(
    key: str,
    name: str,
    amount: float,
    *,
    sold_out: bool = False,
    alt: float | None = None,
    price: str | None = None,
    fee: float | None = None,
) -> Row:
    return Row(
        key=key,
        name=name,
        price=price or f'€{amount:.2f}',
        amount=amount,
        currency='EUR',
        fee=fee,
        sold_out=sold_out,
        alt_amount=alt,
        alt_currency='CZK' if alt else None,
        alt_price=f'{alt} CZK' if alt else None,
    )


def entry(rows: Sequence[Row], at: dt.datetime = AT, page: str = PAGE) -> Read:
    return Read(at=at, page=page, recipe='weezevent@0123abcd', url=page, http=200, status=Status.READ, rows=tuple(rows))


def refused(at: dt.datetime) -> Failed:
    return Failed(at=at, page=PAGE, recipe='weezevent@0123abcd', status=Status.REFUSED, why='HTTP 429')


def broken(at: dt.datetime) -> Failed:
    return Failed(at=at, page=PAGE, recipe='weezevent@0123abcd', status=Status.LAYOUT_BROKEN, why='no ticket rows')


ROWS = (
    row('1', 'Fullpass Male 100€', 102.56, sold_out=True),
    row('2', 'Fullpass Female 100€', 102.56, sold_out=True),
    row('3', 'Fullpass Male 120€', 123.08),
    row('4', 'Fullpass Female 120€', 123.08),
    row('5', 'Shuttle from the airport', 56.41),
)


def changed(rows: Sequence[Row], i: int, **change: object) -> tuple[Row, ...]:
    """The rows, the i-th changed."""
    return tuple(r.model_copy(update=change) if n == i else r for n, r in enumerate(rows))


def tier(*keys: str, until: str | None = None, quantity: int | None = None, quote: str | None = None) -> ReadTier:
    return ReadTier(
        keys=keys, from_=None, until=None if until is None else real_day(until), quantity=quantity, date_quote=quote
    )


def pass_(
    *tiers: ReadTier,
    kind: PassKind = PassKind.FULL,
    style: Style | None = None,
    label: str | None = 'Fullpass',
    days: int | None = None,
    hotel: bool = False,
) -> ReadPass:
    return ReadPass(
        kind=kind,
        style=style,
        label_quote=label,
        group_size=1,
        days=days,
        includes_hotel=hotel,
        tiers=tiers or (tier('1', '2'), tier('3', '4')),
    )


def read(
    passes: Sequence[ReadPass] = (),
    *,
    skipped: Sequence[tuple[str, SkipReason]] = (('5', SkipReason.EXCURSION),),
    description: str = 'Prices rise on 1 December.',
    rule_quotes: Sequence[str] = (),
    styles: Sequence[Style] = (Style.BACHATA, Style.KIZOMBA),
    prompt_: str | None = None,
    rows_at: dt.datetime = AT,
) -> FirstRead:
    return FirstRead(
        event_id=7,
        title='Fest',
        start_date=dt.date(2027, 2, 5),
        read_by='agent',
        prompt=prompt_ or prompt.current('first_read').hash,
        styles=tuple(styles),
        rows_at=rows_at,
        description=description,
        passes=tuple(passes) or (pass_(),),
        skipped=tuple(Skip(key=k, reason=r) for k, r in skipped),
        rule_quotes=tuple(rule_quotes),
    )


def with_tier(fr: FirstRead, t: int, new: ReadTier) -> FirstRead:
    """The first read, the t-th tier of its first pass replaced."""
    ps = fr.passes[0]
    tiers = tuple(new if n == t else x for n, x in enumerate(ps.tiers))
    return fr.model_copy(update={'passes': (ps.model_copy(update={'tiers': tiers}), *fr.passes[1:])})


def with_pass(fr: FirstRead, **change: object) -> FirstRead:
    """The first read, its first pass changed."""
    return fr.model_copy(update={'passes': (fr.passes[0].model_copy(update=change), *fr.passes[1:])})


def tiers_of(answer: Priced) -> tuple[PricedTier, ...]:
    return answer.passes[0].tiers


def test_rows_become_passes_by_key() -> None:
    answer, unread, found = tickets.build(read(), entry(ROWS))
    assert found == []
    assert unread == []
    assert [(t.amount, t.sold_out) for t in tiers_of(answer)] == [(102.56, True), (123.08, False)]
    assert tiers_of(answer)[1].quote == 'Fullpass Male 120€ €123.08'


def test_a_tier_is_sold_out_only_when_all_its_tickets_are() -> None:
    answer = tickets.build(read(), entry(changed(ROWS, 3, sold_out=True)))[0]
    assert tiers_of(answer)[1].sold_out is False


def test_unread_tickets_are_counted_and_kept_out() -> None:
    answer, unread, found = tickets.build(read(), entry((*ROWS, row('6', 'Fullpass Male 140€', 143.59))))
    assert unread == ['6']
    assert found == []
    assert all(t.amount != 143.59 for t in tiers_of(answer))


def test_a_tier_whose_tickets_are_gone_is_left_out() -> None:
    assert [t.amount for t in tiers_of(tickets.build(read(), entry(ROWS[2:]))[0])] == [123.08]


def test_tickets_of_one_tier_that_now_differ_in_price_need_a_new_first_read() -> None:
    rows = changed(ROWS, 3, amount=128.21, price='€128.21')
    assert 'the first read needs doing again' in tickets.build(read(), entry(rows))[2][0]


def test_amounts_are_checked_against_their_quotes() -> None:
    rows = changed(ROWS, 2, price='see below')
    assert any(p.startswith('amounts:') for p in tickets.build(read(), entry(rows))[2])


def test_first_read_maps_every_ticket_once() -> None:
    assert tickets.read_problems(read(skipped=()), [entry(ROWS)]) == [
        'key 5 (Shuttle from the airport €56.41): neither in a tier nor skipped'
    ]
    fr = read(skipped=(('5', SkipReason.EXCURSION), ('3', SkipReason.CLASS)))
    assert 'key 3: in the read twice' in tickets.read_problems(fr, [entry(ROWS)])
    fr = read(skipped=(('5', SkipReason.EXCURSION), ('9', SkipReason.CLASS)))
    assert 'key 9: not on the page' in tickets.read_problems(fr, [entry(ROWS)])


def test_first_read_needs_the_logged_read_it_names() -> None:
    assert 'is no read' in tickets.read_problems(read(), [entry(ROWS, at=stamp(2))])[0]


@pytest.mark.parametrize(
    ('quote', 'ok'),
    [('Prices rise on 1 December', True), ('Fullpass Male 120€', True), ('Prices rise on 2 December', False)],
)
def test_date_quotes_come_from_the_description_or_the_tiers_tickets(quote: str, ok: bool) -> None:
    fr = with_tier(read(), 1, tier('3', '4', until='11-30', quote=quote))
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


def read_json(**change: object) -> str:
    """A first read's file, with these fields changed."""
    return json.dumps(read().model_dump(mode='json') | change)


def first_tier_json(**tier_: object) -> str:
    """A first read's file whose second tier is this."""
    fr: dict[str, object] = read().model_dump(mode='json')
    fr['passes'] = [
        {**read().passes[0].model_dump(mode='json'), 'tiers': [tier('1', '2').model_dump(mode='json'), tier_]}
    ]
    return json.dumps(fr)


@pytest.mark.parametrize(('until', 'quote'), [('11-30', None), (None, 'Prices rise on 1 December')])
def test_a_date_quote_goes_with_a_date_and_only_with_one(until: str | None, quote: str | None) -> None:
    text = first_tier_json(keys=['3', '4'], **{'from': None}, until=until, quantity=None, date_quote=quote)
    found = tickets.checked_read(text)
    assert isinstance(found, list)
    assert found[0].startswith('schema: passes/0/tiers/1')
    assert 'date_quote' in found[0]


def test_price_notes_come_from_the_description_only() -> None:
    assert tickets.read_problems(read(rule_quotes=['Prices rise on 1 December']), [entry(ROWS)]) == []
    assert tickets.read_problems(read(rule_quotes=['Fullpass Male 120€']), [entry(ROWS)]) != []


@pytest.fixture(autouse=True)
def recipes_and_rates() -> None:
    """The committed recipes, which say which sites are ticket shops, and rates, which price the models' answers."""
    committed(tickets.SITES, Rate.FILE)


@pytest.fixture
def files() -> Path:
    """The tickets folder of the test's data folder, with festival 7's first read and one logged read."""
    tickets.save_read(read())
    tickets.append(7, entry(ROWS))
    return data(tickets.TICKETS)


def test_recording_twice_writes_the_same_files(files: Path) -> None:
    assert tickets.record(7) == []
    before = [r.path().read_bytes() for r in (PriceRow, PageRow)]
    assert tickets.record(7) == []
    assert [r.path().read_bytes() for r in (PriceRow, PageRow)] == before


def test_an_unchanged_page_changes_only_the_read_date(files: Path) -> None:
    assert tickets.record(7) == []
    prices_before, pages_before = [r.path().read_text() for r in (PriceRow, PageRow)]
    tickets.append(7, entry(ROWS, at=LATER))
    assert tickets.record(7) == []
    assert (PriceRow.path()).read_text() == prices_before
    assert (PageRow.path()).read_text() == pages_before.replace('2026-10-01', '2026-11-03')


def test_a_failed_read_keeps_the_last_prices(files: Path) -> None:
    assert tickets.record(7) == []
    before = (PageRow.path()).read_text()
    tickets.append(7, refused(LATER))
    assert tickets.record(7) == []
    assert (PageRow.path()).read_text() == before


def test_changes_between_reads() -> None:
    later = changed(
        changed((*ROWS[1:], row('6', 'Fullpass Male 140€', 143.59)), 2, sold_out=True), 3, amount=60.0, price='€60.00'
    )
    got = [text for _, text in tickets.changes([entry(ROWS), entry(later, at=LATER)])]
    assert got == [
        'new: Fullpass Male 140€ €143.59',
        'gone: Fullpass Male 100€ €102.56',
        'sold out: Fullpass Female 120€ €123.08',
        'price: Shuttle from the airport €56.41 → €60.00',
    ]
    assert tickets.changes([entry(ROWS), entry(ROWS, at=LATER)]) == []


def csv_tier(until: str = '', quantity: str = '', sold_out: str = '0') -> PriceRow:
    """A row of pass_prices.csv, as read."""
    return PriceRow.model_validate(
        dict.fromkeys(PriceRow.columns(), '')
        | {'event_id': '7', 'pass_no': '1', 'kind': 'full', 'includes_hotel': '0', 'amount': '90', 'currency': 'EUR'}
        | {'quote': 'q', 'until': until, 'quantity': quantity, 'sold_out': sold_out}
    )


@pytest.mark.parametrize(
    ('tiers', 'today', 'expected'),
    [
        ([csv_tier('11-30'), csv_tier('2026-12-31'), csv_tier(sold_out='1')], '2026-11-15', (Recheck.DATED, False)),
        ([csv_tier('11-30'), csv_tier('12-31')], '2027-01-01', (Recheck.DATED, True)),
        ([csv_tier('11-30', quantity='50'), csv_tier('12-31')], '2026-11-15', (Recheck.MONTHLY, True)),
        ([csv_tier('11-30'), csv_tier()], '2026-11-15', (Recheck.MONTHLY, True)),
        ([csv_tier(), csv_tier(sold_out='1')], '2026-11-15', (Recheck.MONTHLY, True)),
        ([csv_tier('11-30', sold_out='1')], '2026-11-15', (Recheck.MONTHLY, True)),
        ([csv_tier('2026-11-15')], '2026-11-15', (Recheck.DATED, False)),  # its last date is today: not yet
        ([csv_tier('2026-11-14')], '2026-11-15', (Recheck.DATED, True)),
    ],
)
def test_recheck_classes(tiers: list[PriceRow], today: str, expected: tuple[Recheck, bool]) -> None:
    assert tickets.recheck(tiers, dt.date(2027, 2, 5), dt.date.fromisoformat(today))[:2] == expected
    assert {Recheck.DATED, Recheck.MONTHLY} == set(Recheck)


def test_failures_count_back_to_the_last_read() -> None:
    assert tickets.failures([entry(ROWS), refused(stamp(2)), refused(stamp(3))]) == 2
    assert tickets.failures([refused(stamp(1)), entry(ROWS)]) == 0


def test_two_reads_agree_on_meaning_not_on_wording() -> None:
    b = with_pass(read(), label_quote='Fullpass Male')
    b = with_tier(b, 0, tier('2', '1'))
    assert tickets.meaning(read()) == tickets.meaning(b)


DISAGREE: list[Callable[[FirstRead], FirstRead]] = [
    lambda r: with_pass(r, kind=PassKind.PARTY),
    lambda r: with_pass(r.model_copy(update={'skipped': ()}), tiers=(*r.passes[0].tiers, tier('5'))),
    lambda r: with_tier(r, 1, tier('3', '4', until='11-30', quote='Prices rise on 1 December')),
    lambda r: with_pass(r, style=Style.KIZOMBA),
]


@pytest.mark.parametrize('change', DISAGREE, ids=['another pass', 'a skip become a tier', 'a date', 'a style'])
def test_two_reads_disagree_on_a_pass_a_skip_a_date_or_a_style(change: Callable[[FirstRead], FirstRead]) -> None:
    assert tickets.meaning(read()) != tickets.meaning(change(read()))


@pytest.mark.parametrize(
    ('text', 'number'),
    [
        ('3,125.00', 3125),
        ('1.800,00', 1800),
        ('81.03', 81.03),
        ('1 800', 1800),
        ('1.800', 1800),
        ('9,5', 9.5),
        ('free', None),
    ],
)
def test_numbers_as_sites_write_them(text: str, number: float | None) -> None:
    assert tickets.number(text) == number


RAW: dict[str, str | None] = {
    'key': '1',
    'name': 'Fullpass',
    'price': '€81.03',
    'amount': '81.03',
    'currency': '€',
    'fee': None,
    'alt_price': None,
    'alt_amount': None,
    'alt_currency': None,
    'sold_out': None,
}


def attempt_with(
    monkeypatch: pytest.MonkeyPatch, raw: Sequence[dict[str, str | None]] = (), error: Exception | None = None
) -> tickets.Entry:
    """attempt() on a page whose recipe finds these rows, or fails with this error."""
    from pipeline import read_page

    def rows(url: str, recipe: PageRecipe, *, visible: bool | None) -> tuple[int, str, list[dict[str, str | None]]]:
        if error:
            raise error
        return 200, 'Tickets', list(raw)

    monkeypatch.setattr(read_page, 'rows', rows)
    return tickets.attempt(PAGE, SITE._replace(recipe=SITE.recipe.model_copy(update={'widget': None})))


def why(entry_: tickets.Entry) -> str:
    assert isinstance(entry_, Failed)
    return entry_.why


@pytest.mark.parametrize(
    ('change', 'field'),
    [
        ({'amount': None}, 'amount'),
        ({'currency': '$'}, 'currency'),
        ({'alt_amount': '3,125.00', 'alt_currency': 'CZK'}, 'second price'),
    ],
)
def test_a_row_the_recipe_reads_wrong_breaks_the_layout(
    monkeypatch: pytest.MonkeyPatch, change: dict[str, str | None], field: str
) -> None:
    got = attempt_with(monkeypatch, [RAW | change])
    assert got.status == Status.LAYOUT_BROKEN
    assert field in why(got)


def test_two_rows_with_one_key_break_the_layout(monkeypatch: pytest.MonkeyPatch) -> None:
    got = attempt_with(monkeypatch, [RAW, RAW | {'name': 'Partypass'}])
    assert got.status == Status.LAYOUT_BROKEN
    assert 'two rows with key 1' in why(got)


def test_a_recipe_failing_on_the_page_breaks_the_layout_and_a_page_that_wont_load_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from patchright.sync_api import Error

    from pipeline import read_page

    assert attempt_with(monkeypatch, error=read_page.RecipeError('bad selector')).status == Status.LAYOUT_BROKEN
    assert attempt_with(monkeypatch, error=Error('net::ERR_CONNECTION_RESET')).status == Status.REFUSED


def test_a_good_row_is_read_with_its_currency_code(monkeypatch: pytest.MonkeyPatch) -> None:
    got = attempt_with(monkeypatch, [RAW])
    assert isinstance(got, Read)
    assert got.rows[0].currency == 'EUR'


def test_the_log_holds_only_entries_of_its_record(files: Path) -> None:
    _ = (files / 'log' / '7.jsonl').write_text('{"at": "x"}\n')
    with pytest.raises(SystemExit):
        _ = tickets.log(7)


def test_a_log_line_edited_in_place_and_merged_back_is_caught(files: Path) -> None:
    with (files / 'log' / '7.jsonl').open('a') as f:
        _ = f.write(entry(ROWS).model_copy(update={'http': 304}).model_dump_json() + '\n')
    with pytest.raises(SystemExit, match='two entries at'):
        _ = tickets.log(7)


def test_a_log_line_is_written_as_the_entry_was_made(files: Path) -> None:
    tickets.append(7, refused(LATER))
    assert JSON.validate_json((files / 'log' / '7.jsonl').read_text().splitlines()[-1]) == {
        'at': LATER.isoformat(),
        'page': PAGE,
        'recipe': 'weezevent@0123abcd',
        'status': 'refused',
        'why': 'HTTP 429',
    }  # a failure that reached no address has none
    assert tickets.log(7)[-1] == refused(LATER)


def test_a_new_ticket_page_needs_a_new_first_read(files: Path) -> None:
    tickets.append(7, entry(ROWS, at=LATER, page='https://my.weezevent.com/y'))
    assert 'the ticket page changed' in tickets.record(7)[0]


def draft_file(files: Path, fr: FirstRead) -> None:
    (files / 'drafts').mkdir(exist_ok=True)
    _ = (files / 'drafts' / '7.json').write_text(fr.dumped())


def test_a_draft_becomes_the_first_read_once_it_passes(files: Path) -> None:
    draft_file(files, read(skipped=()))
    assert tickets.record(7) != []
    assert (files / 'drafts' / '7.json').exists()
    first = tickets.first_read(7)
    assert isinstance(first, FirstRead)
    assert first.skipped == read().skipped
    draft_file(files, read())
    assert tickets.record(7) == []
    assert not (files / 'drafts' / '7.json').exists()
    assert tickets.first_read(7) == read()


def test_a_draft_starts_with_the_festival_and_nothing_read(files: Path) -> None:
    tickets.save_draft(tickets.draft_of(FEST, entry(ROWS), 'agent'))
    saved = jsons.read(files / 'drafts' / '7.json')
    assert [jsons.at(saved, k) for k in ('passes', 'skipped', 'rule_quotes', 'rows_at')] == [[], [], [], AT.isoformat()]
    assert any('passes' in p for p in tickets.record(7))  # a draft with no pass is not a first read


def test_recipes_are_read_as_their_record() -> None:
    committed(tickets.SITES)
    assert tickets.sites()
    _ = (data(tickets.SITES) / 'x.json').write_text(json.dumps({'site': 'x'}))
    with pytest.raises(SystemExit):
        _ = tickets.sites()


def festival(**change: object) -> tickets.Festival:
    """A festival as festivals() gives it: by default to come, with no first read and no ticket page."""
    return dataclasses.replace(BASE, **change)


BASE = tickets.Festival(
    id=7,
    title='Fest',
    start_date=dt.date(2027, 2, 5),
    end_date=dt.date(2027, 2, 7),
    country='Germany',
    description='Prices rise on 1 December.',
    over=False,
    styles=(Style.BACHATA, Style.KIZOMBA),
    links=(),
    found=None,
    first_read=None,
    log=(),
    tiers=(),
    described=None,
    page=None,
    site=None,
    disputed=False,
    need=FirstReadState.NONE,
)
FEST = festival(page=PAGE)
ANSWER = FirstReadAnswer(passes=read().passes, skipped=read().skipped, rule_quotes=read().rule_quotes)


def answer(kind: PassKind = PassKind.FULL, label: str | None = 'Fullpass') -> str:
    ps = ANSWER.passes[0].model_copy(update={'kind': kind, 'label_quote': label})
    return ANSWER.model_copy(update={'passes': (ps,)}).model_dump_json()


def test_two_models_that_agree_give_the_first_ones_read(files: Path) -> None:
    fr = tickets.models_read(Client(answer(), answer(label=None)), FEST, entry(ROWS), [entry(ROWS)])
    assert fr is not None
    assert fr.passes == ANSWER.passes
    assert fr.read_by == 'claude-opus-5-5 + claude-sonnet-5-5'
    assert not (files / 'disputed' / '7.json').exists()


def test_when_two_models_disagree_a_third_read_settles_it(files: Path) -> None:
    replies = answer(), answer(PassKind.PARTY), answer(PassKind.PARTY)
    fr = tickets.models_read(Client(*replies), FEST, entry(ROWS), [entry(ROWS)])
    assert fr is not None
    assert fr.passes[0].kind == PassKind.PARTY
    assert fr.read_by == 'claude-sonnet-5-5 + claude-fable-5-1'
    assert not (files / 'disputed' / '7.json').exists()


def test_when_no_two_models_agree_all_reads_wait_for_an_agent(files: Path) -> None:
    replies = answer(), answer(PassKind.PARTY), answer(PassKind.OTHER)
    assert tickets.models_read(Client(*replies), FEST, entry(ROWS), [entry(ROWS)]) is None
    disputed = Dispute.parse((files / 'disputed' / '7.json').read_bytes())
    assert set(disputed.reads) == {*tickets.MODELS, tickets.TIE_BREAK}


def test_a_model_that_misreads_answers_again_with_the_checkers_lines(files: Path) -> None:
    wrong = ANSWER.model_copy(update={'skipped': ()}).model_dump_json()
    client = Client(wrong, answer())
    fr = tickets.ask_read(client, 'claude-opus-5-5', FEST, entry(ROWS), [entry(ROWS)])
    assert fr is not None
    assert fr.read_by == 'claude-opus-5-5'
    assert 'neither in a tier nor skipped' in str(client.messages.asked[1][-1]['content'])


def test_both_files_hold_what_the_reads_and_logs_say_and_nothing_else(files: Path) -> None:
    _ = (PriceRow.path()).write_text('event_id,stale\n9,1\n')
    assert tickets.record(7) == []
    assert {r.event_id for r in PriceRow.read()} == {7}
    assert (PriceRow.path()).read_text().splitlines()[0] == ','.join(PriceRow.columns())


def test_a_festival_that_no_longer_fits_its_first_read_is_left_out(files: Path) -> None:
    assert tickets.record(7) == []
    tickets.append(7, entry(changed(ROWS, 3, amount=128.21, price='€128.21'), at=LATER))
    assert 'the first read needs doing again' in tickets.write_all()[0]
    assert PageRow.read() == []


HELD = exceptions.OVERRIDES[0]  # a site the register says no recipe can read


def sold(state: Sales, page: str | None = None) -> FoundRow:
    return FoundRow(event_id=7, event='Fest', state=state, page=page, links=None, found_by='agent', note='n')


@pytest.mark.parametrize(
    ('f', 'expected'),
    [
        (festival(), Waiting.PAGE),
        (festival(page='https://example.org/tickets'), Waiting.RECIPE),
        (festival(page=f'https://{HELD.host}/x'), HELD.then),  # pipeline/exceptions.py
        (festival(page=PAGE, site=SITE), Waiting.NOTHING),
        (festival(found=sold(Sales.OFFLINE)), Waiting.NOTHING),
        (festival(found=sold(Sales.NOT_YET)), Waiting.SALES_OPEN),
        (festival(found=sold(Sales.CLOSED)), Waiting.NOTHING),
        (festival(found=sold(Sales.NONE_FOUND)), Waiting.NOTHING),
        (festival(found=sold(Sales.SHOP, 'https://example.org/t'), page='https://example.org/t'), Waiting.RECIPE),
        (festival(page=PAGE, site=SITE, need=FirstReadState.DISPUTED), Waiting.AGENT),
        (
            festival(
                need=FirstReadState.CURRENT,
                first_read=read(),
                log=(refused(stamp(1)), refused(stamp(2)), refused(stamp(3))),
            ),
            Waiting.SESSION,
        ),
        (festival(need=FirstReadState.CURRENT, first_read=read(), log=(entry(ROWS),)), Waiting.NOTHING),
        (festival(need=FirstReadState.NOT_NEEDED), Waiting.NOTHING),
        (festival(need=FirstReadState.AWAITS_ANSWER), Waiting.NOTHING),
        (festival(over=True), Waiting.NOTHING),  # it is over: nothing to wait for
        (
            festival(
                need=FirstReadState.CURRENT,
                first_read=read(),  # failures before a broken recipe
                log=(refused(stamp(1)), refused(stamp(2)), broken(stamp(3))),
            ),
            Waiting.SESSION,
        ),
    ],
)
def test_what_a_festival_waits_for(f: tickets.Festival, expected: Waiting) -> None:
    assert tickets.waiting(f) == expected


def test_every_waits_for_state_is_reached() -> None:
    """waiting() is total over its states: each case above reaches one, and together they reach them all."""
    reached = {
        tickets.waiting(f)
        for f in [
            festival(),
            festival(page='https://example.org/t'),
            festival(found=sold(Sales.NOT_YET)),
            festival(need=FirstReadState.DISPUTED),
            festival(log=(refused(stamp(1)), refused(stamp(2)), refused(stamp(3)))),
            festival(log=(broken(stamp(2)),)),
            festival(need=FirstReadState.CURRENT),
        ]
    }
    assert reached == set(Waiting)


def test_the_status_lists_every_festival_past_ones_too(files: Path) -> None:
    counts = tickets.write_status(
        [
            festival(id=9, need=FirstReadState.CURRENT),
            festival(),
            festival(id=8, page='https://example.org/t'),
            festival(id=6, over=True, found=sold(Sales.CLOSED)),
        ]
    )
    got = [(r.event_id, r.waits_for, r.first_read, r.sales) for r in StatusRow.read()]
    assert got == [
        (6, Waiting.NOTHING, FirstReadState.NONE, Sales.CLOSED),
        (7, Waiting.PAGE, FirstReadState.NONE, None),
        (8, Waiting.RECIPE, FirstReadState.NONE, None),
        (9, Waiting.NOTHING, FirstReadState.CURRENT, None),
    ]
    assert counts == {Waiting.PAGE: 1, Waiting.RECIPE: 1, Waiting.NOTHING: 2}
    assert StatusRow.path().read_text().splitlines()[0] == ','.join(StatusRow.columns())


@pytest.fixture
def paging(files: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    def one(db: sqlite3.Connection, i: int, page: str | None = None) -> tickets.Festival:
        return festival(id=i, links=('https://example.org/a',))

    def festivals(
        db: sqlite3.Connection, today: str, only: int | None = None, *, every: bool = False
    ) -> list[tickets.Festival]:
        return [festival()]

    monkeypatch.setattr(tickets, 'one', one)
    monkeypatch.setattr(tickets, 'festivals', festivals)
    FoundRow.write([])
    return files


def test_a_found_page_is_recorded_once_and_a_cut_link_refused(memory: Memory, paging: Path) -> None:
    tickets.cmd_page(memory(), 7, tickets.Sold('https://example.org/t', Sales.SHOP, 'its site', 'agent'))
    tickets.cmd_page(memory(), 7, tickets.Sold(None, Sales.OFFLINE, 'by message only', 'agent'))
    assert [(r.state, r.page, r.note) for r in FoundRow.read()] == [(Sales.OFFLINE, None, 'by message only')]
    assert StatusRow.read()[0].waits_for == Waiting.PAGE
    with pytest.raises(SystemExit):
        tickets.cmd_page(memory(), 7, tickets.Sold('https://example.org/t…', Sales.SHOP, 'cut', 'agent'))


def test_a_search_that_found_nothing_holds_until_the_links_change(memory: Memory, paging: Path) -> None:
    tickets.cmd_page(memory(), 7, tickets.Sold(None, Sales.NONE_FOUND, 'a search found no ticket page', 'agent'))
    found = tickets.found_pages()[7]
    assert found.links == tickets.links_hash(['https://example.org/a'])
    assert found.links != tickets.links_hash(['https://example.org/a', 'https://example.org/b'])


@pytest.mark.parametrize(
    ('url', 'state'),
    [(None, Sales.SHOP), ('https://example.org/t', Sales.OFFLINE), ('https://example.org/t', Sales.CLOSED)],
)
def test_only_a_shop_has_a_page(memory: Memory, paging: Path, url: str | None, state: Sales) -> None:
    with pytest.raises(SystemExit):
        tickets.cmd_page(memory(), 7, tickets.Sold(url, state, 'n', 'agent'))


@pytest.mark.parametrize(
    'line',
    [
        '7,Fest,offline,https://x.org,,agent,n',
        '7,Fest,soon,,,agent,n',
        '7,Fest,none_found,,,agent,n',
        '7,Fest,offline,,0123456789abcdef,agent,n',
    ],
)
def test_sales_states_are_checked_when_read(files: Path, line: str) -> None:
    _ = (FoundRow.path()).write_text('event_id,event,state,page,links,found_by,note\n' + line + '\n')
    with pytest.raises((SystemExit, ValueError)):
        _ = tickets.found_pages()


def test_a_fee_the_site_adds_is_in_the_amount(monkeypatch: pytest.MonkeyPatch) -> None:
    got = attempt_with(monkeypatch, [RAW | {'price': '€119.00 + €1.00 fee.', 'amount': '119.00', 'fee': '1.00'}])
    assert isinstance(got, Read)
    assert (got.rows[0].amount, got.rows[0].fee) == (120, 1)


def one_tier(rows: Sequence[Row]) -> FirstRead:
    return read(passes=[pass_(tier(*(r.key for r in rows)), label=None)], skipped=())


def test_a_tier_keeps_its_fee_and_its_quote_shows_it() -> None:
    rows = [row('1', 'Fullpass', 120.0, price='€119.00 + €1.00 fee.', fee=1.0)]
    answer_, _, found = tickets.build(one_tier(rows), entry(rows))
    assert found == []
    assert tiers_of(answer_)[0].fee == 1.0


@pytest.mark.parametrize(
    ('until', 'sold_out', 'ok'), [('09-30', False, False), ('09-30', True, True), ('11-30', False, True)]
)
def test_a_ticket_on_sale_cant_have_a_price_that_ended(until: str, sold_out: bool, ok: bool) -> None:
    rows = changed(changed(ROWS, 2, sold_out=sold_out), 3, sold_out=sold_out)
    fr = read(description='Until 30 September or 30 November.')
    fr = with_tier(fr, 1, tier('3', '4', until=until, quote='Until 30 September or 30 November'))
    assert (tickets.read_problems(fr, [entry(rows)]) == []) == ok


def test_a_free_ticket_is_skipped_not_priced() -> None:
    rows = [*ROWS, row('6', 'Kids 12 & under : FREE', 0.0, price='Free')]
    fr = read((pass_(), pass_(tier('6'), kind=PassKind.OTHER, label=None)))
    free = 'key 6 (Kids 12 & under : FREE Free) is free: no pass is sold for nothing; skip it with its reason'
    assert tickets.read_problems(fr, [entry(rows)]) == [f'passes[1].tiers[0]: {free}']
    fr = read(skipped=(('5', SkipReason.EXCURSION), ('6', SkipReason.DISCOUNT)))
    assert tickets.read_problems(fr, [entry(rows)]) == []


def test_recipe_placeholders_name_fields_or_attributes() -> None:
    """The row reader fills {field} and {@attr} in css and match (its own pattern, taken from its script); any other
    name would leave the field empty on every page, and {3} must stay a regex count."""
    from pipeline.read_page import ROWS_JS

    found = re.search(r't\.replace\(/(.+?)/g', ROWS_JS)
    assert found
    pattern = found[1].replace('\\\\', '\\')
    wrong: list[str] = []
    for site, known in tickets.sites().items():
        if not isinstance(recipe := known.recipe, PageRecipe):
            continue
        names = {name for name, _ in recipe.fields.named()}
        for name, f in recipe.fields.named():
            for text in (f.css or '', f.match or '') if f else ():
                found_names = ((m[1], m[2]) for m in re.finditer(pattern, text))
                wrong += [f'{site}.{name}: {{{at}{k}}}' for at, k in found_names if not at and k not in names]
    assert wrong == []
    assert not re.search(pattern, '[A-Z]{3}')
    assert [(m[1], m[2]) for m in re.finditer(pattern, '"{@value}" {name}')] == [('@', 'value'), ('', 'name')]


def test_a_recipes_fields_are_named_in_order() -> None:
    recipe = SITE.recipe
    assert [n for n, _ in recipe.fields.named()] == list(type(recipe.fields).model_fields)


TICKET: dict[str, object] = {
    'uuid': 'b4cb',
    'name': {'text': 'Couples Party Pass'},
    'price': {'price': 185.0},
    'distributionFee': 6.75,
    'stockLeft': 0,
    'available': False,
}


@pytest.mark.parametrize(
    ('field', 'value'),
    [
        (FromJson(json_='name.text'), 'Couples Party Pass'),
        (FromJson(json_='available'), 'false'),
        (FromJson(json_='missing.path'), None),
        (FromPage(page='"priceCurrency":"([A-Z]{3})"'), 'EUR'),
        (FromText(text='{price.price} + {distributionFee} fee'), '185.0 + 6.75 fee'),
        (FromJson(json_='stockLeft', match='^0$'), '0'),
        (None, None),
    ],
)
def test_api_fields_read_a_ticket_and_its_page(field: FromJson | FromPage | FromText | None, value: str | None) -> None:
    ticket = JSON.validate_python(TICKET)
    assert tickets.api_value(field, ticket, '<script>{"priceCurrency":"EUR"}</script>') == value


def test_a_recipe_reads_the_page_or_the_api_never_a_mix() -> None:
    api, page = jsons.read(ROOT / tickets.SITES / 'goandance.json'), jsons.read(ROOT / tickets.SITES / 'weeztix.json')
    assert isinstance(api, dict)
    assert isinstance(page, dict)

    def valid(recipe: Json) -> bool:
        try:
            _ = RECIPE.validate_json(json.dumps(recipe))
        except ValueError:
            return False
        return True

    assert valid(api)
    assert valid(page)
    assert not valid(api | {'row': '.ticket'})  # an API recipe with page rows
    assert not valid(page | {'api': api['api']})  # page rows and an API
    assert not valid(page | {'fields': api['fields'], 'row': page['row']})  # page rows read by api fields


def test_a_first_read_with_no_pass_is_refused() -> None:
    found = tickets.checked_read(read_json(passes=[], skipped=[{'key': k, 'reason': 'room'} for k in '12345']))
    assert isinstance(found, list)
    assert any('passes' in p for p in found)


def test_a_page_that_broke_its_recipe_waits_for_a_fix_with_or_without_a_first_read() -> None:
    assert tickets.waiting(festival(page=PAGE, site=SITE, log=(broken(stamp(2)),))) == Waiting.RECIPE_FIX
    assert tickets.waiting(festival(first_read=read(), log=(entry(ROWS), broken(LATER)))) == Waiting.RECIPE_FIX


def test_a_day_pass_is_one_day_whether_its_days_say_1_or_nothing() -> None:
    a, b = (with_pass(read(), kind=PassKind.DAY, days=days) for days in (None, 1))
    assert tickets.meaning(a) == tickets.meaning(b)


EVENTBRITE = Widget(
    in_='address', pattern='/e/[^?#]*?-?(\\d{10,})(?:[?#]|$)', address='https://{host}/checkout-external?eid={1}'
)
WEEZEVENT = Widget(
    in_='html', pattern='https://widget\\.weezevent\\.com/ticket/[A-Z0-9-]+/', address='{0}?locale=en-GB'
)


def no_request(*args: object, **kwargs: object) -> None:
    pytest.fail('this address needs no request')


@pytest.mark.parametrize(
    ('url', 'address'),
    [
        (
            'https://www.eventbrite.pt/e/tukina-lisboa-tickets-1977918538593',
            'https://www.eventbrite.pt/checkout-external?eid=1977918538593',
        ),
        (
            'https://www.eventbrite.ca/e/1986387397177?aff=oddtdtcreator',
            'https://www.eventbrite.ca/checkout-external?eid=1986387397177',
        ),
        (
            'https://www.eventbrite.pt/checkout-external?eid=1986728317880',
            'https://www.eventbrite.pt/checkout-external?eid=1986728317880',
        ),
    ],
)
def test_a_widget_builds_the_address_from_the_link(url: str, address: str, monkeypatch: pytest.MonkeyPatch) -> None:
    from curl_cffi import requests

    monkeypatch.setattr(requests, 'get', no_request)
    recipe = SITE.recipe
    assert isinstance(recipe, PageRecipe)
    assert tickets.widget(url, recipe.model_copy(update={'widget': EVENTBRITE})) == address


def test_a_widget_found_in_the_page_keeps_an_address_that_is_already_its_own(monkeypatch: pytest.MonkeyPatch) -> None:
    from curl_cffi import requests

    monkeypatch.setattr(requests, 'get', no_request)
    recipe = SITE.recipe
    assert isinstance(recipe, PageRecipe)
    url = 'https://widget.weezevent.com/ticket/E1/'
    assert tickets.widget(url, recipe.model_copy(update={'widget': WEEZEVENT})) == url


@pytest.mark.parametrize(('price', 'amount'), [('Free', 0.0), ('Gratuit', 0.0), ('€81.03', None)])
def test_a_free_ticket_costs_0(price: str, amount: float | None) -> None:
    got = tickets.parsed(RAW | {'price': price, 'amount': None}, {'€': 'EUR'})
    assert got['amount'] == amount
    try:
        _ = Row.model_validate(got)
    except ValueError:
        assert amount is None
    else:
        assert amount is not None


def test_first_reads_count_against_the_budget(files: Path) -> None:
    _ = tickets.models_read(
        Client(ANSWER.model_dump_json(), ANSWER.model_dump_json()), FEST, entry(ROWS), [entry(ROWS)]
    )
    assert round(spend.month_usd(), 3) == round(
        spend.usd('claude-opus-5-5', 6000, 2000) + spend.usd('claude-sonnet-5-5', 6000, 2000), 3
    )


@pytest.mark.parametrize(('style', 'ok'), [(Style.KIZOMBA, True), (None, True)])
def test_a_first_read_names_each_pass_style(style: Style | None, ok: bool) -> None:
    assert (tickets.read_problems(with_pass(read(), style=style), [entry(ROWS)]) == []) == ok


def test_a_first_read_without_a_pass_style_is_refused() -> None:
    fr: dict[str, object] = read().model_dump(mode='json')
    ps: dict[str, object] = read().passes[0].model_dump(mode='json')
    del ps['style']
    fr['passes'] = [ps]
    found = tickets.checked_read(json.dumps(fr))
    assert isinstance(found, list)
    assert any('style' in p for p in found)


def test_a_pass_keeps_its_style_in_pass_prices_csv(files: Path) -> None:
    tickets.save_read(with_pass(read(), style=Style.KIZOMBA))
    assert tickets.record(7) == []
    assert {r.style for r in PriceRow.read()} == {Style.KIZOMBA}


def old_read(files: Path, **change: object) -> None:
    """A first read made before the prompt changed, in tickets/reads/: to another prompt, perhaps of another shape."""
    _ = (files / 'reads' / '7.json').write_text(read_json(prompt='0' * 16, **change))


def test_a_first_read_to_another_prompt_is_made_again_whatever_its_shape(files: Path) -> None:
    old_read(files, skipped=['5'])
    old = tickets.first_read(7)
    assert old is not None
    assert not isinstance(old, FirstRead)
    assert (
        tickets.why_first_read(festival(first_read=old, log=tuple(tickets.log(7))), DAY)[0]
        == FirstReadState.REDO_PROMPT
    )
    current = festival(first_read=read(), log=tuple(tickets.log(7)))
    assert tickets.why_first_read(current, DAY)[0] == FirstReadState.CURRENT


def test_a_first_read_to_another_prompt_is_never_written(files: Path) -> None:
    with pytest.raises(ValueError, match='not the current'):
        tickets.save_read(read(prompt_='0' * 16))
    old_read(files)
    assert 'make it again' in tickets.record(7)[0]
    assert tickets.write_all() == []
    assert PageRow.read() == []


def described(*passes: PricedPass) -> answers.Answer[Priced]:
    logged = answers.Logged(file='prices/event-7.json', answered_at=AT, model='m', prompt='h', answered_by='x')
    return answers.Answer(Priced(event_id=7, passes=passes, rule_quotes=()), 'b', logged)


def card(kind: PassKind = PassKind.FULL, until: str | None = '2027-01-31') -> PricedPass:
    t = PricedTier(
        amount=90,
        currency='EUR',
        fee=None,
        alt=None,
        from_=None,
        until=None if until is None else real_day(until),
        quantity=None,
        door=False,
        sold_out=False,
        current=False,
        quote='90',
    )
    return PricedPass(
        kind=kind, style=None, label_quote=None, group_size=1, days=None, includes_hotel=False, tiers=(t,)
    )


STAMPED = tickets.Stamped(prompt='0' * 16, rows_at=AT)
FIRST_READ_CASES: list[tuple[dict[str, object], FirstReadState]] = [
    ({}, FirstReadState.CURRENT),
    ({'disputed': True}, FirstReadState.CURRENT),  # a dispute settled by a current first read
    ({'description': 'New prices.'}, FirstReadState.REDO_DESCRIPTION),
    ({'log': (entry(ROWS), entry(ROWS, at=LATER, page='https://my.weezevent.com/y'))}, FirstReadState.REDO_PAGE),
    ({'log': (entry((*ROWS, row('6', 'Fullpass Male 140€', 143.59))),)}, FirstReadState.REDO_UNREAD),
    ({'first_read': STAMPED}, FirstReadState.REDO_PROMPT),
    ({'first_read': STAMPED, 'disputed': True}, FirstReadState.DISPUTED),
    ({'first_read': None, 'described': None}, FirstReadState.AWAITS_ANSWER),
    ({'first_read': None, 'described': None, 'description': ''}, FirstReadState.NONE),  # nothing to answer
    ({'first_read': None, 'described': described(card(until=None))}, FirstReadState.NONE),
    ({'first_read': None, 'described': described(card(kind=PassKind.PARTY))}, FirstReadState.NONE),  # not the card's
    ({'first_read': None, 'described': described(card(until='2026-10-31'))}, FirstReadState.NONE),
    ({'first_read': None, 'described': described(card())}, FirstReadState.NOT_NEEDED),
    ({'first_read': None, 'described': described(card(until='2026-11-01'))}, FirstReadState.NOT_NEEDED),  # today
]


@pytest.mark.parametrize(('change', 'state'), FIRST_READ_CASES)
def test_every_first_read_state(change: dict[str, object], state: FirstReadState) -> None:
    f = dataclasses.replace(festival(first_read=read(), log=(entry(ROWS),)), **change)
    assert tickets.why_first_read(f, DAY)[0] == state


def test_the_first_read_states_tested_are_all_of_them() -> None:
    assert {s for _, s in FIRST_READ_CASES} == set(FirstReadState)


def events(db: sqlite3.Connection, *ids: int) -> sqlite3.Connection:
    _ = db.executescript('create table events (id integer);')
    _ = db.executemany('insert into events values (?)', [(i,) for i in ids])
    return db


def no_status(db: sqlite3.Connection) -> collections.Counter[Waiting]:
    return collections.Counter()


def test_a_run_for_named_festivals_reads_only_them(
    memory: Memory, files: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def festivals(
        db: sqlite3.Connection, today: str, only: int | None = None, *, every: bool = False
    ) -> list[tickets.Festival]:
        return [] if only or every else [festival(id=i, site=SITE, page=f'https://shop.example/{i}') for i in (7, 8)]

    asked: list[str] = []

    def attempt(page: str, site: tickets.Site, *, visible: bool | None = None) -> tickets.Entry:
        asked.append(page)
        return Failed(at=AT, page=page, recipe=site.version, status=Status.REFUSED, why='HTTP 403')

    monkeypatch.setattr(tickets, 'festivals', festivals)
    monkeypatch.setattr(tickets, 'status', no_status)
    monkeypatch.setattr(tickets, 'attempt', attempt)

    def append(event_id: int, entry_: tickets.Entry) -> None:
        return None

    monkeypatch.setattr(tickets, 'append', append)
    tickets.cmd_run(events(memory(), 6, 7, 8), {8, 6})  # 6 is past: nothing to read there
    assert asked == ['https://shop.example/8']
    with pytest.raises(SystemExit, match=r'\[9\]'):
        tickets.cmd_run(events(memory(), 6, 7, 8), {9})


def test_a_past_festivals_first_read_for_an_older_prompt_is_made_again_from_its_logged_rows(
    memory: Memory, files: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import anthropic

    old_read(files)
    past = dataclasses.replace(
        FEST, over=True, first_read=tickets.first_read(7), log=tuple(tickets.log(7)), need=FirstReadState.REDO_PROMPT
    )

    def festivals(
        db: sqlite3.Connection, today: str, only: int | None = None, *, every: bool = False
    ) -> list[tickets.Festival]:
        return [past] if every else []

    monkeypatch.setattr(tickets, 'festivals', festivals)
    monkeypatch.setattr(tickets, 'status', no_status)
    monkeypatch.setattr(tickets, 'attempt', no_request)
    monkeypatch.setattr(anthropic, 'Anthropic', lambda: Client(ANSWER.model_dump_json(), ANSWER.model_dump_json()))
    tickets.cmd_run(events(memory(), 7))
    made = tickets.first_read(7)
    assert isinstance(made, FirstRead)
    assert made.prompt == prompt.current('first_read').hash


def test_passes_alike_in_every_field_load_back_as_the_passes_they_are(
    files: Path,
) -> None:
    one = read().passes[0]
    tickets.save_read(read(passes=[one.model_copy(update={'tiers': (t,)}) for t in one.tiers]))
    assert tickets.record(7) == []
    loaded, _ = load_extract.page_prices({7})[0][7]
    assert [len(p.tiers) for p in loaded.passes] == [1, 1]


@pytest.mark.parametrize(
    ('styles', 'style', 'ok'),
    [
        ([Style.BACHATA, Style.KIZOMBA], Style.KIZOMBA, True),
        ([Style.BACHATA, Style.KIZOMBA], None, True),
        ([Style.KIZOMBA], Style.KIZOMBA, False),  # a kizomba-only festival: its passes have no style
        ([Style.BACHATA, Style.KIZOMBA], Style.ZOUK, False),  # not one of the festival's
        ([], Style.KIZOMBA, False),
    ],
)
def test_a_pass_has_a_style_only_at_a_festival_of_several_and_one_of_them(
    styles: list[Style],
    style: Style | None,
    ok: bool,
) -> None:
    fr = with_pass(read(styles=styles), style=style)
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


@pytest.mark.parametrize(
    ('name', 'reason', 'ok'),
    [
        ('Shuttle from the airport', SkipReason.EXCURSION, True),
        ('Bootcamp GENKIZ - Female', SkipReason.CLASS, False),
        ('BOOTCAMP Kizomba musicality advanced payment', SkipReason.DEPOSIT, True),
        ('BE PRESENT Bootcamp - Standard Ticket', SkipReason.DEPOSIT, False),
        ('Bootcamp deposit - advance payment', SkipReason.DEPOSIT, True),
    ],
)
def test_a_bootcamp_is_skipped_only_as_a_deposit_its_name_calls_one(name: str, reason: SkipReason, ok: bool) -> None:
    rows = changed(ROWS, 4, name=name)
    assert (tickets.read_problems(read(skipped=(('5', reason),)), [entry(rows)]) == []) == ok


@pytest.mark.parametrize('skip', [{'key': '5'}, {'key': '5', 'reason': 'other'}, '5'])
def test_a_skip_has_a_reason_of_the_table(skip: object) -> None:
    found = tickets.checked_read(read_json(skipped=[skip]))
    assert isinstance(found, list)
    assert any(p.startswith('schema: skipped/0') for p in found)


def test_two_reads_agree_whatever_reason_a_kept_skip_has() -> None:
    assert tickets.meaning(read()) == tickets.meaning(read(skipped=(('5', SkipReason.FOOD_DRINK),)))


def test_a_festivals_styles_are_its_genres_styles(memory: Memory) -> None:
    db = memory()
    _ = db.executescript(
        'create table event_genres (event_id integer, genre text);'
        "insert into event_genres values (1, 'urbankiz'), (1, 'semba'), (2, 'kizomba'), (2, 'zouk'), (2, 'kompa');"
    )
    assert prices.styles(db, 1) == [Style.KIZOMBA]
    assert prices.styles(db, 2) == [Style.KIZOMBA, Style.OTHER, Style.ZOUK]


@pytest.mark.parametrize(
    ('field', 'ok'),
    [
        ({'css': 'td', 'attr': None, 'match': '([Ss]old [Oo]ut)'}, True),
        ({'css': 'td', 'attr': None, 'match': '(?i)(sold out)'}, False),  # JavaScript has no inline flags
        ({'css': 'h3, span', 'attr': None, 'match': None, 'all': True, 'up': 'li'}, True),
        ({'css': 'h3, span', 'attr': None, 'match': '(\\d+)', 'all': True}, False),
        ({'css': 'h3', 'attr': None, 'match': None, 'page': True, 'up': 'li'}, False),
    ],
)
def test_a_recipe_field_is_one_the_page_can_run(field: dict[str, Json], ok: bool) -> None:
    recipe = jsons.read(ROOT / tickets.SITES / 'tickera.json')
    fields = jsons.at(recipe, 'fields')
    assert isinstance(fields, dict)
    fields['sold_out'] = field
    try:
        _ = RECIPE.validate_json(json.dumps(recipe))
    except ValueError:
        assert not ok
    else:
        assert ok


def test_a_festival_with_three_problems_is_left_out_like_any_other(files: Path) -> None:
    fr = read(
        skipped=(('5', SkipReason.EXCURSION), ('8', SkipReason.CLASS), ('9', SkipReason.CLASS)),
        rule_quotes=['not in the description'],
    )
    assert len(tickets.read_problems(fr, tickets.log(7))) == 3
    tickets.save_read(fr)
    assert len(tickets.write_all()) == 3
    assert PageRow.read() == []


@pytest.mark.parametrize(
    ('urls', 'page'),
    [
        (['https://fest.example/', 'https://fest.example/tickets'], None),  # its own site: a guess, not a page
        (['https://fest.example/', PAGE], PAGE),  # a shop a recipe reads
        ([f'https://{HELD.host}/x'], f'https://{HELD.host}/x'),  # a shop no recipe can read
        (['https://my.weezevent.com/x…'], None),  # cut short
    ],
)
def test_a_ticket_page_is_known_only_on_a_ticket_shop(urls: list[str], page: str | None) -> None:
    assert tickets.known_page(None, [], None, urls, tickets.shop_hosts(tickets.sites())) == page


def test_a_page_an_agent_found_or_a_first_read_is_known_whatever_its_site(files: Path) -> None:
    shops = tickets.shop_hosts(tickets.sites())
    assert (
        tickets.known_page(None, [], sold(Sales.SHOP, 'https://fest.example/t'), [], shops) == 'https://fest.example/t'
    )
    assert tickets.known_page(None, [], sold(Sales.OFFLINE), [PAGE], shops) is None
    assert tickets.known_page(read(), tickets.log(7), None, [], shops) == PAGE


def test_a_festival_with_links_to_no_shop_waits_for_its_page_and_has_no_page_to_link() -> None:
    f = festival(links=('https://fest.example/',))
    assert tickets.waiting(f) == Waiting.PAGE
    assert prices.price_state([], None, f.page) == Price.NOT_LOOKED


def test_a_dispute_is_settled_by_a_first_read_of_rows_as_new(files: Path) -> None:
    (files / 'disputed').mkdir()
    _ = (files / 'disputed' / '7.json').write_text(json.dumps({'rows_at': AT.isoformat(), 'reads': {}}))
    tickets.settle_dispute(7, read(rows_at=dt.datetime(2026, 9, 1, tzinfo=dt.UTC)))
    assert (files / 'disputed' / '7.json').exists()  # older rows settle nothing
    tickets.settle_dispute(7, read())
    assert not (files / 'disputed' / '7.json').exists()


def test_a_recorded_draft_archives_its_prompt_and_leaves_no_prompt_file(files: Path) -> None:
    p = prompt.current('first_read')
    (data(prompt.ASKED) / f'{p.hash}.md').unlink(missing_ok=True)
    draft_file(files, read())
    _ = (files / 'drafts' / '7.prompt.md').write_text(p.text)
    assert not (data(prompt.ASKED) / f'{p.hash}.md').exists()  # a draft names no archived prompt yet
    assert tickets.record(7) == []
    assert (data(prompt.ASKED) / f'{p.hash}.md').read_text(encoding='utf-8') == p.text
    assert not (files / 'drafts' / '7.prompt.md').exists()


def test_a_url_given_to_read_is_a_full_address(memory: Memory) -> None:
    with pytest.raises(SystemExit, match='not a full address'):
        tickets.cmd_read(memory(), 7, 'https://my.weezevent.com/x…')


def test_a_second_price_is_one_value_in_the_answer_and_two_columns_in_the_file(files: Path) -> None:
    rows = changed(
        changed(ROWS, 2, alt_amount=3050.0, alt_currency='CZK', alt_price='3 050 CZK'),
        3,
        alt_amount=3050.0,
        alt_currency='CZK',
        alt_price='3 050 CZK',
    )
    alts = [t.alt for t in tiers_of(tickets.build(read(), entry(rows))[0])]
    assert [a and (a.amount, a.currency) for a in alts] == [None, (3050.0, 'CZK')]
    tickets.append(7, entry(rows, at=LATER))
    assert tickets.record(7) == []
    assert [(r.alt_amount, r.alt_currency) for r in PriceRow.read()] == [
        (None, None),
        (3050, 'CZK'),
    ]
    assert (PriceRow.path()).read_text().splitlines()[2].split(',')[11:13] == ['3050', 'CZK']


def test_a_first_reads_prompt_is_a_hash_as_long_as_the_prompts() -> None:
    assert isinstance(tickets.checked_read(read_json()), FirstRead)
    assert isinstance(tickets.checked_read(read_json(prompt='0' * (prompt.records.DIGITS + 1))), list)


def test_a_fee_the_site_shows_apart_is_in_the_quote_its_amount_is_checked_against() -> None:
    rows = [row('1', 'Fullpass', 92.25, price='90,00 €', fee=2.25)]
    answer_, _, found = tickets.build(one_tier(rows), entry(rows))
    assert found == []
    assert tiers_of(answer_)[0].quote == 'Fullpass 90,00 € + 2.25 fee'
    shown = row('1', 'Fullpass', 120.0, price='€119.00 + €1.00 fee.', fee=1.0)
    assert tickets.line(shown) == 'Fullpass €119.00 + €1.00 fee.'


def one_pass(*names: str, kind: PassKind = PassKind.FULL, days: int | None = None) -> tuple[FirstRead, tuple[Row, ...]]:
    """A first read of one pass over tickets with these names, one tier each, and the rows it was read from."""
    rows = tuple(row(str(n), name, 90.0 + n) for n, name in enumerate(names, 1))
    tiers = [tier(r.key) for r in rows]
    fr = read(passes=[pass_(*tiers, kind=kind, label=None, days=days, hotel=kind == PassKind.PACKAGE)], skipped=())
    return fr, rows


@pytest.mark.parametrize(
    ('names', 'kind', 'days', 'wrong'),
    [
        (['Double room - 3 nights + 2 Full Pass'], PassKind.PACKAGE, None, 'covers 3 days'),
        (['Full Pass con habitación durante 2 noches'], PassKind.PACKAGE, 3, 'covers 2 days'),
        (['Friday Pass', 'Sunday Pass'], PassKind.DAY, 1, 'different weekdays'),
        (['Full pass - Salsa leader', 'Full pass - Bachata leader'], PassKind.FULL, None, 'different dance styles'),
        (['Early Bird Fullpass', 'KIZOMBA Fullpass'], PassKind.FULL, None, 'different dance styles'),
        (['FULL PASS + DÎNER DU 31 DECEMBRE'], PassKind.FULL, None, 'sold with a meal'),
    ],
)
def test_a_first_read_follows_what_its_tickets_names_say(
    names: list[str], kind: PassKind, days: int | None, wrong: str
) -> None:
    fr, rows = one_pass(*names, kind=kind, days=days)
    assert any(wrong in p for p in tickets.read_problems(fr, [entry(rows)]))


@pytest.mark.parametrize(
    ('names', 'kind', 'days'),
    [
        (['Double room - 3 nights + 2 Full Pass'], PassKind.PACKAGE, 3),
        (['Friday Pass Lady', 'Friday Pass Man'], PassKind.DAY, 1),
        (['Kizomba Fullpass Lady', 'Kizomba Fullpass Man'], PassKind.FULL, None),
        (['FULL PASS + DÎNER DU 31 DECEMBRE'], PassKind.PACKAGE, None),
    ],
)
def test_a_first_read_that_follows_its_tickets_names_passes(names: list[str], kind: PassKind, days: int | None) -> None:
    fr, rows = one_pass(*names, kind=kind, days=days)
    assert tickets.rules_problems(fr, {r.key: r for r in rows}) == []


type Command = Callable[..., str]


@pytest.fixture
def command(
    files: Path, memory: Memory, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> Command:
    """A ticket command as its command line runs it, on a festival with one read logged; what it prints."""
    fest = festival(page=PAGE, log=(entry(ROWS),))

    def festivals(
        db: sqlite3.Connection, today: str, only: int | None = None, *, every: bool = False
    ) -> list[tickets.Festival]:
        return [fest]

    monkeypatch.setattr(tickets, 'festivals', festivals)
    monkeypatch.setattr(tickets, 'src_db', lambda: contextlib.nullcontext(memory()))

    def run(*args: object) -> str:
        monkeypatch.setattr('sys.argv', ['tickets', *map(str, args)])
        _ = capsys.readouterr()
        tickets.main()
        return capsys.readouterr().out

    return run


def test_a_first_read_is_drafted_checked_and_recorded_by_its_commands(files: Path, command: Command) -> None:
    assert command('check', 7).startswith('7: passes; ')  # the first read recorded before
    assert 'Fill passes, skipped and rule_quotes' in command('draft', 7)
    assert (files / 'drafts' / '7.prompt.md').read_text().startswith(prompt.current('first_read').text)
    with pytest.raises(SystemExit, match='exists; delete it'):
        _ = command('draft', 7)
    with pytest.raises(SystemExit, match='passes'):
        _ = command('check', 7)  # the draft as made has no pass yet
    draft_file(files, read())
    assert command('check', 7).startswith('7: passes; ')
    assert command('record', 7).startswith('7: 2 prices recorded, read 2026-10-01\nThen: mise run load')
    assert not (files / 'drafts' / '7.json').exists()


def test_todo_lists_what_a_festival_needs_and_what_all_wait_for(command: Command) -> None:
    out = command('todo')
    assert out.startswith('7  2027-02-05  Fest\n')
    assert 'first read needed, none: ' in out
    assert f'      {PAGE}\n' in out
    assert '\nwaits for: 1 ' in out


def test_changes_name_what_a_read_found_new_or_different(command: Command) -> None:
    assert command('changes', 7) == ''  # one read: nothing to compare yet
    tickets.append(7, entry(changed(ROWS, 2, amount=130.0, price='€130.00'), at=stamp(2)))
    assert command('changes', 7) == command('changes')
    assert '7  2026-10-02  ' in command('changes', 7)
