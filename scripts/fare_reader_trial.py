"""A one-off trial of three readers of Google Flights on the same return searches, run by hand on a GitHub runner
(.github/workflows/fare-reader-trial.yml), to compare how often each answers where the pipeline's reader gets a page
with no flight.

The readers, each run in its own environment, as its own command:

- ours: the outbound search page as pipeline/fli_page.py reads it, through the pinned fli's
  SearchFlights._fetch_flights, one try per search (`uv run --group fares`);
- explore: fli's GetExploreDestinations RPC (fli main, given by its commit, never in uv.lock: `uv run --no-project
  --with`), one call per origin and Friday, round trip of 3 nights to Europe, read at the search's airport;
- chromium: the same search page as ours, loaded in a headless Chromium (Patchright, the browser group), its rendered
  results read, and the GetShoppingResults responses its scripts receive kept (`uv run --group fares --group
  browser`).

Each reader waits at least GAP seconds before each request to Google, and stops at the first HTTP 429. Its outcomes go
to <out>/<reader>.json; `summary` joins them into <out>/summary.json and summary.md. Nothing is written in the
repository. `plan` prints the searches and the requests each reader would make, contacting no one; `selftest` checks the
parsers on pages already recorded.

The module imports nothing of pipeline/: each reader's request is written here as fli_page makes it.
"""
# ruff: noqa: INP001, PLC0415, SLF001
# INP001: a script, run by its path; PLC0415: each reader imports the packages of its own environment; SLF001: the
# outbound page alone is read through fli's private _fetch_flights, as pipeline/fli_page.py reads it

import argparse
import contextlib
import datetime as dt
import functools
import importlib
import json
import re
import statistics
import sys
import time
from collections.abc import Callable, Generator, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Protocol, cast

if TYPE_CHECKING:
    from fli.models import FlightSearchFilters
    from patchright.sync_api import Response

HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parent
ORIGIN = 'BGO'
NIGHTS = 3  # out on the Friday, back on the Monday, as the pipeline asks
GAP = 20.0  # seconds, at least, before each request to Google
TOO_MANY = 429
FLI_MAIN = '249a292e829672f5ee5d3477c2269a16acac9a20'  # fli's commit adding SearchExplore

Kind = Literal['prices', 'empty', 'refused', 'consent', 'error', 'skipped']
READERS = ('ours', 'explore', 'chromium')


@dataclass(frozen=True)
class Search:
    """A return search from ORIGIN: the airport, its city as Explore names it, and the Friday out."""

    airport: str
    city: str
    friday: dt.date
    note: str = ''

    @property
    def id(self) -> str:
        return f'{self.airport}-{self.friday.isoformat()}'

    @property
    def back(self) -> dt.date:
        return self.friday + dt.timedelta(days=NIGHTS)


# the control, then ten upcoming weekends whose latest Google search of any flight from BGO found none (read from
# pipeline.fare_store.read() on 2026-11-22), the most recent of each airport's
SEARCHES = (
    Search('LYS', 'Lyon', dt.date(2026, 12, 18), 'control: a browser showed flights from €333'),
    Search('NTE', 'Nantes', dt.date(2026, 12, 11)),
    Search('ORY', 'Paris', dt.date(2026, 12, 18)),
    Search('STR', 'Stuttgart', dt.date(2027, 1, 1)),
    Search('TLS', 'Toulouse', dt.date(2027, 1, 1)),
    Search('GVA', 'Geneva', dt.date(2027, 1, 8)),
    Search('LYS', 'Lyon', dt.date(2027, 1, 22)),
    Search('MRS', 'Marseille', dt.date(2027, 2, 5)),
    Search('BHX', 'Birmingham', dt.date(2027, 2, 26)),
    Search('LUX', 'Luxembourg', dt.date(2027, 4, 23)),
    Search('CGN', 'Cologne', dt.date(2027, 7, 16)),
)


@dataclass
class Outcome:
    """What one reader made of one search: prices (the cheapest, in EUR, with the airlines and stops of its way out),
    empty (an answer with no priced flight), refused (Google said no: HTTP 429, or an RPC rejection), consent (a
    consent page instead of the results), error, or skipped (after a 429). detail says what was seen; seconds, how
    long the request took."""

    search: str
    reader: str
    kind: Kind
    cheapest: float | None = None
    airlines: list[str] = field(default_factory=list[str])
    stops: int | None = None
    rows: int = 0
    detail: str = ''
    seconds: float | None = None
    at: str = ''


