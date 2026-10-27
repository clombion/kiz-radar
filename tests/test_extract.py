"""The extraction step: price checks and dates, stable artist ids, and asking Claude with one retry."""

import argparse
import dataclasses
import hashlib
import json
import sqlite3
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import pytest
from pydantic import Field, ValidationError

from pipeline import db, enums, prompt, spend, states, tickets
from pipeline.enums import AnswerState, PassKind, Style
from pipeline.extract import answers, ask, load_extract, prices, run_log
from pipeline.extract.resolve_artists import stable_ids
from pipeline.prompt import Prompt, api_schema
from pipeline.records import JSON, Batch, Priced, PricedPass, PricedTier, Record, Stamped, real_day
from tests import jsons
from tests.fakes import Client, Memory


@pytest.mark.parametrize(
    ('quote', 'amount'),
    [
        ('⭐ Early Bird Pass – 130€ (50 or till May 1st)', 130),
        ('one package which costs EUR 1.800 and includes', 1800),
        ('Single room: €1,800 (deposit €200)', 1800),
        ('🇳🇴 Norway – 5 900 NOK', 5900),
        ('$8.50 EVENTBRITE PROCESSING FEE', 8.5),
        ('Breakfast €9,50', 9.5),
        ('Until March 31 155€ (310BGN)', 155),  # a date's day next to the amount
    ],
)
def test_amount_found_in_quote(quote: str, amount: float) -> None:
    assert amount in prices.numbers_in(quote)


def tier(
    quote: str,
    amount: float = 80,
    *,
    fee: float | None = None,
    currency: str = 'EUR',
    from_: str | None = None,
    until: str | None = '01-31',
) -> PricedTier:
    return PricedTier(
        amount=amount,
        currency=currency,
        fee=fee,
        alt=None,
        from_=None if from_ is None else real_day(from_),
        until=None if until is None else real_day(until),
        quantity=None,
        door=False,
        sold_out=False,
        current=False,
        quote=quote,
    )


def priced(*tiers: PricedTier, kind: PassKind = PassKind.FULL, style: Style | None = None, event_id: int = 5) -> Priced:
    ps = PricedPass(
        kind=kind, style=style, label_quote=None, group_size=1, days=None, includes_hotel=False, tiers=tiers
    )
    return Priced(event_id=event_id, passes=(ps,), rule_quotes=())


@pytest.mark.parametrize(
    ('quote', 'amount', 'fee', 'ok'),
    [
        ('🔸Early Bird: £85 + £3 admin fee', 88, 3, True),  # what a buyer pays: the price and its fee
        ('🔸Early Bird: £85 + £3 admin fee', 88, None, False),  # a total needs its fee
        ('🔸Early Bird: £85 + £3 admin fee', 85, None, True),
        ('🔸Early Bird: £85', 88, 3, False),  # a fee the quote doesn't give
    ],
)
def test_a_total_quotes_its_price_and_its_fee(quote: str, amount: float, fee: float | None, ok: bool) -> None:
    ev = priced(tier(quote, amount, fee=fee, currency='GBP', until=None))
    assert (prices.problems(ev, []) == []) == ok


def test_amount_missing_from_quote_is_a_problem() -> None:
    ev = priced(tier('Full Pass – 180€ (Till Festival)', 150, until=None))
    assert prices.problems(ev, [])[0].startswith('amounts: event 5: passes[0].tiers[0].amount 150')


@pytest.mark.parametrize(
    ('answer', 'start', 'expected'),
    [
        ('01-31', '2026-03-20', '2026-01-31'),  # before the festival in its own year
        ('04-30', '2026-03-20', '2025-04-30'),  # a list that started the spring before
        ('12-31', '2026-01-02', '2025-12-31'),
        ('03-20', '2026-03-20 18:00:00', '2026-03-20'),
        ('2027-02-01', '2026-03-20', '2027-02-01'),  # a written year is kept
        (None, '2026-03-20', None),
    ],
)
def test_dates_without_a_year_fall_before_the_festival(answer: str | None, start: str, expected: str | None) -> None:
    assert prices.on_date(None if answer is None else real_day(answer), start) == expected


