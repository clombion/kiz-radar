"""The extraction step: price checks and dates, stable artist ids, and asking Claude with one retry."""

import argparse
import dataclasses
import datetime as dt
import itertools
import json
import sqlite3
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import pytest
from pydantic import Field, ValidationError

from pipeline import db, enums, generate, prompt, spend, states, tickets
from pipeline.enums import AnswerState, PassKind, Role, Style
from pipeline.extract import answers, ask, check_output, load_extract, prices, resolve_artists, run_log
from pipeline.extract.resolve_artists import stable_ids
from pipeline.prompt import Prompt, api_schema
from pipeline.records import JSON, Batch, Priced, PricedPass, PricedTier, Record, Stamped, day_of, real_day
from tests import jsons
from tests.fakes import AT, Client, Memory


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
    day = prices.on_date(None if answer is None else real_day(answer), day_of(start))
    assert (None if day is None else day.isoformat()) == expected


@pytest.mark.parametrize('value', ['02-30', '2027-13-01', '2026-02-29'])
def test_an_answer_with_no_real_day_is_refused(value: str) -> None:
    text = priced(tier('1€', 1)).model_dump_json(by_alias=True)
    assert text.count('"from":null') == 1
    with pytest.raises(ValidationError, match='from'):
        _ = Priced.parse(text.replace('"from":null', f'"from":"{value}"'))


def test_any_year_s_day_is_a_real_day() -> None:
    assert real_day('02-29') == '02-29'


def spelled(name: str, n: int) -> str:
    """The name, or the name a letter off by n: one dropped, doubled or swapped with the next."""
    i = n % (len(name) - 1)
    return [
        name,
        name[:i] + name[i + 1 :],
        name[:i] + name[i] + name[i:],
        name[:i] + name[i + 1] + name[i] + name[i + 2 :],
    ][n % 4]