class Pace:
    """At least `gap` seconds before each request, the first included (the reader before may just have asked)."""

    def __init__(self, gap: float) -> None:
        self.gap = gap

    @contextlib.contextmanager
    def request(self) -> Generator[Callable[[], float]]:
        time.sleep(self.gap)
        start = time.monotonic()
        yield lambda: round(time.monotonic() - start, 2)


def stopped(out: Sequence['Outcome']) -> bool:
    """Whether Google refused one of the reader's requests with HTTP 429, after which it asks no more."""
    return any(o.kind == 'refused' and o.detail.startswith('HTTP 429') for o in out)


def now() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


# --- parsing, shared by the readers and selftest ------------------------------------------------------------------

# a result row of the rendered page, as its aria-label says it (hl=en)
ROW = re.compile(
    r'aria-label="From (?P<price>[\d,]+) euros round trip total\. (?P<stops>Nonstop|\d+ stops?) flight with '
    r'(?P<airlines>[^.]+?)\.'
)


@dataclass(frozen=True)
class Rendered:
    price: float
    stops: int
    airlines: tuple[str, ...]


def rendered_rows(html: str) -> list[Rendered]:
    """The result rows a rendered search page shows, each priced in EUR, with its stops and airlines."""
    out: list[Rendered] = []
    for m in ROW.finditer(html):
        stops = 0 if m['stops'] == 'Nonstop' else int(m['stops'].split()[0])
        airlines = tuple(a.strip() for a in re.split(r',\s*|\s+and\s+', m['airlines']) if a.strip())
        out.append(Rendered(float(m['price'].replace(',', '')), stops, airlines))
    return out


def consent(url: str, html: str) -> bool:
    """Whether the page is Google's consent interstitial rather than the search."""
    return 'consent.google.' in url or ('action="https://consent.google.' in html and 'Before you continue' in html)


def at(value: object, *path: int) -> object:
    """The value at this path of nested lists; None where there is none."""
    for i in path:
        if not isinstance(value, list) or i >= len(cast('list[object]', value)):
            return None
        value = cast('list[object]', value)[i]
    return value


def nearby_dates(payload: object) -> int:
    """How many nearby dates a page's ds:1 payload prices (its noresults|agg block), as pipeline/fli_page.py's
    withheld() reads them: a page with no flight that prices some likely had its flights withheld."""
    dates = at(payload, 6, 0, 4, 0)
    return sum(1 for d in cast('list[object]', dates) if isinstance(at(d, 2, 0, 1), int | float)) if dates else 0


def explore_pick(destinations: Sequence[dict[str, object]], search: Search) -> Outcome:
    """The search's answer in an Explore call's destinations: priced when one lands at its airport; otherwise empty,
    saying when its city is priced through another airport."""
    priced = [d for d in destinations if isinstance(d.get('price'), int | float)]
    mine = [d for d in priced if d.get('destination_airport') == search.airport]
    city = [d for d in priced if str(d.get('name', '')).casefold() == search.city.casefold()]
    n = f'{len(destinations)} destinations, {len(priced)} priced'
    if mine:
        best = min(mine, key=lambda d: cast('float', d['price']))
        name = best.get('airline_name') or best.get('airline')
        stops = best.get('stops')
        return Outcome(
            search.id,
            'explore',
            'prices',
            cheapest=cast('float', best['price']),
            airlines=[str(name)] if name else [],
            stops=stops if isinstance(stops, int) else None,
            rows=len(mine),
            detail=f'{n}; currency {best.get("currency")}',
        )
    if city:
        via = ', '.join(f'{d.get("destination_airport")} €{d.get("price")}' for d in city)
        return Outcome(search.id, 'explore', 'empty', rows=0, detail=f'{n}; {search.city} priced via {via}')
    listed = any(d.get('destination_airport') == search.airport for d in destinations)
    said = f'{search.airport} listed with no fare' if listed else f'neither {search.airport} nor {search.city}'
    return Outcome(search.id, 'explore', 'empty', detail=f'{n}; {said}')


# --- the readers ------------------------------------------------------------------------------------------------