@pytest.mark.parametrize('value', ['02-30', '2027-13-01', '2026-02-29'])
def test_an_answer_with_no_real_day_is_refused(value: str) -> None:
    text = priced(tier('1€', 1)).model_dump_json(by_alias=True)
    assert text.count('"from":null') == 1
    with pytest.raises(ValidationError, match='from'):
        _ = Priced.parse(text.replace('"from":null', f'"from":"{value}"'))


def test_any_year_s_day_is_a_real_day() -> None:
    assert real_day('02-29') == '02-29'


def db_with(
    con: sqlite3.Connection, artists: dict[str, int], keys: dict[str, int], issued: dict[str, int] | None = None
) -> sqlite3.Connection:
    _ = con.execute('create table artists (id integer primary key, display_name, kind, match_key)')
    _ = con.executemany('insert into artists values (?, ?, ?, ?)', [(i, k, 'person', k) for k, i in artists.items()])
    _ = con.execute('create table artist_keys (match_key primary key, artist_id)')
    _ = con.executemany('insert into artist_keys values (?, ?)', keys.items())
    if issued is not None:
        _ = con.execute('create table artist_ids (artist_id integer primary key, match_key)')
        _ = con.executemany('insert into artist_ids values (?, ?)', [(i, k) for k, i in issued.items()])
    return con


def test_unchanged_artists_keep_their_ids(memory: Memory) -> None:
    con = db_with(memory(), {'p:a': 7, 'p:b': 3}, {'p:a': 7, 'p:b': 3})
    assert stable_ids(con, {'p:a': 'p:a', 'p:b': 'p:b'}) == {'p:a': 7, 'p:b': 3}


def test_new_artist_gets_an_id_never_used(memory: Memory) -> None:
    # id 9 belonged to an artist whose festival was deleted; it is not given again
    con = db_with(memory(), {'p:a': 7}, {'p:a': 7}, issued={'p:a': 7, 'p:gone': 9})
    assert stable_ids(con, {'p:a': 'p:a', 'p:new': 'p:new'}) == {'p:a': 7, 'p:new': 10}


def test_merged_artist_keeps_the_lowest_free_id(memory: Memory) -> None:
    # two spellings merge into a couple key no artist had; the lower of their ids carries on
    con = db_with(memory(), {'c:x': 12, 'c:y': 5}, {'c:x': 12, 'c:y': 5})
    assert stable_ids(con, {'c:x': 'c:z', 'c:y': 'c:z'}) == {'c:z': 5}


def test_returning_artist_gets_its_old_id_back(memory: Memory) -> None:
    con = db_with(memory(), {}, {}, issued={'p:a': 4})
    assert stable_ids(con, {'p:a': 'p:a'}) == {'p:a': 4}


FEST = ask.Festival(
    id=5,
    title='Test Fest',
    description_text='Full pass 80€ until 31.01\nDJ Neiken',
    start_date='2026-03-20 18:00:00',
    end_date='2026-03-22 18:00:00',
    country='Norway',
)


def prices_answer(quote: str, style: Style | None = None) -> str:
    return Batch[Priced](batch='event-5', events=(priced(tier(quote), style=style),)).model_dump_json()


def test_answer_retried_once_with_the_checkers_lines() -> None:
    client = Client(prices_answer('Full pass 90€'), prices_answer('Full pass 80€ until 31.01'))
    out = ask.ask(client, prompt.PRICES, FEST)
    assert out is not None
    assert out.events[0].passes[0].tiers[0].amount == 80
    retry = str(client.messages.asked[1][-1]['content'])
    assert 'verbatim' in retry
    assert 'Full pass 90€' in retry


