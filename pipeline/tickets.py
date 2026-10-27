"""Prices from festivals' ticket pages: judgment once, then code.

    uv run --group tickets -m pipeline.tickets todo           # what needs doing
    uv run --group tickets -m pipeline.tickets read ID [--url U]  # read the page by its recipe, log the rows
    uv run --group tickets -m pipeline.tickets draft ID       # a first read to fill (tickets/drafts/ID.json)
    uv run --group tickets -m pipeline.tickets check ID       # what record would find wrong, writing nothing
    uv run --group tickets -m pipeline.tickets record ID      # check the draft or first read, write ID's prices
    uv run --group tickets -m pipeline.tickets retry ID       # read with a visible browser, then record
    uv run --group tickets -m pipeline.tickets changes [ID]   # what changed between consecutive reads
    uv run --group tickets -m pipeline.tickets page ID URL --note N  # where a festival with no known page sells
    uv run --group tickets -m pipeline.tickets page ID --state S --note N  # or not_yet, offline, closed, none_found
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
once it passes, and in the Action Opus and Sonnet each write one, kept when they agree; when they don't, Fable
writes a third, and one two of the three agree on is kept (else tickets/disputed/<event_id>.json holds them all for
an agent). Besides the schema and the quotes, the checker holds a first read to what its tickets' names say
(rules_problems), so a model that misreads them answers again with the checker's lines. A festival needs one when it is still to come and its
description's prices answer to the current prompt gives the pass a card prices (prices.card_pass) no dated price
(until that answer is asked, it awaits it), or again when its description or its ticket page changes, its page shows
tickets the first read doesn't know, or the first read follows another prompt (for a festival now past, made again
from its latest logged rows). A first read to another prompt is never written: record refuses it, and writing both
files leaves it out until it is made again. Saving a first read archives the prompt it names
(pipeline/prompts/asked/).

record builds the passes from the first read and the latest read rows of the same page: amount, currency, sold out
and quote from the rows, the rest from the first read. A ticket the first read doesn't know is counted as unread; a
tier whose tickets are all gone is left out. It runs the prices pass's checks on what it writes, then replaces the
festival's rows in pipeline/pass_prices.csv (one per tier) and pipeline/ticket_pages.csv (one per festival: page,
read date, who made the first read and with which prompt, recipe version, unread tickets, price notes). It writes
both from every first read and its log, so they hold what the reads and logs say and nothing else: a festival whose
first read no longer fits its page is left out until it is read again, and recording twice writes the same files.

A festival's ticket page is known when it is its first read's, the shop an agent found it sells in, or its first
full link to a ticket shop (a site a recipe reads, or one pipeline/exceptions.py says no recipe can). Each festival
still to come waits for something (states.Waiting), or for nothing: its ticket page found (its links are cut short
or go to no ticket shop; tickets/pages.csv, written by page, records how an agent found it sells them: its shop's
page, or that its sales haven't opened, happen offline or are closed, or that a search found no page, which holds
until its links change), a recipe for its site (unless pipeline/exceptions.py says a recipe can't read the site),
its recipe fixed, its sales to open, or an agent when no two models agreed; one whose reads keep failing waits
for a session. tickets/status.csv holds, for every festival the source database lists, what it waits for (nothing
once it is over), its first_read state, how it sells and its known page; page, read, retry, record and run write it
again. Waiting is backlog, not a failure.

Re-reads: a dated festival (every tier on sale has an end date and none is limited to a number of tickets) once its
last date has passed; every other festival on every monthly run. A festival whose latest read failed is retried on
every run; after REFUSALS failures in a row, todo marks it for a session, where retry reads it with a visible browser.
"""
import argparse, collections, csv, datetime as dt, hashlib, json, os, re, sqlite3, sys
from contextlib import closing
from dataclasses import dataclass, replace
from typing import NamedTuple
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.parent
from pipeline import db as sqlite_db, exceptions, prompt as prompts, spend, states
from pipeline.extract import answers, check_output, prices
from pipeline.states import FirstRead, PassKind, Recheck, Sales, SkipReason, Status, Style, Waiting

HERE = ROOT / 'pipeline' / 'tickets'
SITES, READS, DRAFTS, LOG, DISPUTED = (HERE / d for d in ('sites', 'reads', 'drafts', 'log', 'disputed'))
PRICES_CSV, PAGES_CSV = ROOT / 'pipeline' / 'pass_prices.csv', ROOT / 'pipeline' / 'ticket_pages.csv'
PRICE_FIELDS = ['event_id', 'pass_no', 'kind', 'style', 'label', 'group_size', 'days', 'includes_hotel', 'amount', 'currency', 'fee',
                'alt_amount', 'alt_currency', 'from', 'until', 'quantity', 'sold_out', 'quote']