def filters(search: Search) -> 'FlightSearchFilters':
    """The search as pipeline/fli_page.py asks it: one adult, any stops, the cheapest first."""
    from fli.core import build_flight_segments, resolve_airport
    from fli.models import FlightSearchFilters, MaxStops, PassengerInfo, SortBy

    segments, trip = build_flight_segments(
        resolve_airport(ORIGIN), resolve_airport(search.airport), search.friday.isoformat(), search.back.isoformat()
    )
    return FlightSearchFilters(
        trip_type=trip,
        passenger_info=PassengerInfo(adults=1),
        flight_segments=segments,
        stops=MaxStops.ANY,
        sort_by=SortBy.CHEAPEST,
    )


def part(module: str, name: str) -> object:
    """A name of an fli module that the repository's stubs of fli (typings/fli, what pipeline/fli_page.py uses) leave
    out; its caller says its type."""
    return cast('object', vars(importlib.import_module(module))[name])


def page_url(search: Search) -> str:
    """The search page's address, as fli reads it (hl=en, gl=US, curr=EUR)."""
    build_tfs = cast('Callable[[object], str]', part('fli.search._tfs', 'build_tfs'))
    address = cast('Callable[[str, str, None, None], str]', part('fli.search._tfs', 'page_url'))
    return address(build_tfs(filters(search)), 'EUR', None, None)


def ours(searches: Sequence[Search], pace: Pace) -> list[Outcome]:
    from fli.search import SearchFlights
    from fli.search._tfs import extract_payload
    from fli.search.client import Client, Response
    from fli.search.exceptions import SearchClientError, SearchHTTPError
    from tenacity import stop_after_attempt

    class OneTry(Client):
        get = Client.get.retry_with(stop=stop_after_attempt(1))

    class Kept:
        """fli's client, each request sent once, keeping the last page's text (pipeline/fli_page.py's Kept)."""

        def __init__(self) -> None:
            self.client = OneTry()
            self.text = ''

        def get(self, url: str, **kwargs: object) -> Response:
            response = OneTry.get(self.client, url, **kwargs)
            self.text = response.text
            return response

    out: list[Outcome] = []
    for search in searches:
        if stopped(out):
            out.append(Outcome(search.id, 'ours', 'skipped', detail='after a 429'))
            continue
        engine = SearchFlights()
        engine.client = kept = Kept()
        stamp = now()
        with pace.request() as took:
            try:
                found = engine._fetch_flights(
                    filters(search), currency='EUR', language=None, country=None, capture_session=False
                )
            except SearchHTTPError as e:
                kind: Kind = 'refused' if e.status_code == TOO_MANY else 'error'
                out.append(Outcome(search.id, 'ours', kind, detail=f'HTTP {e.status_code}: {e}', seconds=took()))
                continue
            except SearchClientError as e:
                out.append(Outcome(search.id, 'ours', 'error', detail=f'{type(e).__name__}: {e}', seconds=took()))
                continue
            seconds = took()
        rows = found or []
        priced = [r for r in rows if r.price is not None]
        if not priced:
            dates = nearby_dates(extract_payload(kept.text)) if kept.text else 0
            why = f'withheld: no flight, {dates} nearby dates priced' if dates else 'no flight on the page'
            o = Outcome(search.id, 'ours', 'empty', rows=len(rows), detail=why, seconds=seconds, at=stamp)
        else:
            best = min(priced, key=lambda r: cast('float', r.price))
            o = Outcome(
                search.id,
                'ours',
                'prices',
                cheapest=best.price,
                airlines=sorted({leg.airline.value for leg in best.legs}),
                stops=best.stops,
                rows=len(rows),
                detail=f'currency {best.currency}',
                seconds=seconds,
                at=stamp,
            )
        out.append(o)
        print(f'ours {search.id}: {o.kind} {o.cheapest or ""} {o.detail}', flush=True)
    return out


def explore_calls(searches: Sequence[Search]) -> dict[dt.date, list[Search]]:
    """The searches by the Friday of the Explore call that covers them (one per origin and Friday)."""
    calls: dict[dt.date, list[Search]] = {}
    for s in searches:
        calls.setdefault(s.friday, []).append(s)
    return calls


class Explorer(Protocol):
    """fli main's SearchExplore, as the trial calls it."""

    client: object

    def search(self, filters: object, currency: str | None = None) -> 'Dumped': ...


class Retried(Protocol):
    """A method fli's client retries (tenacity), as the stubs say of its get."""

    def retry_with(self, *, stop: object) -> Callable[..., object]: ...


