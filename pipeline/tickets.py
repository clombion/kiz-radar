"""Prices from festivals' ticket pages: judgment once, then code.

    mise run tickets -- todo           # what needs doing
    mise run tickets -- read ID [--url U]  # read the page by its recipe, log the rows
    mise run tickets -- draft ID       # a first read to fill (tickets/drafts/ID.json)
    mise run tickets -- check ID       # what record would find wrong, writing nothing
    mise run tickets -- record ID      # check the draft or first read, write ID's prices
    mise run tickets -- retry ID       # read with a visible browser, then record
    mise run tickets -- changes [ID]   # what changed between consecutive reads
    mise run tickets -- page ID URL --note N  # where a festival with no known page sells
    mise run tickets -- page ID --state S --note N  # or not_yet, offline, closed, none_found
    mise run tickets -- run            # the monthly Action

A site recipe (tickets/sites/<site>.json, a records.Recipe) says where a site's ticket rows are; an
agent writes one per site. read applies it in a browser (read_page.rows) and appends one entry per attempt to
tickets/log/<event_id>.jsonl (records.LogEntry): read (with every row: key, name, price as shown,
amount, currency, a second price when the site shows one, sold out), refused (no rows and an HTTP error), unreachable
(the page could not be reached or would not load), or layout_broken (the recipe's selectors fail, no rows, two rows
with one key, or a row without its key, name, price, amount or currency: the recipe needs an agent). A read that can't
be made here at all (no browser would start) is no entry: the run stops reading pages, and fails.

A first read (tickets/reads/<event_id>.json, a records.FirstRead) says which pass each ticket is, by its key, from the
rows of one logged read (rows_at) and the festival's description: every ticket is in a tier or skipped, and dates and
price notes are quoted from the description or the tickets; its page is that read's. Only checked first reads are saved
there: an agent fills a draft (tickets/drafts/, not committed) that record moves there once it passes, and in the Action
Opus and Sonnet each write one, kept when they agree; when they don't, Fable writes a third, and one two of the three
agree on is kept (else tickets/disputed/<event_id>.json holds them all for an agent, until the first-read prompt
changes). A dispute is of reads made: when fewer than two models made one (a call failed, pipeline/calls.py), the
festival is read again next run, the reads made kept in tickets/partial/ so that none is paid for twice; the month's
budget spent, or a call that can never succeed as made, stops the run's first reads. Besides its record and the quotes,
the checker holds a first read to what its tickets' names say (rules_problems), so a model that misreads them answers
again with the checker's lines. A festival needs one when it is still to come and its description's prices answer to the
current prompt gives the pass a card prices (prices.card_pass) no dated price (until that answer is asked, it awaits
it), or again when its description or its ticket page changes, its page shows tickets the first read doesn't know, or
the first read follows another prompt (for a festival now past, made again from its latest logged rows). A first read to
another prompt is never written: record refuses it, and the prices leave it out until it is made again. Saving a first
read archives the prompt it names (pipeline/prompts/asked/).

A festival's prices are what its first read and the latest read rows of the same page record (tickets_store.written):
amount, currency, sold out and quote from the rows, the rest from the first read. A ticket the first read doesn't know
is counted as unread; a tier whose tickets are all gone is left out. The load takes them from every first read and its
log (tickets_store.recorded), so they are what the reads and logs say and nothing else, and no file holds them in
between: a festival whose first read no longer fits its page is left out until it is read again. record checks a draft
or a first read the same way, moving the draft to tickets/reads/ once it passes.

A festival's ticket page is known when it is the shop's page an agent chose (tickets/pages.csv: page, or read --url,
which replaces its first read's page, which then needs making again), its first read's, or its first full link to a
ticket shop (a site a recipe reads, or one a site claim says no recipe can). Each festival
still to come waits for something (enums.Waiting), or for nothing: its ticket page found (its links are cut short
or go to no ticket shop; tickets/pages.csv, written by page, records how an agent found it sells them: its shop's
page, or that its sales haven't opened, happen offline or are closed, or that a search found no page, which holds
until its links change), a recipe for its site (unless a site claim says a recipe can't read the site),
its recipe fixed, its sales to open, or an agent when no two models agreed; one whose reads keep failing waits
for a session. tickets/status.csv holds, for every festival the source database lists, what it waits for (nothing
once it is over), its first_read state, how it sells and its known page; page, read, retry, record and run write it
again. Waiting is backlog, not a failure.

Re-reads: a dated festival (every tier on sale has an end date and none is limited to a number of tickets) once its
last date has passed; every other festival on every monthly run. A festival whose latest read failed is retried on
every run; after REFUSALS reads in a row refused or unreachable (streak), it waits for a session, where retry reads it
with a visible browser. run --limit N first-reads N festivals at most, as the Action's limit input asks.
"""