def test_the_pairs_judged_are_every_pair_a_candidate_can_be() -> None:
    """Only the pairs sharing a stated country or a partner, and those spelled alike, are judged: every other pair
    lacks what each reason needs. Names a letter apart, alone and in couples, with countries stated, events'
    countries or neither, give each reason's pairs; and a same-name pair judged or not is kept apart all the same."""
    firsts = ['Daniel', 'Daniela', 'Mariana', 'Marian', 'Joao', 'Kwame', 'Isabelle', 'Isabel', 'Ricardo', 'Ana']
    lasts = ['Silva', 'Santos', 'Moreau', 'Mendes', 'Okafor', 'Ferreira', '']
    places = ['France', 'Portugal', 'Angola', None]
    mentions: list[resolve_artists.Mention] = []
    for i in range(400):
        last = lasts[i % 7]
        name = spelled(firsts[i % 10], i // 10) + (f' {spelled(last, i // 7)}' if last else '')
        if i % 3 == 0:
            name += f' & {spelled(firsts[i * 7 % 10], i // 3)}'
        mentions.append(
            resolve_artists.Mention(
                id=i,
                event_id=i,
                role=[Role.TEACHER, Role.DJ][i % 2],
                name_as_written=name,
                style=None,
                country=places[i // 5 % 4],
                event_country=places[i // 11 % 4],
            )
        )
    keys = resolve_artists.keyed(mentions)
    pairing = resolve_artists.Pairing.of(keys)
    every = list(itertools.combinations(sorted(pairing.bare), 2))
    accepted = {pair for pair in every if pairing.reason(*pair)}
    reasons = {found[0] for pair in accepted if (found := pairing.reason(*pair))}
    assert len(reasons) == 4
    assert accepted <= pairing.judged(pairing.bare)
    found, kept_apart = resolve_artists.candidates(keys, {})
    assert {(c.key_a, c.key_b) for c in found if c.key_a != c.key_b} == accepted
    assert kept_apart == sum(
        pairing.bare[a] == pairing.bare[b] and pair not in accepted for pair in every for a, b in [pair]
    )


def db_with(con: sqlite3.Connection, keys: dict[str, int], issued: dict[str, int]) -> sqlite3.Connection:
    """The export's tables stable_ids reads: each spelling's artist, and every id given."""
    _ = con.execute('create table artist_keys (match_key primary key, artist_id)')
    _ = con.executemany('insert into artist_keys values (?, ?)', keys.items())
    _ = con.execute(resolve_artists.ARTIST_IDS)
    _ = con.executemany('insert into artist_ids values (?, ?)', [(i, k) for k, i in issued.items()])
    return con


def test_unchanged_artists_keep_their_ids(memory: Memory) -> None:
    con = db_with(memory(), {'p:a': 7, 'p:b': 3}, {'p:a': 7, 'p:b': 3})
    assert stable_ids(con, {'p:a': 'p:a', 'p:b': 'p:b'}) == {'p:a': 7, 'p:b': 3}


def test_new_artist_gets_an_id_never_used(memory: Memory) -> None:
    # id 9 belonged to an artist whose festival was deleted; it is not given again
    con = db_with(memory(), {'p:a': 7}, issued={'p:a': 7, 'p:gone': 9})
    assert stable_ids(con, {'p:a': 'p:a', 'p:new': 'p:new'}) == {'p:a': 7, 'p:new': 10}


def test_merged_artist_keeps_the_lowest_free_id(memory: Memory) -> None:
    # two spellings merge into a couple key no artist had; the lower of their ids carries on
    con = db_with(memory(), {'c:x': 12, 'c:y': 5}, {'c:x': 12, 'c:y': 5})
    assert stable_ids(con, {'c:x': 'c:z', 'c:y': 'c:z'}) == {'c:z': 5}


def test_returning_artist_gets_its_old_id_back(memory: Memory) -> None:
    con = db_with(memory(), {}, issued={'p:a': 4})
    assert stable_ids(con, {'p:a': 'p:a'}) == {'p:a': 4}


FEST = ask.Festival(
    id=5,
    title='Test Fest',
    description_text='Full pass 80€ until 31.01\nDJ Neiken',
    start_date=dt.date(2026, 3, 20),
    end_date=dt.date(2026, 3, 22),
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


@pytest.mark.usefixtures('answered_here')
def test_an_answer_saved_archives_its_prompt_first() -> None:
    p = prompt.current('prices')
    archived = prompt.ASKED / f'{p.hash}.md'
    archived.unlink(missing_ok=True)
    out = Batch[Priced].parse(prices_answer('Full pass 80€ until 31.01'))
    _ = answers.save('prices', out, 'm', p, 'test')
    assert archived.read_text(encoding='utf-8') == p.text
    assert answers.log()['prices/event-5.json'].prompt == p.hash
    assert answers.current(prompt.PRICES, {5})[5].entry == out.events[0]


def test_only_an_answer_to_the_current_prompt_is_read_as_its_record(answered_here: Path) -> None:
    (answered_here / 'prices').mkdir()
    _ = (answered_here / 'prices' / 'prices-001.json').write_text(
        json.dumps({'batch': 'b', 'events': [{'event_id': 5, 'old': 1}]})
    )
    rows = [answers.Logged(file='prices/prices-001.json', answered_at=AT, model='m', prompt='0' * 16, answered_by='x')]
    answers.Logged.write(answers.LOG, rows)
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


def export_prompts() -> set[str]:
    """The prompts the export's rows name, in every column called prompt (a step's lists them, separated by commas)."""
    with db.opened(db.export(), 'ro') as con:
        tables: list[tuple[str]] = con.execute("select name from sqlite_master where type = 'table'").fetchall()
        named: set[str] = set()
        for (t,) in tables:
            columns: list[tuple[int, str, str, int, object, int]] = con.execute(f'pragma table_info("{t}")').fetchall()
            if any(c[1] == 'prompt' for c in columns):
                values: list[tuple[str]] = con.execute(
                    f'select distinct prompt from "{t}" where prompt is not null'  # noqa: S608 (the export's own table names)
                ).fetchall()
                named |= {h for (v,) in values for h in v.split(', ')}
    return named


def test_every_prompt_the_answers_reads_and_export_name_is_archived_under_its_hash() -> None:
    named = {r.prompt for r in answers.log().values()}
    named |= {Stamped.model_validate_json(p.read_bytes()).prompt for p in tickets.READS.glob('*.json')}
    named |= export_prompts()
    archived = {p.stem: p.read_text(encoding='utf-8') for p in prompt.ASKED.glob('*.md') if p.name != 'README.md'}
    assert named <= set(archived)
    # every prompt ever asked stays, each under the hash of its text
    assert [h for h, text in archived.items() if prompt.digest(text) != h] == []


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
        'country text); create table pending_extraction (event_id integer, since text);'
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


def logged(prompt_: str, at: dt.datetime = dt.datetime(2026, 10, 2, 9, tzinfo=dt.UTC)) -> answers.Logged:
    return answers.Logged(file='prices/event-1.json', answered_at=at, model='m', prompt=prompt_, answered_by='x')


NOW = logged(prompt.current('prices').hash)


def test_an_answer_to_an_older_prompt_is_asked_again(memory: Memory, monkeypatch: pytest.MonkeyPatch) -> None:
    con = source(memory(), (1, 'a'), (2, 'b'))
    have = {1: (Path('a'), logged('0' * 16)), 2: (Path('b'), NOW)}

    def answered(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, answers.Logged]]:
        return have

    monkeypatch.setattr(ask.answers, 'answered', answered)
    assert [f.id for f, _ in ask.due(con, ['prices'])[0]] == [1]


# (an answer asked on 2 October, the day its festival's description last changed when it is pending)
ANSWER_CASES: list[tuple[tuple[answers.Logged | None, dt.date | None], AnswerState]] = [
    ((None, None), AnswerState.NONE),
    ((None, dt.date(2026, 10, 1)), AnswerState.NONE),
    ((logged('0' * 16), None), AnswerState.STALE),
    ((NOW, dt.date(2026, 10, 3)), AnswerState.STALE),  # asked before the change
    (
        (NOW, dt.date(2026, 10, 2)),
        AnswerState.CURRENT,
    ),  # asked on the day of the change: after the refresh that found it
    ((NOW, dt.date(2026, 10, 1)), AnswerState.CURRENT),
    ((NOW, None), AnswerState.CURRENT),
]


@pytest.mark.parametrize(('args', 'state'), ANSWER_CASES)
def test_every_state_of_an_answer_that_due_tells_apart(
    args: tuple[answers.Logged | None, dt.date | None], state: AnswerState
) -> None:
    answer, since = args
    assert ask.answer_state('prices', answer, since=since) == state


def test_the_answer_states_tested_are_all_of_them() -> None:
    assert {s for _, s in ANSWER_CASES} == set(AnswerState)


def test_a_festival_stays_pending_until_every_pass_has_an_answer_since_its_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 1 has only its prices answered, 2 every pass, 3 nothing, 4 every pass but before its description changed
    now = {p.name: logged(prompt.current(p.name).hash) for p in prompt.PASSES}
    have = {'prices': {1: now['prices'], 2: now['prices'], 4: now['prices']}} | {
        p: {2: now[p], 4: now[p]} for p in ('extract', 'rooms_genres')
    }

    def answered(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, answers.Logged]]:
        return {i: (Path(f'{pass_name}/event-{i}.json'), a) for i, a in have[pass_name].items() if i in ids}

    monkeypatch.setattr(ask.answers, 'answered', answered)
    since = dt.date(2026, 10, 1)
    assert ask.settled({1: since, 2: since, 3: since, 4: dt.date(2026, 10, 3)}) == [2]


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
    _ = con.executescript(run_log.SCHEMA)
    _ = con.execute('BEGIN')
    run_log.record(con, run_log.Step('step', 'what', 'test', details={'n': 1}))
    assert con.in_transaction
    assert load_extract.count(con, 'SELECT count(*) FROM pipeline_steps') == 1
    con.rollback()
    assert load_extract.count(con, 'SELECT count(*) FROM pipeline_steps') == 0


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


@pytest.fixture
def answered_here(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Answers saved in a folder of the test's own, with an empty log."""
    monkeypatch.setattr(answers, 'ANSWERS', tmp_path / 'answers')
    monkeypatch.setattr(answers, 'LOG', tmp_path / 'answers' / 'log.csv')
    (tmp_path / 'answers').mkdir()
    _ = (tmp_path / 'answers' / 'log.csv').write_text(','.join(answers.Logged.columns()) + '\n')
    return tmp_path / 'answers'


def source_file(tmp_path: Path) -> Path:
    """A source DB holding FEST, pending extraction."""
    path = tmp_path / 'source.sqlite'
    with db.opened(path, 'rwc') as con:
        _ = con.executescript(
            'create table events (id integer, title text, description_text text, start_date text, end_date text, '
            'country text); create table pending_extraction (event_id integer, reason text, since text); '
            'create table event_genres (event_id integer, genre text); '
            "insert into pending_extraction values (5, 'description changed', '2026-01-01');"
        )
        _ = con.execute(
            'insert into events values (?, ?, ?, ?, ?, ?)',
            (FEST.id, FEST.title, FEST.description_text, FEST.start_date, FEST.end_date, FEST.country),
        )
        con.commit()
    return path


def run_ask(monkeypatch: pytest.MonkeyPatch, client: Client, *args: object) -> None:
    monkeypatch.setattr(ask.anthropic, 'Anthropic', lambda: client)
    monkeypatch.setattr('sys.argv', ['ask', *map(str, args)])
    ask.main()


def test_a_festival_is_asked_its_passes_and_leaves_pending_once_all_are_answered(
    tmp_path: Path, answered_here: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    src = source_file(tmp_path)
    client = Client(prices_answer('Full pass 80€ until 31.01'))
    run_ask(monkeypatch, client, src, '--dry-run')
    assert capsys.readouterr().out.startswith('1 festivals to ask about: ')
    assert client.messages.asked == []
    run_ask(monkeypatch, client, src, '--pass', 'prices')
    assert answers.current(prompt.PRICES, {5})[5].entry.passes[0].tiers[0].amount == 80
    with db.opened(src, 'ro') as con:
        assert con.execute('select event_id from pending_extraction').fetchall() == [(5,)]  # the other passes wait
    run_ask(monkeypatch, client, src, '--pass', 'prices')
    assert 'festivals to ask about: ' in capsys.readouterr().out
    assert len(client.messages.asked) == 1  # answered to the current prompt: not asked again


def run_check(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, question: str, answer: str) -> None:
    _ = (tmp_path / 'question.json').write_text(question)
    _ = (tmp_path / 'answer.json').write_text(answer)
    monkeypatch.setattr('sys.argv', ['check', 'prices', str(tmp_path / 'question.json'), str(tmp_path / 'answer.json')])
    check_output.main()


QUESTION = Batch[ask.Asked](batch='event-5', events=(ask.asked(prompt.PRICES, FEST),)).model_dump_json(
    serialize_as_any=True  # the prices pass's question, with its own fields
)


def test_an_answer_file_is_checked_against_the_festivals_it_was_asked_about(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    run_check(monkeypatch, tmp_path, QUESTION, prices_answer('Full pass 80€ until 31.01'))
    assert capsys.readouterr().out == 'answer.json: OK (1 events, 0 problems)\n'
    with pytest.raises(SystemExit, match=r'answer.json: FAIL \(1 problems\)'):
        run_check(monkeypatch, tmp_path, QUESTION, prices_answer('Full pass 90€'))
    assert 'verbatim' in capsys.readouterr().out
    with pytest.raises(SystemExit, match='not a question of the prices pass'):
        run_check(monkeypatch, tmp_path, '{"batch": "x"}', prices_answer('Full pass 80€ until 31.01'))


def test_generate_writes_what_differs_and_check_names_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    built = tmp_path / 'built.md'
    monkeypatch.setattr(generate, 'ROOT', tmp_path)
    monkeypatch.setattr(generate, 'FILES', {built: lambda: 'from the table\n'})
    monkeypatch.setattr('sys.argv', ['generate', '--check'])
    with pytest.raises(SystemExit, match=r'built\.md differs from pipeline/states\.py'):
        generate.main()
    monkeypatch.setattr('sys.argv', ['generate'])
    generate.main()
    assert built.read_text() == 'from the table\n'
    assert capsys.readouterr().out == 'wrote built.md\n'
    monkeypatch.setattr('sys.argv', ['generate', '--check'])
    generate.main()  # nothing differs
