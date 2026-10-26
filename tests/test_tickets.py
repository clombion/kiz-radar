"""Ticket-page prices: rows to passes by key, the first read's checks, recording, changes, re-reads and agreement."""
import copy, json

import pytest

from pipeline import tickets
from pipeline.tickets import Recheck, Status

AT = '2026-10-01T05:00:00+00:00'


def row(key, name, amount, sold_out=False, alt=None):
    price = f'€{amount:.2f}'
    return {'key': key, 'name': name, 'price': price, 'amount': amount, 'currency': 'EUR', 'sold_out': sold_out,
            'alt_amount': alt, 'alt_currency': 'CZK' if alt else None, 'alt_price': f'{alt} CZK' if alt else None}


def entry(rows, at=AT, page='https://my.weezevent.com/x'):
    return {'at': at, 'page': page, 'recipe': 'weezevent@0123abcd', 'url': page, 'http': 200, 'status': Status.READ,
            'rows': rows}


def refused(at):
    return {'at': at, 'page': 'https://my.weezevent.com/x', 'recipe': 'weezevent@0123abcd', 'status': Status.REFUSED,
            'why': 'HTTP 429'}


ROWS = [row('1', 'Fullpass Male 100€', 102.56, sold_out=True), row('2', 'Fullpass Female 100€', 102.56, sold_out=True),
        row('3', 'Fullpass Male 120€', 123.08), row('4', 'Fullpass Female 120€', 123.08),
        row('5', 'Bootcamp FOUNDATION', 56.41)]


def tier(*keys, until=None, quantity=None, quote=None):
    return {'keys': list(keys), 'from': None, 'until': until, 'quantity': quantity, 'door': False, 'date_quote': quote}


def read(passes=None, skipped=('5',), description='Prices rise on 1 December.', rule_quotes=()):
    return {'event_id': 7, 'title': 'Fest', 'read_by': 'agent', 'prompt_version': 'first-read-v1', 'rows_at': AT,
            'description': description,
            'passes': passes or [{'kind': 'full', 'label_quote': 'Fullpass', 'group_size': 1, 'days': None,
                                  'includes_hotel': False, 'tiers': [tier('1', '2'), tier('3', '4')]}],
            'skipped': list(skipped), 'rule_quotes': list(rule_quotes)}


def test_rows_become_passes_by_key():
    answer, unread, found = tickets.build(read(), entry(ROWS))
    tiers = answer['events'][0]['passes'][0]['tiers']
    assert found == [] and unread == []
    assert [(t['amount'], t['sold_out']) for t in tiers] == [(102.56, True), (123.08, False)]
    assert tiers[1]['quote'] == 'Fullpass Male 120€ €123.08'


def test_a_tier_is_sold_out_only_when_all_its_tickets_are():
    rows = copy.deepcopy(ROWS)
    rows[3]['sold_out'] = True
    assert tickets.build(read(), entry(rows))[0]['events'][0]['passes'][0]['tiers'][1]['sold_out'] is False


def test_unread_tickets_are_counted_and_kept_out():
    rows = ROWS + [row('6', 'Fullpass Male 140€', 143.59)]
    answer, unread, found = tickets.build(read(), entry(rows))
    assert unread == ['6'] and found == []
    assert all(t['amount'] != 143.59 for t in answer['events'][0]['passes'][0]['tiers'])


def test_a_tier_whose_tickets_are_gone_is_left_out():
    answer, _, _ = tickets.build(read(), entry(ROWS[2:]))
    assert [t['amount'] for t in answer['events'][0]['passes'][0]['tiers']] == [123.08]


def test_tickets_of_one_tier_that_now_differ_in_price_need_a_new_first_read():
    rows = copy.deepcopy(ROWS)
    rows[3] |= {'amount': 128.21, 'price': '€128.21'}
    assert 'the first read needs doing again' in tickets.build(read(), entry(rows))[2][0]


def test_amounts_are_checked_against_their_quotes():
    rows = copy.deepcopy(ROWS)
    rows[2]['price'] = 'see below'
    assert any(p.startswith('amounts:') for p in tickets.build(read(), entry(rows))[2])


