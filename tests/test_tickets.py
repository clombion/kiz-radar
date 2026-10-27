"""Ticket-page prices: rows to passes by key, the first read's checks, recording, changes, re-reads and agreement."""
import collections, copy, json

import pytest

from pipeline import tickets
from pipeline.tickets import Recheck, Status

AT = '2026-10-01T05:00:00+00:00'


def row(key, name, amount, sold_out=False, alt=None):
    price = f'€{amount:.2f}'
    return {'key': key, 'name': name, 'price': price, 'amount': amount, 'currency': 'EUR', 'fee': None, 'sold_out': sold_out,
            'alt_amount': alt, 'alt_currency': 'CZK' if alt else None, 'alt_price': f'{alt} CZK' if alt else None}


def entry(rows, at=AT, page='https://my.weezevent.com/x'):
    return {'at': at, 'page': page, 'recipe': 'weezevent@0123abcd', 'url': page, 'http': 200, 'status': Status.READ,
            'rows': rows}


def refused(at):
    return {'at': at, 'page': 'https://my.weezevent.com/x', 'recipe': 'weezevent@0123abcd', 'status': Status.REFUSED,
            'why': 'HTTP 429'}


ROWS = [row('1', 'Fullpass Male 100€', 102.56, sold_out=True), row('2', 'Fullpass Female 100€', 102.56, sold_out=True),
        row('3', 'Fullpass Male 120€', 123.08), row('4', 'Fullpass Female 120€', 123.08),
        row('5', 'Shuttle from the airport', 56.41)]


def tier(*keys, until=None, quantity=None, quote=None):
    return {'keys': list(keys), 'from': None, 'until': until, 'quantity': quantity, 'date_quote': quote}


def read(passes=None, skipped=('5',), description='Prices rise on 1 December.', rule_quotes=()):
    return {'event_id': 7, 'title': 'Fest', 'start_date': '2027-02-05', 'read_by': 'agent', 'prompt_version': tickets.PROMPT, 'styles': ['bachata', 'kizomba'],
            'rows_at': AT,
            'description': description,
            'passes': passes or [{'kind': 'full', 'style': None, 'label_quote': 'Fullpass', 'group_size': 1, 'days': None,
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
    assert tickets.read_problems(fr, [entry(ROWS)]) == ['key 5 (Shuttle from the airport €56.41): neither in a tier nor skipped']
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
                   'sold out: Fullpass Female 120€ €123.08', 'price: Shuttle from the airport €56.41 → €60.00']
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
    lambda r: r['passes'][0].update(style='kizomba'),
])
def test_two_reads_disagree_on_a_pass_a_skip_a_date_or_a_style(change):
    b = read()
    change(b)
    assert tickets.meaning(read()) != tickets.meaning(b)


@pytest.mark.parametrize('text, number', [('3,125.00', 3125), ('1.800,00', 1800), ('81.03', 81.03), ('1 800', 1800),
                                          ('1.800', 1800), ('9,5', 9.5), ('free', None)])
def test_numbers_as_sites_write_them(text, number):
    assert tickets.number(text) == number


RAW = {'key': '1', 'name': 'Fullpass', 'price': '€81.03', 'amount': '81.03', 'currency': '€', 'fee': None, 'alt_price': None,
       'alt_amount': None, 'alt_currency': None, 'sold_out': None}
RECIPE = {'widget': None, 'api': None, 'symbols': {'€': 'EUR'}}


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
                stop_reason='end_turn', content=[SimpleNamespace(type='text', text=text)],
                usage=SimpleNamespace(input_tokens=6000, output_tokens=2000)))
        def __exit__(self, *a): return False
    return SimpleNamespace(messages=SimpleNamespace(stream=lambda **kw: Ctx()))


FEST = {'id': 7, 'title': 'Fest', 'start_date': '2027-02-05', 'end_date': '2027-02-07', 'country': 'Germany',
        'description_text': 'Prices rise on 1 December.', 'page': 'https://my.weezevent.com/x', 'styles': ['bachata', 'kizomba']}
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
    (festival(found={'state': 'offline', 'page': '', 'note': 'by message only'}), tickets.Waiting.OFFLINE),
    (festival(found={'state': 'not_yet', 'page': '', 'note': 'TBA'}), tickets.Waiting.NOT_YET),
    (festival(found={'state': 'closed', 'page': '', 'note': 'registrations closed'}), tickets.Waiting.CLOSED),
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
    tickets.cmd_page(7, 'https://example.org/t', tickets.Sales.SHOP, 'its site', 'agent')
    tickets.cmd_page(7, None, tickets.Sales.OFFLINE, 'by message only', 'agent')
    assert [(r['state'], r['page'], r['note']) for r in tickets.csv_rows(files / 'pages.csv')] == [('offline', '', 'by message only')]
    with pytest.raises(SystemExit):
        tickets.cmd_page(7, 'https://example.org/t…', tickets.Sales.SHOP, 'cut', 'agent')