def test_two_failures_leave_the_festival_unanswered() -> None:
    client = Client(prices_answer('Full pass 90€'), prices_answer('Full pass 85€'))
    assert ask.ask(client, prompt.PRICES, FEST) is None


def test_an_answer_cut_short_or_off_its_record_is_asked_again() -> None:
    client = Client('{"batch": "event-5"', prices_answer('Full pass 80€ until 31.01'))
    assert ask.ask(client, prompt.PRICES, FEST) is not None
    assert 'schema' in str(client.messages.asked[1][-1]['content'])


@pytest.mark.parametrize('name', ['extract', 'rooms_genres', 'prices', 'first_read'])
def test_schema_sent_without_constraints_structured_outputs_reject(name: prompt.Name) -> None:
    text = json.dumps(prompt.current(name).sent_schema)
    for word in ('minLength', 'maxLength', 'minimum', 'oneOf', 'pattern', '$schema', '$ref', '$defs', '"title"'):
        assert word not in text


def test_the_schema_sent_holds_every_state_its_producer_makes() -> None:
    text = json.dumps(prompt.current('extract').sent_schema)
    assert all(f'"{k}"' in text for k in states.made('feature'))
    assert all(f'"{k}"' not in text for k in set(states.keys('feature')) - set(states.made('feature')))


class Kind(StrEnum):
    FULL = 'full'


class Grown(StrEnum):  # Kind with a state added
    FULL = 'full'
    FESTIVAL = 'festival'


class Kinded(Record):
    kind: Kind


class GrownKinded(Record):
    kind: Grown


class Batched(Record):
    batch: str


class Shorter(Record):  # Batched with a constraint the checker alone holds
    batch: Annotated[str, Field(max_length=99)]


def test_a_prompt_is_known_by_the_hash_of_its_text_and_both_schemas() -> None:
    base = prompt.current('prices')
    assert Prompt(base.system, base.record).hash == base.hash  # hashing twice: one hash
    assert Prompt(base.system + ' ', base.record).hash != base.hash  # a template edited
    grown = Prompt('s', GrownKinded)
    assert Prompt('s', Kinded).hash != grown.hash  # a state added to an enum
    assert json.dumps(Prompt('s', Kinded).schema).replace('Kinded', 'X').replace('Kind', 'X') != json.dumps(
        grown.schema
    ).replace('GrownKinded', 'X').replace('Grown', 'X')
    checked = Prompt('s', Shorter)
    assert api_schema(checked.schema) == api_schema(Prompt('s', Batched).schema)  # sent alike
    assert checked.hash != Prompt('s', Batched).hash  # a constraint the checker alone holds


def test_a_criterion_edited_changes_the_prompts_it_is_in() -> None:
    names: list[prompt.Name] = ['extract', 'rooms_genres', 'prices', 'first_read']
    before = {p: prompt.current(p).hash for p in names}
    full = states.state('pass_kind', 'full')
    edited = dataclasses.replace(full, criterion=full.criterion + ' (edited)')
    prompt.current.cache_clear()
    with pytest.MonkeyPatch.context() as m:
        m.setitem(states.BY_KEY, ('pass_kind', 'full'), edited)
        m.setitem(states.BY_POINT, 'pass_kind', tuple(edited if s is full else s for s in states.BY_POINT['pass_kind']))
        after = {p: prompt.current(p).hash for p in names}
    prompt.current.cache_clear()
    assert {p for p in names if before[p] != after[p]} == {'prices', 'first_read'}