class Dumped(Protocol):
    def model_dump(self, *, mode: str) -> dict[str, object]: ...


def explore(searches: Sequence[Search], pace: Pace, attempts: int) -> list[Outcome]:
    # fli main's Explore is read from its modules' namespaces: the fli the lock pins, which the checks type against,
    # has none of it
    from fli.search.client import Client
    from fli.search.exceptions import SearchClientError, SearchHTTPError
    from tenacity import stop_after_attempt

    class Once(Client):
        post = cast('Retried', vars(Client)['post']).retry_with(stop=stop_after_attempt(1))

    # fli's own retry of an error-13 answer (a share of Explore's, fli's notes say), its pauses of 1 to 3 s
    vars(importlib.import_module('fli.search.explore'))['EXPLORE_ATTEMPTS'] = attempts
    filters_of = cast('Callable[..., object]', part('fli.models', 'ExploreSearchFilters'))
    region = cast('Mapping[str, object]', part('fli.models', 'ExploreRegion'))['EUROPE']
    round_trip = cast('Mapping[str, object]', part('fli.models', 'TripType'))['ROUND_TRIP']
    explorer = cast('Callable[[], Explorer]', part('fli.search', 'SearchExplore'))
    rejected = cast('type[Exception]', part('fli.search.exceptions', 'SearchRejectedError'))
    out: list[Outcome] = []
    for friday, covered in explore_calls(searches).items():
        if stopped(out):
            out += [Outcome(s.id, 'explore', 'skipped', detail='after a 429') for s in covered]
            continue
        engine = explorer()
        engine.client = Once()
        stamp = now()
        with pace.request() as took:
            try:
                wanted = filters_of(
                    trip_type=round_trip,
                    origin=cast('Mapping[str, object]', part('fli.models', 'Airport'))[ORIGIN],
                    destination=region,
                    departure_date=friday.isoformat(),
                    trip_length_window=[4, 23, NIGHTS, NIGHTS],
                )
                result = engine.search(wanted, currency='EUR')
            except SearchHTTPError as e:
                kind: Kind = 'refused' if e.status_code == TOO_MANY else 'error'
                out += [
                    Outcome(s.id, 'explore', kind, detail=f'HTTP {e.status_code}: {e}', seconds=took()) for s in covered
                ]
                continue
            except rejected as e:
                out += [Outcome(s.id, 'explore', 'refused', detail=f'rejected: {e}', seconds=took()) for s in covered]
                continue
            except (SearchClientError, ValueError) as e:
                d = f'{type(e).__name__}: {e}'
                out += [Outcome(s.id, 'explore', 'error', detail=d, seconds=took()) for s in covered]
                continue
            seconds = took()
        dumped = result.model_dump(mode='json')
        destinations = cast('list[dict[str, object]]', dumped.get('destinations', []))
        shared = f' (one call for {", ".join(s.id for s in covered)})' if len(covered) > 1 else ''
        for s in covered:
            o = explore_pick(destinations, s)
            o.seconds, o.at, o.detail = seconds, stamp, o.detail + shared
            out.append(o)
            print(f'explore {s.id}: {o.kind} {o.cheapest or ""} {o.detail}', flush=True)
    return out


def chromium(searches: Sequence[Search], pace: Pace, kept: Path, wait: float, path: str | None) -> list[Outcome]:
    from patchright.sync_api import Error, sync_playwright

    kept.mkdir(parents=True, exist_ok=True)
    out: list[Outcome] = []
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=path, headless=True)
        try:
            for search in searches:
                if stopped(out):
                    out.append(Outcome(search.id, 'chromium', 'skipped', detail='after a 429'))
                    continue
                context = browser.new_context(locale='en-US', viewport={'width': 1280, 'height': 1600})
                # the consent cookie fli sends, so both readers of the page ask alike
                context.add_cookies(
                    [
                        {
                            'name': 'SOCS',
                            'value': cast('str', part('fli.search.client', 'SOCS_COOKIE')),
                            'domain': '.google.com',
                            'path': '/',
                        }
                    ]
                )
                page = context.new_page()
                rpcs: list[Response] = []
                page.on('response', functools.partial(keep_rpc, rpcs))
                stamp = now()
                try:
                    with pace.request() as took:
                        response = page.goto(page_url(search), wait_until='domcontentloaded', timeout=60000)
                        status = response.status if response else None
                        rows = settled(page.content, page.wait_for_timeout, wait)
                        seconds = took()
                    html = page.content()
                    o = chromium_outcome(search, status, page.url, html, rows)
                    o.at, o.seconds = stamp, seconds
                    o.detail += '; ' + rpc_note(rpcs, kept / search.id)
                    _ = (kept / f'{search.id}.html').write_text(html, encoding='utf-8')
                    _ = page.screenshot(path=str(kept / f'{search.id}.png'))
                except Error as e:
                    o = Outcome(search.id, 'chromium', 'error', detail=f'{type(e).__name__}: {e}'[:500], at=stamp)
                finally:
                    context.close()
                out.append(o)
                print(f'chromium {search.id}: {o.kind} {o.cheapest or ""} {o.detail}', flush=True)
        finally:
            browser.close()
    return out


