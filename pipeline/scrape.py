"""Refresh the events in the source DB from kizomba-world.com, in place.

    mise run scrape             # what the monthly Action runs
    mise run scrape -- --dry-run   # report the changes without writing

The event list comes from the site's Events Calendar API. Each event page adds what the API leaves out: venue,
address, city, country, the deal link, the organiser's links, the translations and whether it is cancelled.
Pages are fetched for new and changed events and for every event still to come: a deal link can change
without changing the event's modified date, and a cancellation might too. A festival has an id of ours, given once and
never again, beside the site's (source_ids). One the site no longer lists is kept, gone since that day, so plans and
links to it still hold; listed again, it is listed again. A new or changed festival's line-up and features wait for
the extraction steps, which find it by the message they would ask it with now (pipeline/extract/questions.py).

Each event is written as it is read, in a transaction of its own. A request that fails for now (a lost connection, a
timeout, HTTP 403, 429 or 5xx) is tried again, three times in all; then, or at once for any other status (404), it
gives no answer (pipeline/calls.py). An event list that gives none stops the run before anything is written; an event
page that gives none leaves its event as it was (a new one is not added) for the next run, which this one fails
naming.

kizomba-world publishes its listings under CC BY-SA 4.0. Requests are spaced a few seconds apart.
"""

import argparse
import datetime as dt
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from curl_cffi import requests
from curl_cffi.requests import Response
from curl_cffi.requests.exceptions import RequestException
from pydantic import BaseModel

from pipeline import calls, export, states
from pipeline import db as sqlite_db
from pipeline.calls import Declined
from pipeline.db import Reader, Transaction
from pipeline.enums import CallCause, EventSource, Listing
from pipeline.extract import run_log
from pipeline.kizomba_world import ApiEvent, ApiPage, Listed, Paged, api_fields, page_fields
from pipeline.records import day_of, now

SITE = 'https://kizomba-world.com'
FIRST_DAY = dt.date(2026, 1, 1)  # the export covers events from here to the end of next year
PAUSE = 3  # seconds between requests
TRIES, RETRY = 3, 30  # tries of a request the site is busy for, and seconds to wait before the next, times the tries
LISTED_SHARE = 0.9  # a site listing fewer of the events still to come than this share of them is taken to have failed
OK, TOO_MANY, SERVER_ERROR = 200, 429, 500
BUSY = frozenset({403, TOO_MANY})  # what Cloudflare answers when it would rather not, for now


class EventRow(Listed, Paged):
    """A row of the events table: the API's record and its page's fields."""


COLUMNS = list(EventRow.model_fields)


class Fetcher:
    """Requests to the site, a few seconds apart; one that fails for now (a lost connection, a timeout, HTTP 403,
    429 or 5xx) is tried again, TRIES times in all, and then gives no answer, as one the site answers otherwise does
    at once (a page gone, 404)."""

    def __init__(self) -> None:
        self.last = 0.0

    def get(self, url: str) -> Response | Declined:
        failed = Declined(CallCause.TRANSIENT, f'{url}: not tried')
        for attempt in range(TRIES):
            time.sleep(max(0, self.last + PAUSE - time.time()))
            try:
                r = requests.get(url, impersonate='chrome', timeout=60)
            except RequestException as e:
                failed = Declined(CallCause.TRANSIENT, f'{url}: {type(e).__name__}: {e}')
            else:
                if r.status_code == OK:
                    self.last = time.time()
                    return r
                busy = r.status_code in BUSY or r.status_code >= SERVER_ERROR
                failed = Declined(CallCause.TRANSIENT if busy else CallCause.STRUCTURAL, f'{url}: HTTP {r.status_code}')
                if not busy:
                    self.last = time.time()
                    return failed
            self.last = time.time()
            print(f'{failed.why}; try {attempt + 1} of {TRIES}', file=sys.stderr)
            if attempt + 1 < TRIES:
                time.sleep(RETRY * (attempt + 1))
        return failed


def listed(fetch: Fetcher) -> list[ApiEvent]:
    """Every event the API lists from FIRST_DAY to the end of next year."""
    url: str | None = (
        f'{SITE}/wp-json/tribe/events/v1/events?per_page=50&start_date={FIRST_DAY}&end_date={now().year + 1}-12-31'
    )
    events: list[ApiEvent] = []
    while url:
        match fetch.get(url):
            case Declined() as d:
                sys.exit(f'the event list gave no answer ({d.cause}: {d.why}); nothing written')
            case r:
                page = ApiPage.model_validate_json(r.content)
        events += page.events
        url = page.next_rest_url
    return events


STEP = (
    f'Collect kizomba-world.com events dated {FIRST_DAY.day} {FIRST_DAY:%B %Y} to the end of next year: the event '
    "list from The Events Calendar REST API, then each new, changed or upcoming event's page for the fields the API "
    'lacks (venue, address, city, country, deal link, related links, translations, the cancelled flag), fetched as a '
    "browser would (curl_cffi), since the site's Cloudflare protection refuses other clients."
)

