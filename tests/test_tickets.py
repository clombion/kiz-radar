"""Ticket-page prices: rows to passes by key, the first read's checks, recording, changes, re-reads and agreement."""

import collections
import copy
import dataclasses
import json

import pytest

from pipeline import exceptions, prompt, tickets
from pipeline.states import FirstRead, Recheck, Sales, Status, Waiting

AT = '2026-10-01T05:00:00+00:00'


def row(key, name, amount, sold_out=False, alt=None):
    price = f'€{amount:.2f}'
    return {
        'key': key,
        'name': name,
        'price': price,
        'amount': amount,
        'currency': 'EUR',
        'fee': None,
        'sold_out': sold_out,
        'alt_amount': alt,
        'alt_currency': 'CZK' if alt else None,
        'alt_price': f'{alt} CZK' if alt else None,
    }


def entry(rows, at=AT, page='https://my.weezevent.com/x'):
    return {
        'at': at,
        'page': page,
        'recipe': 'weezevent@0123abcd',
        'url': page,
        'http': 200,
        'status': Status.READ,
        'rows': rows,
    }


def refused(at):
    return {
        'at': at,
        'page': 'https://my.weezevent.com/x',
        'recipe': 'weezevent@0123abcd',
        'status': Status.REFUSED,
        'why': 'HTTP 429',
    }


ROWS = [
    row('1', 'Fullpass Male 100€', 102.56, sold_out=True),
    row('2', 'Fullpass Female 100€', 102.56, sold_out=True),
    row('3', 'Fullpass Male 120€', 123.08),
    row('4', 'Fullpass Female 120€', 123.08),
    row('5', 'Shuttle from the airport', 56.41),
]


def tier(*keys, until=None, quantity=None, quote=None):
    return {'keys': list(keys), 'from': None, 'until': until, 'quantity': quantity, 'date_quote': quote}


def read(passes=None, skipped=(('5', 'excursion'),), description='Prices rise on 1 December.', rule_quotes=()):
    return {
        'event_id': 7,
        'title': 'Fest',
        'start_date': '2027-02-05',
        'read_by': 'agent',
        'prompt': prompt.current('first_read').hash,
        'styles': ['bachata', 'kizomba'],
        'rows_at': AT,
        'description': description,
        'passes': passes
        or [
            {
                'kind': 'full',
                'style': None,
                'label_quote': 'Fullpass',
                'group_size': 1,
                'days': None,
                'includes_hotel': False,
                'tiers': [tier('1', '2'), tier('3', '4')],
            }
        ],
        'skipped': [{'key': k, 'reason': r} for k, r in skipped],
        'rule_quotes': list(rule_quotes),
    }


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
    assert tickets.read_problems(fr, [entry(ROWS)]) == [
        'key 5 (Shuttle from the airport €56.41): neither in a tier nor skipped'
    ]
    fr = read(skipped=(('5', 'excursion'), ('3', 'class')))
    assert 'key 3: in the read twice' in tickets.read_problems(fr, [entry(ROWS)])
    fr = read(skipped=(('5', 'excursion'), ('9', 'class')))
    assert 'key 9: not on the page' in tickets.read_problems(fr, [entry(ROWS)])


def test_first_read_needs_the_logged_read_it_names():
    assert 'is no read' in tickets.read_problems(read(), [entry(ROWS, at='2026-10-02T00:00:00+00:00')])[0]


@pytest.mark.parametrize(
    'quote, ok',
    [('Prices rise on 1 December', True), ('Fullpass Male 120€', True), ('Prices rise on 2 December', False)],
)
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
    monkeypatch.setattr(tickets, 'STATUS_CSV', tmp_path / 'status.csv')
    tickets.save_read(read())
    tickets.append(7, entry(ROWS))
    return tmp_path


def test_recording_twice_writes_the_same_files(files):
    assert tickets.record(7) == []
    before = [(files / f).read_bytes() for f in ('pass_prices.csv', 'ticket_pages.csv')]
    assert tickets.record(7) == []
    assert [(files / f).read_bytes() for f in ('pass_prices.csv', 'ticket_pages.csv')] == before


def test_an_unchanged_page_changes_only_the_read_date(files):
    tickets.record(7)
    prices_before, pages_before = [(files / f).read_text() for f in ('pass_prices.csv', 'ticket_pages.csv')]
    tickets.append(7, entry(ROWS, at='2026-11-03T05:00:00+00:00'))
    tickets.record(7)
    assert (files / 'pass_prices.csv').read_text() == prices_before
    assert (files / 'ticket_pages.csv').read_text() == pages_before.replace('2026-10-01', '2026-11-03')


def test_a_failed_read_keeps_the_last_prices(files):
    tickets.record(7)
    before = (files / 'ticket_pages.csv').read_text()
    tickets.append(7, refused('2026-11-03T05:00:00+00:00'))
    tickets.record(7)
    assert (files / 'ticket_pages.csv').read_text() == before


def test_changes_between_reads():
    later = copy.deepcopy(ROWS[1:]) + [row('6', 'Fullpass Male 140€', 143.59)]
    later[2]['sold_out'] = True
    later[3] |= {'amount': 60.0, 'price': '€60.00'}
    got = [text for _, text in tickets.changes([entry(ROWS), entry(later, at='2026-11-03T00:00:00+00:00')])]
    assert got == [
        'new: Fullpass Male 140€ €143.59',
        'gone: Fullpass Male 100€ €102.56',
        'sold out: Fullpass Female 120€ €123.08',
        'price: Shuttle from the airport €56.41 → €60.00',
    ]
    assert tickets.changes([entry(ROWS), entry(ROWS, at='2026-11-03T00:00:00+00:00')]) == []


