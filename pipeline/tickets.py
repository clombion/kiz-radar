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

A site recipe (tickets/sites/<site>.json, a records.Recipe) says where a site's ticket rows are; an
agent writes one per site. read applies it in a browser (read_page.rows) and appends one entry per attempt to
tickets/log/<event_id>.jsonl (records.LogEntry): read (with every row: key, name, price as shown,
amount, currency, a second price when the site shows one, sold out), refused (no rows and an HTTP error, or the page
would not load), or layout_broken (the recipe's selectors fail, no rows, two rows with one key, or a row without its
key, name, price, amount or currency: the recipe needs an agent).

A first read (tickets/reads/<event_id>.json, a records.FirstRead) says which pass each ticket is, by its key, from the
rows of one logged read (rows_at) and the festival's description: every ticket is in a tier or skipped, and dates and
price notes are quoted from the description or the tickets; its page is that read's. Only checked first reads are saved
there: an agent fills a draft (tickets/drafts/, not committed) that record moves there once it passes, and in the Action
Opus and Sonnet each write one, kept when they agree; when they don't, Fable writes a third, and one two of the three
agree on is kept (else tickets/disputed/<event_id>.json holds them all for an agent). Besides its record and the quotes,
the checker holds a first read to what its tickets' names say (rules_problems), so a model that misreads them answers
again with the checker's lines. A festival needs one when it is still to come and its description's prices answer to the
current prompt gives the pass a card prices (prices.card_pass) no dated price (until that answer is asked, it awaits
it), or again when its description or its ticket page changes, its page shows tickets the first read doesn't know, or
the first read follows another prompt (for a festival now past, made again from its latest logged rows). A first read to
another prompt is never written: record refuses it, and writing both files leaves it out until it is made again. Saving
a first read archives the prompt it names (pipeline/prompts/asked/).

record builds the passes from the first read and the latest read rows of the same page: amount, currency, sold out
and quote from the rows, the rest from the first read. A ticket the first read doesn't know is counted as unread; a
tier whose tickets are all gone is left out. It runs the prices pass's checks on what it writes, then replaces the
festival's rows in pipeline/pass_prices.csv (one per tier) and pipeline/ticket_pages.csv (one per festival: page,
read date, who made the first read and with which prompt, recipe version, unread tickets, price notes). It writes
both from every first read and its log, so they hold what the reads and logs say and nothing else: a festival whose
first read no longer fits its page is left out until it is read again, and recording twice writes the same files.