@pytest.mark.parametrize('url, state', [(None, 'shop'), ('https://example.org/t', 'offline'), ('https://example.org/t', 'closed')])
def test_only_a_shop_has_a_page(files, monkeypatch, url, state):
    monkeypatch.setattr(tickets, 'one', lambda i: festival(id=i))
    with pytest.raises(SystemExit):
        tickets.cmd_page(7, url, tickets.Sales(state), 'n', 'agent')


def test_sales_states_are_checked_when_read(files):
    (files / 'pages.csv').write_text('event_id,event,state,page,found_by,note\n7,Fest,offline,https://x.org,agent,n\n')
    with pytest.raises(SystemExit):
        tickets.found_pages()
    (files / 'pages.csv').write_text('event_id,event,state,page,found_by,note\n7,Fest,soon,,agent,n\n')
    with pytest.raises(SystemExit):
        tickets.found_pages()



def test_a_fee_the_site_adds_is_in_the_amount(monkeypatch):
    got = attempt_with(monkeypatch, [RAW | {'price': '€119.00 + €1.00 fee.', 'amount': '119.00', 'fee': '1.00'}])
    assert (got['rows'][0]['amount'], got['rows'][0]['fee']) == (120, 1)


def test_a_tier_keeps_its_fee_and_its_quote_shows_it():
    rows = [row('1', 'Fullpass', 120.0) | {'price': '€119.00 + €1.00 fee.', 'fee': 1.0}]
    fr = read(passes=[{'kind': 'full', 'style': None, 'label_quote': None, 'group_size': 1, 'days': None, 'includes_hotel': False,
                       'tiers': [tier('1')]}], skipped=())
    answer, _, found = tickets.build(fr, entry(rows))
    assert found == [] and answer['events'][0]['passes'][0]['tiers'][0]['fee'] == 1.0


@pytest.mark.parametrize('until, sold_out, ok', [('09-30', False, False), ('09-30', True, True), ('11-30', False, True)])
def test_a_ticket_on_sale_cant_have_a_price_that_ended(until, sold_out, ok):
    rows = copy.deepcopy(ROWS)
    rows[2]['sold_out'] = rows[3]['sold_out'] = sold_out
    fr = read(description='Until 30 September or 30 November.')
    fr['passes'][0]['tiers'][1] = tier('3', '4', until=until, quote='Until 30 September or 30 November')
    assert (tickets.read_problems(fr, [entry(rows)]) == []) == ok



def test_recipe_placeholders_name_fields_or_attributes():
    """The row reader fills {field} and {@attr} in css and match (its own pattern, taken from its script); any other
    name would leave the field empty on every page, and {3} must stay a regex count."""
    import re
    from pipeline.read_page import ROWS_JS
    pattern = re.search(r"t\.replace\(/(.+?)/g", ROWS_JS)[1].replace('\\\\', '\\')
    wrong = []
    for site, (recipe, _) in tickets.sites().items():
        for name, f in recipe['fields'].items():
            for text in (f or {}).get('css') or '', (f or {}).get('match') or '':
                wrong += [f'{site}.{name}: {{{at}{k}}}' for at, k in re.findall(pattern, text)
                          if not at and k not in recipe['fields']]
    assert wrong == []
    assert re.findall(pattern, '[A-Z]{3}') == [] and re.findall(pattern, '"{@value}" {name}') == [('@', 'value'), ('', 'name')]


TICKET = {'uuid': 'b4cb', 'name': {'text': 'Couples Party Pass'}, 'price': {'price': 185.0}, 'distributionFee': 6.75,
          'stockLeft': 0, 'available': False}