def keep_rpc(kept: list['Response'], response: 'Response') -> None:
    """A response the page received, kept when it is the results RPC."""
    if 'GetShoppingResults' in response.url:
        kept.append(response)


def settled(content: Callable[[], str], pause: Callable[[float], None], wait: float) -> list[Rendered]:
    """The rendered rows once their count holds for two looks, 2 s apart, or what is there after `wait` seconds."""
    seen: list[Rendered] = []
    end = time.monotonic() + wait
    while time.monotonic() < end:
        pause(2000)
        rows = rendered_rows(content())
        if rows and len(rows) == len(seen):
            return rows
        seen = rows
    return seen


def chromium_outcome(search: Search, status: int | None, url: str, html: str, rows: list[Rendered]) -> Outcome:
    """What a loaded page says: refused (a 429, or Google's sorry page), consent, its rendered rows, or none."""
    if status == TOO_MANY or '/sorry/' in url:
        return Outcome(search.id, 'chromium', 'refused', detail=f'HTTP 429 or a sorry page: {status} {url}')
    if consent(url, html):
        return Outcome(search.id, 'chromium', 'consent', detail=f'consent page at {url}')
    if not rows:
        hint = 'the page says no results' if 'No results returned' in html else 'no result row rendered'
        return Outcome(search.id, 'chromium', 'empty', detail=f'HTTP {status}; {hint}')
    best = min(rows, key=lambda r: r.price)
    return Outcome(
        search.id,
        'chromium',
        'prices',
        cheapest=best.price,
        airlines=list(best.airlines),
        stops=best.stops,
        rows=len(rows),
        detail=f'HTTP {status}',
    )


def rpc_note(rpcs: Sequence['Response'], stem: Path) -> str:
    """The GetShoppingResults responses the page received: each kept as <stem>-rpc-N.txt, and said in a line (its
    status, size, and whether its request carried the signed x-goog-batchexecute-bgr header)."""
    from patchright.sync_api import Error

    said: list[str] = []
    for i, r in enumerate(rpcs):
        try:
            body = r.body()
            signed = 'x-goog-batchexecute-bgr' in r.request.all_headers()
        except Error as e:
            said.append(f'#{i} {r.status} unread ({type(e).__name__})')
            continue
        _ = stem.with_name(f'{stem.name}-rpc-{i}.txt').write_bytes(body)
        said.append(f'#{i} {r.status} {len(body)} B{" signed" if signed else ""}')
    return f'{len(said)} GetShoppingResults: {", ".join(said)}' if said else 'no GetShoppingResults'


# --- summary ----------------------------------------------------------------------------------------------------


def cell(o: Outcome | None) -> str:
    if o is None:
        return 'not run'
    if o.kind == 'prices':
        return f'€{o.cheapest:.0f} ({", ".join(o.airlines) or "?"}, {o.stops} stops)'
    return o.kind