def test_an_answer_saved_archives_its_prompt_first(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(answers, 'ANSWERS', tmp_path)
    monkeypatch.setattr(answers, 'LOG', tmp_path / 'log.csv')
    _ = (tmp_path / 'log.csv').write_text(','.join(answers.Logged.columns()) + '\n')
    p = prompt.current('prices')
    archived = prompt.ASKED / f'{p.hash}.md'
    archived.unlink(missing_ok=True)
    out = Batch[Priced].parse(prices_answer('Full pass 80€ until 31.01'))
    _ = answers.save('prices', out, 'm', p, 'test')
    assert archived.read_text(encoding='utf-8') == p.text
    assert answers.log()['prices/event-5.json'].prompt == p.hash
    assert answers.current(prompt.PRICES, {5})[5].entry == out.events[0]


def test_only_an_answer_to_the_current_prompt_is_read_as_its_record(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(answers, 'ANSWERS', tmp_path)
    monkeypatch.setattr(answers, 'LOG', tmp_path / 'log.csv')
    (tmp_path / 'prices').mkdir()
    _ = (tmp_path / 'prices' / 'prices-001.json').write_text(
        json.dumps({'batch': 'b', 'events': [{'event_id': 5, 'old': 1}]})
    )
    rows = [answers.Logged(file='prices/prices-001.json', answered_at='t', model='m', prompt='0' * 16, answered_by='x')]
    answers.Logged.write(tmp_path / 'log.csv', rows)
    assert list(answers.answered('prices', {5})) == [5]  # its festivals are known, whatever its shape
    assert answers.current(prompt.PRICES, {5}) == {}


def test_an_archive_cut_short_is_written_again() -> None:
    p = prompt.current('prices')
    archived = p.archive()
    _ = archived.write_text(p.text[:100], encoding='utf-8')
    _ = p.archive()
    assert archived.read_text(encoding='utf-8') == p.text
    assert not list(prompt.ASKED.glob('*.part'))


def test_the_system_text_sent_is_the_prompts() -> None:
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    _ = ask.ask(client, prompt.PRICES, FEST)
    assert client.messages.requests[0]['system'] == prompt.current('prices').system


def test_every_prompt_the_answers_and_reads_name_is_archived() -> None:
    named = {r.prompt for r in answers.log().values()}
    named |= {Stamped.model_validate_json(p.read_bytes()).prompt for p in tickets.READS.glob('*.json')}
    for h in named:  # each archived text hashes to its name
        assert hashlib.sha256(prompt.asked(h).encode()).hexdigest()[:16] == h


def test_a_template_with_a_marker_left_fails() -> None:
    with pytest.raises(ValueError, match='unfilled'):
        _ = states.fill('{{states:pass_kind}}\nand {{states:pass_kind}} inline', 'x.md')
    with pytest.raises(KeyError):
        _ = states.fill('{{states:no_such_point}}', 'x.md')


def test_requests_stop_once_the_months_budget_is_spent() -> None:
    _ = spend.record('prices', 'claude-opus-5-5', 1_000_000, 5_000_000)  # $104, about €93
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    assert ask.ask(client, prompt.PRICES, FEST) is not None
    _ = spend.record('prices', 'claude-opus-5-5', 0, 1_000_000)  # $20 more: over €100
    with pytest.raises(spend.BudgetSpentError):
        _ = ask.ask(client, prompt.PRICES, FEST)
    assert len(client.messages.asked) == 1


def test_a_model_with_no_price_is_never_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    monkeypatch.setattr(ask, 'MODEL', 'claude-unpriced')
    with pytest.raises(KeyError, match='claude-unpriced'):
        _ = ask.ask(client, prompt.PRICES, FEST)
    assert client.messages.asked == []


def test_a_request_costs_its_models_prices() -> None:
    assert spend.usd('claude-haiku-5-5', 100_000, 100_000) == 0.06
    assert spend.usd('claude-haiku-5-5', 200_000, 0) == 0.10  # a long prompt costs Haiku more
    assert spend.usd('claude-sonnet-5-5', 1_000, 1_000) == 0.012


def source(con: sqlite3.Connection, *events: tuple[int, str | None]) -> sqlite3.Connection:
    _ = con.executescript(
        'create table events (id integer, title text, description_text text, start_date text, end_date text, '
        'country text); create table pending_extraction (event_id integer);'
    )
    _ = con.executemany(
        "insert into events values (?, 'F', ?, '2099-01-01', '2099-01-02', null)", [(i, d) for i, d in events]
    )
    return con


def no_answers(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, answers.Logged]]:
    return {}


def test_only_the_named_festivals_are_asked(memory: Memory, monkeypatch: pytest.MonkeyPatch) -> None:
    con = source(memory(), (1, 'a'), (2, 'b'), (3, None))
    monkeypatch.setattr(ask.answers, 'answered', no_answers)
    assert {f.id for f, _ in ask.due(con, ['prices'])[0]} == {1, 2}
    assert {f.id for f, _ in ask.due(con, ['prices'], {2})[0]} == {2}
    with pytest.raises(SystemExit, match=r'\[3\]'):
        _ = ask.due(con, ['prices'], {2, 3})  # no description: nothing to ask it


def logged(prompt_: str) -> answers.Logged:
    return answers.Logged(file='prices/event-1.json', answered_at='t', model='m', prompt=prompt_, answered_by='x')


NOW = logged(prompt.current('prices').hash)


def test_an_answer_to_an_older_prompt_is_asked_again(memory: Memory, monkeypatch: pytest.MonkeyPatch) -> None:
    con = source(memory(), (1, 'a'), (2, 'b'))
    have = {1: (Path('a'), logged('0' * 16)), 2: (Path('b'), NOW)}

    def answered(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, answers.Logged]]:
        return have

    monkeypatch.setattr(ask.answers, 'answered', answered)
    assert [f.id for f, _ in ask.due(con, ['prices'])[0]] == [1]


