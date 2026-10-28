"""Refresh the events in the source DB from kizomba-world.com, in place.

    mise run scrape             # what the monthly Action runs
    mise run scrape -- --dry-run   # report the changes without writing

The event list comes from the site's Events Calendar API. Each event page adds what the API leaves out: venue,
address, city, country, the deal link, the organiser's links, the translations and whether it is cancelled.
Pages are fetched for new and changed events and for every event still to come: a deal link can change
without changing the event's modified date, and a cancellation might too. A festival has an id of ours, given once and
never again, beside the site's (source_ids). One the site no longer lists is kept, gone since that day, so plans and
links to it still hold; listed again, it is listed again. A new festival's line-up and features wait for the
extraction steps, and the events whose description is new or changed since then are listed in pending_extraction.

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
from pydantic import BaseModel

from pipeline import db as sqlite_db
from pipeline import export, states
from pipeline.db import Reader, Transaction
from pipeline.enums import EventSource, Listing, Pending
from pipeline.extract import run_log
from pipeline.kizomba_world import ApiEvent, ApiPage, Listed, Paged, api_fields, page_fields
from pipeline.records import day_of, now

SITE = 'https://kizomba-world.com'
FIRST_DAY = dt.date(2026, 1, 1)  # the export covers events from here to the end of next year
PAUSE = 3  # seconds between requests
TRIES, RETRY = 3, 30  # tries of a refused request, and seconds to wait before the next, times the tries so far
LISTED_SHARE = 0.9  # a site listing fewer of the events still to come than this share of them is taken to have failed
OK = 200


class EventRow(Listed, Paged):
    """A row of the events table: the API's record, its page's fields, and whether its page was read."""

    page_fetched: int


COLUMNS = list(EventRow.model_fields)


class Fetcher:
    """Requests to the site, a few seconds apart, each tried again when refused."""

    def __init__(self) -> None:
        self.last = 0.0

    def get(self, url: str) -> Response:
        time.sleep(max(0, self.last + PAUSE - time.time()))
        for attempt in range(TRIES):
            r = requests.get(url, impersonate='chrome', timeout=60)
            self.last = time.time()
            if r.status_code == OK:
                return r
            print(f'{r.status_code} for {url}', file=sys.stderr)
            time.sleep(RETRY * (attempt + 1))
        sys.exit(f'giving up on {url}: the site refused it three times')


def listed(fetch: Fetcher) -> list[ApiEvent]:
    """Every event the API lists from FIRST_DAY to the end of next year."""
    url: str | None = (
        f'{SITE}/wp-json/tribe/events/v1/events?per_page=50&start_date={FIRST_DAY}&end_date={now().year + 1}-12-31'
    )
    events: list[ApiEvent] = []
    while url:
        page = ApiPage.model_validate_json(fetch.get(url).content)
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
    page_fetched integer not null check (page_fetched in (0, 1)),  -- 0 when the event page could not be fetched
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
create table pending_extraction (
    event_id integer primary key references events(id) on delete cascade deferrable initially deferred,
    reason text not null check (reason in ({pending})),
    since text not null
) strict;
""".format_map(states.SQL_IN)
)


def describe(db: Transaction) -> None:
    db.upsert(
        'table_docs',
        ['name'],
        {
            'name': 'pending_extraction',
            'kind': 'table',
            'description': 'Events whose description is new or changed since the extraction steps last ran, so their '
            'line-up, features, rooms and genres from the description are missing or out of date.',
            'written_by': 'pipeline/scrape.py',
        },
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
) -> Refreshed:
    """The event's row: its page read again when it is new, changed or still to come, else its page fields kept."""
    e, categories, tags = listing
    due = old is None or old.modified_at != e.modified_at or day_of(e.end_date or e.start_date) >= today
    links: list[str] | None = None
    if due or old is None:
        paged, links = page_fields(fetch.get(e.url).text)
        fetched = 1
    else:
        paged, fetched = Paged.model_validate(old.model_dump(include=set(Paged.model_fields))), old.page_fetched
    row = EventRow.model_validate(e.model_dump() | paged.model_dump() | {'page_fetched': fetched})
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


def write(db: Transaction, r: Refreshed, source_id: int, today: dt.date) -> None:
    """The event's row, tags and links, the site's id of it, and its listing. An event whose description is new or
    changed waits for the extraction steps."""
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
    if r.old is None or r.old.description_text != r.row.description_text:
        # a festival still pending keeps why, and waits from its latest change
        db.execute(
            'insert into pending_extraction (event_id, reason, since) values (?, ?, ?) '
            'on conflict (event_id) do update set since = excluded.since',
            (i, Pending.NEW if r.old is None else Pending.DESCRIPTION_CHANGED, today),
        )


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
        'pending_extraction': db.value(int, 'select count(*) from pending_extraction'),
    }
    run_log.record(
        db,
        run_log.Step(
            '1_scrape',
            STEP,
            performed_by='pipeline/scrape.py (curl_cffi)',
            inputs=f'{SITE}/wp-json/tribe/events/v1/events from {FIRST_DAY}; each new, changed or upcoming event page',
            outputs='tables events, source_ids, event_categories, event_tags, event_links, pending_extraction',
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
        for source_id, listing in events:
            r = refreshed(fetch, listing, known.get(listing[0].id), today)
            report.note(r)
            if not dry_run:
                with db.transaction() as tx:  # each event apart: the crawl takes no lock but while it writes one
                    write(tx, r, source_id, today)
        gone = sorted(listed_ids - {e.id for _, (e, _, _) in events})
        report.show([known[i].title for i in gone])
        if not dry_run:
            with db.transaction() as tx:
                describe(tx)
                finish(tx, report, len(events), gone, today)


class Args(argparse.Namespace):
    dry_run: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Refresh the events in the source DB from kizomba-world.com.')
    _ = ap.add_argument('--dry-run', action='store_true', help='fetch and report the changes without writing')
    a = ap.parse_args(namespace=Args())
    run(export.path(), dry_run=a.dry_run)


if __name__ == '__main__':
    main()