# the export's tables of the site's events, as kizomba-world's own export made them, and of the events the extraction
# steps are to read (tests/test_steps.py holds the export to them)
KEPT = sqlite_db.declared(
    """
create table events (
    id integer primary key,
    title text not null,
    url text not null unique,
    slug text,
    start_date text not null,
    end_date text,
    start_date_utc text,
    end_date_utc text,
    timezone text,
    all_day integer not null check (all_day in (0, 1)),
    featured integer not null check (featured in (0, 1)),
    sticky integer not null check (sticky in (0, 1)),
    cancelled integer check (cancelled in (0, 1)),  -- NULL = unknown (a past event's page)
    venue text,
    address text,
    city text,
    country text,
    deal_text text,
    deal_url text,
    website text,
    image_url text,
    description_text text,
    description_html text,
    url_fr text,
    url_es text,
    url_pt text,
    published_at text,
    modified_at text,
    listing text not null default 'listed' check (listing in ('listed', 'gone')),
    unlisted_on text,             -- the day the site stopped listing it
    check ((listing = 'gone') = (unlisted_on is not null))
) strict;
create table event_categories (
    event_id integer not null references events(id) on delete cascade deferrable initially deferred,
    category text not null,
    primary key (event_id, category)
) strict;
create table event_tags (
    event_id integer not null references events(id) on delete cascade deferrable initially deferred,
    tag text not null,
    primary key (event_id, tag)
) strict;
create table event_links (
    event_id integer not null references events(id) on delete cascade deferrable initially deferred,
    url text not null,
    primary key (event_id, url)
) strict;
create table source_ids (
    source text not null check (source in ('kizomba-world')),
    source_id integer not null,   -- the festival's id there
    event_id integer not null references events(id) on delete cascade deferrable initially deferred,
    primary key (source, source_id)
) strict, without rowid;
create index source_ids_event on source_ids(event_id);
create index events_start on events(start_date);
create index events_country on events(country);
""".format_map(states.SQL_IN)
)


def write_event(db: Transaction, row: EventRow, categories: list[str], tags: list[str]) -> None:
    """The event's row, and its categories and tags (load_extract derives the genres and features they name)."""
    db.upsert('events', ['id'], row.model_dump())
    i = row.id
    db.execute('delete from event_categories where event_id = ?', (i,))
    db.executemany('insert into event_categories (event_id, category) values (?, ?)', [(i, c) for c in categories])
    db.execute('delete from event_tags where event_id = ?', (i,))
    db.executemany('insert into event_tags (event_id, tag) values (?, ?)', [(i, t) for t in tags])


@dataclass(frozen=True)
class Refreshed:
    """An event as the site lists it now: its row, the row the source DB had (None for a new one), the organiser's
    links when its page was read, and its categories and tags."""

    row: EventRow
    old: EventRow | None
    links: list[str] | None
    categories: list[str]
    tags: list[str]


def refreshed(
    fetch: Fetcher, listing: tuple[Listed, list[str], list[str]], old: EventRow | None, today: dt.date
) -> Refreshed | Declined:
    """The event's row: its page read again when it is new, changed or still to come, else its page fields kept; or
    why its page gave no answer, which leaves the event as it was, for the next run."""
    e, categories, tags = listing
    due = old is None or old.modified_at != e.modified_at or day_of(e.end_date or e.start_date) >= today
    links: list[str] | None = None
    if due or old is None:
        match fetch.get(e.url):
            case Declined() as d:
                return d
            case r:
                paged, links = page_fields(r.text)
    else:
        paged = Paged.model_validate(old.model_dump(include=set(Paged.model_fields)))
    row = EventRow.model_validate(e.model_dump() | paged.model_dump())
    return Refreshed(row, old, links, categories, tags)


@dataclass
class Report:
    """What the refresh found: new events, changed ones and newly cancelled ones, and each changed field's count, to
    tell site updates from parsing slips."""

    added: list[str] = field(default_factory=list[str])
    changed: list[str] = field(default_factory=list[str])
    cancelled: list[str] = field(default_factory=list[str])
    differs: dict[str, int] = field(default_factory=dict[str, int])

    def note(self, r: Refreshed) -> None:
        before: dict[str, object] = r.old.model_dump() if r.old else {}
        after: dict[str, object] = r.row.model_dump()
        if r.old is None:
            self.added.append(r.row.title)
        elif fields_changed := [k for k, v in after.items() if before[k] != v]:
            self.changed.append(r.row.title)
            for k in fields_changed:
                self.differs[k] = self.differs.get(k, 0) + 1
        if r.row.cancelled and not (r.old and r.old.cancelled):
            self.cancelled.append(r.row.title)

    def show(self, gone: list[str]) -> None:
        print(
            f'{len(self.added)} new, {len(self.changed)} changed, {len(gone)} no longer listed, {len(self.cancelled)} '
            'newly cancelled'
        )
        for label, titles in (('new', self.added), ('newly cancelled', self.cancelled), ('no longer listed', gone)):
            for t in titles:
                print(f'  {label}: {t}')
        print('changed fields:', dict(sorted(self.differs.items(), key=lambda kv: -kv[1])))