ANSWER_CASES: list[tuple[tuple[answers.Logged | None, bool], AnswerState]] = [
    ((None, False), AnswerState.NONE),
    ((None, True), AnswerState.NONE),
    ((logged('0' * 16), False), AnswerState.STALE),
    ((NOW, True), AnswerState.STALE),
    ((NOW, False), AnswerState.CURRENT),
]


@pytest.mark.parametrize(('args', 'state'), ANSWER_CASES)
def test_every_state_of_an_answer_that_due_tells_apart(
    args: tuple[answers.Logged | None, bool], state: AnswerState
) -> None:
    answer, pending = args
    assert ask.answer_state('prices', answer, pending=pending) == state


def test_the_answer_states_tested_are_all_of_them() -> None:
    assert {s for _, s in ANSWER_CASES} == set(AnswerState)


def test_a_festival_stays_pending_until_every_pass_is_answered() -> None:
    every: set[prompt.PassName] = {p.name for p in prompt.PASSES}
    answered: dict[int, set[prompt.PassName]] = {1: {'prices'}, 2: every, 4: every}
    assert ask.settled(answered, {1, 2, 3}) == [2]


@pytest.mark.parametrize(
    ('text', 'ids'), [('16909,18806', {16909, 18806}), ('16909, 18806,', {16909, 18806}), ('x', None)]
)
def test_festival_ids_are_read_from_commas(text: str, ids: set[int] | None) -> None:
    if ids is None:
        with pytest.raises(argparse.ArgumentTypeError):
            _ = db.festival_ids(text)
    else:
        assert db.festival_ids(text) == ids


def test_a_description_answer_gives_a_style_only_at_a_festival_of_several() -> None:
    answer = prices_answer('Full pass 80€ until 31.01', Style.KIZOMBA)
    client = Client(answer, answer)
    assert ask.ask(client, prompt.PRICES, FEST, [Style.KIZOMBA]) is None
    assert 'one style only' in str(client.messages.asked[1])
    assert ask.ask(Client(answer), prompt.PRICES, FEST, [Style.BACHATA, Style.KIZOMBA]) is not None


def test_the_question_asked_is_the_festival_as_its_pass_asks() -> None:
    message, asked = ask.question(prompt.PRICES, FEST, [Style.KIZOMBA])
    assert asked.event_id == 5
    assert message.startswith('Batch input (event-5.json):')
    assert jsons.at(JSON.validate_json(message.split('\n', 1)[1]), 'events', 0, 'styles') == ['kizomba']
    extract = jsons.at(JSON.validate_json(ask.question(prompt.EXTRACT, FEST)[0].split('\n', 1)[1]), 'events', 0)
    assert isinstance(extract, dict)
    assert 'styles' not in extract


