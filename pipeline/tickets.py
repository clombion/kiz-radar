"""Prices from festivals' ticket pages: judgment once, then code.

    uv run --group tickets -m pipeline.tickets todo           # what needs doing
    uv run --group tickets -m pipeline.tickets read ID [--url U]  # read the page by its recipe, log the rows
    uv run --group tickets -m pipeline.tickets draft ID       # a first read to fill (tickets/drafts/ID.json)
    uv run --group tickets -m pipeline.tickets check ID       # what record would find wrong, writing nothing
    uv run --group tickets -m pipeline.tickets record ID      # check the draft or first read, write ID's prices
    uv run --group tickets -m pipeline.tickets retry ID       # read with a visible browser, then record
    uv run --group tickets -m pipeline.tickets changes [ID]   # what changed between consecutive reads
    uv run --group tickets -m pipeline.tickets page ID URL --note N  # where a festival with no full link sells
    uv run --group tickets -m pipeline.tickets page ID --state S --note N  # or not_yet, offline or closed
    uv run --group tickets -m pipeline.tickets run            # the monthly Action

A site recipe (tickets/sites/<site>.json, schema tickets/schemas/site.json) says where a site's ticket rows are; an
agent writes one per site. read applies it in a browser (read_page.rows) and appends one entry per attempt to
tickets/log/<event_id>.jsonl (schema tickets/schemas/log.json): read (with every row: key, name, price as shown,
amount, currency, a second price when the site shows one, sold out), refused (no rows and an HTTP error, or the page
would not load), or layout_broken (the recipe's selectors fail, no rows, two rows with one key, or a row without its
key, name, price, amount or currency: the recipe needs an agent).

A first read (tickets/reads/<event_id>.json, schema tickets/schemas/read.json) says which pass each ticket is, by its
key, from the rows of one logged read (rows_at) and the festival's description: every ticket is in a tier or
skipped, and dates and price notes are quoted from the description or the tickets; its page is that read's. Only
checked first reads are saved there: an agent fills a draft (tickets/drafts/, not committed) that record moves there
once it passes, and in the Action Opus and Sonnet each write one, kept only when they agree (else
tickets/disputed/<event_id>.json holds both for an agent). A festival needs one when it is still to come and its
description gives no dated full pass or package price, or again when its description or its ticket page changes, or
its page shows tickets the first read doesn't know.

record builds the passes from the first read and the latest read rows of the same page: amount, currency, sold out
and quote from the rows, the rest from the first read. A ticket the first read doesn't know is counted as unread; a
tier whose tickets are all gone is left out. It runs the prices pass's checks on what it writes, then replaces the
festival's rows in pipeline/pass_prices.csv (one per tier) and pipeline/ticket_pages.csv (one per festival: page,
read date, who made the first read and with which prompt, recipe version, unread tickets, price notes). It writes
both from every first read and its log, so they hold what the reads and logs say and nothing else: a festival whose
first read no longer fits its page is left out until it is read again, and recording twice writes the same files.

A festival without a first read waits for something (Waiting): its ticket page found (its links are cut short or
none sells tickets; tickets/pages.csv, written by page, records how an agent found it sells them: its shop's page,
or that its sales haven't opened, happen offline or are closed), a recipe for its site, or an agent when the two models disagreed; one whose reads keep failing waits for a
session. The monthly run writes them all to tickets/waiting.csv and prints the counts; waiting is backlog, not a
failure.

Re-reads: a dated festival (every tier on sale has an end date and none is limited to a number of tickets) once its
last date has passed; every other festival on every monthly run. A festival whose latest read failed is retried on
every run; after REFUSALS failures in a row, todo marks it for a session, where retry reads it with a visible browser.
"""
import argparse, collections, csv, datetime as dt, hashlib, json, os, re, sqlite3, sys
from enum import StrEnum
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.parent
from pipeline import db as sqlite_db
from pipeline.extract import check_output, prices

HERE = ROOT / 'pipeline' / 'tickets'
SITES, READS, DRAFTS, LOG, DISPUTED = (HERE / d for d in ('sites', 'reads', 'drafts', 'log', 'disputed'))
PRICES_CSV, PAGES_CSV = ROOT / 'pipeline' / 'pass_prices.csv', ROOT / 'pipeline' / 'ticket_pages.csv'
PRICE_FIELDS = ['event_id', 'kind', 'label', 'group_size', 'days', 'includes_hotel', 'amount', 'currency', 'fee',
                'alt_amount', 'alt_currency', 'from', 'until', 'quantity', 'sold_out', 'quote']
PAGE_FIELDS = ['event_id', 'event', 'page', 'reseller', 'read_on', 'read_by', 'prompt_version', 'recipe', 'unread', 'notes']
FOUND_CSV, WAITING_CSV = HERE / 'pages.csv', HERE / 'waiting.csv'
FOUND_FIELDS = ['event_id', 'event', 'state', 'page', 'found_by', 'note']
WAITING_FIELDS = ['event_id', 'event', 'start', 'waits_for', 'page', 'note']
SITE_SCHEMA = json.loads((HERE / 'schemas' / 'site.json').read_text())
READ_SCHEMA = json.loads((HERE / 'schemas' / 'read.json').read_text())
LOG_SCHEMA = json.loads((HERE / 'schemas' / 'log.json').read_text())
PRICES_SCHEMA = json.loads((ROOT / 'pipeline' / 'extract' / 'schemas' / 'prices.json').read_text())
PROMPT = 'first-read-v2'      # on top of the prices prompt, prices.PROMPT
MODELS = ('claude-opus-5-5', 'claude-sonnet-5-5')    # the first one's read is kept when both agree
REFUSALS = 3
# hosts that are never where tickets are sold: social networks, maps, hotels, kizomba-world itself
NOT_TICKETS = ('facebook', 'instagram', 'youtube', 'kizomba-world', 'google', 'wa.me', 'whatsapp', 'tiktok', 'spotify',
               'booking.com', 'maps', 'linktr', 'accor', 'marriott', 'hotel', 'nh-hotels', 'barcelo', 'bastion',
               'synxis', 'mews.com', 'appartcity', 'twb.nz', 'twibbo', 'fb.me', 'forms.gle')