def test_first_read_maps_every_ticket_once():
    fr = read(skipped=())
    assert tickets.read_problems(fr, [entry(ROWS)]) == ['key 5 (Bootcamp FOUNDATION €56.41): neither in a tier nor skipped']
    fr = read(skipped=('5', '3'))
    assert 'key 3: in the read twice' in tickets.read_problems(fr, [entry(ROWS)])
    fr = read(skipped=('5', '9'))
    assert 'key 9: not on the page' in tickets.read_problems(fr, [entry(ROWS)])


def test_first_read_needs_the_logged_read_it_names():
    assert 'is no read' in tickets.read_problems(read(), [entry(ROWS, at='2026-10-02T00:00:00+00:00')])[0]


@pytest.mark.parametrize('quote, ok', [('Prices rise on 1 December', True), ('Fullpass Male 120€', True),
                                       ('Prices rise on 2 December', False)])
def test_date_quotes_come_from_the_description_or_the_tiers_tickets(quote, ok):
    fr = read()
    fr['passes'][0]['tiers'][1] = tier('3', '4', until='11-30', quote=quote)
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


@pytest.mark.parametrize('until, quote', [('11-30', None), (None, 'Prices rise on 1 December')])
def test_a_date_quote_goes_with_a_date_and_only_with_one(until, quote):
    fr = read()
    fr['passes'][0]['tiers'][1] = tier('3', '4', until=until, quote=quote)
    assert tickets.read_problems(fr, [entry(ROWS)])[0].startswith('schema: passes/0/tiers/1/date_quote')


def test_price_notes_come_from_the_description_only():
    assert tickets.read_problems(read(rule_quotes=['Prices rise on 1 December']), [entry(ROWS)]) == []
    assert tickets.read_problems(read(rule_quotes=['Fullpass Male 120€']), [entry(ROWS)]) != []


@pytest.fixture
def files(tmp_path, monkeypatch):
    for name in ('READS', 'DRAFTS', 'LOG', 'DISPUTED'):
        monkeypatch.setattr(tickets, name, tmp_path / name.lower())
    monkeypatch.setattr(tickets, 'PRICES_CSV', tmp_path / 'pass_prices.csv')
    monkeypatch.setattr(tickets, 'PAGES_CSV', tmp_path / 'ticket_pages.csv')
    monkeypatch.setattr(tickets, 'FOUND_CSV', tmp_path / 'pages.csv')
    monkeypatch.setattr(tickets, 'WAITING_CSV', tmp_path / 'waiting.csv')
    tickets.save_read(read())
    tickets.append(7, entry(ROWS))
    return tmp_path


def test_recording_twice_writes_the_same_files(files):
    assert tickets.record(7, quiet=True) == []
    before = [(files / f).read_bytes() for f in ('pass_prices.csv', 'ticket_pages.csv')]
    assert tickets.record(7, quiet=True) == []
    assert [(files / f).read_bytes() for f in ('pass_prices.csv', 'ticket_pages.csv')] == before


def test_an_unchanged_page_changes_only_the_read_date(files):
    tickets.record(7, quiet=True)
    prices_before, pages_before = [(files / f).read_text() for f in ('pass_prices.csv', 'ticket_pages.csv')]
    tickets.append(7, entry(ROWS, at='2026-11-03T05:00:00+00:00'))
    tickets.record(7, quiet=True)
    assert (files / 'pass_prices.csv').read_text() == prices_before
    assert (files / 'ticket_pages.csv').read_text() == pages_before.replace('2026-10-01', '2026-11-03')


def test_a_failed_read_keeps_the_last_prices(files):
    tickets.record(7, quiet=True)
    before = (files / 'ticket_pages.csv').read_text()
    tickets.append(7, refused('2026-11-03T05:00:00+00:00'))
    tickets.record(7, quiet=True)
    assert (files / 'ticket_pages.csv').read_text() == before