def test_the_run_log_writes_inside_the_callers_transaction(memory: Memory) -> None:
    con = memory()
    _ = con.execute('BEGIN')
    run_log.record(con, run_log.Step('step', 'what', 'test', details={'n': 1}))
    assert con.in_transaction
    tables: list[tuple[str]] = con.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    assert {n for (n,) in tables} == {'prompts', 'table_docs', 'pipeline_steps'}
    con.rollback()
    assert load_extract.count(con, 'SELECT count(*) FROM sqlite_master') == 0


def test_a_load_a_check_refuses_leaves_the_database_as_it_was(memory: Memory) -> None:
    con = memory()
    _ = con.execute('CREATE TABLE event_passes (kept INTEGER)')
    con.commit()
    _ = con.executescript(load_extract.SCHEMA)
    with pytest.raises(sqlite3.IntegrityError):
        _ = con.execute("INSERT INTO event_genres (event_id, genre, source) VALUES (1, 'tango', 'site_tag')")
    con.rollback()
    columns: list[tuple[int, str]] = con.execute('PRAGMA table_info(event_passes)').fetchall()
    assert [c[1] for c in columns] == ['kept']


def loaded(con: sqlite3.Connection) -> sqlite3.Connection:
    """An empty source database with load_extract's tables, inside the load's transaction."""
    _ = con.executescript(
        'CREATE TABLE events (id INTEGER PRIMARY KEY, start_date TEXT, modified_at TEXT);'
        "INSERT INTO events VALUES (5, '2026-03-20 18:00:00', '2026-01-01 10:00:00'), (6, '2026-04-01', '2026-01-01');"
    )
    _ = con.executescript(load_extract.SCHEMA)
    return con


@pytest.mark.parametrize(
    'sql',
    [
        "INSERT INTO price_status VALUES (5, 'priced', NULL, NULL)",  # priced, with no pass to price
        "INSERT INTO price_status VALUES (5, 'not_looked', NULL, 1)",  # a pass priced, said unpriced
        "INSERT INTO price_status VALUES (5, 'soon', NULL, NULL)",
        # half a pair
        "INSERT INTO pass_tiers VALUES (5, 1, 1, 80, 'EUR', NULL, 2000, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 'q')",
        (
            'INSERT INTO event_genres (event_id, genre, source, prompt, rule) '
            "VALUES (5, 'zouk', 'description', 'h', 'title')"
        ),
        "INSERT INTO event_genres (event_id, genre, source) VALUES (5, 'zouk', 'description')",  # from nothing
        "INSERT INTO event_genres (event_id, genre, source, rule) VALUES (5, 'zouk', 'site_tag', 'title')",
    ],
)
def test_a_row_outside_the_table_or_its_rules_is_refused_when_written(memory: Memory, sql: str) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        _ = loaded(memory()).execute(sql)


def test_a_festival_is_priced_exactly_when_it_has_the_pass_a_card_prices(memory: Memory) -> None:
    con = loaded(memory())
    full = priced(tier('Full pass 80€ until 31.01'))
    party = priced(tier('Full pass 80€ until 31.01'), kind=PassKind.PARTY, event_id=6)
    described = {e.event_id: answers.Answer(e, 'b', logged('h')) for e in (full, party)}
    load_extract.load_prices(con, described, {}, {6: (enums.Sales.SHOP, 'https://shop.example/6')})
    statuses: list[tuple[int, str, str | None, int | None]] = con.execute(
        'SELECT event_id, price, page, card_pass FROM price_status ORDER BY event_id'
    ).fetchall()
    assert statuses == [(5, 'priced', None, 1), (6, 'other_passes_only', 'https://shop.example/6', None)]