A festival's ticket page is known when it is its first read's, the shop an agent found it sells in, or its first
full link to a ticket shop (a site a recipe reads, or one pipeline/exceptions.py says no recipe can). Each festival
still to come waits for something (enums.Waiting), or for nothing: its ticket page found (its links are cut short
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

import argparse
import collections
import datetime as dt
import hashlib
import json
import re
import sqlite3
import sys
from collections.abc import Iterable, Mapping, Sequence
from contextlib import AbstractContextManager
from dataclasses import dataclass, replace
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlparse

import anthropic
from pydantic import TypeAdapter, ValidationError

from pipeline import db as sqlite_db
from pipeline import exceptions, spend, states
from pipeline import prompt as prompts
from pipeline.enums import FirstRead as FirstReadState
from pipeline.enums import PassKind, Recheck, Sales, SkipReason, Status, Style, Waiting
from pipeline.extract import answers, ask, check_output, prices
from pipeline.records import (
    JSON,
    LOG_ENTRY,
    RECIPE,
    Alt,
    ApiRecipe,
    Batch,
    Dated,
    Dispute,
    Failed,
    FirstRead,
    FirstReadAnswer,
    FoundRow,
    FromJson,
    FromPage,
    FromText,
    Json,
    On,
    PageRecipe,
    PageRow,
    Priced,
    PricedPass,
    PricedTier,
    PriceRow,
    Read,
    ReadHeader,
    ReadTier,
    Record,
    Row,
    Stamped,
    StatusRow,
    errors,
    now,
    today,
)

ROOT = Path(__file__).parent.parent
HERE = ROOT / 'pipeline' / 'tickets'
SITES, READS, DRAFTS, LOG, DISPUTED = (HERE / d for d in ('sites', 'reads', 'drafts', 'log', 'disputed'))
PRICES_CSV, PAGES_CSV = ROOT / 'pipeline' / 'pass_prices.csv', ROOT / 'pipeline' / 'ticket_pages.csv'
FOUND_CSV, STATUS_CSV = HERE / 'pages.csv', HERE / 'status.csv'
MODELS = ('claude-opus-5-5', 'claude-sonnet-5-5')  # each makes a first read; the first one's is kept when they agree
TIE_BREAK = 'claude-fable-5-1'  # reads too when they don't, so that two of three may agree
REFUSALS = 3
WHY_LENGTH = 300  # a failed read's why is cut to this many characters
HTTP_ERROR = 400  # an HTTP status from this one up is an error
BOOTCAMP = re.compile(r'(?i)boot\s*-?camp')
# what a ticket's name says that a first read must follow (rules_problems): its nights, its weekdays, its dance styles,
# a meal sold with it, a deposit
NIGHTS = re.compile(r'(?i)\b(\d+)\s*(?:nights?|noches|nuits?|notti|nächte|noites)\b')
WEEKDAYS: dict[str, re.Pattern[str]] = {
    day: re.compile(rf'(?i)\b(?:{words})\b')
    for day, words in {
        'monday': 'monday|lundi|lunes|montag|lunedì|lunedi',
        'tuesday': 'tuesday|mardi|martes|dienstag|martedì|martedi',
        'wednesday': 'wednesday|mercredi|miércoles|miercoles|mittwoch|mercoledì|mercoledi',
        'thursday': 'thursday|jeudi|jueves|donnerstag|giovedì|giovedi',
        'friday': 'friday|vendredi|viernes|freitag|venerdì|venerdi',
        'saturday': 'saturday|samedi|sábado|sabado|samstag|sabato',
        'sunday': 'sunday|dimanche|domingo|sonntag|domenica',
    }.items()
}
STYLE_WORDS: dict[str, re.Pattern[str]] = {
    style: re.compile(rf'(?i)\b(?:{words})\b')
    for style, words in {
        Style.KIZOMBA: r'kizomba|semba|urban\s*kiz|tarraxo|tarraxinha',
        Style.ZOUK: 'zouk',
        Style.BACHATA: 'bachata',
        Style.SALSA: 'salsa',
        Style.OTHER: 'kompa|konpa',
    }.items()
}
MEAL = re.compile(r'(?i)dinner|dîner|diner\b|\bcena\b|repas|abendessen|lunch|almuerzo|déjeuner|brunch|\bmeals?\b')
DEPOSIT = re.compile(r'(?i)deposit|advance|anticipo|acompte|anzahlung|instal|payment|caparra|prepay')
FREE = re.compile(r'(?i)\s*(free|gratuit|gratis|gratuito|kostenlos)\s*')
# hosts that are never where tickets are sold: social networks, maps, hotels, kizomba-world itself
NOT_TICKETS = (
    'facebook',
    'instagram',
    'youtube',
    'kizomba-world',
    'google',
    'wa.me',
    'whatsapp',
    'tiktok',
    'spotify',
    'booking.com',
    'maps',
    'linktr',
    'accor',
    'marriott',
    'hotel',
    'nh-hotels',
    'barcelo',
    'bastion',
    'synxis',
    'mews.com',
    'appartcity',
    'twb.nz',
    'twibbo',
    'fb.me',
    'forms.gle',
)
type Entry = Read | Failed
LIST: TypeAdapter[list[Json]] = TypeAdapter(list[Json])  # an API's list of tickets
type Raw = Mapping[str, str | None]  # a ticket as read_page.rows() reads it: each recipe field's text, or None


# ---- sites and reading


class Site(NamedTuple):
    recipe: PageRecipe | ApiRecipe
    version: str  # the recipe's site and its file's hash


def shown(path: Path) -> Path:
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path


def sites() -> dict[str, Site]:
    """{site: its recipe and version}, each recipe read as its record; the version changes with the file."""
    out: dict[str, Site] = {}
    for path in sorted(SITES.glob('*.json')):
        try:
            recipe = RECIPE.validate_json(path.read_bytes())
        except ValidationError as e:
            sys.exit('; '.join(errors(e, str(shown(path)))))
        out[recipe.site] = Site(recipe, f'{recipe.site}@{hashlib.sha256(path.read_bytes()).hexdigest()[:8]}')
    return out


def site_for(url: str, known: Mapping[str, Site]) -> Site | None:
    """The recipe and version for the site a page is on, or None."""
    return next((s for s in known.values() if host(url) in s.recipe.hosts), None)


def number(text: str | None) -> float | None:
    """'3,125.00', '1.800,00', '81.03' and '1 800' as numbers: the last separator before one or two digits is the
    decimal point, every other one separates thousands. None when it is no number."""
    s = re.sub(r"[\s’']", '', text or '')
    if not re.fullmatch(r'\d+(?:[.,]\d+)*', s):
        return None
    whole, dec = (m[1], m[2]) if (m := re.fullmatch(r'(.*)[.,](\d{1,2})', s)) else (s, '')
    return float(re.sub(r'\D', '', whole) + ('.' + dec if dec else ''))


def parsed(raw: Raw, symbols: Mapping[str, str]) -> dict[str, object]:
    """A row as logged, from read_page.rows()'s strings: whitespace collapsed, numbers read, symbols as currency codes,
    and the amount what a buyer pays: the price plus the fee the site adds to it, when it shows one."""
    text = {k: None if v is None else ' '.join(v.split()) for k, v in raw.items()}

    def code(t: str | None) -> str | None:
        return t and symbols.get(t, t)

    amount, fee = number(text['amount']), number(text['fee']) or None  # a fee of 0 is none
    if amount is None and text['price'] and FREE.fullmatch(text['price']):
        amount = 0.0  # a free ticket shows a word, not a number
    return {
        'key': text['key'],
        'name': text['name'],
        'price': text['price'],
        'amount': round(amount + fee, 2) if amount is not None and fee is not None else amount,
        'fee': fee,
        'currency': code(text['currency']),
        'alt_price': text['alt_price'],
        'alt_amount': number(text['alt_amount']),
        'alt_currency': code(text['alt_currency']),
        'sold_out': bool(text['sold_out']),
    }


def widget(url: str, recipe: PageRecipe) -> str:
    """The address that shows the tickets: the page's own, or the one its recipe's widget builds from a pattern found
    in the page's address or in its HTML ({0} the match, {1}… its groups, {host} the page's host)."""
    w = recipe.widget
    if not w:
        return url
    if w.in_ == 'address':
        m = re.search(w.pattern, url)
        return fill(w.address, m, url) if m else url
    if re.match(w.pattern, url):  # already the address the widget points to
        return url
    from curl_cffi import requests

    response = requests.get(url, impersonate='chrome', timeout=60)
    response.raise_for_status()
    if m := re.search(w.pattern, response.text):
        return fill(w.address, m, url)
    raise LookupError(f'no ticket widget on {url}')


def fill(template: str, match: re.Match[str], url: str) -> str:
    return re.sub(r'\{(\w+)\}', lambda t: host(url) if t[1] == 'host' else match.group(int(t[1])), template)


def dotted(value: Json, path: str) -> Json:
    for part in path.split('.'):
        value = value.get(part) if isinstance(value, dict) else None
    return value


def as_text(value: Json) -> str | None:
    return None if value is None else str(value).lower() if isinstance(value, bool) else str(value)


def first_group(pattern: str, text: str) -> str | None:
    """The first group of the pattern's first match in the text (all of the match when it has no group), or None."""
    return (m[1] if m.groups() else m[0]) if (m := re.search(pattern, text)) else None


def api_value(f: FromJson | FromPage | FromText | None, item: Json, html: str) -> str | None:
    """A ticket's value by an api field of its recipe, as read_page.rows() gives values: a string or None."""
    match f:
        case None:
            return None
        case FromJson():
            v = as_text(dotted(item, f.json_))
        case FromPage():
            v = first_group(f.page, html)
        case FromText():
            v = re.sub(r'\{([\w.]+)\}', lambda m: as_text(dotted(item, m[1])) or '', f.text)
    return first_group(f.match, v) if v is not None and f.match else v


def api_rows(page: str, recipe: ApiRecipe) -> tuple[int, str, list[dict[str, str | None]]]:
    """(HTTP status, the API's address, the tickets as read_page.rows() gives rows) for a site whose page carries no
    ticket ids but whose API does: the event's id from the page, then each ticket of the API's list."""
    from curl_cffi import requests

    html = requests.get(page, impersonate='chrome', timeout=60)
    html.raise_for_status()
    if not (m := re.search(recipe.api.id, html.text)):
        raise LookupError(f'no event id on {page}')
    url = recipe.api.url.replace('{id}', m[1])
    response = requests.get(url, impersonate='chrome', timeout=60)
    if response.status_code >= HTTP_ERROR:
        return response.status_code, url, []
    try:
        items = LIST.validate_python(dotted(JSON.validate_json(response.content), recipe.api.items))
    except ValidationError as e:
        raise ValueError(f'{url}: no list of tickets at {recipe.api.items} in its JSON') from e
    fields = recipe.fields.named()
    return response.status_code, url, [{k: api_value(f, item, html.text) for k, f in fields} for item in items]


def failed(base: Mapping[str, object], status: Status, why: str) -> Failed:
    """A failed read's log entry: base (when, which page, by which recipe, and the address and HTTP status when it
    got that far), and why it failed."""
    return Failed.model_validate({**base, 'status': status, 'why': why[:WHY_LENGTH]})


def attempt(page: str, site: Site, *, visible: bool | None = None) -> Entry:
    """One read of a ticket page, as its log entry."""
    base: dict[str, object] = {
        'at': now(),
        'page': page,
        'recipe': site.version,
    }
    recipe = site.recipe
    if isinstance(recipe, ApiRecipe):
        return api_attempt(base, page, recipe)
    return page_attempt(base, page, recipe, visible=visible)


def api_attempt(base: dict[str, object], page: str, recipe: ApiRecipe) -> Entry:
    """A read of a site's API: its tickets, or why it failed."""
    from curl_cffi.requests.exceptions import RequestException

    try:
        status, url, raw = api_rows(page, recipe)
    except (LookupError, ValueError) as e:  # no event id, no ticket list, or no JSON
        return failed(base, Status.LAYOUT_BROKEN, f'{type(e).__name__}: {e}')
    except RequestException as e:
        return failed(base, Status.REFUSED, f'{type(e).__name__}: {e}')
    return judged({**base, 'url': url}, status, url, raw, recipe.symbols)


def page_attempt(base: dict[str, object], page: str, recipe: PageRecipe, *, visible: bool | None) -> Entry:
    """A read of a ticket page in a browser: its tickets, or why it failed."""
    from curl_cffi.requests.exceptions import RequestException
    from patchright.sync_api import Error

    from pipeline.read_page import RecipeError, rows

    try:
        url = widget(page, recipe)
    except LookupError as e:
        return failed(base, Status.LAYOUT_BROKEN, str(e))
    except RequestException as e:
        return failed(base, Status.REFUSED, f'{type(e).__name__}: {e}')
    base['url'] = url
    try:
        status, title, raw = rows(url, recipe, visible=visible)
    except RecipeError as e:
        return failed(base, Status.LAYOUT_BROKEN, f'the recipe fails on the page: {e}')
    except Error as e:  # the page would not load
        return failed(base, Status.REFUSED, f'{type(e).__name__}: {e}')
    return judged(base, status, title, raw, recipe.symbols)


def judged(
    base: Mapping[str, object], status: int | None, title: str, raw: Sequence[Raw], symbols: Mapping[str, str]
) -> Entry:
    """The log entry for a read that got this far: refused, layout_broken, or read with its rows."""
    base = {**base, 'http': status}
    # a browser check answers 4xx, then shows the page once it has passed, so the status alone decides nothing
    if not raw and status and status >= HTTP_ERROR:
        return failed(base, Status.REFUSED, f'HTTP {status} ({title})')
    got: list[Row] = []
    bad: list[str] = []
    for i, r in enumerate(raw):
        row = parsed(r, symbols)
        try:
            got.append(Row.model_validate(row))
        except ValidationError as e:
            bad += errors(e, f'row {i} ({row["name"] or row["key"]})')
    keys = [r.key for r in got]
    bad += [f'two rows with key {k}' for k in sorted({k for k in keys if keys.count(k) > 1})]
    if bad or not got:
        return failed(base, Status.LAYOUT_BROKEN, '; '.join(bad or ['no ticket rows']))
    return Read.model_validate({**base, 'status': Status.READ, 'rows': tuple(got)})


# ---- the log and the first reads


def log(event_id: int) -> list[Entry]:
    path = LOG / f'{event_id}.jsonl'
    if not path.exists():
        return []
    entries: list[Entry] = []
    for n, s in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if s.strip():
            try:
                entries.append(LOG_ENTRY.validate_json(s))
            except ValidationError as e:
                sys.exit('; '.join(errors(e, f'{shown(path)} line {n}')))
    # git merges the log line by line (.gitattributes), so a line edited in place comes back twice
    stamps = [e.at for e in entries]
    if twice := sorted({at for at in stamps if stamps.count(at) > 1}):
        sys.exit(f'{shown(path)}: two entries at {", ".join(map(str, twice))}; the log is only ever appended to')
    return sorted(entries, key=lambda e: e.at)


def append(event_id: int, entry: Entry) -> None:
    """Add a line to the festival's log: the entry's fields as it was made (a failure that reached no address has
    none), keys sorted."""
    LOG.mkdir(exist_ok=True)
    with (LOG / f'{event_id}.jsonl').open('a', encoding='utf-8') as f:
        _ = f.write(
            json.dumps(entry.model_dump(mode='json', exclude_unset=True), ensure_ascii=False, sort_keys=True) + '\n'
        )


def latest_read(entries: Sequence[Entry]) -> Read | None:
    return next((e for e in reversed(entries) if isinstance(e, Read)), None)


def failures(entries: Sequence[Entry]) -> int:
    """How many attempts in a row have failed, counting back from the latest."""
    n = 0
    for e in reversed(entries):
        if isinstance(e, Read):
            break
        n += 1
    return n


def checked_read(text: str) -> FirstRead | list[str]:
    """A first read from its file's text, or what its record refuses in it."""
    try:
        return FirstRead.parse(text)
    except ValidationError as e:
        return errors(e, 'schema')


def first_read(event_id: int) -> FirstRead | Stamped | None:
    """The festival's first read (tickets/reads/), as its record when it follows the current prompt; else only the
    prompt it names and the read it maps, since it may follow another shape."""
    path = READS / f'{event_id}.json'
    if not path.exists():
        return None
    stamped = Stamped.model_validate_json(path.read_bytes())
    if not prompts.is_current('first_read', stamped.prompt):
        return stamped
    match checked_read(path.read_text(encoding='utf-8')):
        case list() as found:
            sys.exit('; '.join(f'{shown(path)}: {p}' for p in found))
        case fr:
            return fr


def draft(event_id: int) -> str | None:
    """The text of the festival's draft (tickets/drafts/), or None."""
    path = DRAFTS / f'{event_id}.json'
    return path.read_text(encoding='utf-8') if path.exists() else None


def save_draft(header: ReadHeader) -> None:
    """A first read to fill: the festival's header, its passes, skipped and rule quotes empty."""
    DRAFTS.mkdir(exist_ok=True)
    empty: dict[str, object] = {'passes': [], 'skipped': [], 'rule_quotes': []}
    text = json.dumps(header.model_dump(mode='json') | empty, ensure_ascii=False, indent=1)
    _ = (DRAFTS / f'{header.event_id}.json').write_text(text + '\n', encoding='utf-8')


def save_read(fr: FirstRead) -> None:
    """Save a checked first read in tickets/reads/, the current first-read prompt it names archived first."""
    prompt = prompts.current('first_read')
    if fr.prompt != prompt.hash:
        raise ValueError(f'{fr.event_id}: a first read to prompt {fr.prompt}, not the current {prompt.hash}')
    _ = prompt.archive()
    READS.mkdir(exist_ok=True)
    _ = (READS / f'{fr.event_id}.json').write_text(fr.dumped(), encoding='utf-8')


def settle_dispute(event_id: int, fr: FirstRead) -> None:
    """Remove the festival's dispute when this first read is of rows at least as new as the disputed reads'."""
    path = DISPUTED / f'{event_id}.json'
    if path.exists() and Dated.model_validate_json(path.read_bytes()).rows_at <= fr.rows_at:
        path.unlink()


def read_at(fr: Dated | FirstRead, entries: Sequence[Entry]) -> Read | None:
    """The logged read a first read was made from, or None."""
    return next((e for e in entries if isinstance(e, Read) and e.at == fr.rows_at), None)


def line(row: Row) -> str:
    """The ticket as the page shows it: its name and price, the fee the site adds to it when the price doesn't show
    it (the site shows it apart), and its second price when it has one."""
    fee = f' + {row.fee:g} fee' if row.fee and row.fee not in prices.numbers_in(row.price) else ''
    return f'{row.name} {row.price}{fee}' + (f' · {row.alt_price}' if row.alt_price else '')


def in_text(quote: str, text: str) -> bool:
    return check_output.norm(quote) in check_output.norm(text)


def split_price(here: Sequence[Row]) -> str | None:
    """A problem when the tickets of one tier are not all at one price, else None."""
    if len({(r.amount, r.currency) for r in here}) > 1:
        return f'tickets {", ".join(r.key for r in here)} differ in price ({"; ".join(map(line, here))}); one tier each'
    return None


def keys_of(fr: FirstRead) -> list[str]:
    """Every key the first read names: in its tiers, then skipped."""
    return [k for ps in fr.passes for t in ps.tiers for k in t.keys] + [s.key for s in fr.skipped]


def read_problems(fr: FirstRead, entries: Sequence[Entry]) -> list[str]:
    """What is wrong with a first read, against the rows it was made from and its description; empty when sound."""
    if (at := read_at(fr, entries)) is None:
        return [f'rows_at {fr.rows_at.isoformat()} is no read in tickets/log/{fr.event_id}.jsonl']
    rows = {r.key: r for r in at.rows}
    keys = keys_of(fr)
    found = [f'key {k}: in the read twice' for k in sorted({k for k in keys if keys.count(k) > 1})]
    found += [f'key {k}: not on the page' for k in sorted(set(keys) - set(rows))]
    found += [f'key {k} ({line(rows[k])}): neither in a tier nor skipped' for k in rows if k not in keys]
    desc = fr.description
    for p, ps in enumerate(fr.passes):
        names = '\n'.join(line(rows[k]) for t in ps.tiers for k in t.keys if k in rows)
        if ps.label_quote and not in_text(ps.label_quote, names + '\n' + desc):
            found.append(f'passes[{p}].label_quote {ps.label_quote!r} is neither in its tickets nor in the description')
        for t, tier in enumerate(ps.tiers):
            found += tier_problems(fr, f'passes[{p}].tiers[{t}]', tier, [rows[k] for k in tier.keys if k in rows])
    found += [f'rule_quotes {q!r} is not in the description' for q in fr.rule_quotes if not in_text(q, desc)]
    found += prices.style_problems(fr.passes, fr.styles)
    return found + rules_problems(fr, rows)


def tier_problems(fr: FirstRead, where: str, tier: ReadTier, here: Sequence[Row]) -> list[str]:
    """What is wrong with a tier of a first read: its quote, its dates, its tickets' prices. A free ticket is no
    pass's price (a priced tier's amount is more than 0, records.PricedTier), so it is skipped."""
    found: list[str] = [
        f'{where}: key {r.key} ({r.name} {r.price}) is free: no pass is sold for nothing; skip it with its reason'
        for r in here
        if r.amount == 0
    ]
    if tier.date_quote and not in_text(tier.date_quote, '\n'.join(map(line, here)) + '\n' + fr.description):
        found.append(f'{where}.date_quote {tier.date_quote!r} is neither in its tickets nor in the description')
    found += [f'{where}: {d}' for d in [split_price(here)] if d]
    # the page sold these tickets when it was read, so their price can't have ended before that day
    until = tier.until
    if (
        until
        and any(not r.sold_out for r in here)
        and (ends := prices.on_date(until, fr.start_date)) is not None
        and ends < fr.rows_at.date()
    ):
        found.append(
            f'{where}.until {until}: the page sold these tickets on {fr.rows_at.date()}; a date that has passed is not '
            'theirs'
        )
    return found


def named(words: Mapping[str, re.Pattern[str]], name: str) -> frozenset[str]:
    """Which of the words the name says."""
    return frozenset(k for k, rx in words.items() if rx.search(name))


def rules_problems(fr: FirstRead, rows: Mapping[str, Row]) -> list[str]:
    """What a first read gets wrong of what its tickets' names say, by the prompt's rules: a pass of tickets for N
    nights covers N days; one pass's tickets name the same weekdays and the same dance styles (others are other
    passes, not its tiers); a pass sold with a meal is a package; a bootcamp is a pass, skipped only as a deposit on
    one, that its name calls one."""
    found: list[str] = []
    for p, ps in enumerate(fr.passes):
        names = [rows[k].name for t in ps.tiers for k in t.keys if k in rows]
        nights = {int(m[1]) for n in names if (m := NIGHTS.search(n))}
        if names and all(NIGHTS.search(n) for n in names) and len(nights) == 1 and ps.days != (n := nights.pop()):
            found.append(f'passes[{p}].days {ps.days}: its tickets are for {n} nights, so it covers {n} days')
        for what, words in (('weekdays', WEEKDAYS), ('dance styles', STYLE_WORDS)):
            if len(said := {named(words, n) for n in names}) > 1:
                found.append(
                    f'passes[{p}]: its tickets name different {what} '
                    f'({"; ".join(sorted(", ".join(sorted(w)) or "none" for w in said))}): each is a pass of its '
                    'own, not a tier of one'
                )
        if names and all(MEAL.search(n) for n in names) and ps.kind not in {PassKind.PACKAGE, PassKind.OTHER}:
            found.append(f'passes[{p}].kind {ps.kind}: its tickets are sold with a meal, so it is a {PassKind.PACKAGE}')
    found += [
        f'key {s.key} ({line(rows[s.key])}): a bootcamp is a pass ({PassKind.OTHER}), skipped only as '
        f'a {SkipReason.DEPOSIT} on one that its name calls one, not as a {s.reason}'
        for s in fr.skipped
        if s.key in rows
        and BOOTCAMP.search(name := rows[s.key].name)
        and (s.reason != SkipReason.DEPOSIT or not DEPOSIT.search(name))
    ]
    return found


# ---- recording


def unread_keys(fr: FirstRead, entry: Read) -> list[str]:
    """The keys of the read rows' tickets that the first read neither puts in a tier nor skips (enums.Ticket.UNREAD)."""
    mapped = set(keys_of(fr))
    return [r.key for r in entry.rows if r.key not in mapped]


def priced_tier(tier: ReadTier, here: Sequence[Row]) -> PricedTier:
    """A tier of the prices answer from a first read's tier and its tickets on the page, the first one's price: a
    ticket page sells online what is on sale, so no door price and no 'current' price."""
    lead = here[0]
    alt = (
        None
        if lead.alt_amount is None or lead.alt_currency is None
        else Alt(amount=lead.alt_amount, currency=lead.alt_currency)
    )
    return PricedTier(
        amount=lead.amount,
        currency=lead.currency,
        fee=lead.fee,
        alt=alt,
        from_=tier.from_,
        until=tier.until,
        quantity=tier.quantity,
        door=False,
        sold_out=all(r.sold_out for r in here),
        current=False,
        quote=line(lead),
    )


def build(fr: FirstRead, entry: Read) -> tuple[Priced, list[str], list[str]]:
    """(prices answer, unread keys, problems) from a first read and read rows of the same page."""
    rows = {r.key: r for r in entry.rows}
    passes: list[PricedPass] = []
    found: list[str] = []
    for p, ps in enumerate(fr.passes):
        tiers: list[PricedTier] = []
        for t, tier in enumerate(ps.tiers):
            here = [rows[k] for k in tier.keys if k in rows]
            if not here:
                continue  # its tickets are no longer on the page
            if d := split_price(here):
                found.append(f'{d}: the first read needs doing again')
            try:
                tiers.append(priced_tier(tier, here))
            except ValidationError as e:
                found += errors(e, f'schema: event {fr.event_id}: passes[{p}].tiers[{t}]')
        if tiers:
            passes.append(
                PricedPass(
                    kind=ps.kind,
                    style=ps.style,
                    label_quote=ps.label_quote,
                    group_size=ps.group_size,
                    days=ps.days,
                    includes_hotel=ps.includes_hotel,
                    tiers=tuple(tiers),
                )
            )
    answer = Priced(event_id=fr.event_id, passes=tuple(passes), rule_quotes=fr.rule_quotes)
    text = '\n'.join(map(line, entry.rows)) + '\n' + fr.description
    batch = Batch[Priced](batch=f'page-{fr.event_id}', events=(answer,))
    found += check_output.found_in(batch, {fr.event_id: text + '\n' + fr.title}) + prices.problems(answer, fr.styles)
    return answer, unread_keys(fr, entry), found


class Written(NamedTuple):
    tiers: list[PriceRow]  # its pass_prices.csv rows
    page: PageRow  # its ticket_pages.csv row
    unread: list[str]  # the keys of its tickets the first read doesn't know


def price_rows(answer: Priced) -> list[PriceRow]:
    return [
        PriceRow(
            event_id=answer.event_id,
            pass_no=n,
            kind=p.kind,
            style=p.style,
            label=p.label_quote,
            group_size=p.group_size,
            days=p.days,
            includes_hotel=p.includes_hotel,
            amount=t.amount,
            currency=t.currency,
            fee=t.fee,
            alt_amount=t.alt and t.alt.amount,
            alt_currency=t.alt and t.alt.currency,
            from_=t.from_,
            until=t.until,
            quantity=t.quantity,
            sold_out=t.sold_out,
            quote=t.quote,
        )
        for n, p in enumerate(answer.passes, 1)
        for t in p.tiers
    ]


def written(
    event_id: int, fr: FirstRead | Stamped, entries: Sequence[Entry], known: Mapping[str, Site]
) -> Written | list[str]:
    """What a festival writes (Written), or the problems that stop it, a list; known is sites(), for the reseller its
    page is on."""
    if isinstance(fr, Stamped) or not prompts.is_current('first_read', fr.prompt):
        return [
            (
                f'{event_id}: the first read follows prompt {fr.prompt}, not the current '
                f'{prompts.current("first_read").hash}; make it again'
            )
        ]
    if found := read_problems(fr, entries):
        return [f'{event_id}: {p}' for p in found]
    at, entry = read_at(fr, entries), latest_read(entries)
    if at is None or entry is None:
        return [f'{event_id}: no read rows']
    if entry.page != at.page:
        return [f'{event_id}: the ticket page changed from {at.page} to {entry.page}; make a new first read']
    answer, unread, found = build(fr, entry)
    if found:
        return [f'{event_id}: {p}' for p in found]
    site = known.get(entry.recipe.split('@')[0])
    page = PageRow(
        event_id=event_id,
        event=fr.title,
        page=entry.page,
        reseller=site.recipe.reseller if site else None,
        read_on=entry.at.date(),
        read_by=fr.read_by,
        prompt=fr.prompt,
        recipe=entry.recipe,
        unread=len(unread),
        notes='\n'.join(fr.rule_quotes),
    )
    return Written(price_rows(answer), page, unread)


def write_all() -> list[str]:
    """Write pass_prices.csv and ticket_pages.csv from every first read to the current prompt and its log, so both
    are what the reads and logs say and nothing else; the problems of the festivals left out. A first read to another
    prompt is left out quietly: its festival waits for it to be made again (redo_prompt)."""
    prices_rows: list[PriceRow] = []
    pages: list[PageRow] = []
    found: list[str] = []
    known = sites()
    for path in sorted(READS.glob('*.json'), key=lambda p: int(p.stem)):
        i = int(path.stem)
        if not isinstance(fr := first_read(i), FirstRead):
            continue
        match written(i, fr, log(i), known):
            case Written(tiers, page):
                prices_rows += tiers
                pages.append(page)
            case list() as problems_:
                found += problems_
    PriceRow.write(PRICES_CSV, prices_rows)
    PageRow.write(PAGES_CSV, pages)
    return found


def record(event_id: int) -> list[str]:
    """Check the festival's draft (moved to tickets/reads/ once it passes) or its first read against its latest read
    rows, then write both files and settle its dispute; the festival's problems, empty when it is written."""
    entries = log(event_id)
    text = draft(event_id)
    if text is not None:
        match checked_read(text):
            case list() as found:
                return [f'{event_id}: {p}' for p in found]
            case fr:
                pass
    elif (fr := first_read(event_id)) is None:
        return [
            (
                f'{event_id}: no first read (tickets/reads/{event_id}.json); run: uv run --group tickets -m '
                f'pipeline.tickets draft {event_id}'
            )
        ]
    match written(event_id, fr, entries, sites()):
        case Written(tiers, page, unread):
            pass
        case list() as found:
            return found
    if text is not None and isinstance(fr, FirstRead):
        save_read(fr)
        (DRAFTS / f'{event_id}.json').unlink()
        (DRAFTS / f'{event_id}.prompt.md').unlink(missing_ok=True)
    others = write_all()
    if isinstance(fr, FirstRead):
        settle_dispute(event_id, fr)
    print(
        f'{event_id}: {len(tiers)} prices recorded, read {page.read_on}'
        + (f'; {len(unread)} tickets not read yet ({", ".join(unread)})' if unread else '')
    )
    for p in others:
        print(f'left out: {p}', file=sys.stderr)
    return []


# ---- what changed, and when to read again


def changes(entries: Sequence[Entry]) -> list[tuple[str, str]]:
    """What differs between each read and the one before it, as (date, line) pairs."""
    out: list[tuple[str, str]] = []
    before: dict[str, Row] | None = None
    for e in entries:
        if not isinstance(e, Read):
            continue
        now = {r.key: r for r in e.rows}
        if before is not None:
            day = e.at.date().isoformat()
            out += [(day, f'new: {line(now[k])}') for k in now if k not in before]
            out += [(day, f'gone: {line(before[k])}') for k in before if k not in now]
            for k in (k for k in now if k in before):
                a, b = before[k], now[k]
                if (a.amount, a.currency) != (b.amount, b.currency):
                    out.append((day, f'price: {b.name} {a.price} → {b.price}'))
                if a.sold_out != b.sold_out:
                    out.append((day, f'{"sold out" if b.sold_out else "back on sale"}: {line(b)}'))
        before = now
    return out


def recheck(tiers: Sequence[PriceRow], start: dt.date, today: dt.date) -> tuple[Recheck, bool, str]:
    """(class, due, why) from a festival's recorded tiers (its pass_prices.csv rows)."""
    on_sale = [t for t in tiers if not t.sold_out]
    if on_sale and all(t.until and not t.quantity for t in on_sale):
        last = max(d for t in on_sale if (d := prices.on_date(t.until, start)) is not None)
        return Recheck.DATED, last < today, f'last price date {last}'
    return Recheck.MONTHLY, True, 'read on every monthly run'


# ---- festivals


def src_db() -> AbstractContextManager[sqlite3.Connection]:
    """The newest kizomba-world export, to read, closed with its block."""
    return sqlite_db.opened(max((ROOT / 'source').glob('*.sqlite'), key=lambda p: p.stat().st_mtime), 'ro')


def host(url: str) -> str:
    return (urlparse(url).netloc or '').lower()


def links(db: sqlite3.Connection, event_id: int) -> list[str]:
    """The festival's links that may sell tickets, full ones first; a cut-short one ends in …."""
    linked: list[tuple[str]] = db.execute('select url from event_links where event_id = ?', (event_id,)).fetchall()
    described: list[tuple[str]] = db.execute(
        'select coalesce(description_text, "") from events where id = ?', (event_id,)
    ).fetchall()
    urls = [u for (u,) in linked] + [m[0] for (text,) in described for m in re.finditer(r'https?://[^\s<>"|)]+', text)]
    keep = {u for u in urls if (h := host(u)) and not any(n in h for n in NOT_TICKETS)}
    return sorted(keep, key=lambda u: ('…' in u, u))


def shop_hosts(known: Mapping[str, Site]) -> set[str]:
    """The hosts of ticket shops: the ones a recipe reads, and the ones the register says no recipe can."""
    return {h for site in known.values() for h in site.recipe.hosts} | exceptions.BY_HOST.keys()


def known_page(
    fr: Dated | FirstRead | None, entries: Sequence[Entry], sold: FoundRow | None, urls: Sequence[str], shops: set[str]
) -> str | None:
    """The festival's ticket page when it is known, else None: its first read's, the shop an agent found it sells in
    (tickets/pages.csv), or its first full link to a ticket shop."""
    if fr:
        if (at := read_at(fr, entries)) is None:
            sys.exit(f'a first read of rows at {fr.rows_at.isoformat()}, which its log has no read of')
        return at.page
    if sold:
        return sold.page if sold.state == Sales.SHOP else None
    return next((u for u in urls if '…' not in u and host(u) in shops), None)


def dated_in_description(entry: Priced, start: dt.date, today: dt.date) -> bool:
    """Whether the description's own prices answer gives the pass a card prices (prices.card_pass) a price dated
    today or later."""
    card = prices.card_pass(entry.passes)
    return card is not None and any(
        (day := prices.on_date(d, start)) is not None and day >= today
        for t in entry.passes[card].tiers
        for d in (t.from_, t.until)
    )


# whether a festival in the first_read state needs a (new) first read
NEEDS = states.total(
    'first_read',
    {
        FirstReadState.NOT_NEEDED: False,
        FirstReadState.NONE: True,
        FirstReadState.AWAITS_ANSWER: False,
        FirstReadState.CURRENT: False,
        FirstReadState.REDO_PROMPT: True,
        FirstReadState.REDO_DESCRIPTION: True,
        FirstReadState.REDO_PAGE: True,
        FirstReadState.REDO_UNREAD: True,
        FirstReadState.DISPUTED: True,
    },
    'tickets.NEEDS',
)


class Event(Record):
    """A festival as the source database has it."""

    id: int
    title: str
    start_date: On
    end_date: On
    country: str | None
    description_text: str | None


@dataclass(frozen=True)
class Festival:
    """A festival with what tickets.py knows of it."""

    id: int
    title: str
    start_date: dt.date
    end_date: dt.date
    country: str | None
    description: str  # '' when it has none
    over: bool  # it ended before today
    styles: tuple[Style, ...]  # prices.styles
    links: tuple[str, ...]  # links()
    found: FoundRow | None  # its tickets/pages.csv row, unless a search that found nothing was of other links
    first_read: FirstRead | Stamped | None  # first_read()
    log: tuple[Entry, ...]
    tiers: tuple[PriceRow, ...]  # its pass_prices.csv rows
    described: answers.Answer[Priced] | None  # its description's prices answer to the current prompt
    page: str | None  # known_page()
    site: Site | None  # the recipe and version for its page's site
    disputed: bool  # tickets/disputed/<id>.json exists
    need: FirstReadState = FirstReadState.NONE
    unread: tuple[str, ...] = ()  # the latest rows' tickets the first read doesn't know

    @property
    def needs_read(self) -> bool:
        return NEEDS[self.need]


def why_first_read(f: Festival, today: dt.date) -> tuple[FirstReadState, tuple[str, ...]]:
    """(the festival's first_read state, the latest rows' unread keys). A first read to another prompt is judged by its
    prompt alone, since it may follow another shape."""
    fr, entry = f.first_read, latest_read(f.log)
    unread: tuple[str, ...] = ()
    match fr:
        case None:
            state = (
                FirstReadState.AWAITS_ANSWER
                if f.description and f.described is None
                else FirstReadState.NOT_NEEDED
                if f.described and dated_in_description(f.described.entry, f.start_date, today)
                else FirstReadState.NONE
            )
        case Stamped():
            state = FirstReadState.REDO_PROMPT
        case FirstRead():
            if entry is None or (at := read_at(fr, f.log)) is None:
                sys.exit(f'{f.id}: a first read of rows at {fr.rows_at.isoformat()}, which its log has no read of')
            unread = tuple(unread_keys(fr, entry))
            state = (
                FirstReadState.REDO_DESCRIPTION
                if fr.description != f.description
                else FirstReadState.REDO_PAGE
                if entry.page != at.page
                else FirstReadState.REDO_UNREAD
                if unread
                else FirstReadState.CURRENT
            )
    return (FirstReadState.DISPUTED if NEEDS[state] and f.disputed else state), unread


def assessed(f: Festival, today: dt.date) -> Festival:
    """The festival with its first_read state as of today."""
    need, unread = why_first_read(f, today)
    return replace(f, need=need, unread=unread)


def links_hash(urls: Iterable[str]) -> str:
    """What a none_found search was made of: the festival's links."""
    return hashlib.sha256('\n'.join(sorted(urls)).encode()).hexdigest()[:16]


def festivals(
    db: sqlite3.Connection, today: dt.date, only: int | None = None, *, every: bool = False
) -> list[Festival]:
    """The festivals still to come, every festival the source database lists (every), or the one asked for (only),
    leaving out the cancelled ones, as Festival records."""
    query = 'select id, title, start_date, end_date, country, description_text from events where cancelled is not 1'
    events = (
        sqlite_db.records(db, Event, query + ' and id = ?', (only,))
        if only
        else sqlite_db.records(db, Event, query + ' order by start_date')
        if every
        else sqlite_db.records(db, Event, query + ' and end_date >= ? order by start_date', (today,))
    )
    described = answers.current(prompts.PRICES, {e.id for e in events})
    known, found = sites(), found_pages()
    shops = shop_hosts(known)
    tiers: dict[int, list[PriceRow]] = {}
    for r in PriceRow.read(PRICES_CSV):
        tiers.setdefault(r.event_id, []).append(r)
    out: list[Festival] = []
    for e in events:
        fr, entries, urls = first_read(e.id), log(e.id), links(db, e.id)
        sold = found.get(e.id)
        if sold and sold.state == Sales.NONE_FOUND and sold.links != links_hash(urls):
            sold = None
        page = known_page(fr, entries, sold, urls, shops)
        f = Festival(
            id=e.id,
            title=e.title,
            start_date=e.start_date,
            end_date=e.end_date,
            country=e.country,
            description=e.description_text or '',
            over=e.end_date < today,
            styles=tuple(prices.styles(db, e.id)),
            links=tuple(urls),
            found=sold,
            first_read=fr,
            log=tuple(entries),
            tiers=tuple(tiers.get(e.id, [])),
            described=described.get(e.id),
            page=page,
            site=site_for(page, known) if page else None,
            disputed=(DISPUTED / f'{e.id}.json').exists(),
        )
        out.append(assessed(f, today))
    return out


# how a festival an agent found no shop for waits: for nothing it can do while its links stay the ones searched
UNSOLD = states.total(
    'sales',
    {
        Sales.SHOP: None,
        Sales.NOT_YET: Waiting.SALES_OPEN,
        Sales.OFFLINE: Waiting.NOTHING,
        Sales.CLOSED: Waiting.NOTHING,
        Sales.NONE_FOUND: Waiting.NOTHING,
    },
    'tickets.UNSOLD',
)


def waiting(f: Festival) -> Waiting:
    """What the festival waits for before its prices can come from its ticket page (enums.Waiting): what it waits for
    by default, unless an override for its page's site (pipeline/exceptions.py) replaces that."""
    w = waits_by_default(f)
    o = exceptions.BY_HOST.get(host(f.page)) if f.page else None
    return o.then if o and w == o.instead_of else w


def waits_by_default(f: Festival) -> Waiting:
    """What the festival waits for by its own data: nothing once it is over; then what its reads say, whether it
    needs a first read, and how it sells and where."""
    if f.over:
        return Waiting.NOTHING
    if failures(f.log) >= REFUSALS:
        return Waiting.SESSION
    if f.log and f.log[-1].status == Status.LAYOUT_BROKEN:
        return Waiting.RECIPE_FIX
    return waits_for_first_read(f) if f.needs_read else Waiting.NOTHING


def waits_for_first_read(f: Festival) -> Waiting:
    """What a festival that needs a first read waits for: an agent to settle its dispute, its sales to open, its
    ticket page, or a recipe for its site."""
    if f.need == FirstReadState.DISPUTED:
        return Waiting.AGENT
    if f.found and (w := UNSOLD[f.found.state]):
        return w
    if not f.page:
        return Waiting.PAGE
    return Waiting.RECIPE if not f.site else Waiting.NOTHING


def write_status(fs: Sequence[Festival]) -> collections.Counter[Waiting]:
    """tickets/status.csv: for each festival, what it waits for, its first_read state, how an agent found it sells
    and its known ticket page; the counts of what they wait for."""
    rows = [
        StatusRow(
            event_id=f.id,
            event=f.title,
            start=f.start_date,
            waits_for=waiting(f),
            first_read=f.need,
            sales=f.found.state if f.found else None,
            page=f.page,
        )
        for f in sorted(fs, key=lambda f: f.id)
    ]
    StatusRow.write(STATUS_CSV, rows)
    return collections.Counter(r.waits_for for r in rows)


def status(db: sqlite3.Connection) -> collections.Counter[Waiting]:
    """Write tickets/status.csv for every festival the source database lists; the counts of what they wait for."""
    return write_status(festivals(db, today(), every=True))


# ---- first reads by the models


def question(f: Festival, entry: Read) -> str:
    tickets = [{'key': r.key, 'name': r.name, 'price': r.price, 'sold_out': r.sold_out} for r in entry.rows]
    return json.dumps(
        {
            'event_id': f.id,
            'title': f.title,
            'start_date': f.start_date.isoformat(),
            'end_date': f.end_date.isoformat(),
            'country': f.country,
            'styles': list(f.styles),
            'description': f.description,
            'tickets': tickets,
        },
        ensure_ascii=False,
        indent=1,
    )


def joined(header: ReadHeader, answer: FirstReadAnswer) -> FirstRead:
    """The first read of a festival and a model's answer."""
    return FirstRead(
        event_id=header.event_id,
        title=header.title,
        start_date=header.start_date,
        read_by=header.read_by,
        prompt=header.prompt,
        rows_at=header.rows_at,
        styles=header.styles,
        description=header.description,
        passes=answer.passes,
        skipped=answer.skipped,
        rule_quotes=answer.rule_quotes,
    )


def ask_read(client: ask.Client, model: str, f: Festival, entry: Read, entries: Sequence[Entry]) -> FirstRead | None:
    """One model's first read, checked, with one retry on the checker's lines; None when it fails twice."""
    header = draft_of(f, entry, model)

    def check(text: str) -> FirstRead | list[str]:
        try:
            fr = joined(header, FirstReadAnswer.parse(text))
        except ValidationError as e:
            return errors(e, 'schema')
        return read_problems(fr, entries) or fr

    request = ask.Request(model, prompts.current('first_read'), question(f, entry), f'{f.id} {model}', 'first-read')
    return ask.structured(client, request, check)


type Meaning = tuple[
    frozenset[
        tuple[
            PassKind,
            Style | None,
            int | None,
            int | None,
            bool,
            frozenset[tuple[frozenset[str], str | None, str | None, int | None]],
        ]
    ],
    frozenset[tuple[str, SkipReason | None]],
]


def meaning(fr: FirstRead) -> Meaning:
    """What two first reads must agree on: which tickets are skipped, which share a pass and a tier, each pass's
    kind, style, people, days (a day pass is one day, whether its days say 1 or nothing) and hotel, each tier's dates
    and quantity, and why a ticket is skipped where a consumer tells its reasons apart (a skip_reason whose
    disposition is not kept). Labels and quotes may differ."""
    told = {s.key for s in states.of('skip_reason') if s.disposition != states.Disposition.KEPT}
    return frozenset(
        (
            ps.kind,
            ps.style,
            ps.group_size,
            1 if ps.kind == PassKind.DAY else ps.days,
            ps.includes_hotel,
            frozenset((frozenset(t.keys), t.from_, t.until, t.quantity) for t in ps.tiers),
        )
        for ps in fr.passes
    ), frozenset((s.key, s.reason if s.reason in told else None) for s in fr.skipped)


def agreed(reads: Mapping[str, FirstRead | None]) -> FirstRead | None:
    """Of the models' reads ({model: read, or None when it failed}), the first that another agrees with, its read_by
    naming every model that agrees; else None."""
    done = [(m, r) for m, r in reads.items() if r]
    for _, r in done:
        if len(same := [n for n, other in done if meaning(other) == meaning(r)]) > 1:
            return r.model_copy(update={'read_by': ' + '.join(same)})
    return None


def models_read(client: ask.Client, f: Festival, entry: Read, entries: Sequence[Entry]) -> FirstRead | None:
    """The first read two models agree on: MODELS', or when they don't, one TIE_BREAK agrees with; else None, with
    every read in tickets/disputed/ for an agent."""
    reads = {m: ask_read(client, m, f, entry, entries) for m in MODELS}
    if found := agreed(reads):
        return found
    reads[TIE_BREAK] = ask_read(client, TIE_BREAK, f, entry, entries)
    if found := agreed(reads):
        return found
    DISPUTED.mkdir(exist_ok=True)
    _ = (DISPUTED / f'{f.id}.json').write_text(Dispute(rows_at=entry.at, reads=reads).dumped(), encoding='utf-8')
    return None


# ---- commands

FULL_URL = re.compile(r'https?://[^\s…]+')


def full_url(url: str) -> str:
    if not FULL_URL.fullmatch(url):
        sys.exit(f'{url}: not a full address')
    return url


def draft_of(f: Festival, entry: Read, by: str) -> ReadHeader:
    return ReadHeader(
        event_id=f.id,
        title=f.title,
        start_date=f.start_date,
        read_by=by,
        prompt=prompts.current('first_read').hash,
        rows_at=entry.at,
        styles=f.styles,
        description=f.description,
    )


def one(db: sqlite3.Connection, event_id: int, page: str | None = None) -> Festival:
    f = next(iter(festivals(db, today(), event_id)), None)
    if f is None:
        sys.exit(f'{event_id}: no such festival, or it is cancelled')
    return replace(f, page=page, site=site_for(page, sites())) if page else f


def cmd_read(db: sqlite3.Connection, event_id: int, url: str | None = None, *, visible: bool | None = None) -> None:
    f = one(db, event_id, url and full_url(url))
    if not f.page:
        sys.exit(f'{event_id}: no known ticket page; find it and pass --url')
    if not f.site:
        sys.exit(
            f'{event_id}: no recipe for {host(f.page)}; write tickets/sites/<site>.json '
            '(its record: pipeline/records.py, Recipe) from the page, then read again'
        )
    entry = attempt(f.page, f.site, visible=visible)
    append(event_id, entry)
    _ = status(db)
    if isinstance(entry, Failed):
        sys.exit(
            f'{event_id}: {entry.status}: {entry.why}'
            + (
                f'; try: uv run --group tickets -m pipeline.tickets retry {event_id}'
                if entry.status == Status.REFUSED
                else ''
            )
        )
    print(f'{event_id}: {len(entry.rows)} tickets read at {entry.at.isoformat()} from {entry.url}')
    for r in entry.rows:
        print(f'  {r.key:>12}  {line(r)}{"  (sold out)" if r.sold_out else ""}')


def cmd_draft(db: sqlite3.Connection, event_id: int) -> None:
    f, path = one(db, event_id), DRAFTS / f'{event_id}.json'
    if path.exists():
        sys.exit(f'{shown(path)} exists; delete it to start the draft again')
    if not (entry := latest_read(f.log)):
        sys.exit(f'{event_id}: no read rows yet; run: uv run --group tickets -m pipeline.tickets read {event_id}')
    save_draft(draft_of(f, entry, 'agent'))
    asked = DRAFTS / f'{event_id}.prompt.md'
    _ = asked.write_text(
        prompts.current('first_read').text + '\n======== the festival ========\n\n' + question(f, entry) + '\n',
        encoding='utf-8',
    )
    print(
        f'Fill passes, skipped and rule_quotes in {shown(path)} following {shown(asked)}, the prompt the models '
        f'answer, with the festival and the tickets of the read at {entry.at.isoformat()}; '
        f'then run: uv run --group tickets -m pipeline.tickets record {event_id}'
    )


def cmd_check(event_id: int) -> None:
    """The problems record would find in the festival's draft (or first read), without writing anything."""
    text = draft(event_id)
    fr = checked_read(text) if text is not None else first_read(event_id)
    match fr:
        case None:
            sys.exit(f'{event_id}: no draft or first read')
        case list():
            sys.exit('\n'.join(f'{event_id}: {p}' for p in fr))
        case _:
            pass
    match written(event_id, fr, log(event_id), sites()):
        case Written(tiers, _, unread):
            print(f'{event_id}: passes; {len(tiers)} prices' + (f', {len(unread)} tickets not read' if unread else ''))
        case list() as found:
            sys.exit('\n'.join(found))


def cmd_record(db: sqlite3.Connection, event_id: int) -> None:
    if found := record(event_id):
        sys.exit('\n'.join(found))
    _ = status(db)
    print(
        'Then: uv run -m pipeline.extract.load_extract, uv run --group artists -m pipeline.extract.resolve_artists and '
        'uv run -m pipeline.build_site_db on the newest source/*.sqlite'
    )


def todo_notes(f: Festival, today: dt.date) -> list[str]:
    """What todo says of a festival: when to read it again, its failed reads, and its first read."""
    notes: list[str] = []
    if f.first_read:
        kind, due, why = recheck(f.tiers, f.start_date, today)
        notes.append(f'{kind}: {"due" if due else "not due"}, {why}')
        if (n := failures(f.log)) and isinstance(last := f.log[-1], Failed):
            notes.append(
                f'{n} failed reads in a row ({last.status}: {last.why})'
                + (
                    f'; read it in a session: uv run --group tickets -m pipeline.tickets retry {f.id}'
                    if n >= REFUSALS
                    else ''
                )
            )
    if f.needs_read:
        w = waiting(f)
        notes.append(
            f'first read needed, {f.need}: {states.state("first_read", f.need).criterion}'
            + ('' if w == Waiting.NOTHING else f'; waits for {w} ({states.state("waits_for", w).owner})')
        )
    if f.disputed:
        notes.append(f'no two models agreed: tickets/disputed/{f.id}.json')
    return notes


def cmd_todo(db: sqlite3.Connection) -> None:
    day = today()
    fs = festivals(db, day)
    for f in fs:
        if not f.first_read and not f.needs_read:
            continue
        print(f'{f.id}  {f.start_date}  {f.title[:50]}')
        for n in todo_notes(f, day):
            print(f'      {n}')
        for u in ([f.page] if f.page else list(f.links))[:3]:
            print(f'      {u}')
    counts = collections.Counter(waiting(f) for f in fs)
    print('\nwaits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))


def found_pages() -> dict[int, FoundRow]:
    """{event_id: tickets/pages.csv row}, each checked: a page exactly when it sells in a shop (a festival whose
    sales haven't opened may name its coming page); the links searched exactly when a search found nothing."""
    out: dict[int, FoundRow] = {}
    for r in FoundRow.read(FOUND_CSV):
        if ((r.state == Sales.SHOP) != bool(r.page) and r.state != Sales.NOT_YET) or (
            r.state == Sales.NONE_FOUND
        ) != bool(r.links):
            sys.exit(
                f'{shown(FOUND_CSV)}: festival {r.event_id}: state {str(r.state)!r} with page {r.page or ""!r} and '
                f'links {r.links or ""!r}'
            )
        out[r.event_id] = r
    return out


class Sold(NamedTuple):
    """How an agent found a festival sells its tickets: its shop's page (or none), the sales state, how it was found
    or why there is none, and who found it."""

    page: str | None
    state: Sales
    note: str
    by: str


def cmd_page(db: sqlite3.Connection, event_id: int, sold: Sold) -> None:
    """Record how a festival with no known ticket page sells its tickets: its shop's page, or that its sales haven't
    opened, happen offline, are closed, or that a search of its links and the web found no page."""
    url, state, note, by = sold
    f = one(db, event_id)
    if f.first_read:
        sys.exit(f'{event_id}: it has a first read of {f.page}; read a new page with: read {event_id} --url URL')
    if (state == Sales.SHOP) != bool(url) and state != Sales.NOT_YET:
        sys.exit('a shop needs its page, and only a shop (or sales not open yet) has one')
    if url:
        _ = full_url(url)
    rows = [r for r in FoundRow.read(FOUND_CSV) if r.event_id != event_id]
    rows.append(
        FoundRow(
            event_id=event_id,
            event=f.title,
            state=state,
            page=url,
            links=links_hash(f.links) if state == Sales.NONE_FOUND else None,
            found_by=by,
            note=note,
        )
    )
    FoundRow.write(FOUND_CSV, sorted(rows, key=lambda r: r.event_id))
    _ = status(db)
    print(
        f'{event_id}: {state}'
        + (f' {url}' if url else '')
        + ('' if state != Sales.SHOP or not url or site_for(url, sites()) else f'; no recipe for {host(url)} yet')
    )


def cmd_changes(event_id: int | None = None) -> None:
    for i in [event_id] if event_id else sorted(int(p.stem) for p in LOG.glob('*.jsonl')):
        for day, text in changes(log(i)):
            print(f'{i}  {day}  {text}')


def cmd_retry(db: sqlite3.Connection, event_id: int) -> None:
    cmd_read(db, event_id, visible=True)
    cmd_record(db, event_id)


class Run:
    """The monthly Action's run: the reads it makes, what it found wrong, and whether the month's budget stopped
    the first reads."""

    def __init__(self, db: sqlite3.Connection, today: dt.date) -> None:
        self.db, self.today = db, today
        self.client: ask.Client | None = None
        self.alarms: list[str] = []
        self.budget: str | None = None

    def make(self, f: Festival, entry: Read) -> None:
        """A first read of the festival by the models, saved when two agree."""
        self.client = self.client or anthropic.Anthropic()
        try:
            new = models_read(self.client, f, entry, log(f.id))
            if new:
                save_read(new)
                settle_dispute(f.id, new)
            print(f'{f.id}: first read ' + (f'by {new.read_by}' if new else f'disputed: tickets/disputed/{f.id}.json'))
        except spend.BudgetSpentError as e:
            self.budget = f'{e}: the other first reads wait for next month'
            self.alarms.append(self.budget)

    def broken(self, i: int, entry: Entry) -> None:
        if isinstance(entry, Failed) and entry.status == Status.LAYOUT_BROKEN:
            self.alarms.append(f'{i}: layout broken ({entry.why}); the recipe {entry.recipe} needs an agent')

    def reread(self, f: Festival) -> Festival:
        """Read again a festival whose prices are due or whose reads failed, raising the alarm on a broken recipe or
        the REFUSALS-th failure; the festival as of the new read."""
        if not (f.first_read and f.site and (recheck(f.tiers, f.start_date, self.today)[1] or failures(f.log))):
            return f
        i, entry = f.id, attempt(f.page or '', f.site)
        append(i, entry)
        print(f'{i}: {entry.status}' + (f': {entry.why}' if isinstance(entry, Failed) else ''))
        self.broken(i, entry)
        if not (isinstance(entry, Failed) and entry.status == Status.LAYOUT_BROKEN) and failures(log(i)) == REFUSALS:
            self.alarms.append(
                f'{i}: {REFUSALS} failed reads in a row; read it in a session: uv run --group tickets -m '
                f'pipeline.tickets retry {i}'
            )
        return assessed(replace(f, log=tuple(log(i))), self.today)

    def first_reads(self, f: Festival) -> None:
        """A first read for a festival that needs one, from rows read today."""
        if not (f.needs_read and f.need != FirstReadState.DISPUTED and f.site):
            return
        entry = latest_read(f.log)
        if entry is None or entry.at.date() != self.today:
            append(f.id, fresh := attempt(f.page or '', f.site))
            entry = fresh
        if isinstance(entry, Read) and not self.budget:
            self.make(f, entry)
        elif isinstance(entry, Failed):
            print(f'{f.id}: {entry.status}: {entry.why}')
            self.broken(f.id, entry)


def cmd_run(db: sqlite3.Connection, ids: set[int] | None = None) -> None:
    """Re-read what is due and retry failures, first-read with the models what needs it, and make again, from their
    latest logged rows, the first reads of festivals now past that follow another prompt (of the festivals ids
    names, when it names some); then write both files. Exits 1 naming each festival whose page broke its recipe,
    reached REFUSALS failures, or no longer fits its first read."""
    day = today()
    every: list[tuple[int]] = db.execute('select id from events').fetchall()
    if ids and (missing := ids - {i for (i,) in every}):
        sys.exit(f'no such festival: {sorted(missing)}')
    run = Run(db, day)
    for f in (f for f in festivals(db, day) if not ids or f.id in ids):
        run.first_reads(run.reread(f))
    for f in festivals(db, day, every=True):
        redo = f.over and (not ids or f.id in ids) and f.need == FirstReadState.REDO_PROMPT and not run.budget
        if redo and (entry := latest_read(f.log)):
            run.make(f, entry)  # its page sells nothing any more; its logged rows still say what it sold
    run.alarms += write_all()
    counts = status(db)
    print('waits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))
    if run.alarms:
        sys.exit('\n'.join(run.alarms))


class Args(argparse.Namespace):
    cmd: str = ''
    id: int | None = None
    url: str | None = None
    state: Sales = Sales.SHOP
    note: str = ''
    by: str = 'agent'
    only: set[int] | None = None


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Prices from festivals' ticket pages.")
    sub = ap.add_subparsers(dest='cmd', required=True)
    _ = sub.add_parser('todo', help='what needs doing')
    r = sub.add_parser('read', help="read a festival's ticket page and log its rows")
    _ = r.add_argument('id', type=int)
    _ = r.add_argument('--url', help='the ticket page, when the festival has no known one')
    for name, text in (
        ('draft', 'a first read to fill, from the latest rows'),
        ('record', 'check and write the prices'),
        ('check', 'what record would find wrong, writing nothing'),
        ('retry', 'read with a visible browser, then record'),
    ):
        _ = sub.add_parser(name, help=text).add_argument('id', type=int)
    _ = sub.add_parser('changes', help='what changed between reads').add_argument('id', type=int, nargs='?')
    pg = sub.add_parser('page', help='record where a festival with no known ticket page sells its tickets')
    _ = pg.add_argument('id', type=int)
    _ = pg.add_argument('url', nargs='?', help='the ticket page')
    _ = pg.add_argument(
        '--state',
        type=Sales,
        choices=list(Sales),
        default=Sales.SHOP,
        help='shop (the default, with its page), ' + ', '.join(s for s in Sales if s != Sales.SHOP),
    )
    _ = pg.add_argument('--note', required=True, help='how it was found, or why there is none')
    _ = pg.add_argument('--by', default='agent', help='who found it')
    _ = sub.add_parser('run', help='the monthly Action').add_argument(
        '--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"'
    )
    return ap


def main() -> None:
    a = parser().parse_args(namespace=Args())
    if a.cmd in {'read', 'retry', 'run'}:  # a recipe may need a visible browser
        from pipeline import read_page

        read_page.on_display()
    i = a.id or 0
    match a.cmd:
        case 'check':
            return cmd_check(i)
        case 'changes':
            return cmd_changes(a.id)
        case _:
            pass
    with src_db() as db:
        match a.cmd:
            case 'todo':
                cmd_todo(db)
            case 'read':
                cmd_read(db, i, a.url)
            case 'draft':
                cmd_draft(db, i)
            case 'record':
                cmd_record(db, i)
            case 'retry':
                cmd_retry(db, i)
            case 'page':
                cmd_page(db, i, Sold(a.url, a.state, a.note, a.by))
            case _:
                cmd_run(db, a.only)
    return None


if __name__ == '__main__':
    main()