def test_changes_between_reads():
    later = copy.deepcopy(ROWS[1:]) + [row('6', 'Fullpass Male 140€', 143.59)]
    later[2]['sold_out'] = True
    later[3] |= {'amount': 60.0, 'price': '€60.00'}
    got = [text for _, text in tickets.changes([entry(ROWS), entry(later, at='2026-11-03T00:00:00+00:00')])]
    assert got == ['new: Fullpass Male 140€ €143.59', 'gone: Fullpass Male 100€ €102.56',
                   'sold out: Fullpass Female 120€ €123.08', 'price: Bootcamp FOUNDATION €56.41 → €60.00']
    assert tickets.changes([entry(ROWS), entry(ROWS, at='2026-11-03T00:00:00+00:00')]) == []


def csv_tier(until='', quantity='', sold_out='0'):
    return {'until': until, 'quantity': quantity, 'sold_out': sold_out}


@pytest.mark.parametrize('tiers, today, expected', [
    ([csv_tier('11-30'), csv_tier('2026-12-31'), csv_tier(sold_out='1')], '2026-11-15', (Recheck.DATED, False)),
    ([csv_tier('11-30'), csv_tier('12-31')], '2027-01-01', (Recheck.DATED, True)),
    ([csv_tier('11-30', quantity='50'), csv_tier('12-31')], '2026-11-15', (Recheck.MONTHLY, True)),
    ([csv_tier('11-30'), csv_tier()], '2026-11-15', (Recheck.MONTHLY, True)),
    ([csv_tier(), csv_tier(sold_out='1')], '2026-11-15', (Recheck.MONTHLY, True)),
    ([csv_tier('11-30', sold_out='1')], '2026-11-15', (Recheck.MONTHLY, True)),
])
def test_recheck_classes(tiers, today, expected):
    assert tickets.recheck(tiers, '2027-02-05', today)[:2] == expected


def test_failures_count_back_to_the_last_read():
    assert tickets.failures([entry(ROWS), refused('b'), refused('c')]) == 2
    assert tickets.failures([refused('a'), entry(ROWS)]) == 0


def test_two_reads_agree_on_meaning_not_on_wording():
    a, b = read(), read()
    b['passes'][0]['label_quote'] = 'Fullpass Male'
    b['passes'][0]['tiers'][0]['keys'] = ['2', '1']
    assert tickets.meaning(a) == tickets.meaning(b)


@pytest.mark.parametrize('change', [
    lambda r: r['passes'][0].update(kind='party'),
    lambda r: r.update(skipped=[]) or r['passes'][0]['tiers'].append(tier('5')),
    lambda r: r['passes'][0]['tiers'][1].update(until='11-30'),
])
def test_two_reads_disagree_on_a_pass_a_skip_or_a_date(change):
    b = read()
    change(b)
    assert tickets.meaning(read()) != tickets.meaning(b)


@pytest.mark.parametrize('text, number', [('3,125.00', 3125), ('1.800,00', 1800), ('81.03', 81.03), ('1 800', 1800),
                                          ('1.800', 1800), ('9,5', 9.5), ('free', None)])
def test_numbers_as_sites_write_them(text, number):
    assert tickets.number(text) == number


RAW = {'key': '1', 'name': 'Fullpass', 'price': '€81.03', 'amount': '81.03', 'currency': '€', 'alt_price': None,
       'alt_amount': None, 'alt_currency': None, 'sold_out': None}
RECIPE = {'widget': None, 'symbols': {'€': 'EUR'}}


def attempt_with(monkeypatch, raw=None, error=None):
    """attempt() on a page whose recipe finds these rows, or fails with this error."""
    from pipeline import read_page
    def rows(url, recipe, visible):
        if error:
            raise error
        return 200, 'Tickets', raw
    monkeypatch.setattr(read_page, 'rows', rows)
    return tickets.attempt('https://my.weezevent.com/x', RECIPE, 'weezevent@0123abcd')


@pytest.mark.parametrize('change, why', [
    ({'amount': None}, 'amount'),
    ({'currency': '$'}, 'currency'),
    ({'alt_amount': '3,125.00', 'alt_currency': 'CZK'}, 'alt'),
])
def test_a_row_the_recipe_reads_wrong_breaks_the_layout(monkeypatch, change, why):
    got = attempt_with(monkeypatch, [RAW | change])
    assert got['status'] == Status.LAYOUT_BROKEN and why in got['why'] or 'is not valid' in got['why']


