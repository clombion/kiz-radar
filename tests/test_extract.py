"""The extraction step: price checks and dates, stable artist ids, and asking Claude with one retry."""
import json, sqlite3, sys, threading
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / 'pipeline' / 'extract'))
import ask, prices
from resolve_artists import stable_ids


@pytest.mark.parametrize('quote, amount', [
    ('⭐ Early Bird Pass – 130€ (50 or till May 1st)', 130),
    ('one package which costs EUR 1.800 and includes', 1800),
    ('Single room: €1,800 (deposit €200)', 1800),
    ('🇳🇴 Norway – 5 900 NOK', 5900),
    ('$8.50 EVENTBRITE PROCESSING FEE', 8.5),
    ('Breakfast €9,50', 9.5),
])
def test_amount_found_in_quote(quote, amount):
    assert amount in prices.numbers_in(quote)


def test_amount_missing_from_quote_is_a_problem():
    tier = dict(amount=150, currency='EUR', alt_amount=None, alt_currency=None, quote='Full Pass – 180€ (Till Festival)')
    out = {'events': [{'event_id': 1, 'passes': [{'tiers': [tier]}]}]}
    assert prices.problems(out)[0].startswith('amounts: event 1: passes[0].tiers[0].amount 150')


@pytest.mark.parametrize('answer, start, expected', [
    ('01-31', '2026-03-20', '2026-01-31'),        # before the festival in its own year
    ('04-30', '2026-03-20', '2025-04-30'),        # a list that started the spring before
    ('12-31', '2026-01-02', '2025-12-31'),
    ('03-20', '2026-03-20 18:00:00', '2026-03-20'),
    ('2027-02-01', '2026-03-20', '2027-02-01'),   # a written year is kept
    (None, '2026-03-20', None),
])
def test_dates_without_a_year_fall_before_the_festival(answer, start, expected):
    assert prices.on_date(answer, start) == expected


def test_impossible_date_is_a_problem():
    tier = dict(amount=1, currency='EUR', alt_amount=None, alt_currency=None, quote='1€', **{'from': '02-30', 'until': None})
    assert any(p.startswith('dates:') for p in prices.problems({'events': [{'event_id': 1, 'passes': [{'tiers': [tier]}]}]}))


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


ROW = {'id': 5, 'title': 'Test Fest', 'description_text': 'Full pass 80€ until 31.01\nDJ Neiken', 'start_date': '2026-03-20 18:00:00',
       'end_date': '2026-03-22 18:00:00', 'country': 'Norway'}


def prices_answer(quote):
    tier = {'amount': 80, 'currency': 'EUR', 'alt_amount': None, 'alt_currency': None, 'from': None, 'until': '01-31',
            'quantity': None, 'door': False, 'sold_out': False, 'current': False, 'quote': quote}
    return json.dumps({'batch': 'event-5', 'prompt_version': 'prices-v1', 'events': [
        {'event_id': 5, 'notes': None, 'passes': [{'kind': 'full', 'label_quote': None, 'group_size': 1, 'days': None,
                                                     'includes_hotel': False, 'tiers': [tier]}]}]})


class Ctx:
    """messages.stream() is used as a context manager that hands back the final message."""
    def __init__(self, reply): self.reply = reply
    def __enter__(self): return SimpleNamespace(get_final_message=lambda: self.reply)
    def __exit__(self, *a): return False


def fake(*texts):
    """A client whose replies are these texts, in turn; client.calls keeps what each request sent."""
    texts, client = list(texts), SimpleNamespace(calls=[])
    def stream(**kw):
        client.calls.append(kw)
        return Ctx(SimpleNamespace(stop_reason='end_turn', _request_id='req', content=[SimpleNamespace(type='text', text=texts.pop(0))],
                                   usage=SimpleNamespace(input_tokens=10, output_tokens=5)))
    client.messages = SimpleNamespace(stream=stream)
    return client


def test_answer_retried_once_with_the_checkers_lines():
    client = fake(prices_answer('Full pass 90€'), prices_answer('Full pass 80€ until 31.01'))
    out = ask.ask(client, 'prices', ROW, {'input': 0, 'output': 0}, threading.Lock())
    assert out['events'][0]['passes'][0]['tiers'][0]['amount'] == 80
    retry = client.calls[1]['messages'][-1]['content']
    assert 'verbatim' in retry and 'Full pass 90€' in retry


def test_two_failures_leave_the_festival_unanswered():
    client = fake(prices_answer('Full pass 90€'), prices_answer('Full pass 85€'))
    assert ask.ask(client, 'prices', ROW, {'input': 0, 'output': 0}, threading.Lock()) is None


def test_schema_sent_without_constraints_structured_outputs_reject():
    schema = ask.api_schema(json.loads((Path(ask.HERE) / 'schemas' / 'rooms_genres.json').read_text()))
    text = json.dumps(schema)
    for word in ('minLength', 'maxLength', 'minimum', 'oneOf', 'pattern', '$schema'):
        assert word not in text