import argparse
import collections
import datetime as dt
import json
import re
import sys
from collections.abc import Mapping, Sequence
from dataclasses import replace
from typing import NamedTuple

import anthropic
from pydantic import ValidationError

from pipeline import calls, data, states
from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline.calls import Declined
from pipeline.enums import FirstRead as FirstReadState
from pipeline.enums import Model, PassKind, Sales, SkipReason, Status, Style, Waiting
from pipeline.extract import ask
from pipeline.records import (
    AGREE,
    Dispute,
    Failed,
    FirstRead,
    FirstReadAnswer,
    FoundRow,
    LogEntry,
    ModelReads,
    Read,
    ReadHeader,
    errors,
    today,
)
from pipeline.tickets_reading import attempt
from pipeline.tickets_state import Festival, KnownPage, assessed, festivals, links_hash, src_db, status, waiting
from pipeline.tickets_store import (
    DISPUTED,
    DRAFTS,
    LOG,
    PARTIAL,
    REFUSALS,
    Written,
    append,
    changes,
    checked_read,
    draft,
    first_read,
    host,
    latest_read,
    line,
    log,
    read_problems,
    recheck,
    record,
    recorded,
    save_draft,
    save_read,
    settle_dispute,
    shown,
    site_for,
    sites,
    streak,
    written,
)

# each makes a first read; the first one's is kept when they agree
MODELS = (Model.CLAUDE_OPUS_5_5, Model.CLAUDE_SONNET_5_5)
TIE_BREAK = Model.CLAUDE_FABLE_5_1  # reads too when they don't, so that two of three may agree


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


def ask_read(
    client: ask.Client, model: Model, f: Festival, entry: Read, entries: Sequence[LogEntry]
) -> FirstRead | Declined:
    """One model's first read, checked, with one retry on the checker's lines; or why there is none."""
    header = draft_of(f, entry, model)

    def check(text: str) -> FirstRead | list[str]:
        try:
            fr = joined(header, FirstReadAnswer.parse(text))
        except ValidationError as e:
            return errors(e, 'schema')
        return read_problems(fr, entries) or fr

    request = ask.Request(model, prompts.current('first_read'), question(f, entry), f'{f.id} {model}', 'first_read')
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


def agreed(reads: Mapping[Model, FirstRead]) -> FirstRead | None:
    """Of the models' reads, the first that another agrees with, its read_by naming every model that agrees; else
    None."""
    for r in reads.values():
        if len(same := [n for n, other in reads.items() if meaning(other) == meaning(r)]) >= AGREE:
            return r.model_copy(update={'read_by': ' + '.join(same)})
    return None


def kept(event_id: int, entry: Read) -> dict[Model, FirstRead]:
    """The models' reads already paid for of these rows, to the current prompt (tickets/partial/)."""
    path = data(PARTIAL) / f'{event_id}.json'
    if not path.exists():
        return {}
    found = ModelReads.model_validate_json(path.read_bytes())
    current = found.rows_at == entry.at and prompts.is_current('first_read', found.prompt)
    return dict(found.reads) if current else {}


def keep(event_id: int, entry: Read, reads: Mapping[Model, FirstRead]) -> None:
    """Keep the reads paid for until they settle, or forget them once they have (none to keep)."""
    path = data(PARTIAL) / f'{event_id}.json'
    if not reads:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    prompt = prompts.current('first_read').hash
    _ = path.write_text(ModelReads(rows_at=entry.at, prompt=prompt, reads=dict(reads)).dumped(), encoding='utf-8')