@pytest.mark.parametrize('field, value', [
    ({'json': 'name.text'}, 'Couples Party Pass'),
    ({'json': 'available'}, 'false'),
    ({'json': 'missing.path'}, None),
    ({'page': '"priceCurrency":"([A-Z]{3})"'}, 'EUR'),
    ({'text': '{price.price} + {distributionFee} fee'}, '185.0 + 6.75 fee'),
    ({'json': 'stockLeft', 'match': '^0$'}, '0'),
    (None, None),
])
def test_api_fields_read_a_ticket_and_its_page(field, value):
    assert tickets.api_value(field, TICKET, '<script>{"priceCurrency":"EUR"}</script>') == value


def test_a_recipe_reads_the_page_or_the_api_never_a_mix():
    from jsonschema import Draft202012Validator
    api = json.loads((tickets.SITES / 'goandance.json').read_text())
    page = json.loads((tickets.SITES / 'weeztix.json').read_text())
    valid = lambda r: not list(Draft202012Validator(tickets.SITE_SCHEMA).iter_errors(r))
    assert valid(api) and valid(page)
    assert not valid(api | {'row': '.ticket'})                        # an API recipe with page rows
    assert not valid(page | {'api': api['api']})                      # page rows and an API
    assert not valid(page | {'fields': api['fields'], 'row': page['row']})   # page rows read by api fields


def test_a_first_read_with_no_pass_is_refused():
    fr = read(passes=[], skipped=('1', '2', '3', '4', '5'))
    fr['passes'] = []
    assert any('passes' in p for p in tickets.read_problems(fr, [entry(ROWS)]))


def test_a_page_that_broke_its_recipe_waits_for_a_fix_with_or_without_a_first_read():
    broken = {'at': 'b', 'page': 'x', 'recipe': 'r', 'status': Status.LAYOUT_BROKEN, 'why': 'no ticket rows'}
    assert tickets.waiting(festival(page='https://my.weezevent.com/x', site=('r', 'v'), log=[broken])) == tickets.Waiting.RECIPE_FIX
    assert tickets.waiting(festival(why=None, first_read=read(), log=[entry(ROWS), broken])) == tickets.Waiting.RECIPE_FIX


def test_a_day_pass_is_one_day_whether_its_days_say_1_or_nothing():
    a, b = read(), read()
    for fr, days in ((a, None), (b, 1)):
        fr['passes'][0] |= {'kind': 'day', 'days': days}
    assert tickets.meaning(a) == tickets.meaning(b)


@pytest.mark.parametrize('url, address', [
    ('https://www.eventbrite.pt/e/tukina-lisboa-tickets-1977918538593', 'https://www.eventbrite.pt/checkout-external?eid=1977918538593'),
    ('https://www.eventbrite.ca/e/1986387397177?aff=oddtdtcreator', 'https://www.eventbrite.ca/checkout-external?eid=1986387397177'),
    ('https://www.eventbrite.pt/checkout-external?eid=1986728317880', 'https://www.eventbrite.pt/checkout-external?eid=1986728317880'),
])
def test_a_widget_builds_the_address_from_the_link(url, address, monkeypatch):
    from curl_cffi import requests
    monkeypatch.setattr(requests, 'get', lambda *a, **k: pytest.fail('an address pattern needs no request'))
    recipe = {'widget': {'in': 'address', 'pattern': '/e/[^?#]*?-?(\\d{10,})(?:[?#]|$)',
                         'address': 'https://{host}/checkout-external?eid={1}'}}
    assert tickets.widget(url, recipe) == address


def test_a_widget_found_in_the_page_keeps_an_address_that_is_already_its_own(monkeypatch):
    from curl_cffi import requests
    monkeypatch.setattr(requests, 'get', lambda *a, **k: pytest.fail('the address is already the widget'))
    recipe = {'widget': {'in': 'html', 'pattern': 'https://widget\\.weezevent\\.com/ticket/[A-Z0-9-]+/', 'address': '{0}?locale=en-GB'}}
    assert tickets.widget('https://widget.weezevent.com/ticket/E1/', recipe) == 'https://widget.weezevent.com/ticket/E1/'


@pytest.mark.parametrize('price, amount', [('Free', 0.0), ('Gratuit', 0.0), ('€81.03', None)])
def test_a_free_ticket_costs_0(price, amount):
    got = tickets.parsed(RAW | {'price': price, 'amount': None}, {'€': 'EUR'})
    assert got['amount'] == amount
    assert (tickets.problems(tickets.LOG_SCHEMA['$defs']['row'], got) == []) == (amount is not None)