def csv_tier(until='', quantity='', sold_out='0'):
    return {'until': until, 'quantity': quantity, 'sold_out': sold_out}


@pytest.mark.parametrize(
    'tiers, today, expected',
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
def test_recheck_classes(tiers, today, expected):
    assert tickets.recheck(tiers, '2027-02-05', today)[:2] == expected
    assert {Recheck.DATED, Recheck.MONTHLY} == set(Recheck)


def test_failures_count_back_to_the_last_read():
    assert tickets.failures([entry(ROWS), refused('b'), refused('c')]) == 2
    assert tickets.failures([refused('a'), entry(ROWS)]) == 0


def test_two_reads_agree_on_meaning_not_on_wording():
    a, b = read(), read()
    b['passes'][0]['label_quote'] = 'Fullpass Male'
    b['passes'][0]['tiers'][0]['keys'] = ['2', '1']
    assert tickets.meaning(a) == tickets.meaning(b)


@pytest.mark.parametrize(
    'change',
    [
        lambda r: r['passes'][0].update(kind='party'),
        lambda r: r.update(skipped=[]) or r['passes'][0]['tiers'].append(tier('5')),
        lambda r: r['passes'][0]['tiers'][1].update(until='11-30'),
        lambda r: r['passes'][0].update(style='kizomba'),
    ],
)
def test_two_reads_disagree_on_a_pass_a_skip_a_date_or_a_style(change):
    b = read()
    change(b)
    assert tickets.meaning(read()) != tickets.meaning(b)


@pytest.mark.parametrize(
    'text, number',
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
def test_numbers_as_sites_write_them(text, number):
    assert tickets.number(text) == number


RAW = {
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


@pytest.mark.parametrize(
    'change, why',
    [
        ({'amount': None}, 'amount'),
        ({'currency': '$'}, 'currency'),
        ({'alt_amount': '3,125.00', 'alt_currency': 'CZK'}, 'alt'),
    ],
)
def test_a_row_the_recipe_reads_wrong_breaks_the_layout(monkeypatch, change, why):
    got = attempt_with(monkeypatch, [RAW | change])
    assert (got['status'] == Status.LAYOUT_BROKEN and why in got['why']) or 'is not valid' in got['why']


def test_two_rows_with_one_key_break_the_layout(monkeypatch):
    got = attempt_with(monkeypatch, [RAW, RAW | {'name': 'Partypass'}])
    assert got['status'] == Status.LAYOUT_BROKEN and 'two rows with key 1' in got['why']


def test_a_recipe_failing_on_the_page_breaks_the_layout_and_a_page_that_wont_load_is_refused(monkeypatch):
    from patchright.sync_api import Error

    from pipeline import read_page

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
    assert 'the ticket page changed' in tickets.record(7)[0]


def test_a_draft_becomes_the_first_read_once_it_passes(files):
    tickets.save_draft(read(skipped=()))
    assert tickets.record(7) != [] and (files / 'drafts' / '7.json').exists()
    assert tickets.first_read(7)['skipped'] == read()['skipped']  # the failing draft is not the first read
    tickets.save_draft(read())
    assert tickets.record(7) == [] and not (files / 'drafts' / '7.json').exists()
    assert tickets.first_read(7) == read()


def test_recipes_are_checked_against_their_schema(tmp_path, monkeypatch):
    assert tickets.sites()
    monkeypatch.setattr(tickets, 'SITES', tmp_path)
    (tmp_path / 'x.json').write_text(json.dumps({'site': 'x'}))
    with pytest.raises(SystemExit):
        tickets.sites()


def client(*replies):
    """A client answering each request with the next reply, as structured output."""
    from types import SimpleNamespace

    replies = list(replies)

    class Ctx:
        def __enter__(self):
            text = json.dumps(replies.pop(0))
            return SimpleNamespace(
                get_final_message=lambda: SimpleNamespace(
                    stop_reason='end_turn',
                    content=[SimpleNamespace(type='text', text=text)],
                    usage=SimpleNamespace(input_tokens=6000, output_tokens=2000),
                )
            )

        def __exit__(self, *a):
            return False

    return SimpleNamespace(messages=SimpleNamespace(stream=lambda **kw: Ctx()))


def festival(**k):
    """A festival as festivals() gives it: by default to come, with no first read and no ticket page."""
    return tickets.Festival(
        **dict(
            id=7,
            title='Fest',
            start_date='2027-02-05',
            end_date='2027-02-07',
            country='Germany',
            description='Prices rise on 1 December.',
            over=False,
            styles=['bachata', 'kizomba'],
            links=[],
            found=None,
            first_read=None,
            log=[],
            tiers=[],
            described=None,
            page=None,
            site=None,
            disputed=False,
            need=FirstRead.NONE,
        )
        | k
    )


FEST = festival(page='https://my.weezevent.com/x')
ANSWER = {k: read()[k] for k in ('passes', 'skipped', 'rule_quotes')}


def answer(kind='full', label='Fullpass'):
    out = copy.deepcopy(ANSWER)
    out['passes'][0] |= {'kind': kind, 'label_quote': label}
    return out


def test_two_models_that_agree_give_the_first_ones_read(files):
    fr = tickets.models_read(client(answer(), answer(label=None)), FEST, entry(ROWS), [entry(ROWS)])
    assert fr['passes'] == ANSWER['passes'] and fr['read_by'] == 'claude-opus-5-5 + claude-sonnet-5-5'
    assert not (files / 'disputed' / '7.json').exists()


def test_when_two_models_disagree_a_third_read_settles_it(files):
    fr = tickets.models_read(client(answer(), answer('party'), answer('party')), FEST, entry(ROWS), [entry(ROWS)])
    assert fr['passes'][0]['kind'] == 'party' and fr['read_by'] == 'claude-sonnet-5-5 + claude-fable-5-1'
    assert not (files / 'disputed' / '7.json').exists()


def test_when_no_two_models_agree_all_reads_wait_for_an_agent(files):
    assert (
        tickets.models_read(client(answer(), answer('party'), answer('other')), FEST, entry(ROWS), [entry(ROWS)])
        is None
    )
    assert set(json.loads((files / 'disputed' / '7.json').read_text())['reads']) == {*tickets.MODELS, tickets.TIE_BREAK}


def test_both_files_hold_what_the_reads_and_logs_say_and_nothing_else(files):
    (files / 'pass_prices.csv').write_text('event_id,stale\n9,1\n')
    assert tickets.record(7) == []
    assert {r['event_id'] for r in tickets.csv_rows(files / 'pass_prices.csv')} == {'7'}
    assert list(tickets.csv_rows(files / 'pass_prices.csv')[0]) == tickets.PRICE_FIELDS


def test_a_festival_that_no_longer_fits_its_first_read_is_left_out(files):
    tickets.record(7)
    rows = copy.deepcopy(ROWS)
    rows[3] |= {'amount': 128.21, 'price': '€128.21'}
    tickets.append(7, entry(rows, at='2026-11-03T05:00:00+00:00'))
    assert 'the first read needs doing again' in tickets.write_all()[0]
    assert tickets.csv_rows(files / 'ticket_pages.csv') == []


HELD = exceptions.OVERRIDES[0]  # a site the register says no recipe can read


def sold(state, page=''):
    return {'state': state, 'page': page, 'links': '', 'note': 'n'}


@pytest.mark.parametrize(
    'f, expected',
    [
        (festival(), Waiting.PAGE),
        (festival(page='https://example.org/tickets'), Waiting.RECIPE),
        (festival(page=f'https://{HELD.host}/x'), HELD.then),  # pipeline/exceptions.py
        (festival(page='https://my.weezevent.com/x', site=('r', 'v')), Waiting.NOTHING),
        (festival(found=sold(Sales.OFFLINE)), Waiting.NOTHING),
        (festival(found=sold(Sales.NOT_YET)), Waiting.SALES_OPEN),
        (festival(found=sold(Sales.CLOSED)), Waiting.NOTHING),
        (festival(found=sold(Sales.NONE_FOUND)), Waiting.NOTHING),
        (festival(found=sold(Sales.SHOP, 'https://example.org/t'), page='https://example.org/t'), Waiting.RECIPE),
        (festival(page='https://my.weezevent.com/x', site=('r', 'v'), need=FirstRead.DISPUTED), Waiting.AGENT),
        (
            festival(need=FirstRead.CURRENT, first_read=read(), log=[refused('a'), refused('b'), refused('c')]),
            Waiting.SESSION,
        ),
        (festival(need=FirstRead.CURRENT, first_read=read(), log=[entry(ROWS)]), Waiting.NOTHING),
        (festival(need=FirstRead.NOT_NEEDED), Waiting.NOTHING),
        (festival(need=FirstRead.AWAITS_ANSWER), Waiting.NOTHING),
        (festival(over=True), Waiting.NOTHING),  # it is over: nothing to wait for
        (
            festival(
                need=FirstRead.CURRENT,
                first_read=read(),  # failures before a broken recipe
                log=[refused('a'), refused('b'), {'at': 'c', 'status': Status.LAYOUT_BROKEN, 'why': 'x'}],
            ),
            Waiting.SESSION,
        ),
    ],
)
def test_what_a_festival_waits_for(f, expected):
    assert tickets.waiting(f) == expected


def test_every_waits_for_state_is_reached():
    """waiting() is total over its states: each case above reaches one, and together they reach them all."""
    reached = {
        tickets.waiting(f)
        for f in [
            festival(),
            festival(page='https://example.org/t'),
            festival(found=sold(Sales.NOT_YET)),
            festival(need=FirstRead.DISPUTED),
            festival(log=[refused('a'), refused('b'), refused('c')]),
            festival(log=[{'at': 'b', 'status': Status.LAYOUT_BROKEN, 'why': 'x'}]),
            festival(need=FirstRead.CURRENT),
        ]
    }
    assert reached == set(Waiting)


def test_the_status_lists_every_festival_past_ones_too(files):
    counts = tickets.write_status(
        [
            festival(id=9, need=FirstRead.CURRENT),
            festival(),
            festival(id=8, page='https://example.org/t'),
            festival(id=6, over=True, found=sold(Sales.CLOSED)),
        ]
    )
    got = [(r['event_id'], r['waits_for'], r['first_read'], r['sales']) for r in tickets.csv_rows(files / 'status.csv')]
    assert got == [
        ('6', 'nothing', 'none', 'closed'),
        ('7', 'page', 'none', ''),
        ('8', 'recipe', 'none', ''),
        ('9', 'nothing', 'current', ''),
    ]
    assert counts == {Waiting.PAGE: 1, Waiting.RECIPE: 1, Waiting.NOTHING: 2}
    assert list(tickets.csv_rows(files / 'status.csv')[0]) == tickets.STATUS_FIELDS


@pytest.fixture
def paging(files, monkeypatch):
    monkeypatch.setattr(tickets, 'one', lambda db, i, page=None: festival(id=i, links=['https://example.org/a']))
    monkeypatch.setattr(tickets, 'festivals', lambda db, today, only=None, every=False: [festival()])
    return files


def test_a_found_page_is_recorded_once_and_a_cut_link_refused(paging):
    tickets.cmd_page(None, 7, 'https://example.org/t', Sales.SHOP, 'its site', 'agent')
    tickets.cmd_page(None, 7, None, Sales.OFFLINE, 'by message only', 'agent')
    assert [(r['state'], r['page'], r['note']) for r in tickets.csv_rows(paging / 'pages.csv')] == [
        ('offline', '', 'by message only')
    ]
    assert tickets.csv_rows(paging / 'status.csv')[0]['waits_for'] == 'page'
    with pytest.raises(SystemExit):
        tickets.cmd_page(None, 7, 'https://example.org/t…', Sales.SHOP, 'cut', 'agent')


def test_a_search_that_found_nothing_holds_until_the_links_change(paging):
    tickets.cmd_page(None, 7, None, Sales.NONE_FOUND, 'a search found no ticket page', 'agent')
    row = tickets.found_pages()[7]
    assert row['links'] == tickets.links_hash(['https://example.org/a'])
    assert row['links'] != tickets.links_hash(['https://example.org/a', 'https://example.org/b'])


@pytest.mark.parametrize(
    'url, state', [(None, 'shop'), ('https://example.org/t', 'offline'), ('https://example.org/t', 'closed')]
)
def test_only_a_shop_has_a_page(paging, url, state):
    with pytest.raises(SystemExit):
        tickets.cmd_page(None, 7, url, Sales(state), 'n', 'agent')


@pytest.mark.parametrize(
    'line',
    [
        '7,Fest,offline,https://x.org,,agent,n',
        '7,Fest,soon,,,agent,n',
        '7,Fest,none_found,,,agent,n',
        '7,Fest,offline,,0123456789abcdef,agent,n',
    ],
)
def test_sales_states_are_checked_when_read(files, line):
    (files / 'pages.csv').write_text('event_id,event,state,page,links,found_by,note\n' + line + '\n')
    with pytest.raises(SystemExit):
        tickets.found_pages()


def test_a_fee_the_site_adds_is_in_the_amount(monkeypatch):
    got = attempt_with(monkeypatch, [RAW | {'price': '€119.00 + €1.00 fee.', 'amount': '119.00', 'fee': '1.00'}])
    assert (got['rows'][0]['amount'], got['rows'][0]['fee']) == (120, 1)


def test_a_tier_keeps_its_fee_and_its_quote_shows_it():
    rows = [row('1', 'Fullpass', 120.0) | {'price': '€119.00 + €1.00 fee.', 'fee': 1.0}]
    fr = read(
        passes=[
            {
                'kind': 'full',
                'style': None,
                'label_quote': None,
                'group_size': 1,
                'days': None,
                'includes_hotel': False,
                'tiers': [tier('1')],
            }
        ],
        skipped=(),
    )
    answer, _, found = tickets.build(fr, entry(rows))
    assert found == [] and answer['events'][0]['passes'][0]['tiers'][0]['fee'] == 1.0


@pytest.mark.parametrize(
    'until, sold_out, ok', [('09-30', False, False), ('09-30', True, True), ('11-30', False, True)]
)
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

    pattern = re.search(r't\.replace\(/(.+?)/g', ROWS_JS)[1].replace('\\\\', '\\')
    wrong = []
    for site, (recipe, _) in tickets.sites().items():
        for name, f in recipe['fields'].items():
            for text in (f or {}).get('css') or '', (f or {}).get('match') or '':
                wrong += [
                    f'{site}.{name}: {{{at}{k}}}'
                    for at, k in re.findall(pattern, text)
                    if not at and k not in recipe['fields']
                ]
    assert wrong == []
    assert re.findall(pattern, '[A-Z]{3}') == [] and re.findall(pattern, '"{@value}" {name}') == [
        ('@', 'value'),
        ('', 'name'),
    ]


TICKET = {
    'uuid': 'b4cb',
    'name': {'text': 'Couples Party Pass'},
    'price': {'price': 185.0},
    'distributionFee': 6.75,
    'stockLeft': 0,
    'available': False,
}


@pytest.mark.parametrize(
    'field, value',
    [
        ({'json': 'name.text'}, 'Couples Party Pass'),
        ({'json': 'available'}, 'false'),
        ({'json': 'missing.path'}, None),
        ({'page': '"priceCurrency":"([A-Z]{3})"'}, 'EUR'),
        ({'text': '{price.price} + {distributionFee} fee'}, '185.0 + 6.75 fee'),
        ({'json': 'stockLeft', 'match': '^0$'}, '0'),
        (None, None),
    ],
)
def test_api_fields_read_a_ticket_and_its_page(field, value):
    assert tickets.api_value(field, TICKET, '<script>{"priceCurrency":"EUR"}</script>') == value


def test_a_recipe_reads_the_page_or_the_api_never_a_mix():
    from jsonschema import Draft202012Validator

    api = json.loads((tickets.SITES / 'goandance.json').read_text())
    page = json.loads((tickets.SITES / 'weeztix.json').read_text())
    valid = lambda r: not list(Draft202012Validator(tickets.SITE_SCHEMA).iter_errors(r))
    assert valid(api) and valid(page)
    assert not valid(api | {'row': '.ticket'})  # an API recipe with page rows
    assert not valid(page | {'api': api['api']})  # page rows and an API
    assert not valid(page | {'fields': api['fields'], 'row': page['row']})  # page rows read by api fields


def test_a_first_read_with_no_pass_is_refused():
    fr = read(passes=[], skipped=[(k, 'room') for k in '12345'])
    fr['passes'] = []
    assert any('passes' in p for p in tickets.read_problems(fr, [entry(ROWS)]))


def test_a_page_that_broke_its_recipe_waits_for_a_fix_with_or_without_a_first_read():
    broken = {'at': 'b', 'page': 'x', 'recipe': 'r', 'status': Status.LAYOUT_BROKEN, 'why': 'no ticket rows'}
    assert (
        tickets.waiting(festival(page='https://my.weezevent.com/x', site=('r', 'v'), log=[broken]))
        == tickets.Waiting.RECIPE_FIX
    )
    assert tickets.waiting(festival(first_read=read(), log=[entry(ROWS), broken])) == tickets.Waiting.RECIPE_FIX


def test_a_day_pass_is_one_day_whether_its_days_say_1_or_nothing():
    a, b = read(), read()
    for fr, days in ((a, None), (b, 1)):
        fr['passes'][0] |= {'kind': 'day', 'days': days}
    assert tickets.meaning(a) == tickets.meaning(b)


@pytest.mark.parametrize(
    'url, address',
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
def test_a_widget_builds_the_address_from_the_link(url, address, monkeypatch):
    from curl_cffi import requests

    monkeypatch.setattr(requests, 'get', lambda *a, **k: pytest.fail('an address pattern needs no request'))
    recipe = {
        'widget': {
            'in': 'address',
            'pattern': '/e/[^?#]*?-?(\\d{10,})(?:[?#]|$)',
            'address': 'https://{host}/checkout-external?eid={1}',
        }
    }
    assert tickets.widget(url, recipe) == address


def test_a_widget_found_in_the_page_keeps_an_address_that_is_already_its_own(monkeypatch):
    from curl_cffi import requests

    monkeypatch.setattr(requests, 'get', lambda *a, **k: pytest.fail('the address is already the widget'))
    recipe = {
        'widget': {
            'in': 'html',
            'pattern': 'https://widget\\.weezevent\\.com/ticket/[A-Z0-9-]+/',
            'address': '{0}?locale=en-GB',
        }
    }
    assert (
        tickets.widget('https://widget.weezevent.com/ticket/E1/', recipe) == 'https://widget.weezevent.com/ticket/E1/'
    )


@pytest.mark.parametrize('price, amount', [('Free', 0.0), ('Gratuit', 0.0), ('€81.03', None)])
def test_a_free_ticket_costs_0(price, amount):
    got = tickets.parsed(RAW | {'price': price, 'amount': None}, {'€': 'EUR'})
    assert got['amount'] == amount
    assert (tickets.problems(tickets.LOG_SCHEMA['$defs']['row'], got) == []) == (amount is not None)


def test_first_reads_count_against_the_budget(files):
    from pipeline import spend

    tickets.models_read(client(ANSWER, ANSWER), FEST, entry(ROWS), [entry(ROWS)])
    assert round(spend.month_usd(), 3) == round(
        spend.usd('claude-opus-5-5', 6000, 2000) + spend.usd('claude-sonnet-5-5', 6000, 2000), 3
    )


@pytest.mark.parametrize(
    'current, style, ok',
    [
        (True, 'kizomba', True),
        (True, None, True),
        (True, ..., False),
        (False, ..., False),  # a read to another prompt: made again, never loaded
    ],
)
def test_a_first_read_names_each_pass_style_and_follows_a_prompt(current, style, ok):
    fr = read() | ({} if current else {'prompt': 'not a hash'})
    if style is ...:
        del fr['passes'][0]['style']
    else:
        fr['passes'][0]['style'] = style
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


def test_a_pass_keeps_its_style_in_pass_prices_csv(files):
    fr = read()
    fr['passes'][0]['style'] = 'kizomba'
    tickets.save_read(fr)
    assert tickets.record(7) == []
    assert {r['style'] for r in tickets.csv_rows(files / 'pass_prices.csv')} == {'kizomba'}


def test_a_first_read_to_another_prompt_is_made_again_whatever_its_shape(files):
    old = read() | {'prompt': '0' * 16, 'skipped': ['5']}
    assert (
        tickets.why_first_read(festival(first_read=old, log=tickets.log(7)), '2026-11-01')[0] == FirstRead.REDO_PROMPT
    )
    assert tickets.why_first_read(festival(first_read=read(), log=tickets.log(7)), '2026-11-01')[0] == FirstRead.CURRENT


def test_a_first_read_to_another_prompt_is_never_written(files):
    old = read() | {'prompt': '0' * 16}
    with pytest.raises(ValueError, match='not the current'):
        tickets.save_read(old)
    tickets.dump(tickets.READS / '7.json', old)  # as a read made before the prompt changed
    assert 'make it again' in tickets.record(7)[0]
    assert tickets.write_all() == [] and tickets.csv_rows(files / 'ticket_pages.csv') == []  # set aside quietly


def described(*passes):
    from types import SimpleNamespace

    return SimpleNamespace(entry={'passes': list(passes)})


def card(kind='full', until='2027-01-31', **k):
    return {
        'kind': kind,
        'style': None,
        'group_size': 1,
        'days': None,
        'includes_hotel': False,
        'tiers': [{'from': None, 'until': until, 'amount': 90}],
    } | k


FIRST_READ_CASES = [
    ({}, FirstRead.CURRENT),
    ({'disputed': True}, FirstRead.CURRENT),  # a dispute settled by a current first read
    ({'description': 'New prices.'}, FirstRead.REDO_DESCRIPTION),
    (
        {'log': [entry(ROWS), entry(ROWS, at='2026-11-03T00:00:00+00:00', page='https://my.weezevent.com/y')]},
        FirstRead.REDO_PAGE,
    ),
    ({'log': [entry(ROWS + [row('6', 'Fullpass Male 140€', 143.59)])]}, FirstRead.REDO_UNREAD),
    ({'first_read': read() | {'prompt': '0' * 16}}, FirstRead.REDO_PROMPT),
    ({'first_read': read() | {'prompt': '0' * 16}, 'disputed': True}, FirstRead.DISPUTED),
    ({'first_read': None, 'described': None}, FirstRead.AWAITS_ANSWER),
    ({'first_read': None, 'described': None, 'description': ''}, FirstRead.NONE),  # nothing to answer
    ({'first_read': None, 'described': described(card(until=None))}, FirstRead.NONE),
    ({'first_read': None, 'described': described(card(kind='party'))}, FirstRead.NONE),  # not the card's pass
    ({'first_read': None, 'described': described(card(until='2026-10-31'))}, FirstRead.NONE),
    ({'first_read': None, 'described': described(card())}, FirstRead.NOT_NEEDED),
    ({'first_read': None, 'described': described(card(until='2026-11-01'))}, FirstRead.NOT_NEEDED),  # dated today
]


@pytest.mark.parametrize('change, state', FIRST_READ_CASES)
def test_every_first_read_state(change, state):
    f = dataclasses.replace(festival(first_read=read(), log=[entry(ROWS)]), **change)
    assert tickets.why_first_read(f, '2026-11-01')[0] == state


def test_the_first_read_states_tested_are_all_of_them():
    assert {s for _, s in FIRST_READ_CASES} == set(FirstRead)


def test_a_run_for_named_festivals_reads_only_them(files, monkeypatch):
    import sqlite3

    fest = lambda i: festival(id=i, site=('recipe',), page=f'https://shop.example/{i}')
    db = sqlite3.connect(':memory:')
    db.executescript('create table events (id integer); insert into events values (6), (7), (8);')
    monkeypatch.setattr(
        tickets, 'festivals', lambda db, today, only=None, every=False: [] if only or every else [fest(7), fest(8)]
    )
    monkeypatch.setattr(tickets, 'status', lambda db: collections.Counter())
    read = []
    monkeypatch.setattr(
        tickets,
        'attempt',
        lambda page, *site: (
            read.append(page) or {'at': AT, 'status': tickets.Status.REFUSED, 'why': 'HTTP 403', 'page': page}
        ),
    )
    monkeypatch.setattr(tickets, 'append', lambda i, e: None)
    tickets.cmd_run(db, {8, 6})  # 6 is past: nothing to read there
    assert read == ['https://shop.example/8']
    with pytest.raises(SystemExit, match=r'\[9\]'):
        tickets.cmd_run(db, {9})


def test_a_past_festivals_first_read_for_an_older_prompt_is_made_again_from_its_logged_rows(files, monkeypatch):
    import sqlite3

    old = read() | {'prompt': '0' * 16}
    del old['passes'][0]['style']
    tickets.dump(tickets.READS / '7.json', old)
    db = sqlite3.connect(':memory:')
    db.executescript('create table events (id integer); insert into events values (7);')
    past = dataclasses.replace(FEST, over=True, first_read=old, log=tickets.log(7), need=FirstRead.REDO_PROMPT)
    monkeypatch.setattr(tickets, 'festivals', lambda db, today, only=None, every=False: [past] if every else [])
    monkeypatch.setattr(tickets, 'status', lambda db: collections.Counter())
    monkeypatch.setattr(tickets, 'attempt', lambda *a: pytest.fail('a past festival is not read again'))
    import anthropic

    monkeypatch.setattr(anthropic, 'Anthropic', lambda: client(ANSWER, ANSWER))
    tickets.cmd_run(db)
    assert tickets.first_read(7)['prompt'] == prompt.current('first_read').hash


def test_passes_alike_in_every_field_load_back_as_the_passes_they_are(files, monkeypatch):
    from pipeline.extract import load_extract

    fr = read()
    one = fr['passes'][0]
    fr['passes'] = [one | {'tiers': [one['tiers'][0]]}, one | {'tiers': [one['tiers'][1]]}]
    tickets.save_read(fr)
    assert tickets.record(7) == []
    monkeypatch.setattr(load_extract, 'PAGE_PRICES', files / 'pass_prices.csv')
    monkeypatch.setattr(load_extract, 'TICKET_PAGES', files / 'ticket_pages.csv')
    entry_, _ = load_extract.page_prices({7})[0][7]
    assert [len(p['tiers']) for p in entry_['passes']] == [1, 1]


@pytest.mark.parametrize(
    'styles, style, ok',
    [
        (['bachata', 'kizomba'], 'kizomba', True),
        (['bachata', 'kizomba'], None, True),
        (['kizomba'], 'kizomba', False),  # a kizomba-only festival: its passes have no style
        (['bachata', 'kizomba'], 'zouk', False),  # not one of the festival's
        ([], 'kizomba', False),
    ],
)
def test_a_pass_has_a_style_only_at_a_festival_of_several_and_one_of_them(styles, style, ok):
    fr = read() | {'styles': styles}
    fr['passes'][0]['style'] = style
    assert (tickets.read_problems(fr, [entry(ROWS)]) == []) == ok


@pytest.mark.parametrize(
    'name, reason, ok',
    [
        ('Shuttle from the airport', 'excursion', True),
        ('Bootcamp GENKIZ - Female', 'class', False),
        ('BOOTCAMP Kizomba musicality advanced payment', 'deposit', True),
    ],
)
def test_a_bootcamp_is_skipped_only_as_a_deposit(name, reason, ok):
    rows = copy.deepcopy(ROWS)
    rows[4] |= {'name': name}
    assert (tickets.read_problems(read(skipped=(('5', reason),)), [entry(rows)]) == []) == ok


@pytest.mark.parametrize('skip', [{'key': '5'}, {'key': '5', 'reason': 'other'}, '5'])
def test_a_skip_has_a_reason_of_the_table(skip):
    fr = read() | {'skipped': [skip]}
    assert any(p.startswith('schema: skipped/0') for p in tickets.read_problems(fr, [entry(ROWS)]))


def test_two_reads_agree_whatever_reason_a_kept_skip_has():
    assert tickets.meaning(read()) == tickets.meaning(read(skipped=(('5', 'food_drink'),)))


def test_a_festivals_styles_are_its_genres_styles():
    import sqlite3

    from pipeline.extract import prices

    db = sqlite3.connect(':memory:')
    db.executescript(
        'create table event_genres (event_id integer, genre text);'
        "insert into event_genres values (1, 'urbankiz'), (1, 'semba'), (2, 'kizomba'), (2, 'zouk'), (2, 'kompa');"
    )
    assert prices.styles(db, 1) == ['kizomba']
    assert prices.styles(db, 2) == ['kizomba', 'other', 'zouk']


@pytest.mark.parametrize(
    'field, ok',
    [
        ({'css': 'td', 'attr': None, 'match': '([Ss]old [Oo]ut)'}, True),
        ({'css': 'td', 'attr': None, 'match': '(?i)(sold out)'}, False),  # JavaScript has no inline flags
        ({'css': 'h3, span', 'attr': None, 'match': None, 'all': True, 'up': 'li'}, True),
        ({'css': 'h3, span', 'attr': None, 'match': '(\\d+)', 'all': True}, False),
        ({'css': 'h3', 'attr': None, 'match': None, 'page': True, 'up': 'li'}, False),
    ],
)
def test_a_recipe_field_is_one_the_page_can_run(field, ok):
    recipe = json.loads((tickets.SITES / 'tickera.json').read_text())
    recipe['fields']['sold_out'] = field
    assert (tickets.problems(tickets.SITE_SCHEMA, recipe) == []) == ok


def test_a_festival_with_three_problems_is_left_out_like_any_other(files):
    fr = read(skipped=(('5', 'excursion'), ('8', 'class'), ('9', 'class')))
    fr['rule_quotes'] = ['not in the description']
    assert len(tickets.read_problems(fr, tickets.log(7))) == 3
    tickets.save_read(fr)
    assert len(tickets.write_all()) == 3 and tickets.csv_rows(files / 'ticket_pages.csv') == []


@pytest.mark.parametrize(
    'urls, page',
    [
        (['https://fest.example/', 'https://fest.example/tickets'], None),  # its own site: a guess, not a page
        (
            ['https://fest.example/', 'https://my.weezevent.com/x'],
            'https://my.weezevent.com/x',
        ),  # a shop a recipe reads
        ([f'https://{HELD.host}/x'], f'https://{HELD.host}/x'),  # a shop no recipe can read
        (['https://my.weezevent.com/x…'], None),  # cut short
    ],
)
def test_a_ticket_page_is_known_only_on_a_ticket_shop(urls, page):
    assert tickets.known_page(None, [], None, urls, tickets.shop_hosts(tickets.sites())) == page


def test_a_page_an_agent_found_or_a_first_read_is_known_whatever_its_site(files):
    shops = tickets.shop_hosts(tickets.sites())
    assert (
        tickets.known_page(None, [], sold(Sales.SHOP, 'https://fest.example/t'), [], shops) == 'https://fest.example/t'
    )
    assert tickets.known_page(None, [], sold(Sales.OFFLINE), ['https://my.weezevent.com/x'], shops) is None
    assert tickets.known_page(read(), tickets.log(7), None, [], shops) == 'https://my.weezevent.com/x'


def test_a_festival_with_links_to_no_shop_waits_for_its_page_and_has_no_page_to_link():
    from pipeline.extract import prices

    f = festival(links=['https://fest.example/'])
    assert tickets.waiting(f) == Waiting.PAGE and prices.price_state([], None, f.page) == prices.Price.NOT_LOOKED


def test_a_dispute_is_settled_by_a_first_read_of_rows_as_new(files):
    (files / 'disputed').mkdir()
    (files / 'disputed' / '7.json').write_text(json.dumps({'rows_at': AT, 'reads': {}}))
    tickets.settle_dispute(7, read() | {'rows_at': '2026-09-01T00:00:00+00:00'})
    assert (files / 'disputed' / '7.json').exists()  # older rows settle nothing
    tickets.settle_dispute(7, read())
    assert not (files / 'disputed' / '7.json').exists()


def test_a_recorded_draft_archives_its_prompt_and_leaves_no_prompt_file(files):
    p = prompt.current('first_read')
    (prompt.ASKED / f'{p.hash}.md').unlink(missing_ok=True)
    tickets.save_draft(read())
    (files / 'drafts' / '7.prompt.md').write_text(p.text)
    assert not (prompt.ASKED / f'{p.hash}.md').exists()  # a draft names no archived prompt yet
    assert tickets.record(7) == []
    assert (prompt.ASKED / f'{p.hash}.md').read_text(encoding='utf-8') == p.text
    assert not (files / 'drafts' / '7.prompt.md').exists()


def test_a_url_given_to_read_is_a_full_address():
    with pytest.raises(SystemExit, match='not a full address'):
        tickets.cmd_read(None, 7, 'https://my.weezevent.com/x…')


def test_a_second_price_is_one_value_in_the_answer_and_two_columns_in_the_file(files):
    rows = copy.deepcopy(ROWS)
    rows[2] |= {'alt_amount': 3050.0, 'alt_currency': 'CZK', 'alt_price': '3 050 CZK'}
    rows[3] |= {'alt_amount': 3050.0, 'alt_currency': 'CZK', 'alt_price': '3 050 CZK'}
    tiers = tickets.build(read(), entry(rows))[0]['events'][0]['passes'][0]['tiers']
    assert [t['alt'] for t in tiers] == [None, {'amount': 3050.0, 'currency': 'CZK'}]
    tickets.append(7, entry(rows, at='2026-11-03T05:00:00+00:00'))
    assert tickets.record(7) == []
    assert [(r['alt_amount'], r['alt_currency']) for r in tickets.csv_rows(files / 'pass_prices.csv')] == [
        ('', ''),
        ('3050', 'CZK'),
    ]


def test_a_first_reads_prompt_is_a_hash_as_long_as_the_prompts():
    import re

    pattern = tickets.READ_SCHEMA['properties']['prompt']['pattern']
    assert re.fullmatch(pattern, prompt.current('first_read').hash) and not re.fullmatch(
        pattern, '0' * (prompt.DIGITS + 1)
    )


def test_a_fee_the_site_shows_apart_is_in_the_quote_its_amount_is_checked_against():
    rows = [row('1', 'Fullpass', 92.25) | {'price': '90,00 €', 'fee': 2.25}]
    fr = read(
        passes=[
            {
                'kind': 'full',
                'style': None,
                'label_quote': None,
                'group_size': 1,
                'days': None,
                'includes_hotel': False,
                'tiers': [tier('1')],
            }
        ],
        skipped=(),
    )
    answer, _, found = tickets.build(fr, entry(rows))
    assert found == [] and answer['events'][0]['passes'][0]['tiers'][0]['quote'] == 'Fullpass 90,00 € + 2.25 fee'
    assert (
        tickets.line(row('1', 'Fullpass', 120.0) | {'price': '€119.00 + €1.00 fee.', 'fee': 1.0})
        == 'Fullpass €119.00 + €1.00 fee.'
    )


def one_pass(*names, kind='full', days=None, tiers=None):
    """A first read of one pass over tickets with these names (one tier each, unless tiers groups their keys), and
    the rows it was read from."""
    rows = [row(str(n), name, 90.0 + n) for n, name in enumerate(names, 1)]
    keys = tiers or [[r['key']] for r in rows]
    fr = read(
        passes=[
            {
                'kind': kind,
                'style': None,
                'label_quote': None,
                'group_size': 1,
                'days': days,
                'includes_hotel': kind == 'package',
                'tiers': [tier(*k) for k in keys],
            }
        ],
        skipped=(),
    )
    return fr, rows


@pytest.mark.parametrize(
    'names, change, wrong',
    [
        (['Double room - 3 nights + 2 Full Pass'], dict(kind='package'), 'covers 3 days'),
        (['Full Pass con habitación durante 2 noches'], dict(kind='package', days=3), 'covers 2 days'),
        (['Friday Pass', 'Sunday Pass'], dict(kind='day', days=1), 'different weekdays'),
        (['Full pass - Salsa leader', 'Full pass - Bachata leader'], {}, 'different dance styles'),
        (['Early Bird Fullpass', 'KIZOMBA Fullpass'], {}, 'different dance styles'),
        (['FULL PASS + DÎNER DU 31 DECEMBRE'], {}, 'sold with a meal'),
    ],
)
def test_a_first_read_follows_what_its_tickets_names_say(names, change, wrong):
    fr, rows = one_pass(*names, **change)
    assert any(wrong in p for p in tickets.read_problems(fr, [entry(rows)]))


@pytest.mark.parametrize(
    'names, change',
    [
        (['Double room - 3 nights + 2 Full Pass'], dict(kind='package', days=3)),
        (['Friday Pass Lady', 'Friday Pass Man'], dict(kind='day', days=1)),
        (['Kizomba Fullpass Lady', 'Kizomba Fullpass Man'], {}),
        (['FULL PASS + DÎNER DU 31 DECEMBRE'], dict(kind='package')),
    ],
)
def test_a_first_read_that_follows_its_tickets_names_passes(names, change):
    fr, rows = one_pass(*names, **change)
    assert tickets.rules_problems(fr, {r['key']: r for r in rows}) == []


@pytest.mark.parametrize(
    'name, ok', [('BE PRESENT Bootcamp - Standard Ticket', False), ('Bootcamp deposit - advance payment', True)]
)
def test_a_bootcamp_is_skipped_only_as_a_deposit_its_name_calls_one(name, ok):
    rows = copy.deepcopy(ROWS)
    rows[4] |= {'name': name}
    assert (tickets.read_problems(read(skipped=(('5', 'deposit'),)), [entry(rows)]) == []) == ok