class Status(StrEnum):
    READ = 'read'
    REFUSED = 'refused'
    LAYOUT_BROKEN = 'layout_broken'


class Sales(StrEnum):
    """How a festival with no full link sells its tickets, as an agent found it (tickets/pages.csv)."""
    SHOP = 'shop'              # a page sells them online: page is that page
    NOT_YET = 'not_yet'        # sales are announced but not open ("coming soon", "TBA")
    OFFLINE = 'offline'        # by message, e-mail, a form then payment, a bank transfer or an agency
    CLOSED = 'closed'          # its sales or registrations are closed


class Waiting(StrEnum):
    """What a festival with no prices from its ticket page waits for."""
    PAGE = 'its ticket page found'          # no full link to it: kizomba-world cut it short, or gave none
    RECIPE = 'a recipe for its site'
    AGENT = 'an agent: the two models disagreed'
    SESSION = 'a session: its reads keep failing'
    NOT_YET = 'its sales to open'
    OFFLINE = 'nothing: it sells its tickets by message or form'
    CLOSED = 'nothing: its sales are closed'


class Recheck(StrEnum):
    DATED = 'dated'      # read again once its last date has passed
    MONTHLY = 'monthly'  # read again on every monthly run


# ---- sites and reading

def shown(path):
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path

def problems(schema, value):
    from jsonschema import Draft202012Validator
    return [f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in Draft202012Validator(schema).iter_errors(value)]

def sites():
    """{site: (recipe, version)}, each recipe checked against its schema; the version changes with the file."""
    out = {}
    for path in sorted(SITES.glob('*.json')):
        recipe = json.loads(path.read_text())
        if errs := problems(SITE_SCHEMA, recipe):
            sys.exit(f'{shown(path)}: ' + '; '.join(errs))
        out[recipe['site']] = recipe, f"{recipe['site']}@{hashlib.sha256(path.read_bytes()).hexdigest()[:8]}"
    return out

def site_for(url, known):
    """(recipe, version) for the site a page is on, or None."""
    host = urlparse(url).netloc.lower()
    return next((v for v in known.values() if host in v[0]['hosts']), None)

def number(text):
    """'3,125.00', '1.800,00', '81.03' and '1 800' as numbers: the last separator before one or two digits is the
    decimal point, every other one separates thousands. None when it is no number."""
    s = re.sub(r"[\s’']", '', text or '')
    if not re.fullmatch(r'\d+(?:[.,]\d+)*', s):
        return None
    whole, dec = (m[1], m[2]) if (m := re.fullmatch(r'(.*)[.,](\d{1,2})', s)) else (s, '')
    return float(re.sub(r'\D', '', whole) + ('.' + dec if dec else ''))

def parsed(raw, symbols):
    """A row as logged, from read_page.rows()'s strings: whitespace collapsed, numbers read, symbols as currency codes,
    and the amount what a buyer pays: the price plus the fee the site adds to it, when it shows one."""
    text = {k: ' '.join(v.split()) if isinstance(v, str) else v for k, v in raw.items()}
    code = lambda t: t and symbols.get(t, t)
    amount, fee = number(text['amount']), number(text['fee']) or None      # a fee of 0 is none
    return {'key': text['key'], 'name': text['name'], 'price': text['price'],
            'amount': round(amount + fee, 2) if amount is not None and fee is not None else amount, 'fee': fee,
            'currency': code(text['currency']), 'alt_price': text['alt_price'], 'alt_amount': number(text['alt_amount']),
            'alt_currency': code(text['alt_currency']), 'sold_out': bool(text['sold_out'])}

def widget(url, recipe):
    """The address that shows the tickets: the page's own, or the widget its HTML points to."""
    if not recipe['widget'] or re.match(recipe['widget']['pattern'], url):
        return url
    from curl_cffi import requests
    response = requests.get(url, impersonate='chrome', timeout=60)
    response.raise_for_status()
    if m := re.search(recipe['widget']['pattern'], response.text):
        return m.group(0) + recipe['widget']['suffix']
    raise LookupError(f'no ticket widget on {url}')

def dotted(value, path):
    for part in path.split('.'):
        value = value.get(part) if isinstance(value, dict) else None
    return value

def as_text(value):
    return None if value is None else str(value).lower() if isinstance(value, bool) else str(value)

def api_value(f, item, html):
    """A ticket's value by an api field of its recipe (schemas/site.json), as read_page.rows() gives values: a string or None."""
    if f is None:
        return None
    if 'json' in f:
        v = as_text(dotted(item, f['json']))
    elif 'page' in f:
        v = (m[1] if m.groups() else m[0]) if (m := re.search(f['page'], html)) else None
    else:
        v = re.sub(r'\{([\w.]+)\}', lambda m: as_text(dotted(item, m[1])) or '', f['text'])
    if v is not None and f.get('match'):
        v = (m[1] if m.groups() else m[0]) if (m := re.search(f['match'], v)) else None
    return v

