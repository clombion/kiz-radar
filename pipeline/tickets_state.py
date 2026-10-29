"""What each festival is to its ticket page (pipeline/tickets.py): its known page, whether it needs a first read and
why, what it waits for, and tickets/status.csv, which says it."""

import collections
import datetime as dt
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from contextlib import AbstractContextManager
from dataclasses import dataclass, replace
from typing import NamedTuple

from pipeline import claims, data, export, states, tickets_store
from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline.enums import FirstRead as FirstReadState
from pipeline.enums import Listing, Sales, Status, Style, Waiting
from pipeline.extract import answers, prices
from pipeline.records import (
    Dated,
    FirstRead,
    FoundRow,
    LogEntry,
    On,
    Priced,
    PricedTier,
    Record,
    Stamped,
    StatusRow,
    digest,
    today,
)
from pipeline.tickets_store import (
    DISPUTED,
    REFUSALS,
    Site,
    first_read,
    host,
    latest_read,
    log,
    read_at,
    site_for,
    sites,
    streak,
    unread_keys,
)

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


# ---- festivals


def src_db() -> AbstractContextManager[sqlite_db.Db]:
    """The kizomba-world export, to read, closed with its block."""
    return export.opened('ro')


def links(db: sqlite_db.Reader, event_id: int) -> list[str]:
    """The festival's links that may sell tickets, full ones first; a cut-short one ends in …."""
    linked = db.column(str, 'select url from event_links where event_id = ?', (event_id,))
    described = db.column(str, "select coalesce(description_text, '') from events where id = ?", (event_id,))
    urls = linked + [m[0].rstrip('.,;:!?') for text in described for m in re.finditer(r'https?://[^\s<>"|)]+', text)]
    keep = {u for u in urls if (h := host(u)) and not sells_nothing(h)}
    return sorted(keep, key=lambda u: ('…' in u, u))


def sells_nothing(h: str) -> bool:
    """Whether a host is one of NOT_TICKETS: the domain or a subdomain of a name with a dot (booking.com, never
    trybooking.com), and a host with the word in a label of its name for one without (any hotel's)."""
    return any(
        h == n or h.endswith('.' + n) if '.' in n else any(n in label for label in h.split('.')) for n in NOT_TICKETS
    )


def shop_hosts(known: Mapping[str, Site]) -> set[str]:
    """The hosts of ticket shops: the ones a recipe reads, and the ones a site claim says no recipe can."""
    return {h for site in known.values() for h in site.recipe.hosts} | claims.sites().keys()


def known_page(
    fr: Dated | FirstRead | None,
    entries: Sequence[LogEntry],
    sold: FoundRow | None,
    urls: Sequence[str],
    shops: set[str],
) -> str | None:
    """The festival's ticket page when it is known, else None: the shop's page an agent chose for it (tickets/pages.csv,
    written by page and read --url), else its first read's, else none when an agent found it sells no page, else its
    first full link to a ticket shop."""
    if sold and sold.state == Sales.SHOP and sold.page:
        return sold.page
    if fr:
        if (at := read_at(fr, entries)) is None:
            sys.exit(f'a first read of rows at {fr.rows_at.isoformat()}, which its log has no read of')
        return at.page
    if sold:
        return None
    return next((u for u in urls if '…' not in u and host(u) in shops), None)


def dated_in_description(entry: Priced, start: dt.date, today: dt.date) -> bool:
    """Whether the description's own prices answer gives the pass a card prices (prices.card_pass) a price dated
    today or later."""
    card = prices.card_pass(entry.passes)
    return card is not None and any(
        day is not None and day >= today
        for t in entry.passes[card].tiers
        for day in prices.window(t.from_, t.until, start)
    )


# whether a festival in the first_read state needs a (new) first read
NEEDS = states.total(
    'first_read',
    {
        FirstReadState.NOT_NEEDED: False,
        FirstReadState.NONE: True,
        FirstReadState.PAST: False,
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


class KnownPage(NamedTuple):
    """A festival's known ticket page, and the recipe and version for its site, when one can read it."""

    url: str
    site: Site | None


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
    log: tuple[LogEntry, ...]
    tiers: tuple[PricedTier, ...]  # the tiers its first read records (tickets_store.recorded)
    described: answers.Answer[Priced] | None  # its description's prices answer to the current prompt
    page: KnownPage | None  # known_page()
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
                else FirstReadState.PAST
                if f.over
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
                if f.page and f.page.url != at.page
                else FirstReadState.REDO_UNREAD
                if unread
                else FirstReadState.CURRENT
            )
    return (FirstReadState.DISPUTED if NEEDS[state] and f.disputed else state), unread


def assessed(f: Festival, today: dt.date) -> Festival:
    """The festival with its first_read state as of today."""
    need, unread = why_first_read(f, today)
    return replace(f, need=need, unread=unread)


def disputed(event_id: int) -> bool:
    """Whether the festival's models disagreed in reads to the current prompt: a dispute to another is no dispute, and
    the reads are made again."""
    path = data(DISPUTED) / f'{event_id}.json'
    return path.exists() and prompts.is_current('first_read', Stamped.model_validate_json(path.read_bytes()).prompt)


def links_hash(urls: Iterable[str]) -> str:
    """What a none_found search was made of: the festival's links."""
    return digest('\n'.join(sorted(urls)))


def festivals(db: sqlite_db.Reader, today: dt.date, only: int | None = None, *, every: bool = False) -> list[Festival]:
    """The festivals still to come, every festival the source database lists (every), or the one asked for (only),
    leaving out the cancelled ones and the ones the site no longer lists, as Festival records."""
    query = (
        'select id, title, start_date, end_date, country, description_text from events where cancelled is not 1'
        ' and listing = ?'
    )
    events = (
        db.rows(Event, query + ' and id = ?', (Listing.LISTED, only))
        if only
        else db.rows(Event, query + ' order by start_date', (Listing.LISTED,))
        if every
        else db.rows(Event, query + ' and end_date >= ? order by start_date', (today,))
    )
    described = answers.current(prompts.PRICES, {e.id for e in events})
    known, found = sites(), found_pages()
    shops = shop_hosts(known)
    recorded = tickets_store.recorded().written
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
            tiers=w.tiers if (w := recorded.get(e.id)) else (),
            described=described.get(e.id),
            page=KnownPage(page, site_for(page, known)) if page else None,
            disputed=disputed(e.id),
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
    by default, unless a claim for its page's site (pipeline/claims.py) replaces that."""
    w = waits_by_default(f)
    o = claims.sites().get(host(f.page.url)) if f.page else None
    return o.then if o and w == o.instead_of else w


def waits_by_default(f: Festival) -> Waiting:
    """What the festival waits for by its own data: nothing once it is over; then what its reads say, whether it
    needs a first read, and how it sells and where."""
    if f.over:
        return Waiting.NOTHING
    if streak(f.log) >= REFUSALS:
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
    return Waiting.RECIPE if not f.page.site else Waiting.NOTHING


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
            page=f.page.url if f.page else None,
        )
        for f in sorted(fs, key=lambda f: f.id)
    ]
    StatusRow.write(rows)
    return collections.Counter(r.waits_for for r in rows)


def status(db: sqlite_db.Reader) -> collections.Counter[Waiting]:
    """Write tickets/status.csv for every festival the source database lists; the counts of what they wait for."""
    return write_status(festivals(db, today(), every=True))


def found_pages() -> dict[int, FoundRow]:
    """{event_id: tickets/pages.csv row}."""
    return {r.event_id: r for r in FoundRow.read()}
