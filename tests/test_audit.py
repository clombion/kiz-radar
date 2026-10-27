"""pipeline.audit: a value that is no state is named with its point and file; an override that departs from nothing
is stale; the report is the same each time."""
import csv, shutil

import pytest

from pipeline import audit, exceptions, prompt, tickets
from pipeline.extract import answers
from pipeline.states import FirstRead

FILES = {file for file, _, _ in audit.COLUMNS}


def copied(tmp_path, monkeypatch):
    for file in FILES:
        (tmp_path / file).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(audit.ROOT / file, tmp_path / file)
    monkeypatch.setattr(audit, 'ROOT', tmp_path)
    return tmp_path


def test_a_hand_edited_state_is_named_with_its_point_and_file(tmp_path, monkeypatch):
    root = copied(tmp_path, monkeypatch)
    path = root / 'pipeline/tickets/pages.csv'
    rows = list(csv.DictReader(path.open(encoding='utf-8')))
    rows[0]['state'] = 'soon'
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, list(rows[0]), lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    assert audit.unmapped(set()) == [('sales', 'soon', 'pipeline/tickets/pages.csv line 2, state')]
    assert audit.unmapped(set()) == audit.unmapped(set())          # the same report each time


def festival(page, site=None, **k):
    return tickets.Festival(**dict(id=1, title='F', start_date='2027-01-01', end_date='2027-01-02', country=None,
                                   description='', over=False, styles=[], links=[], found=None, first_read=None, log=[],
                                   tiers=[], described=None, page=page, site=site, disputed=False,
                                   need=FirstRead.NONE) | k)


def test_an_override_is_stale_once_a_recipe_reads_its_site_or_no_festival_has_its_page_there():
    o = exceptions.OVERRIDES[0]
    others = [festival(f'https://{p.host}/e') for p in exceptions.OVERRIDES[1:]]
    known = tickets.sites()
    assert audit.stale(others + [festival(f'https://{o.host}/e', over=True)], known) == []   # past festivals count
    assert [s for s, _ in audit.stale(others, known)] == [o]                                 # no festival uses the site
    recipe = ({'hosts': [o.host], 'reseller': None}, f'{o.host}@0123abcd')
    stale = audit.stale(others + [festival(f'https://{o.host}/e')], known | {'x': recipe})
    assert [s for s, _ in stale] == [o] and 'festivals 1' in stale[0][1]                     # a recipe reads it now


def test_an_override_replaces_only_the_state_it_names():
    o = exceptions.OVERRIDES[0]
    assert tickets.waiting(festival(f'https://{o.host}/e')) == o.then
    assert tickets.waiting(festival(f'https://{o.host}/e', need=FirstRead.DISPUTED)) != o.then


def test_an_answer_to_the_current_prompt_names_only_states_its_pass_makes(tmp_path, monkeypatch):
    copied(tmp_path, monkeypatch)
    now, old = prompt.current('extract').hash, '0' * 16
    entry = {'event_id': 1, 'artists': [], 'features': [{'feature': 'promo_code'}]}    # a feature the build makes
    def latest(pass_name, ids):
        if pass_name != 'extract':
            return {}
        return {1: answers.Answer(entry, now, 'b', 'extract/event-1.json', 'm', 't', 'x'),
                2: answers.Answer(entry | {'event_id': 2}, old, 'b', 'extract/event-2.json', 'm', 't', 'x')}
    monkeypatch.setattr(audit.answers, 'latest', latest)
    assert audit.unmapped({1, 2}) == [('feature', 'promo_code', 'pipeline/extract/answers/extract/event-1.json, festival 1')]


def test_an_empty_value_is_allowed_only_where_its_column_allows_it(tmp_path, monkeypatch):
    root = copied(tmp_path, monkeypatch)
    with (root / 'pipeline/pass_prices.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, tickets.PRICE_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerow(dict.fromkeys(tickets.PRICE_FIELDS, '') | {'kind': 'full'})       # a pass for all its styles
    path = root / 'pipeline/tickets/status.csv'
    rows = list(csv.DictReader(path.open(encoding='utf-8')))
    rows[0]['waits_for'] = ''
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, list(rows[0]), lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    assert audit.unmapped(set()) == [('waits_for', '', 'pipeline/tickets/status.csv line 2, waits_for')]


def test_the_audit_exits_1_naming_what_it_found_on_stderr(monkeypatch, capsys):
    import sqlite3
    db = sqlite3.connect(':memory:')
    db.execute('create table events (id integer)')
    monkeypatch.setattr(audit.tickets, 'src_db', lambda: db)
    monkeypatch.setattr(audit, 'unmapped', lambda ids: [('sales', 'soon', 'pages.csv line 2, state')])
    monkeypatch.setattr(audit.tickets, 'festivals', lambda db, today, every=False: [])
    monkeypatch.setattr('sys.argv', ['audit'])
    with pytest.raises(SystemExit) as e:
        audit.main()
    out = capsys.readouterr()
    assert e.value.code == 1 and out.out.startswith('1 unmapped, 6 stale') and "sales 'soon'" in out.err