def test_two_rows_with_one_key_break_the_layout(monkeypatch):
    got = attempt_with(monkeypatch, [RAW, RAW | {'name': 'Partypass'}])
    assert got['status'] == Status.LAYOUT_BROKEN and 'two rows with key 1' in got['why']


def test_a_recipe_failing_on_the_page_breaks_the_layout_and_a_page_that_wont_load_is_refused(monkeypatch):
    from pipeline import read_page
    from patchright.sync_api import Error
    assert attempt_with(monkeypatch, error=read_page.RecipeError('bad selector'))['status'] == Status.LAYOUT_BROKEN
    assert attempt_with(monkeypatch, error=Error('net::ERR_CONNECTION_RESET'))['status'] == Status.REFUSED


def test_a_good_row_is_read_with_its_currency_code(monkeypatch):
    got = attempt_with(monkeypatch, [RAW])
    assert got['status'] == Status.READ and got['rows'][0]['currency'] == 'EUR'


def test_the_log_holds_only_entries_of_its_schema(files):
    with pytest.raises(ValueError):
        tickets.append(7, entry([{k: v for k, v in ROWS[0].items() if k != 'alt_price'}]))
    with pytest.raises(ValueError):
        tickets.append(7, refused(AT) | {'rows': ROWS})
    (files / 'log' / '7.jsonl').write_text('{"at": "x"}\n')
    with pytest.raises(SystemExit):
        tickets.log(7)


def test_a_log_line_edited_in_place_and_merged_back_is_caught(files):
    edited = entry(ROWS) | {'http': 304}
    with (files / 'log' / '7.jsonl').open('a') as f:
        f.write(json.dumps(edited) + '\n')
    with pytest.raises(SystemExit, match='two entries at'):
        tickets.log(7)


def test_a_new_ticket_page_needs_a_new_first_read(files):
    tickets.append(7, entry(ROWS, at='2026-11-03T05:00:00+00:00', page='https://my.weezevent.com/y'))
    assert 'the ticket page changed' in tickets.record(7, quiet=True)[0]


def test_a_draft_becomes_the_first_read_once_it_passes(files):
    tickets.save_read(read(skipped=()), draft=True)
    assert tickets.record(7, quiet=True) != [] and (files / 'drafts' / '7.json').exists()
    assert tickets.first_read(7)['skipped'] == ['5']             # the failing draft is not the first read
    tickets.save_read(read(), draft=True)
    assert tickets.record(7, quiet=True) == [] and not (files / 'drafts' / '7.json').exists()
    assert tickets.first_read(7) == read()


def test_recipes_are_checked_against_their_schema(tmp_path, monkeypatch):
    assert tickets.sites()
    monkeypatch.setattr(tickets, 'SITES', tmp_path)
    (tmp_path / 'x.json').write_text(json.dumps({'site': 'x'}))
    with pytest.raises(SystemExit):
        tickets.sites()


def test_model_schema_is_accepted_by_structured_outputs():
    from pipeline.extract import ask
    text = json.dumps(ask.api_schema(tickets.model_schema()))
    for word in ('minLength', 'maxLength', 'minimum', 'oneOf', 'pattern', '$schema'):
        assert word not in text


def client(*replies):
    """A client answering each request with the next reply, as structured output."""
    from types import SimpleNamespace
    replies = list(replies)
    class Ctx:
        def __enter__(self):
            text = json.dumps(replies.pop(0))
            return SimpleNamespace(get_final_message=lambda: SimpleNamespace(
                stop_reason='end_turn', content=[SimpleNamespace(type='text', text=text)]))
        def __exit__(self, *a): return False
    return SimpleNamespace(messages=SimpleNamespace(stream=lambda **kw: Ctx()))


FEST = {'id': 7, 'title': 'Fest', 'start_date': '2027-02-05', 'end_date': '2027-02-07', 'country': 'Germany',
        'description_text': 'Prices rise on 1 December.', 'page': 'https://my.weezevent.com/x'}
