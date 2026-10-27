"""The extraction step: price checks and dates, stable artist ids, and asking Claude with one retry."""

import copy
import dataclasses
import hashlib
import json
import sqlite3
from types import SimpleNamespace

import pytest

from pipeline import prompt, states
from pipeline.extract import answers, ask, prices
from pipeline.extract.resolve_artists import stable_ids
from pipeline.prompt import Prompt, api_schema
from pipeline.states import AnswerState


@pytest.mark.parametrize(
    'quote, amount',
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
def test_amount_found_in_quote(quote, amount):
    assert amount in prices.numbers_in(quote)


@pytest.mark.parametrize(
    'quote, amount, fee, ok',
    [
        ('🔸Early Bird: £85 + £3 admin fee', 88, 3, True),  # what a buyer pays: the price and its fee
        ('🔸Early Bird: £85 + £3 admin fee', 88, None, False),  # a total needs its fee
        ('🔸Early Bird: £85 + £3 admin fee', 85, None, True),
        ('🔸Early Bird: £85', 88, 3, False),  # a fee the quote doesn't give
    ],
)
def test_a_total_quotes_its_price_and_its_fee(quote, amount, fee, ok):
    tier = dict(amount=amount, currency='GBP', fee=fee, alt=None, quote=quote)
    assert (prices.problems({'events': [{'event_id': 1, 'passes': [{'tiers': [tier]}]}]}) == []) == ok


def test_amount_missing_from_quote_is_a_problem():
    tier = dict(amount=150, currency='EUR', fee=None, alt=None, quote='Full Pass – 180€ (Till Festival)')
    out = {'events': [{'event_id': 1, 'passes': [{'tiers': [tier]}]}]}
    assert prices.problems(out)[0].startswith('amounts: event 1: passes[0].tiers[0].amount 150')


@pytest.mark.parametrize(
    'answer, start, expected',
    [
        ('01-31', '2026-03-20', '2026-01-31'),  # before the festival in its own year
        ('04-30', '2026-03-20', '2025-04-30'),  # a list that started the spring before
        ('12-31', '2026-01-02', '2025-12-31'),
        ('03-20', '2026-03-20 18:00:00', '2026-03-20'),
        ('2027-02-01', '2026-03-20', '2027-02-01'),  # a written year is kept
        (None, '2026-03-20', None),
    ],
)
def test_dates_without_a_year_fall_before_the_festival(answer, start, expected):
    assert prices.on_date(answer, start) == expected


def test_impossible_date_is_a_problem():
    tier = dict(amount=1, currency='EUR', fee=None, alt=None, quote='1€', **{'from': '02-30', 'until': None})
    assert any(
        p.startswith('dates:') for p in prices.problems({'events': [{'event_id': 1, 'passes': [{'tiers': [tier]}]}]})
    )


def db_with(artists, keys, issued=None):
    con = sqlite3.connect(':memory:')
    con.execute('create table artists (id integer primary key, display_name, kind, match_key)')
    con.executemany('insert into artists values (?, ?, ?, ?)', [(i, k, 'person', k) for k, i in artists.items()])
    con.execute('create table artist_keys (match_key primary key, artist_id)')
    con.executemany('insert into artist_keys values (?, ?)', keys.items())
    if issued is not None:
        con.execute('create table artist_ids (artist_id integer primary key, match_key)')
        con.executemany('insert into artist_ids values (?, ?)', [(i, k) for k, i in issued.items()])
    return con


def test_unchanged_artists_keep_their_ids():
    con = db_with({'p:a': 7, 'p:b': 3}, {'p:a': 7, 'p:b': 3})
    assert stable_ids(con, {'p:a': 'p:a', 'p:b': 'p:b'}) == {'p:a': 7, 'p:b': 3}


def test_new_artist_gets_an_id_never_used():
    # id 9 belonged to an artist whose festival was deleted; it is not given again
    con = db_with({'p:a': 7}, {'p:a': 7}, issued={'p:a': 7, 'p:gone': 9})
    assert stable_ids(con, {'p:a': 'p:a', 'p:new': 'p:new'}) == {'p:a': 7, 'p:new': 10}


def test_merged_artist_keeps_the_lowest_free_id():
    # two spellings merge into a couple key no artist had; the lower of their ids carries on
    con = db_with({'c:x': 12, 'c:y': 5}, {'c:x': 12, 'c:y': 5})
    assert stable_ids(con, {'c:x': 'c:z', 'c:y': 'c:z'}) == {'c:z': 5}


def test_returning_artist_gets_its_old_id_back():
    con = db_with({}, {}, issued={'p:a': 4})
    assert stable_ids(con, {'p:a': 'p:a'}) == {'p:a': 4}


ROW = {
    'id': 5,
    'title': 'Test Fest',
    'description_text': 'Full pass 80€ until 31.01\nDJ Neiken',
    'start_date': '2026-03-20 18:00:00',
    'end_date': '2026-03-22 18:00:00',
    'country': 'Norway',
}


def prices_answer(quote):
    tier = {
        'amount': 80,
        'currency': 'EUR',
        'fee': None,
        'alt': None,
        'from': None,
        'until': '01-31',
        'quantity': None,
        'door': False,
        'sold_out': False,
        'current': False,
        'quote': quote,
    }
    return json.dumps(
        {
            'batch': 'event-5',
            'events': [
                {
                    'event_id': 5,
                    'rule_quotes': [],
                    'passes': [
                        {
                            'kind': 'full',
                            'style': None,
                            'label_quote': None,
                            'group_size': 1,
                            'days': None,
                            'includes_hotel': False,
                            'tiers': [tier],
                        }
                    ],
                }
            ],
        }
    )


class Ctx:
    """messages.stream() is used as a context manager that hands back the final message."""

    def __init__(self, reply):
        self.reply = reply

    def __enter__(self):
        return SimpleNamespace(get_final_message=lambda: self.reply)

    def __exit__(self, *a):
        return False


def fake(*texts):
    """A client whose replies are these texts, in turn; client.calls keeps what each request sent."""
    texts, client = list(texts), SimpleNamespace(calls=[])

    def stream(**kw):
        client.calls.append(kw)
        return Ctx(
            SimpleNamespace(
                stop_reason='end_turn',
                _request_id='req',
                content=[SimpleNamespace(type='text', text=texts.pop(0))],
                usage=SimpleNamespace(input_tokens=10, output_tokens=5),
            )
        )

    client.messages = SimpleNamespace(stream=stream)
    return client


def test_answer_retried_once_with_the_checkers_lines():
    client = fake(prices_answer('Full pass 90€'), prices_answer('Full pass 80€ until 31.01'))
    out = ask.ask(client, 'prices', ROW)
    assert out['events'][0]['passes'][0]['tiers'][0]['amount'] == 80
    retry = client.calls[1]['messages'][-1]['content']
    assert 'verbatim' in retry and 'Full pass 90€' in retry


def test_two_failures_leave_the_festival_unanswered():
    client = fake(prices_answer('Full pass 90€'), prices_answer('Full pass 85€'))
    assert ask.ask(client, 'prices', ROW) is None


@pytest.mark.parametrize('name', [*prompt.PASSES, 'first_read'])
def test_schema_sent_without_constraints_structured_outputs_reject(name):
    text = json.dumps(prompt.current(name).sent_schema)
    for word in ('minLength', 'maxLength', 'minimum', 'oneOf', 'pattern', '$schema', '$ref', '$defs'):
        assert word not in text


def test_a_prompt_is_known_by_the_hash_of_its_text_and_both_schemas():
    base = prompt.current('prices')
    assert Prompt(base.system, base.schema).hash == base.hash  # hashing twice: one hash
    assert Prompt(base.system + ' ', base.schema).hash != base.hash  # a template edited
    schema = copy.deepcopy(base.schema)
    schema['$defs']['pass_kind']['enum'].append('festival')
    assert Prompt(base.system, schema).hash != base.hash  # a state added to a schema's enum
    checked = copy.deepcopy(base.schema)
    checked['properties']['batch']['maxLength'] = 99
    assert api_schema(checked) == base.sent_schema and Prompt(base.system, checked).hash != base.hash  # checker only


def test_a_criterion_edited_changes_the_prompts_it_is_in():
    names = [*prompt.PASSES, 'first_read']
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


def test_an_answer_saved_archives_its_prompt_first(tmp_path, monkeypatch):
    monkeypatch.setattr(answers, 'ANSWERS', tmp_path)
    monkeypatch.setattr(answers, 'LOG', tmp_path / 'log.csv')
    (tmp_path / 'log.csv').write_text(','.join(answers.LOG_FIELDS) + '\n')
    p = prompt.current('prices')
    archived = prompt.ASKED / f'{p.hash}.md'
    archived.unlink(missing_ok=True)
    answers.save('prices', 5, json.loads(prices_answer('Full pass 80€ until 31.01')), 'm', p, 'test')
    assert archived.read_text(encoding='utf-8') == p.text
    assert answers.log()['prices/event-5.json']['prompt'] == p.hash


def test_an_archive_cut_short_is_written_again():
    p = prompt.current('prices')
    archived = p.archive()
    archived.write_text(p.text[:100], encoding='utf-8')
    p.archive()
    assert archived.read_text(encoding='utf-8') == p.text and not list(prompt.ASKED.glob('*.part'))


def test_the_system_text_sent_is_the_prompts():
    client = fake(prices_answer('Full pass 80€ until 31.01'))
    ask.ask(client, 'prices', ROW)
    assert client.calls[0]['system'] == prompt.current('prices').system


def test_every_prompt_the_answers_and_reads_name_is_archived():
    from pipeline import tickets

    named = {r['prompt'] for r in answers.log().values()}
    named |= {json.loads(p.read_text())['prompt'] for p in tickets.READS.glob('*.json')}
    for h in named:  # each archived text hashes to its name
        assert hashlib.sha256(prompt.asked(h).encode()).hexdigest()[:16] == h


def test_a_template_with_a_marker_left_fails():
    with pytest.raises(ValueError, match='unfilled'):
        states.fill('{{states:pass_kind}}\nand {{states:pass_kind}} inline', 'x.md')
    with pytest.raises(KeyError):
        states.fill('{{states:no_such_point}}', 'x.md')


def test_requests_stop_once_the_months_budget_is_spent(tmp_path):
    from pipeline import spend

    spend.record('prices', 'claude-opus-5-5', 1_000_000, 5_000_000)  # $104, about €93
    client = fake(prices_answer('Full pass 80€ until 31.01'))
    assert ask.ask(client, 'prices', ROW) is not None
    spend.record('prices', 'claude-opus-5-5', 0, 1_000_000)  # $20 more: over €100
    with pytest.raises(spend.BudgetSpent):
        ask.ask(client, 'prices', ROW)
    assert len(client.calls) == 1


def test_a_model_with_no_price_is_never_asked(monkeypatch):
    client = fake(prices_answer('Full pass 80€ until 31.01'))
    monkeypatch.setattr(ask, 'MODEL', 'claude-unpriced')
    with pytest.raises(KeyError, match='claude-unpriced'):
        ask.ask(client, 'prices', ROW)
    assert client.calls == []


def test_a_request_costs_its_models_prices():
    from pipeline import spend

    assert spend.usd('claude-haiku-5-5', 100_000, 100_000) == 0.06
    assert spend.usd('claude-haiku-5-5', 200_000, 0) == 0.10  # a long prompt costs Haiku more
    assert spend.usd('claude-sonnet-5-5', 1_000, 1_000) == 0.012


def test_only_the_named_festivals_are_asked(monkeypatch):
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript(
        'create table events (id integer, description_text text, end_date text);'
        "insert into events values (1, 'a', '2099-01-01'), (2, 'b', '2099-01-01'), (3, null, '2099-01-01');"
        'create table pending_extraction (event_id integer);'
    )
    monkeypatch.setattr(ask.answers, 'latest', lambda pass_name, ids: {})
    assert {r['id'] for r, _ in ask.due(db, ['prices'])[0]} == {1, 2}
    assert {r['id'] for r, _ in ask.due(db, ['prices'], {2})[0]} == {2}
    with pytest.raises(SystemExit, match=r'\[3\]'):
        ask.due(db, ['prices'], {2, 3})  # no description: nothing to ask it


def test_an_answer_to_an_older_prompt_is_asked_again_and_left_out_until_then(monkeypatch):
    from pipeline.extract import load_extract

    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript(
        'create table events (id integer, description_text text, end_date text);'
        "insert into events values (1, 'a', '2020-01-01'), (2, 'b', '2099-01-01');"
        'create table pending_extraction (event_id integer);'
    )
    have = {1: SimpleNamespace(prompt='0' * 16), 2: SimpleNamespace(prompt=prompt.current('prices').hash)}
    monkeypatch.setattr(ask.answers, 'latest', lambda pass_name, ids: have)
    assert [r['id'] for r, _ in ask.due(db, ['prices'])[0]] == [1]  # past or not
    assert load_extract.current('prices', {1, 2}) == ({2: have[2]}, 1)


NOW = SimpleNamespace(prompt=prompt.current('prices').hash)
ANSWER_CASES = [
    ((None, False), AnswerState.NONE),
    ((None, True), AnswerState.NONE),
    ((SimpleNamespace(prompt='0' * 16), False), AnswerState.STALE),
    ((NOW, True), AnswerState.STALE),
    ((NOW, False), AnswerState.CURRENT),
]


@pytest.mark.parametrize('args, state', ANSWER_CASES)
def test_every_state_of_an_answer_that_due_tells_apart(args, state):
    assert ask.answer_state('prices', *args) == state


def test_the_answer_states_tested_are_all_of_them():
    assert {s for _, s in ANSWER_CASES} == set(AnswerState)


def test_a_festival_stays_pending_until_every_pass_is_answered():
    every = set(prompt.PASSES)
    assert ask.settled({1: {'prices'}, 2: every, 4: every}, {1, 2, 3}) == [2]


@pytest.mark.parametrize('text, ids', [('16909,18806', {16909, 18806}), ('16909, 18806,', {16909, 18806}), ('x', None)])
def test_festival_ids_are_read_from_commas(text, ids):
    import argparse

    from pipeline import db

    if ids is None:
        with pytest.raises(argparse.ArgumentTypeError):
            db.festival_ids(text)
    else:
        assert db.festival_ids(text) == ids


def test_a_description_answer_gives_a_style_only_at_a_festival_of_several():
    answer = json.loads(prices_answer('Full pass 80€ until 31.01'))
    answer['events'][0]['passes'][0]['style'] = 'kizomba'
    client = fake(json.dumps(answer), json.dumps(answer))
    assert ask.ask(client, 'prices', ROW, ['kizomba']) is None
    assert 'one style only' in str(client.calls[1]['messages'])
    assert ask.ask(fake(json.dumps(answer)), 'prices', ROW, ['bachata', 'kizomba']) is not None


def test_the_run_log_writes_inside_the_callers_transaction():
    from pipeline.extract import run_log

    con = sqlite3.connect(':memory:')
    con.execute('BEGIN')
    run_log.record(con, 'step', 'what', 'test', details={'n': 1})
    assert con.in_transaction
    assert {n for (n,) in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")} == {
        'prompts',
        'table_docs',
        'pipeline_steps',
    }
    con.rollback()
    assert con.execute('SELECT count(*) FROM sqlite_master').fetchone()[0] == 0


def test_a_load_a_check_refuses_leaves_the_database_as_it_was(monkeypatch):
    from pipeline.extract import load_extract

    con = sqlite3.connect(':memory:')
    con.execute('CREATE TABLE event_passes (kept INTEGER)')
    con.commit()
    con.executescript(load_extract.SCHEMA)
    with pytest.raises(sqlite3.IntegrityError):
        con.execute("INSERT INTO event_genres (event_id, genre, source) VALUES (1, 'tango', 'site_tag')")
    con.rollback()
    assert [r[1] for r in con.execute('PRAGMA table_info(event_passes)')] == ['kept']


def loaded():
    """An empty source database with load_extract's tables, inside the load's transaction."""
    from pipeline.extract import load_extract

    con = sqlite3.connect(':memory:')
    con.executescript(
        'CREATE TABLE events (id INTEGER PRIMARY KEY, start_date TEXT, modified_at TEXT);'
        "INSERT INTO events VALUES (5, '2026-03-20 18:00:00', '2026-01-01 10:00:00'), (6, '2026-04-01', '2026-01-01');"
    )
    con.executescript(load_extract.SCHEMA)
    return con


@pytest.mark.parametrize(
    'sql',
    [
        "INSERT INTO price_status VALUES (5, 'priced', NULL, NULL)",  # priced, with no pass to price
        "INSERT INTO price_status VALUES (5, 'not_looked', NULL, 1)",  # a pass priced, said unpriced
        "INSERT INTO price_status VALUES (5, 'soon', NULL, NULL)",
        "INSERT INTO pass_tiers VALUES (5, 1, 1, 80, 'EUR', NULL, 2000, NULL, NULL, NULL, NULL, NULL, 0, 0, 0, 'q')",  # half a pair
        "INSERT INTO event_genres (event_id, genre, source, prompt, rule) VALUES (5, 'zouk', 'description', 'h', 'title')",
        "INSERT INTO event_genres (event_id, genre, source) VALUES (5, 'zouk', 'description')",  # from nothing
        "INSERT INTO event_genres (event_id, genre, source, rule) VALUES (5, 'zouk', 'site_tag', 'title')",
    ],
)
def test_a_row_outside_the_table_or_its_rules_is_refused_when_written(sql):
    with pytest.raises(sqlite3.IntegrityError):
        loaded().execute(sql)


def test_a_festival_is_priced_exactly_when_it_has_the_pass_a_card_prices():
    from pipeline.extract import load_extract

    con = loaded()
    full = json.loads(prices_answer('Full pass 80€ until 31.01'))['events'][0]
    party = copy.deepcopy(full)
    party['event_id'], party['passes'][0]['kind'] = 6, 'party'
    described = {e['event_id']: answers.Answer(e, 'h', 'b', 'f', 'm', 't', 'x') for e in (full, party)}
    load_extract.load_prices(con, described, {}, {6: (states.Sales.SHOP, 'https://shop.example/6')})
    assert con.execute('SELECT event_id, price, page, card_pass FROM price_status ORDER BY event_id').fetchall() == [
        (5, 'priced', None, 1),
        (6, 'other_passes_only', 'https://shop.example/6', None),
    ]