def test_first_reads_count_against_the_budget(files):
    from pipeline import spend
    tickets.two_model_read(client(ANSWER, ANSWER), FEST, entry(ROWS), [entry(ROWS)])
    assert round(spend.month_usd(), 3) == round(spend.usd('claude-opus-5-5', 6000, 2000) + spend.usd('claude-sonnet-5-5', 6000, 2000), 3)


@pytest.mark.parametrize('version, style, ok', [
    (tickets.PROMPT, 'kizomba', True), (tickets.PROMPT, None, True), (tickets.PROMPT, ..., False),
    ('first-read-v2', ..., False),          # an older read: made again, never loaded
])
def test_a_first_read_names_each_pass_style_and_follows_the_current_prompt(version, style, ok):
    fr = read() | {'prompt_version': version}
    if style is ...:
        del fr['passes'][0]['style']
    else:
        fr['passes'][0]['style'] = style
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


def test_a_pass_keeps_its_style_in_pass_prices_csv(files):
    fr = read()
    fr['passes'][0]['style'] = 'kizomba'
    tickets.save_read(fr)
    assert tickets.record(7, quiet=True) == []
    assert {r['style'] for r in tickets.csv_rows(files / 'pass_prices.csv')} == {'kizomba'}


def test_a_first_read_made_for_an_older_prompt_is_made_again(files):
    old = read() | {'prompt_version': 'first-read-v2'}
    del old['passes'][0]['style']
    f = {'first_read': old, 'log': tickets.log(7), 'description_text': old['description']}
    assert tickets.why_first_read(f, '2026-11-01')[0] == f'the first read follows first-read-v2, not {tickets.PROMPT}'
    f['first_read'] = read()
    assert tickets.why_first_read(f, '2026-11-01')[0] is None


def test_a_run_for_named_festivals_reads_only_them(files, monkeypatch):
    import sqlite3
    fest = lambda i: {'id': i, 'first_read': None, 'why': 'no price in the description', 'site': ('recipe',),
                      'page': f'https://shop.example/{i}', 'disputed': False, 'log': [], 'tiers': [], 'start_date': '2027-02-05'}
    db = sqlite3.connect(':memory:')
    db.executescript('create table events (id integer); insert into events values (6), (7), (8);')
    monkeypatch.setattr(tickets, 'src_db', lambda: db)
    monkeypatch.setattr(tickets, 'festivals', lambda db, today, only=None: [] if only else [fest(7), fest(8)])
    monkeypatch.setattr(tickets, 'write_waiting', lambda fs: collections.Counter())
    read = []
    monkeypatch.setattr(tickets, 'attempt', lambda page, *site: read.append(page) or
                        {'at': AT, 'status': tickets.Status.REFUSED, 'why': 'HTTP 403', 'page': page})
    monkeypatch.setattr(tickets, 'append', lambda i, e: None)
    tickets.cmd_run({8, 6})                 # 6 is past: nothing to read there
    assert read == ['https://shop.example/8']
    with pytest.raises(SystemExit, match=r'\[9\]'):
        tickets.cmd_run({9})


def test_a_past_festivals_first_read_for_an_older_prompt_is_made_again_from_its_logged_rows(files, monkeypatch):
    import sqlite3
    old = read() | {'prompt_version': 'first-read-v2'}
    del old['passes'][0]['style']
    tickets.save_read(old)
    db = sqlite3.connect(':memory:')
    db.executescript('create table events (id integer); insert into events values (7);')
    past = FEST | {'first_read': old, 'log': tickets.log(7), 'disputed': False}
    monkeypatch.setattr(tickets, 'src_db', lambda: db)
    monkeypatch.setattr(tickets, 'festivals', lambda db, today, only=None: [past] if only == 7 else [])
    monkeypatch.setattr(tickets, 'write_waiting', lambda fs: collections.Counter())
    monkeypatch.setattr(tickets, 'attempt', lambda *a: pytest.fail('a past festival is not read again'))
    import anthropic
    monkeypatch.setattr(anthropic, 'Anthropic', lambda: client(ANSWER, ANSWER))
    tickets.cmd_run()
    assert tickets.first_read(7)['prompt_version'] == tickets.PROMPT