PAGE_FIELDS = ['event_id', 'event', 'page', 'reseller', 'read_on', 'read_by', 'prompt', 'recipe', 'unread', 'notes']
FOUND_CSV, STATUS_CSV = HERE / 'pages.csv', HERE / 'status.csv'
FOUND_FIELDS = ['event_id', 'event', 'state', 'page', 'links', 'found_by', 'note']
STATUS_FIELDS = ['event_id', 'event', 'start', 'waits_for', 'first_read', 'sales', 'page']
SITE_SCHEMA = json.loads((HERE / 'schemas' / 'site.json').read_text())
READ_SCHEMA = states.schema(HERE / 'schemas' / 'read.json')
LOG_SCHEMA = states.schema(HERE / 'schemas' / 'log.json')
MODELS = ('claude-opus-5-5', 'claude-sonnet-5-5')    # each makes a first read; the first one's is kept when they agree
TIE_BREAK = 'claude-fable-5-1'                         # reads too when they don't, so that two of three may agree
REFUSALS = 3
BOOTCAMP = re.compile(r'(?i)boot\s*-?camp')
# what a ticket's name says that a first read must follow (rules_problems): its nights, its weekdays, its dance styles,
# a meal sold with it, a deposit
NIGHTS = re.compile(r'(?i)\b(\d+)\s*(?:nights?|noches|nuits?|notti|nächte|noites)\b')
WEEKDAYS = {day: re.compile(rf'(?i)\b(?:{words})\b') for day, words in {
    'monday': 'monday|lundi|lunes|montag|lunedì|lunedi', 'tuesday': 'tuesday|mardi|martes|dienstag|martedì|martedi',
    'wednesday': 'wednesday|mercredi|miércoles|miercoles|mittwoch|mercoledì|mercoledi',
    'thursday': 'thursday|jeudi|jueves|donnerstag|giovedì|giovedi', 'friday': 'friday|vendredi|viernes|freitag|venerdì|venerdi',
    'saturday': 'saturday|samedi|sábado|sabado|samstag|sabato', 'sunday': 'sunday|dimanche|domingo|sonntag|domenica'}.items()}
STYLE_WORDS = {style: re.compile(rf'(?i)\b(?:{words})\b') for style, words in {
    Style.KIZOMBA: r'kizomba|semba|urban\s*kiz|tarraxo|tarraxinha', Style.ZOUK: 'zouk', Style.BACHATA: 'bachata',
    Style.SALSA: 'salsa', Style.OTHER: 'kompa|konpa'}.items()}
MEAL = re.compile(r'(?i)dinner|dîner|diner\b|\bcena\b|repas|abendessen|lunch|almuerzo|déjeuner|brunch|\bmeals?\b')
DEPOSIT = re.compile(r'(?i)deposit|advance|anticipo|acompte|anzahlung|instal|payment|caparra|prepay')
FREE = re.compile(r'(?i)\s*(free|gratuit|gratis|gratuito|kostenlos)\s*')
# hosts that are never where tickets are sold: social networks, maps, hotels, kizomba-world itself
NOT_TICKETS = ('facebook', 'instagram', 'youtube', 'kizomba-world', 'google', 'wa.me', 'whatsapp', 'tiktok', 'spotify',
               'booking.com', 'maps', 'linktr', 'accor', 'marriott', 'hotel', 'nh-hotels', 'barcelo', 'bastion',
               'synxis', 'mews.com', 'appartcity', 'twb.nz', 'twibbo', 'fb.me', 'forms.gle')


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
    if amount is None and text['price'] and FREE.fullmatch(text['price']):
        amount = 0.0                        # a free ticket shows a word, not a number
    return {'key': text['key'], 'name': text['name'], 'price': text['price'],
            'amount': round(amount + fee, 2) if amount is not None and fee is not None else amount, 'fee': fee,
            'currency': code(text['currency']), 'alt_price': text['alt_price'], 'alt_amount': number(text['alt_amount']),
            'alt_currency': code(text['alt_currency']), 'sold_out': bool(text['sold_out'])}

def widget(url, recipe):
    """The address that shows the tickets: the page's own, or the one its recipe's widget builds from a pattern found
    in the page's address or in its HTML ({0} the match, {1}… its groups, {host} the page's host)."""
    w = recipe['widget']
    if not w:
        return url
    if w['in'] == 'address':
        m = re.search(w['pattern'], url)
        return fill(w['address'], m, url) if m else url
    if re.match(w['pattern'], url):                 # already the address the widget points to
        return url
    from curl_cffi import requests
    response = requests.get(url, impersonate='chrome', timeout=60)
    response.raise_for_status()
    if m := re.search(w['pattern'], response.text):
        return fill(w['address'], m, url)
    raise LookupError(f'no ticket widget on {url}')

def fill(template, match, url):
    return re.sub(r'\{(\w+)\}', lambda t: urlparse(url).netloc if t[1] == 'host' else match.group(int(t[1])), template)

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