class SourceId(BaseModel):
    source_id: int
    event_id: int


@dataclass
class Ids:
    """Our id of each of the site's festivals, by its id there: the one it was given, else the next one never given."""

    given: dict[int, int]
    next_id: int

    def of(self, source_id: int) -> int:
        if source_id not in self.given:
            self.given[source_id], self.next_id = self.next_id, self.next_id + 1
        return self.given[source_id]


def ids(db: Reader) -> Ids:
    given = db.rows(
        SourceId, 'select source_id, event_id from source_ids where source = ?', (EventSource.KIZOMBA_WORLD,)
    )
    taken = db.value(
        int, 'select coalesce(max(id), 0) from (select id from events union all select event_id from source_ids)'
    )
    return Ids({r.source_id: r.event_id for r in given}, taken + 1)


def write(db: Transaction, r: Refreshed, source_id: int) -> None:
    """The event's row, tags and links, the site's id of it, and its listing."""
    write_event(db, r.row, r.categories, r.tags)
    i = r.row.id
    db.insert(
        'source_ids',
        [{'source': EventSource.KIZOMBA_WORLD, 'source_id': source_id, 'event_id': i}],
        unless=('source', 'source_id'),
    )
    db.execute(
        'update events set listing = ?, unlisted_on = null where id = ? and listing = ?',
        (Listing.LISTED, i, Listing.GONE),
    )
    if r.links is not None:
        db.execute('delete from event_links where event_id = ?', (i,))
        db.executemany('insert into event_links (event_id, url) values (?, ?)', [(i, u) for u in r.links])


def finish(db: Transaction, report: Report, events: int, gone: list[int], today: dt.date) -> None:
    """Keep the events the site no longer lists as gone since today, and log the step."""
    db.executemany(
        'update events set listing = ?, unlisted_on = ? where id = ?', [(Listing.GONE, today, i) for i in gone]
    )
    details = {
        'events': events,
        'new': len(report.added),
        'changed': len(report.changed),
        'unlisted': len(gone),
    }
    run_log.record(
        db,
        run_log.Step(
            '1_scrape',
            STEP,
            performed_by='pipeline/scrape.py (curl_cffi)',
            inputs=f'{SITE}/wp-json/tribe/events/v1/events from {FIRST_DAY}; each new, changed or upcoming event page',
            outputs='tables events, source_ids, event_categories, event_tags, event_links',
            details=details,
        ),
    )
    print(details)


def run(src: Path, *, dry_run: bool) -> None:
    with export.opened('ro' if dry_run else 'rw', src) as db:
        known = {r.id: r for r in db.rows(EventRow, f'select {", ".join(map(sqlite_db.name, COLUMNS))} from events')}  # noqa: S608 (the record's own column names, quoted)
        listed_ids = set(db.column(int, 'select id from events where listing = ?', (Listing.LISTED,)))
        today = now().date()
        fetch = Fetcher()
        ours = ids(db)
        events = [
            (e.id, (e.model_copy(update={'id': ours.of(e.id)}), c, t)) for e, c, t in map(api_fields, listed(fetch))
        ]
        print(f'{len(events)} events listed; {len(listed_ids)} listed in the source DB')
        if len(events) < LISTED_SHARE * sum(1 for i in listed_ids if day_of(known[i].start_date) >= FIRST_DAY):
            sys.exit('the site lists far fewer events than before; stopping instead of taking them off the listing')
        report = Report()
        declined: list[tuple[str, Declined]] = []
        for source_id, listing in events:
            r = refreshed(fetch, listing, known.get(listing[0].id), today)
            if isinstance(r, Declined):
                print(f'{listing[0].title}: no answer ({r.why}); left as it was', file=sys.stderr)
                declined.append((listing[0].title, r))
                continue
            report.note(r)
            if not dry_run:
                with db.transaction() as tx:  # each event apart: the crawl takes no lock but while it writes one
                    write(tx, r, source_id)
        gone = sorted(listed_ids - {e.id for _, (e, _, _) in events})  # one whose page gave no answer is still listed
        report.show([known[i].title for i in gone])
        if not dry_run:
            with db.transaction() as tx:
                finish(tx, report, len(events), gone, today)
    if why := calls.failed('event pages', declined):
        sys.exit(why)


class Args(argparse.Namespace):
    dry_run: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Refresh the events in the source DB from kizomba-world.com.')
    _ = ap.add_argument('--dry-run', action='store_true', help='fetch and report the changes without writing')
    a = ap.parse_args(namespace=Args())
    run(export.path(), dry_run=a.dry_run)


if __name__ == '__main__':
    main()