def models_read(
    client: ask.Client, f: Festival, entry: Read, entries: Sequence[LogEntry]
) -> FirstRead | Dispute | Declined:
    """The first read two models agree on: MODELS', or when they don't, one TIE_BREAK agrees with. Two reads made or
    more and no two agreeing are a dispute, in tickets/disputed/ for an agent. Fewer, and the festival is read again
    next run: why, the reads made kept, so that none is paid for twice; a call that stops the run (pipeline/calls.py)
    asks no further model."""
    reads = kept(f.id, entry)
    missed: list[Declined] = []
    for group in (MODELS, (TIE_BREAK,)):
        for m in (m for m in group if m not in reads):
            match ask_read(client, m, f, entry, entries):
                case Declined() as d if d.stops:
                    keep(f.id, entry, reads)
                    return d
                case Declined() as d:
                    missed.append(d)
                case read:
                    reads[m] = read
        if found := agreed(reads):
            keep(f.id, entry, {})
            return found
    if len(reads) < AGREE:
        keep(f.id, entry, reads)
        d = missed[0]
        return Declined(d.cause, f'{len(reads)} model read made ({d.why})')
    keep(f.id, entry, {})
    dispute = Dispute(rows_at=entry.at, prompt=prompts.current('first_read').hash, reads=reads)
    data(DISPUTED).mkdir(parents=True, exist_ok=True)
    _ = (data(DISPUTED) / f'{f.id}.json').write_text(dispute.dumped(), encoding='utf-8')
    return dispute


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


def one(db: sqlite_db.Reader, event_id: int, page: str | None = None) -> Festival:
    f = next(iter(festivals(db, today(), event_id)), None)
    if f is None:
        sys.exit(f'{event_id}: no such festival, or it is cancelled or no longer listed')
    return replace(f, page=KnownPage(page, site_for(page, sites()))) if page else f


def cmd_read(db: sqlite_db.Reader, event_id: int, url: str | None = None, *, visible: bool | None = None) -> None:
    """Read the festival's known ticket page, or the one url names, which becomes its known page (tickets/pages.csv),
    so that the next run reads it too."""
    f = one(db, event_id, url and full_url(url))
    if url and f.page:
        found(
            FoundRow(
                event_id=event_id,
                event=f.title,
                state=Sales.SHOP,
                page=f.page.url,
                links=None,
                found_by='agent',
                note='read --url',
            )
        )
    if not f.page:
        sys.exit(f'{event_id}: no known ticket page; find it and pass --url')
    url, site = f.page
    if not site:
        sys.exit(
            f'{event_id}: no recipe for {host(url)}; write tickets/sites/<site>.json '
            '(its record: pipeline/records.py, Recipe) from the page, then read again'
        )
    entry = attempt(url, site, visible=visible)
    if isinstance(entry, Declined):
        sys.exit(f'{event_id}: {entry.why}')
    append(event_id, entry)
    _ = status(db)
    if isinstance(entry, Failed):
        sys.exit(
            f'{event_id}: {entry.status}: {entry.why}'
            + (f'; try: mise run tickets -- retry {event_id}' if entry.status == Status.REFUSED else '')
        )
    print(f'{event_id}: {len(entry.rows)} tickets read at {entry.at.isoformat()} from {entry.url}')
    for r in entry.rows:
        print(f'  {r.key:>12}  {line(r)}{"  (sold out)" if r.sold_out else ""}')