def dump(path, fr):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(fr, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

def save_draft(fr):
    dump(DRAFTS / f"{fr['event_id']}.json", fr)

def save_read(fr):
    """Save a checked first read in tickets/reads/, the current first-read prompt it names archived first."""
    prompt = prompts.current('first_read')
    if fr['prompt'] != prompt.hash:
        raise ValueError(f"{fr['event_id']}: a first read to prompt {fr['prompt']}, not the current {prompt.hash}")
    prompt.archive()
    dump(READS / f"{fr['event_id']}.json", fr)

def settle_dispute(event_id, fr):
    """Remove the festival's dispute when this first read is of rows at least as new as the disputed reads'."""
    path = DISPUTED / f'{event_id}.json'
    if path.exists() and json.loads(path.read_text(encoding='utf-8'))['rows_at'] <= fr['rows_at']:
        path.unlink()

def read_at(fr, entries):
    """The logged read a first read was made from, or None."""
    return next((e for e in entries if e['at'] == fr['rows_at'] and e['status'] == Status.READ), None)

def line(row):
    """The ticket as the page shows it: its name and price, the fee the site adds to it when the price doesn't show
    it (the site shows it apart), and its second price when it has one."""
    fee = f" + {row['fee']:g} fee" if row['fee'] and row['fee'] not in prices.numbers_in(row['price']) else ''
    return f"{row['name']} {row['price']}{fee}" + (f" · {row['alt_price']}" if row['alt_price'] else '')

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
    keys = [k for ps in fr['passes'] for t in ps['tiers'] for k in t['keys']] + [s['key'] for s in fr['skipped']]
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
    found += prices.style_problems(fr['passes'], fr['styles'])
    return found + rules_problems(fr, rows)

def rules_problems(fr, rows):
    """What a first read gets wrong of what its tickets' names say, by the prompt's rules: a pass of tickets for N
    nights covers N days; one pass's tickets name the same weekdays and the same dance styles (others are other
    passes, not its tiers); a pass sold with a meal is a package; a bootcamp is a pass, skipped only as a deposit on
    one, that its name calls one."""
    named = lambda words, name: frozenset(k for k, rx in words.items() if rx.search(name))
    found = []
    for p, ps in enumerate(fr['passes']):
        names = [rows[k]['name'] for t in ps['tiers'] for k in t['keys'] if k in rows]
        nights = {int(m[1]) for n in names if (m := NIGHTS.search(n))}
        if names and all(NIGHTS.search(n) for n in names) and len(nights) == 1 and ps['days'] != (n := nights.pop()):
            found.append(f'passes[{p}].days {ps["days"]}: its tickets are for {n} nights, so it covers {n} days')
        for what, words in (('weekdays', WEEKDAYS), ('dance styles', STYLE_WORDS)):
            if len(said := {named(words, n) for n in names}) > 1:
                found.append(f'passes[{p}]: its tickets name different {what} '
                             f"({'; '.join(sorted(', '.join(sorted(w)) or 'none' for w in said))}): each is a pass of its "
                             'own, not a tier of one')
        if names and all(MEAL.search(n) for n in names) and ps['kind'] not in (PassKind.PACKAGE, PassKind.OTHER):
            found.append(f"passes[{p}].kind {ps['kind']}: its tickets are sold with a meal, so it is a {PassKind.PACKAGE}")
    for s in fr['skipped']:
        if s['key'] in rows and BOOTCAMP.search(name := rows[s['key']]['name']) and \
                (s['reason'] != SkipReason.DEPOSIT or not DEPOSIT.search(name)):
            found.append(f"key {s['key']} ({line(rows[s['key']])}): a bootcamp is a pass ({PassKind.OTHER}), skipped only as "
                         f'a {SkipReason.DEPOSIT} on one that its name calls one, not as a {s["reason"]}')
    return found


# ---- recording

def unread_keys(fr, entry):
    """The keys of the read rows' tickets that the first read neither puts in a tier nor skips (states.Ticket.UNREAD)."""
    mapped = {k for ps in fr['passes'] for t in ps['tiers'] for k in t['keys']} | {s['key'] for s in fr['skipped']}
    return [r['key'] for r in entry['rows'] if r['key'] not in mapped]

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
            alt = None if lead['alt_amount'] is None else {'amount': lead['alt_amount'], 'currency': lead['alt_currency']}
            # a ticket page sells online what is on sale: no door price, no 'current' price
            tiers.append({'amount': lead['amount'], 'currency': lead['currency'], 'fee': lead['fee'], 'alt': alt,
                          'from': tier['from'], 'until': tier['until'], 'quantity': tier['quantity'], 'door': False,
                          'sold_out': all(r['sold_out'] for r in here), 'current': False, 'quote': line(lead)})
        if tiers:
            passes.append({k: ps[k] for k in ('kind', 'style', 'label_quote', 'group_size', 'days', 'includes_hotel')}
                          | {'tiers': tiers})
    unread = unread_keys(fr, entry)
    answer = {'batch': f"page-{fr['event_id']}",
              'events': [{'event_id': fr['event_id'], 'passes': passes, 'rule_quotes': fr['rule_quotes']}]}
    text = '\n'.join(map(line, entry['rows'])) + '\n' + fr['description']
    batch = {'events': [{'event_id': fr['event_id'], 'title': fr['title'], 'description': text}]}
    return answer, unread, found + check_output.problems(prompts.current('prices').schema, batch, answer) + prices.problems(answer)

def csv_rows(path):
    if not path.exists():
        return []
    with path.open(encoding='utf-8') as f:
        return list(csv.DictReader(f))

class Written(NamedTuple):
    tiers: list         # its pass_prices.csv rows
    page: dict          # its ticket_pages.csv row
    unread: list        # the keys of its tickets the first read doesn't know


def written(event_id, fr, entries, known):
    """What a festival writes (Written), or the problems that stop it, a list; known is sites(), for the reseller its
    page is on."""
    if not prompts.is_current('first_read', fr['prompt']):
        return [f"{event_id}: the first read follows prompt {fr['prompt']}, not the current "
                f"{prompts.current('first_read').hash}; make it again"]
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
    tiers = [{'event_id': event_id, 'pass_no': n, 'kind': p['kind'], 'style': p['style'] or '',
              'label': p['label_quote'] or '', 'group_size': p['group_size'] or '', 'days': p['days'] or '',
              'includes_hotel': flag(p['includes_hotel']), 'amount': num(t['amount']), 'currency': t['currency'],
              'fee': num(t['fee']), 'alt_amount': num(t['alt'] and t['alt']['amount']),
              'alt_currency': t['alt']['currency'] if t['alt'] else '', 'from': t['from'] or '',
              'until': t['until'] or '', 'quantity': t['quantity'] or '', 'sold_out': flag(t['sold_out']),
              'quote': t['quote']}
             for n, p in enumerate(answer['events'][0]['passes'], 1) for t in p['tiers']]
    site = known.get(entry['recipe'].split('@')[0])
    page = {'event_id': event_id, 'event': fr['title'], 'page': entry['page'],
            'reseller': site[0]['reseller'] or '' if site else '', 'read_on': entry['at'][:10],
            'read_by': fr['read_by'], 'prompt': fr['prompt'], 'recipe': entry['recipe'],
            'unread': len(unread), 'notes': '\n'.join(fr['rule_quotes'])}
    return Written(tiers, page, unread)

def write_all():
    """Write pass_prices.csv and ticket_pages.csv from every first read to the current prompt and its log, so both
    are what the reads and logs say and nothing else; the problems of the festivals left out. A first read to another
    prompt is left out quietly: its festival waits for it to be made again (redo_prompt)."""
    prices_rows, pages, found, known = [], [], [], sites()
    for path in sorted(READS.glob('*.json'), key=lambda p: int(p.stem)):
        i, fr = int(path.stem), first_read(int(path.stem))
        if not prompts.is_current('first_read', fr['prompt']):
            continue
        match written(i, fr, log(i), known):
            case Written(tiers, page):
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

def record(event_id):
    """Check the festival's draft (moved to tickets/reads/ once it passes) or its first read against its latest read
    rows, then write both files and settle its dispute; the festival's problems, empty when it is written."""
    draft, entries = first_read(event_id, draft=True), log(event_id)
    fr = draft or first_read(event_id)
    if fr is None:
        return [f'{event_id}: no first read (tickets/reads/{event_id}.json); run: uv run --group tickets -m pipeline.tickets draft {event_id}']
    match written(event_id, fr, entries, sites()):
        case Written(tiers, page, unread):
            pass
        case found:
            return found
    if draft:
        save_read(draft)
        (DRAFTS / f'{event_id}.json').unlink()
        (DRAFTS / f'{event_id}.prompt.md').unlink(missing_ok=True)
    others = write_all()
    settle_dispute(event_id, fr)
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

def host(url):
    return urlparse(url).netloc.lower()

def links(db, event_id):
    """The festival's links that may sell tickets, full ones first; a cut-short one ends in …."""
    urls = [u for u, in db.execute('select url from event_links where event_id = ?', (event_id,))]
    urls += re.findall(r'https?://[^\s<>"|)]+', db.execute('select coalesce(description_text, "") from events where id = ?',
                                                           (event_id,)).fetchone()[0])
    keep = {u for u in urls if (h := host(u)) and not any(n in h for n in NOT_TICKETS)}
    return sorted(keep, key=lambda u: ('…' in u, u))

def shop_hosts(known):
    """The hosts of ticket shops: the ones a recipe reads, and the ones the register says no recipe can."""
    return {h for recipe, _ in known.values() for h in recipe['hosts']} | exceptions.BY_HOST.keys()

def known_page(fr, entries, sold, urls, shops):
    """The festival's ticket page when it is known, else None: its first read's, the shop an agent found it sells in
    (tickets/pages.csv), or its first full link to a ticket shop."""
    if fr:
        return read_at(fr, entries)['page']
    if sold:
        return sold['page'] if sold['state'] == Sales.SHOP else None
    return next((u for u in urls if '…' not in u and host(u) in shops), None)

def dated_in_description(entry, start, today):
    """Whether the description's own prices answer gives the pass a card prices (prices.card_pass) a price dated
    today or later."""
    card = prices.card_pass(entry['passes'])
    return card is not None and any(t[k] and prices.on_date(t[k], start) >= today
                                    for t in entry['passes'][card]['tiers'] for k in ('from', 'until'))

# whether a festival in the first_read state needs a (new) first read
NEEDS = states.total('first_read', {
    FirstRead.NOT_NEEDED: False, FirstRead.NONE: True, FirstRead.AWAITS_ANSWER: False, FirstRead.CURRENT: False,
    FirstRead.REDO_PROMPT: True, FirstRead.REDO_DESCRIPTION: True, FirstRead.REDO_PAGE: True,
    FirstRead.REDO_UNREAD: True, FirstRead.DISPUTED: True}, 'tickets.NEEDS')


@dataclass(frozen=True)
class Festival:
    """A festival with what tickets.py knows of it."""
    id: int
    title: str
    start_date: str
    end_date: str
    country: str | None
    description: str            # '' when it has none
    over: bool                  # it ended before today
    styles: list                # prices.styles
    links: list                 # links()
    found: dict | None          # its tickets/pages.csv row, unless a search that found nothing was of other links
    first_read: dict | None
    log: list
    tiers: list                 # its pass_prices.csv rows
    described: answers.Answer | None    # its description's prices answer to the current prompt
    page: str | None            # known_page()
    site: tuple | None          # (recipe, version) for its page's site
    disputed: bool              # tickets/disputed/<id>.json exists
    need: FirstRead = FirstRead.NONE
    unread: tuple = ()          # the latest rows' tickets the first read doesn't know

    @property
    def needs_read(self):
        return NEEDS[self.need]


def why_first_read(f, today):
    """(the festival's first_read state, the latest rows' unread keys). A first read to another prompt is judged by its
    prompt alone, since it may follow another shape."""
    fr, entry = f.first_read, latest_read(f.log)
    unread = ()
    if fr is None:
        state = (FirstRead.AWAITS_ANSWER if f.description and f.described is None else
                 FirstRead.NOT_NEEDED if f.described and dated_in_description(f.described.entry, f.start_date, today) else
                 FirstRead.NONE)
    elif not prompts.is_current('first_read', fr['prompt']):
        state = FirstRead.REDO_PROMPT
    else:
        unread = tuple(unread_keys(fr, entry))
        state = (FirstRead.REDO_DESCRIPTION if fr['description'] != f.description else
                 FirstRead.REDO_PAGE if entry['page'] != read_at(fr, f.log)['page'] else
                 FirstRead.REDO_UNREAD if unread else FirstRead.CURRENT)
    return (FirstRead.DISPUTED if NEEDS[state] and f.disputed else state), unread

def assessed(f, today):
    """The festival with its first_read state as of today."""
    need, unread = why_first_read(f, today)
    return replace(f, need=need, unread=unread)

def links_hash(urls):
    """What a none_found search was made of: the festival's links."""
    return hashlib.sha256('\n'.join(sorted(urls)).encode()).hexdigest()[:16]

def festivals(db, today, only=None, every=False):
    """The festivals still to come, every festival the source database lists (every), or the one asked for (only),
    leaving out the cancelled ones, as Festival records."""
    query = 'select id, title, start_date, end_date, country, description_text from events where cancelled is not 1'
    events = [dict(r) for r in (db.execute(query + ' and id = ?', (only,)) if only else
                                db.execute(query + ' order by start_date') if every else
                                db.execute(query + ' and end_date >= ? order by start_date', (today,)))]
    described = {i: a for i, a in answers.latest('prices', {e['id'] for e in events}).items()
                 if prompts.is_current('prices', a.prompt)}
    known, tiers, found = sites(), {}, found_pages()
    shops = shop_hosts(known)
    for r in csv_rows(PRICES_CSV):
        tiers.setdefault(int(r['event_id']), []).append(r)
    out = []
    for e in events:
        i, fr, entries, urls = e['id'], first_read(e['id']), log(e['id']), links(db, e['id'])
        sold = found.get(i)
        if sold and sold['state'] == Sales.NONE_FOUND and sold['links'] != links_hash(urls):
            sold = None
        page = known_page(fr, entries, sold, urls, shops)
        f = Festival(id=i, title=e['title'], start_date=e['start_date'], end_date=e['end_date'], country=e['country'],
                     description=e['description_text'] or '', over=e['end_date'] < today,
                     styles=prices.styles(db, i), links=urls, found=sold, first_read=fr, log=entries,
                     tiers=tiers.get(i, []), described=described.get(i), page=page,
                     site=site_for(page, known) if page else None, disputed=(DISPUTED / f'{i}.json').exists())
        out.append(assessed(f, today))
    return out


# how a festival an agent found no shop for waits: for nothing it can do while its links stay the ones searched
UNSOLD = states.total('sales', {Sales.SHOP: None, Sales.NOT_YET: Waiting.SALES_OPEN, Sales.OFFLINE: Waiting.NOTHING,
                                Sales.CLOSED: Waiting.NOTHING, Sales.NONE_FOUND: Waiting.NOTHING}, 'tickets.UNSOLD')


def waiting(f):
    """What the festival waits for before its prices can come from its ticket page (states.Waiting): what it waits for
    by default, unless an override for its page's site (pipeline/exceptions.py) replaces that."""
    w = waits_by_default(f)
    o = exceptions.BY_HOST.get(host(f.page)) if f.page else None
    return o.then if o and w == o.instead_of else w

def waits_by_default(f):
    """What the festival waits for by its own data: nothing once it is over; then what its reads say, whether it
    needs a first read, and how it sells and where."""
    if f.over:
        return Waiting.NOTHING
    if failures(f.log) >= REFUSALS:
        return Waiting.SESSION
    if f.log and f.log[-1]['status'] == Status.LAYOUT_BROKEN:
        return Waiting.RECIPE_FIX
    if not f.needs_read:
        return Waiting.NOTHING
    if f.need == FirstRead.DISPUTED:
        return Waiting.AGENT
    if f.found and (w := UNSOLD[f.found['state']]):
        return w
    if not f.page:
        return Waiting.PAGE
    return Waiting.RECIPE if not f.site else Waiting.NOTHING

def write_status(fs):
    """tickets/status.csv: for each festival, what it waits for, its first_read state, how an agent found it sells
    and its known ticket page; the counts of what they wait for."""
    rows = [{'event_id': f.id, 'event': f.title, 'start': f.start_date[:10], 'waits_for': waiting(f),
             'first_read': f.need, 'sales': f.found['state'] if f.found else '', 'page': f.page or ''}
            for f in sorted(fs, key=lambda f: f.id)]
    with STATUS_CSV.open('w', encoding='utf-8', newline='') as out:
        w = csv.DictWriter(out, STATUS_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    return collections.Counter(r['waits_for'] for r in rows)

def status(db):
    """Write tickets/status.csv for every festival the source database lists; the counts of what they wait for."""
    return write_status(festivals(db, dt.date.today().isoformat(), every=True))


# ---- two-model first reads

def question(f, entry):
    tickets = [{'key': r['key'], 'name': r['name'], 'price': r['price'], 'sold_out': r['sold_out']} for r in entry['rows']]
    return json.dumps({'event_id': f.id, 'title': f.title, 'start_date': f.start_date[:10],
                       'end_date': f.end_date[:10], 'country': f.country, 'styles': f.styles,
                       'description': f.description, 'tickets': tickets}, ensure_ascii=False, indent=1)

def ask_read(client, model, f, entry, entries):
    """One model's first read, checked, with one retry on the checker's lines; None when it fails twice."""
    from pipeline.extract import ask
    out = ask.structured(client, model, prompts.current('first_read'), question(f, entry),
                         lambda out: read_problems(draft_of(f, entry, model) | out, entries), f'{f.id} {model}', 'first-read')
    return out and draft_of(f, entry, model) | out

def meaning(fr):
    """What two first reads must agree on: which tickets are skipped, which share a pass and a tier, each pass's
    kind, style, people, days (a day pass is one day, whether its days say 1 or nothing) and hotel, each tier's dates
    and quantity, and why a ticket is skipped where a consumer tells its reasons apart (a skip_reason whose
    disposition is not kept). Labels and quotes may differ."""
    told = {s.key for s in states.of('skip_reason') if s.disposition != states.Disposition.KEPT}
    return frozenset((ps['kind'], ps['style'], ps['group_size'], 1 if ps['kind'] == 'day' else ps['days'], ps['includes_hotel'],
                      frozenset((frozenset(t['keys']), t['from'], t['until'], t['quantity'])
                                for t in ps['tiers'])) for ps in fr['passes']), \
        frozenset((s['key'], s['reason'] if s['reason'] in told else None) for s in fr['skipped'])

def agreed(reads):
    """Of the models' reads ({model: read, or None when it failed}), the first that another agrees with, its read_by
    naming every model that agrees; else None."""
    done = [(m, r) for m, r in reads.items() if r]
    for m, r in done:
        if len(same := [n for n, other in done if meaning(other) == meaning(r)]) > 1:
            return r | {'read_by': ' + '.join(same)}
    return None

def models_read(client, f, entry, entries):
    """The first read two models agree on: MODELS', or when they don't, one TIE_BREAK agrees with; else None, with
    every read in tickets/disputed/ for an agent."""
    reads = {m: ask_read(client, m, f, entry, entries) for m in MODELS}
    if found := agreed(reads):
        return found
    reads[TIE_BREAK] = ask_read(client, TIE_BREAK, f, entry, entries)
    if found := agreed(reads):
        return found
    DISPUTED.mkdir(exist_ok=True)
    (DISPUTED / f'{f.id}.json').write_text(json.dumps({'rows_at': entry['at'], 'reads': reads}, ensure_ascii=False,
                                                      indent=1) + '\n', encoding='utf-8')
    return None


# ---- commands

FULL_URL = re.compile(r'https?://[^\s…]+')

def full_url(url):
    if not FULL_URL.fullmatch(url):
        sys.exit(f'{url}: not a full address')
    return url

def draft_of(f, entry, by):
    return {'event_id': f.id, 'title': f.title, 'start_date': f.start_date[:10], 'read_by': by,
            'prompt': prompts.current('first_read').hash, 'rows_at': entry['at'], 'styles': f.styles,
            'description': f.description, 'passes': [], 'skipped': [], 'rule_quotes': []}

def one(db, event_id, page=None):
    f = next(iter(festivals(db, dt.date.today().isoformat(), event_id)), None)
    if f is None:
        sys.exit(f'{event_id}: no such festival, or it is cancelled')
    return replace(f, page=page, site=site_for(page, sites())) if page else f

def cmd_read(db, event_id, url=None, visible=None):
    f = one(db, event_id, url and full_url(url))
    if not f.page:
        sys.exit(f'{event_id}: no known ticket page; find it and pass --url')
    if not f.site:
        sys.exit(f'{event_id}: no recipe for {host(f.page)}; write tickets/sites/<site>.json '
                 '(schema tickets/schemas/site.json) from the page, then read again')
    entry = attempt(f.page, *f.site, visible)
    append(event_id, entry)
    status(db)
    if entry['status'] != Status.READ:
        sys.exit(f"{event_id}: {entry['status']}: {entry['why']}"
                 + (f'; try: uv run --group tickets -m pipeline.tickets retry {event_id}' if entry['status'] == Status.REFUSED else ''))
    print(f"{event_id}: {len(entry['rows'])} tickets read at {entry['at']} from {entry['url']}")
    for r in entry['rows']:
        print(f"  {r['key']:>12}  {line(r)}{'  (sold out)' if r['sold_out'] else ''}")

def cmd_draft(db, event_id):
    f, path = one(db, event_id), DRAFTS / f'{event_id}.json'
    if path.exists():
        sys.exit(f'{shown(path)} exists; delete it to start the draft again')
    if not (entry := latest_read(f.log)):
        sys.exit(f'{event_id}: no read rows yet; run: uv run --group tickets -m pipeline.tickets read {event_id}')
    save_draft(draft_of(f, entry, 'agent'))
    asked = DRAFTS / f'{event_id}.prompt.md'
    asked.write_text(prompts.current('first_read').text + '\n======== the festival ========\n\n' + question(f, entry)
                     + '\n', encoding='utf-8')
    print(f'Fill passes, skipped and rule_quotes in {shown(path)} following {shown(asked)}, the prompt the models '
          f'answer, with the festival and the tickets of the read at {entry["at"]}; '
          f'then run: uv run --group tickets -m pipeline.tickets record {event_id}')

def cmd_check(event_id):
    """The problems record would find in the festival's draft (or first read), without writing anything."""
    fr = first_read(event_id, draft=True) or first_read(event_id)
    if fr is None:
        sys.exit(f'{event_id}: no draft or first read')
    match written(event_id, fr, log(event_id), sites()):
        case Written(tiers, _, unread):
            print(f'{event_id}: passes; {len(tiers)} prices' + (f', {len(unread)} tickets not read' if unread else ''))
        case found:
            sys.exit('\n'.join(found))

def cmd_record(db, event_id):
    if found := record(event_id):
        sys.exit('\n'.join(found))
    status(db)
    print('Then: python3 -m pipeline.extract.load_extract, uv run --group artists -m pipeline.extract.resolve_artists and '
          'python3 -m pipeline.build_site_db on the newest source/*.sqlite')

def cmd_todo(db):
    today = dt.date.today().isoformat()
    for f in (fs := festivals(db, today)):
        notes = []
        if f.first_read:
            kind, due, why = recheck(f.tiers, f.start_date, today)
            notes.append(f"{kind}: {'due' if due else 'not due'}, {why}")
            if n := failures(f.log):
                notes.append(f"{n} failed reads in a row ({f.log[-1]['status']}: {f.log[-1]['why']})"
                             + (f'; read it in a session: uv run --group tickets -m pipeline.tickets retry {f.id}' if n >= REFUSALS else ''))
        elif not f.needs_read:
            continue
        if f.needs_read:
            w = waiting(f)
            notes.append(f"first read needed, {f.need}: {states.state('first_read', f.need).criterion}"
                         + ('' if w == Waiting.NOTHING else f"; waits for {w} ({states.state('waits_for', w).owner})"))
        if f.disputed:
            notes.append(f'no two models agreed: tickets/disputed/{f.id}.json')
        print(f'{f.id}  {f.start_date[:10]}  {f.title[:50]}')
        for n in notes:
            print(f'      {n}')
        for u in ([f.page] if f.page else f.links)[:3]:
            print(f'      {u}')
    counts = collections.Counter(waiting(f) for f in fs)
    print('\nwaits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))

def found_pages():
    """{event_id: tickets/pages.csv row, its state a Sales}, each checked: a sales state; a page exactly when it sells
    in a shop (a festival whose sales haven't opened may name its coming page); the links searched exactly when a
    search found nothing."""
    out = {}
    for r in csv_rows(FOUND_CSV):
        if r['state'] not in set(Sales) or ((r['state'] == Sales.SHOP) != bool(r['page']) and r['state'] != Sales.NOT_YET) \
                or (r['state'] == Sales.NONE_FOUND) != bool(r['links']):
            sys.exit(f"{shown(FOUND_CSV)}: festival {r['event_id']}: state {r['state']!r} with page {r['page']!r} and "
                     f"links {r['links']!r}")
        out[int(r['event_id'])] = r | {'state': Sales(r['state'])}
    return out

def cmd_page(db, event_id, url, state, note, by):
    """Record how a festival with no known ticket page sells its tickets: its shop's page, or that its sales haven't
    opened, happen offline, are closed, or that a search of its links and the web found no page."""
    f = one(db, event_id)
    if f.first_read:
        sys.exit(f'{event_id}: it has a first read of {f.page}; read a new page with: read {event_id} --url URL')
    if (state == Sales.SHOP) != bool(url) and state != Sales.NOT_YET:
        sys.exit('a shop needs its page, and only a shop (or sales not open yet) has one')
    if url:
        full_url(url)
    rows = [r for r in csv_rows(FOUND_CSV) if int(r['event_id']) != event_id]
    rows.append({'event_id': event_id, 'event': f.title, 'state': state, 'page': url or '',
                 'links': links_hash(f.links) if state == Sales.NONE_FOUND else '', 'found_by': by, 'note': note})
    with FOUND_CSV.open('w', encoding='utf-8', newline='') as out:
        w = csv.DictWriter(out, FOUND_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: int(r['event_id'])))
    status(db)
    print(f"{event_id}: {state}" + (f' {url}' if url else '')
          + ('' if state != Sales.SHOP or site_for(url, sites()) else f'; no recipe for {host(url)} yet'))

def cmd_changes(event_id=None):
    for i in [event_id] if event_id else sorted(int(p.stem) for p in LOG.glob('*.jsonl')):
        for day, text in changes(log(i)):
            print(f'{i}  {day}  {text}')

def cmd_retry(db, event_id):
    cmd_read(db, event_id, visible=True)
    cmd_record(db, event_id)

def cmd_run(db, ids=None):
    """Re-read what is due and retry failures, first-read with the models what needs it, and make again, from their
    latest logged rows, the first reads of festivals now past that follow another prompt (of the festivals ids
    names, when it names some); then write both files. Exits 1 naming each festival whose page broke its recipe,
    reached REFUSALS failures, or no longer fits its first read."""
    import anthropic
    today = dt.date.today().isoformat()
    client, alarms, budget = None, [], None
    if ids and (missing := ids - {i for i, in db.execute('select id from events')}):
        sys.exit(f'no such festival: {sorted(missing)}')

    def make(f, entry):
        nonlocal client, budget
        client = client or anthropic.Anthropic()
        try:
            new = models_read(client, f, entry, log(f.id))
            if new:
                save_read(new)
                settle_dispute(f.id, new)
            print(f'{f.id}: first read ' + (f"by {new['read_by']}" if new else f'disputed: tickets/disputed/{f.id}.json'))
        except spend.BudgetSpent as e:
            budget = f'{e}: the other first reads wait for next month'
            alarms.append(budget)

    for f in (f for f in festivals(db, today) if not ids or f.id in ids):
        i, fr = f.id, f.first_read
        if fr and f.site and (recheck(f.tiers, f.start_date, today)[1] or failures(f.log)):
            entry = attempt(f.page, *f.site)
            append(i, entry)
            print(f"{i}: {entry['status']}" + (f": {entry['why']}" if 'why' in entry else ''))
            if entry['status'] == Status.LAYOUT_BROKEN:
                alarms.append(f"{i}: layout broken ({entry['why']}); the recipe {entry['recipe']} needs an agent")
            elif failures(log(i)) == REFUSALS:
                alarms.append(f'{i}: {REFUSALS} failed reads in a row; read it in a session: uv run --group tickets -m pipeline.tickets retry {i}')
            f = assessed(replace(f, log=log(i)), today)
        if f.needs_read and f.need != FirstRead.DISPUTED and f.site:
            entry = latest_read(f.log)
            if entry is None or entry['at'][:10] != today:
                append(i, entry := attempt(f.page, *f.site))
            if entry['status'] == Status.READ and not budget:
                make(f, entry)
            else:
                print(f"{i}: {entry['status']}: {entry['why']}")
                if entry['status'] == Status.LAYOUT_BROKEN:
                    alarms.append(f"{i}: layout broken ({entry['why']}); the recipe {entry['recipe']} needs an agent")
    for f in festivals(db, today, every=True):
        if f.over and (not ids or f.id in ids) and f.need == FirstRead.REDO_PROMPT and not budget:
            make(f, latest_read(f.log))     # its page sells nothing any more; its logged rows still say what it sold
    alarms += write_all()
    counts = status(db)
    print('waits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))
    if alarms:
        sys.exit('\n'.join(alarms))

def main():
    ap = argparse.ArgumentParser(description="Prices from festivals' ticket pages.")
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('todo', help='what needs doing')
    r = sub.add_parser('read', help="read a festival's ticket page and log its rows")
    r.add_argument('id', type=int)
    r.add_argument('--url', help='the ticket page, when the festival has no known one')
    for name, text in (('draft', 'a first read to fill, from the latest rows'), ('record', 'check and write the prices'),
                       ('check', 'what record would find wrong, writing nothing'),
                       ('retry', 'read with a visible browser, then record')):
        sub.add_parser(name, help=text).add_argument('id', type=int)
    sub.add_parser('changes', help='what changed between reads').add_argument('id', type=int, nargs='?')
    pg = sub.add_parser('page', help='record where a festival with no known ticket page sells its tickets')
    pg.add_argument('id', type=int)
    pg.add_argument('url', nargs='?', help='the ticket page')
    pg.add_argument('--state', type=Sales, choices=list(Sales), default=Sales.SHOP,
                    help='shop (the default, with its page), ' + ', '.join(s for s in Sales if s != Sales.SHOP))
    pg.add_argument('--note', required=True, help='how it was found, or why there is none')
    pg.add_argument('--by', default='agent', help='who found it')
    sub.add_parser('run', help='the monthly Action').add_argument(
        '--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"')
    a = ap.parse_args()
    if a.cmd in ('read', 'retry', 'run'):       # a recipe may need a visible browser
        from pipeline import read_page
        read_page.on_display()
    match a.cmd:
        case 'check': return cmd_check(a.id)
        case 'changes': return cmd_changes(a.id)
    with closing(src_db()) as db:
        match a.cmd:
            case 'todo': cmd_todo(db)
            case 'read': cmd_read(db, a.id, a.url)
            case 'draft': cmd_draft(db, a.id)
            case 'record': cmd_record(db, a.id)
            case 'retry': cmd_retry(db, a.id)
            case 'page': cmd_page(db, a.id, a.url, a.state, a.note, a.by)
            case 'run': cmd_run(db, a.only)

if __name__ == '__main__':
    main()