def summary(out: Path) -> tuple[dict[str, object], str]:
    found: dict[str, dict[str, Outcome]] = {}
    for reader in READERS:
        p = out / f'{reader}.json'
        if p.exists():
            raw = cast('list[dict[str, object]]', json.loads(p.read_text(encoding='utf-8')))
            found[reader] = {o.search: o for o in (Outcome(**r) for r in raw)}  # pyright: ignore[reportArgumentType]
    per_reader: dict[str, dict[str, object]] = {}
    for reader, by in found.items():
        kinds = [o.kind for o in by.values()]
        times = [o.seconds for o in by.values() if o.seconds is not None]
        asked = sum(1 for k in kinds if k != 'skipped')
        per_reader[reader] = {
            'searches': len(kinds),
            'asked': asked,
            'answered': kinds.count('prices'),
            'answer_rate': round(kinds.count('prices') / len(kinds), 3) if kinds else None,
            **{k: kinds.count(k) for k in ('empty', 'refused', 'consent', 'error', 'skipped')},
            'median_seconds': statistics.median(times) if times else None,
        }
    lines = [
        f'# Fare reader trial: {ORIGIN} to each airport, out on the Friday, back on the Monday',
        '',
        '| reader | answered | rate | empty | refused | consent | error | skipped | median s |',
        '|---|---|---|---|---|---|---|---|---|',
    ]
    for reader, r in per_reader.items():
        lines.append(
            f'| {reader} | {r["answered"]}/{r["searches"]} | {r["answer_rate"]} | {r["empty"]} | {r["refused"]} | '
            f'{r["consent"]} | {r["error"]} | {r["skipped"]} | {r["median_seconds"]} |'
        )
    lines += ['', f'| search | {" | ".join(found)} |', f'|---|{"---|" * len(found)}']
    for s in SEARCHES:
        mark = ' (control)' if s.note.startswith('control') else ''
        lines.append(f'| {s.id}{mark} | {" | ".join(cell(by.get(s.id)) for by in found.values())} |')
    lines += ['', '## Details', '']
    for reader, by in found.items():
        lines += [f'### {reader}', '']
        lines += [f'- {o.search}: {o.kind}, {o.seconds} s. {o.detail}' for o in by.values()]
        lines.append('')
    data: dict[str, object] = {
        'origin': ORIGIN,
        'searches': [{'id': s.id, 'back': s.back.isoformat(), 'note': s.note} for s in SEARCHES],
        'readers': per_reader,
        'outcomes': {reader: [asdict(o) for o in by.values()] for reader, by in found.items()},
    }
    return data, '\n'.join(lines) + '\n'


# --- plan and selftest ------------------------------------------------------------------------------------------


def plan(gap: float) -> str:
    lines = [
        f'{len(SEARCHES)} searches from {ORIGIN}, back {NIGHTS} nights later; at least {gap:.0f} s before each request'
    ]
    try:
        urls = {s.id: page_url(s) for s in SEARCHES}
    except ImportError:
        urls = {}
        lines.append('(fli is not installed here: the page addresses are left out)')
    for s in SEARCHES:
        lines.append(f'  {s.id} back {s.back} {s.city}{" - " + s.note if s.note else ""}')
        if s.id in urls:
            lines.append(f'    page: {urls[s.id]}')
    calls = explore_calls(SEARCHES)
    lines.append(
        f'explore: {len(calls)} calls (round trip, {NIGHTS} nights, {ORIGIN} to Europe), fli at {FLI_MAIN[:7]}'
    )
    lines += [f'  {f} covers {", ".join(s.id for s in c)}' for f, c in calls.items()]
    requests = 2 * len(SEARCHES) + len(calls)
    lines.append(f'requests to Google: {requests}; the waits alone {requests * gap / 60:.0f} min')
    return '\n'.join(lines)