def test_passes_alike_in_every_field_load_back_as_the_passes_they_are(files, monkeypatch):
    from pipeline.extract import load_extract
    fr = read()
    one = fr['passes'][0]
    fr['passes'] = [one | {'tiers': [one['tiers'][0]]}, one | {'tiers': [one['tiers'][1]]}]
    tickets.save_read(fr)
    assert tickets.record(7, quiet=True) == []
    monkeypatch.setattr(load_extract, 'PAGE_PRICES', files / 'pass_prices.csv')
    monkeypatch.setattr(load_extract, 'TICKET_PAGES', files / 'ticket_pages.csv')
    entry_, _ = load_extract.page_prices({7})[7]
    assert [len(p['tiers']) for p in entry_['passes']] == [1, 1]


def test_kinds_styles_and_sales_states_are_stated_alike_everywhere():
    import re
    from pathlib import Path
    from pipeline.extract import load_extract
    docs = Path(tickets.ROOT) / 'docs' / 'js'
    passes = tickets.PRICES_SCHEMA['properties']['events']['items']['properties']['passes']['items']['properties']
    kinds, styles = passes['kind']['enum'], passes['style']['anyOf'][0]['enum']
    read = tickets.READ_SCHEMA['properties']['passes']['items']['properties']
    js = lambda file, name: re.findall(r"(\w+):", re.search(rf'const {name} = \{{([^}}]*)\}}', (docs / file).read_text())[1])
    check = lambda column, table: re.findall(r"'(\w+)'", re.search(rf'CREATE TABLE {table} \((?:[^;]*?)\n    {column} TEXT[^\n]*?CHECK \({column} IN \(([^)]*)\)\)',
                                                                   load_extract.SCHEMA)[1])
    assert read['kind']['enum'] == kinds and read['style']['anyOf'][0]['enum'] == styles
    assert js('passes.js', 'KIND') == kinds and js('passes.js', 'STYLE') == styles
    assert check('kind', 'event_passes') == kinds and check('style', 'event_passes') == styles
    assert check('state', 'ticket_sales') == list(tickets.Sales)
    assert sorted(js('eventcard.js', 'NO_PRICE')) == sorted(set(tickets.Sales) - {tickets.Sales.SHOP})


@pytest.mark.parametrize('styles, style, ok', [
    (['bachata', 'kizomba'], 'kizomba', True), (['bachata', 'kizomba'], None, True),
    (['kizomba'], 'kizomba', False),            # a kizomba-only festival: its passes have no style
    (['bachata', 'kizomba'], 'zouk', False),    # not one of the festival's
    ([], 'kizomba', False),
])
def test_a_pass_has_a_style_only_at_a_festival_of_several_and_one_of_them(styles, style, ok):
    fr = read() | {'styles': styles}
    fr['passes'][0]['style'] = style
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


@pytest.mark.parametrize('name, ok', [('Shuttle from the airport', True), ('Bootcamp GENKIZ - Female', False),
                                      ('BOOTCAMP Kizomba musicality advanced payment', True), ('Boot-camp acompte', True)])
def test_a_bootcamp_is_never_skipped_unless_it_is_a_deposit(name, ok):
    rows = copy.deepcopy(ROWS)
    rows[4] |= {'name': name}
    assert (tickets.read_problems(read(), [entry(rows)]) == []) == ok


def test_a_festivals_styles_are_its_genres_styles():
    import sqlite3
    from pipeline.extract import prices
    db = sqlite3.connect(':memory:')
    db.executescript("create table event_genres (event_id integer, genre text);"
                     "insert into event_genres values (1, 'urbankiz'), (1, 'semba'), (2, 'kizomba'), (2, 'zouk'), (2, 'kompa');")
    assert prices.styles(db, 1) == ['kizomba']
    assert prices.styles(db, 2) == ['kizomba', 'other', 'zouk']


@pytest.mark.parametrize('field, ok', [
    ({'css': 'td', 'attr': None, 'match': '([Ss]old [Oo]ut)'}, True),
    ({'css': 'td', 'attr': None, 'match': '(?i)(sold out)'}, False),       # JavaScript has no inline flags
    ({'css': 'h3, span', 'attr': None, 'match': None, 'all': True, 'up': 'li'}, True),
    ({'css': 'h3, span', 'attr': None, 'match': '(\\d+)', 'all': True}, False),
    ({'css': 'h3', 'attr': None, 'match': None, 'page': True, 'up': 'li'}, False),
])
def test_a_recipe_field_is_one_the_page_can_run(field, ok):
    recipe = json.loads((tickets.SITES / 'tickera.json').read_text())
    recipe['fields']['sold_out'] = field
    assert (tickets.problems(tickets.SITE_SCHEMA, recipe) == []) == ok