def cmd_draft(db: sqlite_db.Reader, event_id: int) -> None:
    f, path = one(db, event_id), data(DRAFTS) / f'{event_id}.json'
    if path.exists():
        sys.exit(f'{shown(path)} exists; delete it to start the draft again')
    if not (entry := latest_read(f.log)):
        sys.exit(f'{event_id}: no read rows yet; run: mise run tickets -- read {event_id}')
    save_draft(draft_of(f, entry, 'agent'))
    asked = data(DRAFTS) / f'{event_id}.prompt.md'
    _ = asked.write_text(
        prompts.current('first_read').text + '\n======== the festival ========\n\n' + question(f, entry) + '\n',
        encoding='utf-8',
    )
    print(
        f'Fill passes, skipped and rule_quotes in {shown(path)} following {shown(asked)}, the prompt the models '
        f'answer, with the festival and the tickets of the read at {entry.at.isoformat()}; '
        f'then run: mise run tickets -- record {event_id}'
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
        case Written() as w:
            print(
                f'{event_id}: passes; {len(w.tiers)} prices'
                + (f', {len(w.unread)} tickets not read' if w.unread else '')
            )
        case list() as found:
            sys.exit('\n'.join(found))


def cmd_record(db: sqlite_db.Reader, event_id: int) -> None:
    if found := record(event_id):
        sys.exit('\n'.join(found))
    _ = status(db)
    print('Then: mise run load, mise run resolve and mise run build:data')


def todo_notes(f: Festival, today: dt.date) -> list[str]:
    """What todo says of a festival: when to read it again, its failed reads, and its first read."""
    notes: list[str] = []
    if f.first_read:
        kind, due, why = recheck(f.tiers, f.start_date, today)
        notes.append(f'{kind}: {"due" if due else "not due"}, {why}')
        if f.log and isinstance(last := f.log[-1], Failed):
            n = streak(f.log)
            notes.append(
                f'latest read failed ({last.status}: {last.why})'
                + (f', {n} in a row' if n > 1 else '')
                + (f'; read it in a session: mise run tickets -- retry {f.id}' if n >= REFUSALS else '')
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


def cmd_todo(db: sqlite_db.Reader) -> None:
    day = today()
    fs = festivals(db, day)
    for f in fs:
        if not f.first_read and not f.needs_read:
            continue
        print(f'{f.id}  {f.start_date}  {f.title[:50]}')
        for n in todo_notes(f, day):
            print(f'      {n}')
        for u in ([f.page.url] if f.page else list(f.links))[:3]:
            print(f'      {u}')
    counts = collections.Counter(waiting(f) for f in fs)
    print('\nwaits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))


class Sold(NamedTuple):
    """How an agent found a festival sells its tickets: its shop's page (or none), the sales state, how it was found
    or why there is none, and who found it."""

    page: str | None
    state: Sales
    note: str
    by: str


def found(row: FoundRow) -> None:
    """Record how a festival sells (tickets/pages.csv), in place of what was recorded before."""
    rows = [r for r in FoundRow.read() if r.event_id != row.event_id]
    FoundRow.write(sorted([*rows, row], key=lambda r: r.event_id))


def cmd_page(db: sqlite_db.Reader, event_id: int, sold: Sold) -> None:
    """Record how a festival with no known ticket page sells its tickets: its shop's page, or that its sales haven't
    opened, happen offline, are closed, or that a search of its links and the web found no page."""
    url, state, note, by = sold
    f = one(db, event_id)
    if f.first_read:
        sys.exit(f'{event_id}: it has a first read; read a new page with: read {event_id} --url URL')
    if url:
        _ = full_url(url)
    try:
        row = FoundRow(
            event_id=event_id,
            event=f.title,
            state=state,
            page=url,
            links=links_hash(f.links) if state == Sales.NONE_FOUND else None,
            found_by=by,
            note=note,
        )
    except ValidationError as e:
        sys.exit('\n'.join(errors(e, f'{event_id}')))
    found(row)
    _ = status(db)
    print(
        f'{event_id}: {state}'
        + (f' {url}' if url else '')
        + ('' if state != Sales.SHOP or not url or site_for(url, sites()) else f'; no recipe for {host(url)} yet')
    )


def cmd_changes(event_id: int | None = None) -> None:
    for i in [event_id] if event_id else sorted(int(p.stem) for p in data(LOG).glob('*.jsonl')):
        for day, text in changes(log(i)):
            print(f'{i}  {day}  {text}')


def cmd_retry(db: sqlite_db.Reader, event_id: int) -> None:
    cmd_read(db, event_id, visible=True)
    cmd_record(db, event_id)


class Run:
    """The monthly Action's run: the reads it makes, what it found wrong, and what stopped its calls: a page read
    that can be made nowhere here (no browser) stops the page reads; the month's budget, or a call to the models that
    cannot succeed as made, stops the first reads; limit bounds how many festivals the models read."""

    def __init__(self, db: sqlite_db.Reader, today: dt.date, limit: int | None = None) -> None:
        self.db, self.today, self.limit = db, today, limit
        self.client: ask.Client | None = None
        self.alarms: list[str] = []
        self.pages: Declined | None = None  # what stopped the page reads
        self.models: Declined | None = None  # what stopped the first reads
        self.unread: list[tuple[int, Declined]] = []  # the festivals the models left without a first read, and why
        self.asked = 0

    def make(self, f: Festival, entry: Read) -> None:
        """A first read of the festival by the models, saved when two agree."""
        if self.models or (self.limit is not None and self.asked >= self.limit):
            return
        self.asked += 1
        self.client = self.client or anthropic.Anthropic()
        match models_read(self.client, f, entry, log(f.id)):
            case FirstRead() as new:
                save_read(new)
                settle_dispute(f.id, new)
                print(f'{f.id}: first read by {new.read_by}')
            case Dispute():
                print(f'{f.id}: first read disputed: tickets/disputed/{f.id}.json')
            case Declined() as d:
                print(f'{f.id}: no first read: {d.cause}: {d.why}', file=sys.stderr)
                self.unread.append((f.id, d))
                if d.stops:
                    self.models = d

    def read(self, f: Festival) -> LogEntry | None:
        """A new read of the festival's page, logged; None once the page reads have stopped."""
        if self.pages or not (f.page and f.page.site):
            return None
        match attempt(f.page.url, f.page.site):
            case Declined() as d:
                self.pages = d
                self.alarms.append(f'{d.why}: no ticket page was read from here on')
                return None
            case entry:
                append(f.id, entry)
                print(f'{f.id}: {entry.status}' + (f': {entry.why}' if isinstance(entry, Failed) else ''))
                if isinstance(entry, Failed) and entry.status == Status.LAYOUT_BROKEN:
                    self.alarms.append(f'{f.id}: layout broken ({entry.why}); the recipe {entry.recipe} needs an agent')
                elif streak(log(f.id)) == REFUSALS:
                    self.alarms.append(
                        f'{f.id}: {REFUSALS} failed reads in a row; read it in a session: mise run tickets -- retry '
                        f'{f.id}'
                    )
                return entry

    def reread(self, f: Festival) -> Festival:
        """Read again a festival whose prices are due or whose latest read failed; the festival as of the new read."""
        if not f.first_read:
            return f
        if not (recheck(f.tiers, f.start_date, self.today)[1] or (f.log and isinstance(f.log[-1], Failed))):
            return f
        if self.read(f) is None:
            return f
        return assessed(replace(f, log=tuple(log(f.id))), self.today)

    def first_reads(self, f: Festival) -> None:
        """A first read for a festival that needs one, from rows read today."""
        if not (f.needs_read and f.need != FirstReadState.DISPUTED and f.page and f.page.site):
            return
        entry = latest_read(f.log)
        if entry is None or entry.at.date() != self.today:
            entry = self.read(f)
        if isinstance(entry, Read):
            self.make(f, entry)

    def verdict(self) -> str | None:
        """What the run exits with: every alarm, and the festivals left without a first read."""
        unread = calls.failed('first reads', self.unread)
        return '\n'.join([*self.alarms, *([unread] if unread else [])]) or None


def cmd_run(db: sqlite_db.Reader, ids: set[int] | None = None, limit: int | None = None) -> None:
    """Re-read what is due and retry failures, first-read with the models what needs it (at most limit festivals),
    and make again, from their latest logged rows, the first reads of festivals now past that follow another prompt
    (of the festivals ids names, when it names some). Exits 1 naming each festival whose page
    broke its recipe, reached REFUSALS failures, no longer fits its first read, or got no first read from the models
    (pipeline/calls.py)."""
    day = today()
    every = set(db.column(int, 'select id from events'))
    if ids and (missing := ids - every):
        sys.exit(f'no such festival: {sorted(missing)}')
    run = Run(db, day, limit)
    for f in (f for f in festivals(db, day) if not ids or f.id in ids):
        run.first_reads(run.reread(f))
    for f in festivals(db, day, every=True):
        redo = f.over and (not ids or f.id in ids) and f.need == FirstReadState.REDO_PROMPT
        if redo and (entry := latest_read(f.log)):
            run.make(f, entry)  # its page sells nothing any more; its logged rows still say what it sold
    run.alarms += recorded().problems
    counts = status(db)
    print('waits for: ' + '; '.join(f'{n} {w}' for w, n in counts.most_common()))
    if why := run.verdict():
        sys.exit(why)


class Args(argparse.Namespace):
    cmd: str = ''
    id: int | None = None
    url: str | None = None
    state: Sales = Sales.SHOP
    note: str = ''
    by: str = 'agent'
    only: set[int] | None = None
    limit: int | None = None


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
    run = sub.add_parser('run', help='the monthly Action')
    _ = run.add_argument('--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"')
    _ = run.add_argument('--limit', type=sqlite_db.at_least_one, help='first reads by the models for this many at most')
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
                cmd_run(db, a.only, a.limit)
    return None


if __name__ == '__main__':
    main()