def selftest(pages: Sequence[Path]) -> list[str]:
    """The parsers on recorded pages: tests/pages/'s (fli's withheld page and a page with flights), and any probe
    page given, which is read as a rendered page. Returns what failed."""
    failed: list[str] = []
    recorded = REPOSITORY / 'tests' / 'pages'
    try:
        from fli.search._tfs import extract_payload
    except ImportError:
        failed.append('fli is not installed: run under uv run --group fares')
    else:
        withheld = nearby_dates(extract_payload((recorded / 'google-bgo-lys-withheld.html').read_text()))
        flights = nearby_dates(extract_payload((recorded / 'google-bgo-lis.html').read_text()))
        print(f'withheld page: {withheld} nearby dates; page with flights: {flights}')
        if not withheld or flights:
            failed.append('nearby_dates')
    if rendered_rows((recorded / 'google-bgo-lys-withheld.html').read_text()):
        failed.append('rendered_rows found a row on the withheld page')
    label = (
        '<div aria-label="From 1,355 euros round trip total. 1 stop flight with Lufthansa and Discover Airlines. '
        'Leaves ..."></div><div aria-label="From 99 euros round trip total. Nonstop flight with KLM. Leaves"></div>'
    )
    rows = rendered_rows(label)
    if rows != [Rendered(1355.0, 1, ('Lufthansa', 'Discover Airlines')), Rendered(99.0, 0, ('KLM',))]:
        failed.append(f'rendered_rows on labels: {rows}')
    for p in pages:
        found = rendered_rows(p.read_text(encoding='utf-8', errors='replace'))
        print(f'{p.name}: {len(found)} rows, cheapest {min((r.price for r in found), default=None)}', found[:2])
    if not consent('https://consent.google.com/m?continue=x', '') or consent('https://www.google.com/travel', label):
        failed.append('consent')
    lys = SEARCHES[0]
    picked = explore_pick(
        [
            {'name': 'Lyon', 'destination_airport': 'LYS', 'price': 333.0, 'airline_name': 'KLM', 'stops': 1},
            {'name': 'Lyon', 'destination_airport': 'LYS', 'price': 401.0},
            {'name': 'Paris', 'destination_airport': 'CDG', 'price': 120.0},
        ],
        lys,
    )
    if (picked.kind, picked.cheapest, picked.airlines) != ('prices', 333.0, ['KLM']):
        failed.append(f'explore_pick at the airport: {picked}')
    other = explore_pick([{'name': 'Paris', 'destination_airport': 'CDG', 'price': 120.0}], SEARCHES[2])
    if other.kind != 'empty' or 'via CDG' not in other.detail:
        failed.append(f'explore_pick through another airport: {other}')
    return failed


# --- command line -----------------------------------------------------------------------------------------------


def outside(path: str) -> Path:
    p = Path(path).resolve()
    if p == REPOSITORY or REPOSITORY in p.parents:
        raise argparse.ArgumentTypeError(f'{p} is in the repository, which the trial writes nothing in')
    return p


def write(path: Path, outcomes: list[Outcome]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    _ = path.write_text(json.dumps([asdict(o) for o in outcomes], indent=1), encoding='utf-8')
    print(f'{path}: {len(outcomes)} outcomes')


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0] if __doc__ else None)
    commands = parser.add_subparsers(dest='command', required=True)
    _ = commands.add_parser('plan', help='print the searches and the requests, contacting no one')
    test = commands.add_parser('selftest', help='the parsers on recorded pages')
    _ = test.add_argument('pages', nargs='*', type=Path, help='probe pages to read as rendered pages')
    for name in READERS:
        r = commands.add_parser(name, help=f'run the {name} reader')
        _ = r.add_argument('--out', type=outside, required=True, help='folder of the outcomes, outside the repository')
        _ = r.add_argument('--only', nargs='*', default=None, help='these search ids alone')
        if name == 'explore':
            _ = r.add_argument('--attempts', type=int, default=4, help="fli's tries of an error-13 answer")
        if name == 'chromium':
            _ = r.add_argument('--wait', type=float, default=40, help='seconds the results may take to render')
            _ = r.add_argument('--browser', help="the Chromium to run (default: Patchright's own)")
    s = commands.add_parser('summary', help='join the outcomes into summary.json and summary.md')
    _ = s.add_argument('--out', type=outside, required=True)
    for sub in commands.choices.values():
        _ = sub.add_argument('--gap', type=float, default=GAP, help=f'seconds before each request, at least {GAP:.0f}')
    args = parser.parse_args(argv)
    gap = max(cast('float', args.gap), GAP)
    command = cast('str', args.command)
    if command == 'plan':
        print(plan(gap))
        return 0
    if command == 'selftest':
        failed = selftest(cast('list[Path]', args.pages))
        print('\n'.join(failed) or 'selftest: every check holds')
        return 1 if failed else 0
    out = cast('Path', args.out)
    if command == 'summary':
        data, md = summary(out)
        _ = (out / 'summary.json').write_text(json.dumps(data, indent=1), encoding='utf-8')
        _ = (out / 'summary.md').write_text(md, encoding='utf-8')
        print(md)
        return 0
    only = cast('list[str] | None', args.only)
    searches = [s for s in SEARCHES if only is None or s.id in only]
    pace = Pace(gap)
    if command == 'ours':
        outcomes = ours(searches, pace)
    elif command == 'explore':
        outcomes = explore(searches, pace, cast('int', args.attempts))
    else:
        outcomes = chromium(
            searches, pace, out / 'chromium', cast('float', args.wait), cast('str | None', args.browser)
        )
    write(out / f'{command}.json', outcomes)
    return 0


if __name__ == '__main__':
    sys.exit(main())