ANSWER = {k: read()[k] for k in ('passes', 'skipped', 'rule_quotes')}


def test_two_models_that_agree_give_the_first_ones_read(files):
    other = copy.deepcopy(ANSWER)
    other['passes'][0]['label_quote'] = None
    fr = tickets.two_model_read(client(ANSWER, other), FEST, entry(ROWS), [entry(ROWS)])
    assert fr['passes'] == ANSWER['passes'] and fr['read_by'] == 'claude-opus-5-5 + claude-sonnet-5-5'
    assert not (files / 'disputed' / '7.json').exists()


def test_two_models_that_disagree_leave_both_for_an_agent(files):
    other = copy.deepcopy(ANSWER)
    other['passes'][0]['kind'] = 'party'
    assert tickets.two_model_read(client(ANSWER, other), FEST, entry(ROWS), [entry(ROWS)]) is None
    assert set(json.loads((files / 'disputed' / '7.json').read_text())['reads']) == set(tickets.MODELS)


def test_both_files_hold_what_the_reads_and_logs_say_and_nothing_else(files):
    (files / 'pass_prices.csv').write_text('event_id,stale\n9,1\n')
    assert tickets.record(7, quiet=True) == []
    assert {r['event_id'] for r in tickets.csv_rows(files / 'pass_prices.csv')} == {'7'}
    assert list(tickets.csv_rows(files / 'pass_prices.csv')[0]) == tickets.PRICE_FIELDS


def test_a_festival_that_no_longer_fits_its_first_read_is_left_out(files):
    tickets.record(7, quiet=True)
    rows = copy.deepcopy(ROWS)
    rows[3] |= {'amount': 128.21, 'price': '€128.21'}
    tickets.append(7, entry(rows, at='2026-11-03T05:00:00+00:00'))
    assert 'the first read needs doing again' in tickets.write_all()[0]
    assert tickets.csv_rows(files / 'ticket_pages.csv') == []



def festival(**k):
    """A festival as festivals() gives it, with no first read and no ticket page."""
    return {'id': 7, 'title': 'Fest', 'start_date': '2027-02-05', 'first_read': None, 'log': [], 'why': 'no price in the description',
            'disputed': False, 'found': None, 'page': None, 'site': None} | k


@pytest.mark.parametrize('f, expected', [
    (festival(), tickets.Waiting.PAGE),
    (festival(page='https://example.org/tickets'), tickets.Waiting.RECIPE),
    (festival(page='https://my.weezevent.com/x', site=('r', 'v')), None),
    (festival(found={'page': '', 'note': 'by message only'}), tickets.Waiting.NONE_ONLINE),
    (festival(page='https://my.weezevent.com/x', site=('r', 'v'), disputed=True), tickets.Waiting.AGENT),
    (festival(why=None, first_read=read(), log=[refused('a'), refused('b'), refused('c')]), tickets.Waiting.SESSION),
    (festival(why=None, first_read=read(), log=[entry(ROWS)]), None),
])
def test_what_a_festival_waits_for(f, expected):
    assert tickets.waiting(f) == expected


def test_the_waiting_report_lists_every_waiting_festival(files):
    counts = tickets.write_waiting([festival(), festival(id=8, page='https://example.org/t'), festival(id=9, why=None)])
    assert [r['event_id'] for r in tickets.csv_rows(files / 'waiting.csv')] == ['7', '8']
    assert counts == {tickets.Waiting.PAGE: 1, tickets.Waiting.RECIPE: 1}


def test_a_found_page_is_recorded_once_and_a_cut_link_refused(files, monkeypatch):
    monkeypatch.setattr(tickets, 'one', lambda i: festival(id=i))
    tickets.cmd_page(7, 'https://example.org/t', False, 'its site', 'agent')
    tickets.cmd_page(7, None, True, 'by message only', 'agent')
    assert [(r['page'], r['note']) for r in tickets.csv_rows(files / 'pages.csv')] == [('', 'by message only')]
    with pytest.raises(SystemExit):
        tickets.cmd_page(7, 'https://example.org/t…', False, 'cut', 'agent')
