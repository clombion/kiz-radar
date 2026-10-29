"""Reading a ticket page by its site's recipe (pipeline/tickets.py): an API's JSON with plain requests, or a page in a
browser (pipeline/read_page.py); each attempt as its log entry."""

import datetime as dt
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal

from pydantic import TypeAdapter, ValidationError

from pipeline.calls import Declined
from pipeline.enums import CallCause, Status
from pipeline.records import (
    JSON,
    ApiRecipe,
    Failed,
    FromJson,
    FromPage,
    FromText,
    Json,
    LogEntry,
    PageRecipe,
    Read,
    Row,
    errors,
    now,
)
from pipeline.tickets_store import Site, host

WHY_LENGTH = 300  # a failed read's why is cut to this many characters
HTTP_ERROR = 400  # an HTTP status from this one up is an error
FREE = re.compile(r'(?i)\s*(free|gratuit|gratis|gratuito|kostenlos)\s*')
LIST: TypeAdapter[list[Json]] = TypeAdapter(list[Json])  # an API's list of tickets
type Raw = Mapping[str, str | None]  # a ticket as read_page.rows() reads it: each recipe field's text, or None


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


@dataclass(frozen=True)
class Attempt:
    """A read of a ticket page under way: when, which page, by which recipe, and once it got that far, the address
    read and its HTTP status."""

    at: dt.datetime
    page: str
    recipe: str
    url: str | None = None
    http: int | None = None

    def failed(self, status: Literal[Status.REFUSED, Status.UNREACHABLE, Status.LAYOUT_BROKEN], why: str) -> Failed:
        """The log entry of a read that failed, and why."""
        return Failed(
            at=self.at,
            page=self.page,
            recipe=self.recipe,
            url=self.url,
            http=self.http,
            status=status,
            why=why[:WHY_LENGTH],
        )

    def read(self, url: str, rows: Sequence[Row]) -> Read:
        """The log entry of a read of these rows at this address."""
        return Read(
            at=self.at,
            page=self.page,
            recipe=self.recipe,
            url=url,
            http=self.http,
            status=Status.READ,
            rows=tuple(rows),
        )


def attempt(page: str, site: Site, *, visible: bool | None = None) -> LogEntry | Declined:
    """One read of a ticket page, as its log entry; or, when no read can be made here at all (no browser would
    start), why, which is no entry of the festival's log."""
    from pipeline.read_page import NoBrowserError

    started = Attempt(now(), page, site.version)
    recipe = site.recipe
    if isinstance(recipe, ApiRecipe):
        return api_attempt(started, recipe)
    try:
        return page_attempt(started, recipe, visible=visible)
    except NoBrowserError as e:
        return Declined(CallCause.STRUCTURAL, f'no browser would start: {e}')


def api_attempt(started: Attempt, recipe: ApiRecipe) -> LogEntry:
    """A read of a site's API: its tickets, or why it failed."""
    from curl_cffi.requests.exceptions import RequestException

    try:
        status, url, raw = api_rows(started.page, recipe)
    except (LookupError, ValueError) as e:  # no event id, no ticket list, or no JSON
        return started.failed(Status.LAYOUT_BROKEN, f'{type(e).__name__}: {e}')
    except RequestException as e:  # the request failed: no HTTP answer to judge
        return started.failed(Status.UNREACHABLE, f'{type(e).__name__}: {e}')
    return judged(replace(started, url=url, http=status), url, url, raw, recipe.symbols)


def page_attempt(started: Attempt, recipe: PageRecipe, *, visible: bool | None) -> LogEntry:
    """A read of a ticket page in a browser: its tickets, or why it failed."""
    from curl_cffi.requests.exceptions import RequestException

    from pipeline.read_page import RecipeError, UnreachableError, rows

    try:
        url = widget(started.page, recipe)
    except LookupError as e:
        return started.failed(Status.LAYOUT_BROKEN, str(e))
    except RequestException as e:
        return started.failed(Status.UNREACHABLE, f'{type(e).__name__}: {e}')
    reached = replace(started, url=url)
    try:
        status, title, raw = rows(url, recipe, visible=visible)
    except RecipeError as e:
        return reached.failed(Status.LAYOUT_BROKEN, f'the recipe fails on the page: {e}')
    except UnreachableError as e:
        return reached.failed(Status.UNREACHABLE, str(e))
    return judged(replace(reached, http=status), url, title, raw, recipe.symbols)


def judged(reached: Attempt, url: str, title: str, raw: Sequence[Raw], symbols: Mapping[str, str]) -> LogEntry:
    """The log entry for a read that got an answer: refused (an HTTP error, and no rows), layout_broken, or read with
    its rows."""
    # a browser check answers 4xx, then shows the page once it has passed, so the status alone decides nothing
    if not raw and reached.http and reached.http >= HTTP_ERROR:
        return reached.failed(Status.REFUSED, f'HTTP {reached.http} ({title})')
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
        return reached.failed(Status.LAYOUT_BROKEN, '; '.join(bad or ['no ticket rows']))
    return reached.read(url, got)