def api_rows(page, recipe):
    """(HTTP status, the API's address, the tickets as read_page.rows() gives rows) for a site whose page carries no
    ticket ids but whose API does: the event's id from the page, then each ticket of the API's list."""
    from curl_cffi import requests
    html = requests.get(page, impersonate='chrome', timeout=60)
    html.raise_for_status()
    if not (m := re.search(recipe['api']['id'], html.text)):
        raise LookupError(f'no event id on {page}')
    url = recipe['api']['url'].replace('{id}', m[1])
    response = requests.get(url, impersonate='chrome', timeout=60)
    if response.status_code >= 400:
        return response.status_code, url, []
    items = dotted(response.json(), recipe['api']['items'])
    if not isinstance(items, list):
        raise LookupError(f"{url}: no list at {recipe['api']['items']}")
    return response.status_code, url, [{k: api_value(f, item, html.text) for k, f in recipe['fields'].items()} for item in items]

def attempt(page, recipe, version, visible=None):
    """One read of a ticket page, as its log entry."""
    from curl_cffi.requests.exceptions import RequestException
    from patchright.sync_api import Error
    from pipeline.read_page import RecipeError, rows
    entry = {'at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'page': page, 'recipe': version}
    if recipe['api']:
        try:
            status, url, raw = api_rows(page, recipe)
        except (LookupError, ValueError) as e:      # no event id, no ticket list, or no JSON
            return entry | {'status': Status.LAYOUT_BROKEN, 'why': f'{type(e).__name__}: {e}'[:300]}
        except RequestException as e:
            return entry | {'status': Status.REFUSED, 'why': f'{type(e).__name__}: {e}'[:300]}
        return judged(entry | {'url': url, 'http': status}, status, url, raw, recipe)
    try:
        url = widget(page, recipe)
    except LookupError as e:
        return entry | {'status': Status.LAYOUT_BROKEN, 'why': str(e)}
    except RequestException as e:
        return entry | {'status': Status.REFUSED, 'why': f'{type(e).__name__}: {e}'[:300]}
    entry['url'] = url
    try:
        status, title, raw = rows(url, recipe, visible)
    except RecipeError as e:
        return entry | {'status': Status.LAYOUT_BROKEN, 'why': f'the recipe fails on the page: {e}'[:300]}
    except Error as e:                      # the page would not load
        return entry | {'status': Status.REFUSED, 'why': f'{type(e).__name__}: {e}'[:300]}
    return judged(entry | {'http': status}, status, title, raw, recipe)

def judged(entry, status, title, raw, recipe):
    """The log entry for a read that got this far: refused, layout_broken, or read with its rows."""
    # a browser check answers 4xx, then shows the page once it has passed, so the status alone decides nothing
    if not raw and status and status >= 400:
        return entry | {'status': Status.REFUSED, 'why': f'HTTP {status} ({title})'}
    got = [parsed(r, recipe['symbols']) for r in raw]
    keys = [r['key'] for r in got]
    bad = [f"row {i} ({r['name'] or r['key']}): {p}" for i, r in enumerate(got) for p in problems(LOG_SCHEMA['$defs']['row'], r)]
    bad += [f'two rows with key {k}' for k in sorted({k for k in keys if keys.count(k) > 1})]
    if bad or not got:
        return entry | {'status': Status.LAYOUT_BROKEN, 'why': '; '.join(bad or ['no ticket rows'])[:300]}
    return entry | {'status': Status.READ, 'rows': got}


# ---- the log and the first reads

def log(event_id):
    path = LOG / f'{event_id}.jsonl'
    if not path.exists():
        return []
    entries = [json.loads(s) for s in path.read_text(encoding='utf-8').splitlines() if s.strip()]
    for n, e in enumerate(entries, 1):
        if errs := problems(LOG_SCHEMA, e):
            sys.exit(f'{shown(path)} line {n}: ' + '; '.join(errs))
    # git merges the log line by line (.gitattributes), so a line edited in place comes back twice
    if twice := sorted({e['at'] for e in entries if [d['at'] for d in entries].count(e['at']) > 1}):
        sys.exit(f'{shown(path)}: two entries at {", ".join(twice)}; the log is only ever appended to')
    return sorted(entries, key=lambda e: e['at'])

def append(event_id, entry):
    if errs := problems(LOG_SCHEMA, json.loads(json.dumps(entry))):
        raise ValueError(f'{event_id}: a log entry outside tickets/schemas/log.json: ' + '; '.join(errs))
    LOG.mkdir(exist_ok=True)
    with (LOG / f'{event_id}.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + '\n')

def latest_read(entries):
    return next((e for e in reversed(entries) if e['status'] == Status.READ), None)

def failures(entries):
    """How many attempts in a row have failed, counting back from the latest."""
    n = 0
    for e in reversed(entries):
        if e['status'] == Status.READ:
            break
        n += 1
    return n

def first_read(event_id, draft=False):
    path = (DRAFTS if draft else READS) / f'{event_id}.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None

def save_read(fr, draft=False):
    folder = DRAFTS if draft else READS
    folder.mkdir(exist_ok=True)
    (folder / f"{fr['event_id']}.json").write_text(json.dumps(fr, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

def read_at(fr, entries):
    """The logged read a first read was made from, or None."""
    return next((e for e in entries if e['at'] == fr['rows_at'] and e['status'] == Status.READ), None)

def line(row):
    """The ticket as the page shows it: its name and price, and its second price when it has one."""
    return f"{row['name']} {row['price']}" + (f" · {row['alt_price']}" if row['alt_price'] else '')

def day_ok(value):
    return prices.day(value) is not None

def in_text(quote, text):
    return check_output.norm(quote) in check_output.norm(text)

def split_price(here):
    """A problem when the tickets of one tier are not all at one price, else None."""
    if len({(r['amount'], r['currency']) for r in here}) > 1:
        return f"tickets {', '.join(r['key'] for r in here)} differ in price ({'; '.join(map(line, here))}); one tier each"

def read_problems(fr, entries):
    """What is wrong with a first read, against the rows it was made from and its description; empty when sound."""
    if found := [f'schema: {p}' for p in problems(READ_SCHEMA, fr)]:
        return found
    if (at := read_at(fr, entries)) is None:
        return [f"rows_at {fr['rows_at']!r} is no read in tickets/log/{fr['event_id']}.jsonl"]
    rows = {r['key']: r for r in at['rows']}
    keys = [k for ps in fr['passes'] for t in ps['tiers'] for k in t['keys']] + fr['skipped']
    found += [f'key {k}: in the read twice' for k in sorted({k for k in keys if keys.count(k) > 1})]
    found += [f'key {k}: not on the page' for k in sorted(set(keys) - set(rows))]
    found += [f'key {k} ({line(rows[k])}): neither in a tier nor skipped' for k in rows if k not in keys]
    desc = fr['description']
    for p, ps in enumerate(fr['passes']):
        names = '\n'.join(line(rows[k]) for t in ps['tiers'] for k in t['keys'] if k in rows)
        if ps['label_quote'] and not in_text(ps['label_quote'], names + '\n' + desc):
            found.append(f"passes[{p}].label_quote {ps['label_quote']!r} is neither in its tickets nor in the description")
        for t, tier in enumerate(ps['tiers']):
            where, here = f'passes[{p}].tiers[{t}]', [rows[k] for k in tier['keys'] if k in rows]
            if tier['date_quote'] and not in_text(tier['date_quote'], '\n'.join(map(line, here)) + '\n' + desc):
                found.append(f"{where}.date_quote {tier['date_quote']!r} is neither in its tickets nor in the description")
            found += [f'{where}.{k} {tier[k]!r} is not a real day' for k in ('from', 'until')
                      if tier[k] and prices.day(tier[k]) is None]
            found += [f'{where}: {d}' for d in [split_price(here)] if d]
            # the page sold these tickets when it was read, so their price can't have ended before that day
            if tier['until'] and day_ok(tier['until']) and any(not r['sold_out'] for r in here) \
                    and prices.on_date(tier['until'], fr['start_date']) < fr['rows_at'][:10]:
                found.append(f"{where}.until {tier['until']}: the page sold these tickets on {fr['rows_at'][:10]}; a date "
                             'that has passed is not theirs')
    found += [f'rule_quotes {q!r} is not in the description' for q in fr['rule_quotes'] if not in_text(q, desc)]
    return found


# ---- recording

def build(fr, entry):
    """(prices answer, unread keys, problems) from a first read and read rows of the same page."""
    rows = {r['key']: r for r in entry['rows']}
    passes, found = [], []
    for ps in fr['passes']:
        tiers = []
        for tier in ps['tiers']:
            here = [rows[k] for k in tier['keys'] if k in rows]
            if not here:
                continue                    # its tickets are no longer on the page
            if d := split_price(here):
                found.append(f'{d}: the first read needs doing again')
            lead = here[0]
            # a ticket page sells online what is on sale: no door price, no 'current' price
            tiers.append({'amount': lead['amount'], 'currency': lead['currency'], 'fee': lead['fee'],
                          'alt_amount': lead['alt_amount'], 'alt_currency': lead['alt_currency'], 'from': tier['from'],
                          'until': tier['until'], 'quantity': tier['quantity'], 'door': False,
                          'sold_out': all(r['sold_out'] for r in here), 'current': False, 'quote': line(lead)})
        if tiers:
            passes.append({k: ps[k] for k in ('kind', 'label_quote', 'group_size', 'days', 'includes_hotel')} | {'tiers': tiers})
    mapped = {k for ps in fr['passes'] for t in ps['tiers'] for k in t['keys']} | set(fr['skipped'])
    unread = [k for k in rows if k not in mapped]
    answer = {'batch': f"page-{fr['event_id']}", 'prompt_version': prices.PROMPT,
              'events': [{'event_id': fr['event_id'], 'passes': passes, 'rule_quotes': fr['rule_quotes']}]}
    text = '\n'.join(map(line, entry['rows'])) + '\n' + fr['description']
    batch = {'events': [{'event_id': fr['event_id'], 'title': fr['title'], 'description': text}]}
    return answer, unread, found + check_output.problems(PRICES_SCHEMA, batch, answer) + prices.problems(answer)

def csv_rows(path):
    if not path.exists():
        return []
    with path.open(encoding='utf-8') as f:
        return list(csv.DictReader(f))

def written(event_id, fr, entries, known):
    """(pass_prices.csv rows, ticket_pages.csv row, unread keys) for a festival, or the problems that stop it; known is
    sites(), for the reseller its page is on."""
    if found := read_problems(fr, entries):
        return [f'{event_id}: {p}' for p in found]
    at, entry = read_at(fr, entries), latest_read(entries)
    if entry['page'] != at['page']:
        return [f"{event_id}: the ticket page changed from {at['page']} to {entry['page']}; make a new first read"]
    answer, unread, found = build(fr, entry)
    if found:
        return [f'{event_id}: {p}' for p in found]
    flag = lambda v: '1' if v else '0'
    num = lambda v: '' if v is None else f'{v:g}'
    tiers = [{'event_id': event_id, 'kind': p['kind'], 'label': p['label_quote'] or '', 'group_size': p['group_size'] or '',
              'days': p['days'] or '', 'includes_hotel': flag(p['includes_hotel']), 'amount': num(t['amount']),
              'currency': t['currency'], 'fee': num(t['fee']), 'alt_amount': num(t['alt_amount']),
              'alt_currency': t['alt_currency'] or '', 'from': t['from'] or '', 'until': t['until'] or '',
              'quantity': t['quantity'] or '', 'sold_out': flag(t['sold_out']), 'quote': t['quote']}
             for p in answer['events'][0]['passes'] for t in p['tiers']]
    site = known.get(entry['recipe'].split('@')[0])
    page = {'event_id': event_id, 'event': fr['title'], 'page': entry['page'],
            'reseller': site[0]['reseller'] or '' if site else '', 'read_on': entry['at'][:10],
            'read_by': fr['read_by'], 'prompt_version': fr['prompt_version'], 'recipe': entry['recipe'],
            'unread': len(unread), 'notes': '\n'.join(fr['rule_quotes'])}
    return tiers, page, unread

def write_all():
    """Write pass_prices.csv and ticket_pages.csv from every first read and its log, so both are what the reads and
    logs say and nothing else; the problems of the festivals left out."""
    prices_rows, pages, found, known = [], [], [], sites()
    for path in sorted(READS.glob('*.json'), key=lambda p: int(p.stem)):
        i = int(path.stem)
        match written(i, first_read(i), log(i), known):
            case (tiers, page, _):
                prices_rows += tiers
                pages.append(page)
            case problems_:
                found += problems_
    for path, fields, rows in ((PRICES_CSV, PRICE_FIELDS, prices_rows), (PAGES_CSV, PAGE_FIELDS, pages)):
        with path.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fields, lineterminator='\n')
            w.writeheader()
            w.writerows(rows)
    return found

def record(event_id, quiet=False):
    """Check the festival's draft (moved to tickets/reads/ once it passes) or its first read against its latest read
    rows, then write both files; the festival's problems, empty when it is written."""
    draft, entries = first_read(event_id, draft=True), log(event_id)
    fr = draft or first_read(event_id)
    if fr is None:
        return [f'{event_id}: no first read (tickets/reads/{event_id}.json); run: uv run --group tickets -m pipeline.tickets draft {event_id}']
    match written(event_id, fr, entries, sites()):
        case (tiers, page, unread):
            pass
        case found:
            return found
    if draft:
        save_read(draft)
        (DRAFTS / f'{event_id}.json').unlink()
    others = write_all()
    disputed = DISPUTED / f'{event_id}.json'
    if disputed.exists() and json.loads(disputed.read_text())['rows_at'] <= fr['rows_at']:
        disputed.unlink()                   # settled by this first read
    if not quiet:
        print(f'{event_id}: {len(tiers)} prices recorded, read {page["read_on"]}'
              + (f'; {len(unread)} tickets not read yet ({", ".join(unread)})' if unread else ''))
        for p in others:
            print(f'left out: {p}', file=sys.stderr)
    return []


# ---- what changed, and when to read again

def changes(entries):
    """What differs between each read and the one before it, as (date, line) pairs."""
    out, before = [], None
    for e in entries:
        if e['status'] != Status.READ:
            continue
        now = {r['key']: r for r in e['rows']}
        if before is not None:
            day = e['at'][:10]
            out += [(day, f'new: {line(now[k])}') for k in now if k not in before]
            out += [(day, f'gone: {line(before[k])}') for k in before if k not in now]
            for k in (k for k in now if k in before):
                a, b = before[k], now[k]
                if (a['amount'], a['currency']) != (b['amount'], b['currency']):
                    out.append((day, f"price: {b['name']} {a['price']} → {b['price']}"))
                if a['sold_out'] != b['sold_out']:
                    out.append((day, f"{'sold out' if b['sold_out'] else 'back on sale'}: {line(b)}"))
        before = now
    return out

def recheck(tiers, start, today):
    """(class, due, why) from a festival's recorded tiers (its pass_prices.csv rows)."""
    on_sale = [t for t in tiers if t['sold_out'] != '1']
    if on_sale and all(t['until'] and not t['quantity'] for t in on_sale):
        last = max(prices.on_date(t['until'], start) for t in on_sale)
        return Recheck.DATED, last < today, f'last price date {last}'
    return Recheck.MONTHLY, True, 'read on every monthly run'


# ---- festivals

def src_db():
    db = sqlite_db.connect(sorted((ROOT / 'source').glob('*.sqlite'), key=os.path.getmtime)[-1], 'ro')
    db.row_factory = sqlite3.Row
    return db

def links(db, event_id):
    """The festival's links that may sell tickets, full ones first; a cut-short one ends in …."""
    urls = [u for u, in db.execute('select url from event_links where event_id = ?', (event_id,))]
    urls += re.findall(r'https?://[^\s<>"|)]+', db.execute('select coalesce(description_text, "") from events where id = ?',
                                                           (event_id,)).fetchone()[0])
    keep = {u for u in urls if (h := urlparse(u).netloc.lower()) and not any(n in h for n in NOT_TICKETS)}
    return sorted(keep, key=lambda u: ('…' in u, u))

def dated_in_description(entry, start, today):
    """Whether the description's own prices answer gives a full pass or package price dated today or later."""
    return any(t[k] and prices.on_date(t[k], start) >= today
               for ps in entry['passes'] if ps['kind'] in ('full', 'package') for t in ps['tiers'] for k in ('from', 'until'))

def why_first_read(f, today):
    """Why the festival needs a (new) first read, or None; and the latest rows' unread keys."""
    fr, entry, desc = f['first_read'], latest_read(f['log']), f['description_text'] or ''
    if fr:
        unread = build(fr, entry)[1]
        return ('the description changed' if fr['description'] != desc else
                'the ticket page changed' if entry['page'] != read_at(fr, f['log'])['page'] else
                f'{len(unread)} tickets not read yet' if unread else None), unread
    if f['described'] and dated_in_description(f['described'].entry, f['start_date'], today):
        return None, []
    return ('the description has no dated full pass price' if f['described'] and f['described'].entry['passes']
            else 'no price in the description'), []

def festivals(db, today, only=None):
    """Every festival still to come (or the one asked for) with what tickets.py knows of it: its first read, log and
    recorded tiers, its description's prices answer, the ticket page and recipe it is read with, and why it needs a
    first read."""
    from pipeline.extract import answers
    query = 'select id, title, start_date, end_date, country, description_text from events where cancelled is not 1 and '
    events = [dict(r) for r in (db.execute(query + 'id = ?', (only,)) if only else
                                db.execute(query + 'end_date >= ? order by start_date', (today,)))]
    described = answers.latest('prices', {e['id'] for e in events})
    known, tiers, found = sites(), {}, found_pages()
    for r in csv_rows(PRICES_CSV):
        tiers.setdefault(int(r['event_id']), []).append(r)
    out = []
    for f in events:
        i, fr, entries, urls = f['id'], first_read(f['id']), log(f['id']), links(db, f['id'])
        full = [u for u in urls if '…' not in u]
        page = (read_at(fr, entries)['page'] if fr else (found[i]['page'] if found[i]['state'] == Sales.SHOP else None) if i in found else
                next((u for u in full if site_for(u, known)), full[0] if full else None))
        f |= {'found': found.get(i), 'first_read': fr, 'log': entries, 'tiers': tiers.get(i, []), 'described': described.get(i), 'page': page,
              'links': urls, 'site': site_for(page, known) if page else None, 'disputed': (DISPUTED / f'{i}.json').exists()}
        f['why'], f['unread'] = why_first_read(f, today)
        out.append(f)
    return out


def waiting(f):
    """What the festival waits for before its prices can come from its ticket page, or None."""
    if f['first_read'] and failures(f['log']) >= REFUSALS:
        return Waiting.SESSION
    if not f['why']:
        return None
    if f['disputed']:
        return Waiting.AGENT
    if f['found'] and f['found']['state'] != Sales.SHOP:
        return {Sales.NOT_YET: Waiting.NOT_YET, Sales.OFFLINE: Waiting.OFFLINE, Sales.CLOSED: Waiting.CLOSED}[f['found']['state']]
    return Waiting.PAGE if not f['page'] else Waiting.RECIPE if not f['site'] else None

def write_waiting(fs):
    """tickets/waiting.csv: every festival still to come that waits for something, and what; the counts."""
    rows = [{'event_id': f['id'], 'event': f['title'], 'start': f['start_date'][:10], 'waits_for': w,
             'page': f['page'] or '', 'note': f['found']['note'] if f['found'] else f['why'] or ''}
            for f in fs if (w := waiting(f))]
    with WAITING_CSV.open('w', encoding='utf-8', newline='') as out:
        w = csv.DictWriter(out, WAITING_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    return collections.Counter(r['waits_for'] for r in rows)


# ---- two-model first reads

def model_schema():
    keep = ('passes', 'skipped', 'rule_quotes')
    return {'type': 'object', 'additionalProperties': False, 'required': list(keep),
            'properties': {k: READ_SCHEMA['properties'][k] for k in keep}}

def question(f, entry):
    system = ((ROOT / 'pipeline' / 'extract' / 'prompts' / f'{prices.PROMPT}.md').read_text() + '\n\n'
              + (HERE / 'prompts' / f'{PROMPT}.md').read_text())
    tickets = [{'key': r['key'], 'name': r['name'], 'price': r['price'], 'sold_out': r['sold_out']} for r in entry['rows']]
    return system, json.dumps({'event_id': f['id'], 'title': f['title'], 'start_date': f['start_date'][:10],
                               'end_date': f['end_date'][:10], 'country': f['country'],
                               'description': f['description_text'] or '', 'tickets': tickets}, ensure_ascii=False, indent=1)

def ask_read(client, model, f, entry, entries):
    """One model's first read, checked, with one retry on the checker's lines; None when it fails twice."""
    from pipeline.extract import ask
    system, content = question(f, entry)
    out = ask.structured(client, model, system, content, model_schema(),
                         lambda out: read_problems(draft_of(f, entry, model) | out, entries), f"{f['id']} {model}")
    return out and draft_of(f, entry, model) | out

def meaning(fr):
    """What two first reads must agree on: which tickets are skipped, which share a pass and a tier, each pass's
    kind, people, days and hotel, and each tier's dates and quantity. Labels and quotes may differ."""
    return frozenset((ps['kind'], ps['group_size'], ps['days'], ps['includes_hotel'],
                      frozenset((frozenset(t['keys']), t['from'], t['until'], t['quantity'])
                                for t in ps['tiers'])) for ps in fr['passes']), frozenset(fr['skipped'])

def two_model_read(client, f, entry, entries):
    """The first model's read when both agree; else None, with both in tickets/disputed/."""
    reads = {m: ask_read(client, m, f, entry, entries) for m in MODELS}
    if all(reads.values()) and len({meaning(r) for r in reads.values()}) == 1:
        return reads[MODELS[0]] | {'read_by': ' + '.join(MODELS)}
    DISPUTED.mkdir(exist_ok=True)
    (DISPUTED / f"{f['id']}.json").write_text(json.dumps({'rows_at': entry['at'], 'reads': reads}, ensure_ascii=False,
                                                         indent=1) + '\n', encoding='utf-8')
    return None


# ---- commands

def draft_of(f, entry, by):
    return {'event_id': f['id'], 'title': f['title'], 'start_date': f['start_date'][:10], 'read_by': by,
            'prompt_version': PROMPT, 'rows_at': entry['at'],
            'description': f['description_text'] or '', 'passes': [], 'skipped': [], 'rule_quotes': []}

def one(event_id, page=None):
    f = next(iter(festivals(src_db(), dt.date.today().isoformat(), event_id)), None)
    if f is None:
        sys.exit(f'{event_id}: no such festival, or it is cancelled')
    if page:
        f |= {'page': page, 'site': site_for(page, sites())}
    return f

def cmd_read(event_id, url=None, visible=None):
    f = one(event_id, url)
    if not f['page']:
        sys.exit(f'{event_id}: no full ticket link; find the page and pass --url')
    if not f['site']:
        sys.exit(f"{event_id}: no recipe for {urlparse(f['page']).netloc}; write tickets/sites/<site>.json "
                 '(schema tickets/schemas/site.json) from the page, then read again')
    entry = attempt(f['page'], *f['site'], visible)
    append(event_id, entry)
    if entry['status'] != Status.READ:
        sys.exit(f"{event_id}: {entry['status']}: {entry['why']}"
                 + (f'; try: uv run --group tickets -m pipeline.tickets retry {event_id}' if entry['status'] == Status.REFUSED else ''))
    print(f"{event_id}: {len(entry['rows'])} tickets read at {entry['at']} from {entry['url']}")
    for r in entry['rows']:
        print(f"  {r['key']:>12}  {line(r)}{'  (sold out)' if r['sold_out'] else ''}")

def cmd_draft(event_id):
    f, path = one(event_id), DRAFTS / f'{event_id}.json'
    if path.exists():
        sys.exit(f'{shown(path)} exists; delete it to start the draft again')
    if not (entry := latest_read(f['log'])):
        sys.exit(f'{event_id}: no read rows yet; run: uv run --group tickets -m pipeline.tickets read {event_id}')
    save_read(draft_of(f, entry, 'agent'), draft=True)
    print(f'Fill passes, skipped and rule_quotes in {shown(path)} following pipeline/extract/prompts/{prices.PROMPT}.md '
          f'and pipeline/tickets/prompts/{PROMPT}.md, from the tickets of the read at {entry["at"]} and the description; '
          f'then run: uv run --group tickets -m pipeline.tickets record {event_id}')

def cmd_check(event_id):
    """The problems record would find in the festival's draft (or first read), without writing anything."""
    fr = first_read(event_id, draft=True) or first_read(event_id)
    if fr is None:
        sys.exit(f'{event_id}: no draft or first read')
    match written(event_id, fr, log(event_id), sites()):
        case (tiers, _, unread):
            print(f'{event_id}: passes; {len(tiers)} prices' + (f', {len(unread)} tickets not read' if unread else ''))
        case found:
            sys.exit('\n'.join(found))

def cmd_record(event_id):
    if found := record(event_id):
        sys.exit('\n'.join(found))
    print('Then: python3 -m pipeline.extract.load_extract, uv run --group artists -m pipeline.extract.resolve_artists and '
          'python3 -m pipeline.build_site_db on the newest source/*.sqlite')

def cmd_todo():
    today = dt.date.today().isoformat()
    for f in (fs := festivals(src_db(), today)):
        notes = []
        if f['first_read']:
            kind, due, why = recheck(f['tiers'], f['start_date'], today)
            notes.append(f"{kind}: {'due' if due else 'not due'}, {why}")
            if n := failures(f['log']):
                notes.append(f"{n} failed reads in a row ({f['log'][-1]['status']}: {f['log'][-1]['why']})"
                             + (f"; read it in a session: uv run --group tickets -m pipeline.tickets retry {f['id']}" if n >= REFUSALS else ''))
        elif not f['why']:
            continue
        if f['why']:
            notes.append(f"first read needed: {f['why']}" + (f'; waits for {w}' if (w := waiting(f)) else ''))
        if f['disputed']:
            notes.append(f"the two models disagreed: tickets/disputed/{f['id']}.json")
        print(f"{f['id']}  {f['start_date'][:10]}  {f['title'][:50]}")
        for n in notes:
            print(f'      {n}')
        for u in ([f['page']] if f['page'] else f['links'])[:3]:
            print(f'      {u}')
    counts = collections.Counter(w for f in fs if (w := waiting(f)))
    print('\nwaiting: ' + '; '.join(f'{n} for {w}' for w, n in counts.most_common()))

def found_pages():
    """{event_id: tickets/pages.csv row}, each checked: a known state, and a page exactly when it sells in a shop (a
    festival whose sales haven't opened may name its coming page)."""
    out = {}
    for r in csv_rows(FOUND_CSV):
        if r['state'] not in set(Sales) or ((r['state'] == Sales.SHOP) != bool(r['page']) and r['state'] != Sales.NOT_YET):
            sys.exit(f"{shown(FOUND_CSV)}: festival {r['event_id']}: state {r['state']!r} with page {r['page']!r}")
        out[int(r['event_id'])] = r
    return out

def cmd_page(event_id, url, state, note, by):
    """Record how a festival with no full link sells its tickets: its shop's page, or that its sales haven't opened,
    happen offline, or are closed."""
    f = one(event_id)
    if f['first_read']:
        sys.exit(f"{event_id}: it has a first read of {f['page']}; read a new page with: read {event_id} --url URL")
    if (state == Sales.SHOP) != bool(url) and state != Sales.NOT_YET:
        sys.exit('a shop needs its page, and only a shop (or sales not open yet) has one')
    if url and not re.match(r'https?://[^\s…]+$', url):
        sys.exit(f'{url}: not a full address')
    rows = [r for r in csv_rows(FOUND_CSV) if int(r['event_id']) != event_id]
    rows.append({'event_id': event_id, 'event': f['title'], 'state': state, 'page': url or '', 'found_by': by, 'note': note})
    with FOUND_CSV.open('w', encoding='utf-8', newline='') as out:
        w = csv.DictWriter(out, FOUND_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: int(r['event_id'])))
    print(f"{event_id}: {state}" + (f' {url}' if url else '')
          + ('' if state != Sales.SHOP or site_for(url, sites()) else f'; no recipe for {urlparse(url).netloc} yet'))

def cmd_changes(event_id=None):
    for i in [event_id] if event_id else sorted(int(p.stem) for p in LOG.glob('*.jsonl')):
        for day, text in changes(log(i)):
            print(f'{i}  {day}  {text}')

def cmd_retry(event_id):
    cmd_read(event_id, visible=True)
    cmd_record(event_id)

def cmd_run():
    """Re-read what is due and retry failures, first-read with two models what needs it, then write both files. Exits
    1 naming each festival whose page broke its recipe, reached REFUSALS failures, or no longer fits its first read."""
    import anthropic
    today, db = dt.date.today().isoformat(), src_db()
    client, alarms = None, []
    for f in festivals(db, today):
        i, fr = f['id'], f['first_read']
        if fr and f['site'] and (recheck(f['tiers'], f['start_date'], today)[1] or failures(f['log'])):
            entry = attempt(f['page'], *f['site'])
            append(i, entry)
            print(f"{i}: {entry['status']}" + (f": {entry['why']}" if 'why' in entry else ''))
            if entry['status'] == Status.LAYOUT_BROKEN:
                alarms.append(f"{i}: layout broken ({entry['why']}); the recipe {entry['recipe']} needs an agent")
            elif failures(log(i)) == REFUSALS:
                alarms.append(f'{i}: {REFUSALS} failed reads in a row; read it in a session: uv run --group tickets -m pipeline.tickets retry {i}')
            f['log'] = log(i)
            f['why'], f['unread'] = why_first_read(f, today)
        if f['why'] and f['site'] and not f['disputed']:
            entry = latest_read(f['log'])
            if entry is None or entry['at'][:10] != today:
                append(i, entry := attempt(f['page'], *f['site']))
            if entry['status'] == Status.READ:
                client = client or anthropic.Anthropic()
                if new := two_model_read(client, f, entry, log(i)):
                    save_read(new)
                print(f'{i}: first read ' + (f"by {new['read_by']}" if new else f'disputed: tickets/disputed/{i}.json'))
            else:
                print(f"{i}: {entry['status']}: {entry['why']}")
        if (DISPUTED / f'{i}.json').exists() and first_read(i):
            record(i, quiet=True)           # a new first read settles an older dispute
    alarms += write_all()
    counts = write_waiting(festivals(db, today))
    print('waiting: ' + '; '.join(f'{n} for {w}' for w, n in counts.most_common()))
    if alarms:
        sys.exit('\n'.join(alarms))

def main():
    ap = argparse.ArgumentParser(description="Prices from festivals' ticket pages.")
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('todo', help='what needs doing')
    r = sub.add_parser('read', help="read a festival's ticket page and log its rows")
    r.add_argument('id', type=int)
    r.add_argument('--url', help='the ticket page, when the festival has no full link to it')
    for name, text in (('draft', 'a first read to fill, from the latest rows'), ('record', 'check and write the prices'),
                       ('check', 'what record would find wrong, writing nothing'),
                       ('retry', 'read with a visible browser, then record')):
        sub.add_parser(name, help=text).add_argument('id', type=int)
    sub.add_parser('changes', help='what changed between reads').add_argument('id', type=int, nargs='?')
    pg = sub.add_parser('page', help='record where a festival with no full link sells its tickets')
    pg.add_argument('id', type=int)
    pg.add_argument('url', nargs='?', help='the ticket page')
    pg.add_argument('--state', type=Sales, choices=list(Sales), default=Sales.SHOP,
                    help='shop (the default, with its page), not_yet, offline or closed')
    pg.add_argument('--note', required=True, help='how it was found, or why there is none')
    pg.add_argument('--by', default='agent', help='who found it')
    sub.add_parser('run', help='the monthly Action')
    a = ap.parse_args()
    if a.cmd in ('read', 'retry', 'run'):       # a recipe may need a visible browser
        from pipeline import read_page
        read_page.on_display()
    match a.cmd:
        case 'todo': cmd_todo()
        case 'read': cmd_read(a.id, a.url)
        case 'draft': cmd_draft(a.id)
        case 'record': cmd_record(a.id)
        case 'check': cmd_check(a.id)
        case 'retry': cmd_retry(a.id)
        case 'changes': cmd_changes(a.id)
        case 'page': cmd_page(a.id, a.url, a.state, a.note, a.by)
        case 'run': cmd_run()

if __name__ == '__main__':
    main()
