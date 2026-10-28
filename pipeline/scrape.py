"""Refresh the events in the source DB from kizomba-world.com, in place.

    mise run scrape             # what the monthly Action runs
    mise run scrape -- --dry-run   # report the changes without writing

The event list comes from the site's Events Calendar API. Each event page adds what the API leaves out: venue,
address, city, country, the deal link, the organiser's links, the translations and whether it is cancelled.
Pages are fetched for new and changed events and for every event still to come: a deal link can change
without changing the event's modified date,
     and a cancellation might too. Events the site no longer lists are deleted with everything that refers
to them. New festivals get their poster; their line-up and features wait for the extraction steps, and the
events whose description is new or changed since then are listed in pending_extraction.

kizomba-world publishes its listings under CC BY-SA 4.0. Requests are spaced a few seconds apart.
"""

import argparse
import datetime as dt
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from curl_cffi import requests
from curl_cffi.requests import Response

from pipeline import db as sqlite_db
from pipeline import states
from pipeline.db import Reader, Transaction
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


# the export's table of the events the extraction steps are to read (tests/test_steps.py holds the export to it)
PENDING = """create table pending_extraction (
        event_id integer primary key references events(id) deferrable initially deferred,
        reason text not null check (reason in ('new', 'description changed')),
        since text not null)"""


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


def event_tables(db: Reader) -> list[str]:
    """The tables whose rows belong to one event, cleared when the site drops it."""
    return db.column(
        str,
        "select m.name from sqlite_master m, pragma_table_info(m.name) c where m.type = 'table' and m.name != 'events'"
        " and c.name = 'event_id' order by m.name",
    )


def write_event(db: Transaction, row: EventRow, categories: list[str], tags: list[str]) -> None:
    """The event's row, its categories and tags, and the genres and features its tags name."""
    db.upsert('events', ['id'], row.model_dump())
    i = row.id
    db.execute('delete from event_categories where event_id = ?', (i,))
    db.executemany('insert into event_categories (event_id, category) values (?, ?)', [(i, c) for c in categories])
    db.execute('delete from event_tags where event_id = ?', (i,))
    db.executemany('insert into event_tags (event_id, tag) values (?, ?)', [(i, t) for t in tags])
    db.execute("delete from event_genres where event_id = ? and source = 'site_tag'", (i,))
    db.executemany(
        "insert into event_genres (event_id, genre, source) values (?, ?, 'site_tag')",
        sorted({(i, g) for t in tags for g in states.TAG_GENRES.get(t, [])}),
    )
    db.execute("delete from event_features where event_id = ? and source = 'site_tag'", (i,))
    db.executemany(
        "insert into event_features (event_id, feature, source) values (?, ?, 'site_tag')",
        sorted({(i, states.TAG_FEATURES[t]) for t in tags if t in states.TAG_FEATURES}),
    )


def write_poster(db: Transaction, fetch: Fetcher, row: EventRow) -> bool:
    """Download the event's poster when it has a new one; whether it did."""
    posters = db.column(str, 'select url from event_images where event_id = ?', (row.id,))
    if not row.image_url or (posters and posters[0] == row.image_url):
        return False
    img = fetch.get(row.image_url)
    db.upsert(
        'event_images',
        ['event_id'],
        {
            'event_id': row.id,
            'url': row.image_url,
            'mime_type': img.headers.get('content-type', 'image/jpeg'),
            'size_bytes': len(img.content),
            'data': img.content,
        },
    )
    return True


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


def write(db: Transaction, fetch: Fetcher, r: Refreshed, today: dt.date) -> bool:
    """The event's row, tags, links and poster; whether it downloaded a poster. An event whose description is new or
    changed waits for the extraction steps."""
    write_event(db, r.row, r.categories, r.tags)
    i = r.row.id
    if r.links is not None:
        db.execute('delete from event_links where event_id = ?', (i,))
        db.executemany('insert into event_links (event_id, url) values (?, ?)', [(i, u) for u in r.links])
    if r.old is None or r.old.description_text != r.row.description_text:
        # a festival still pending keeps why, and waits from its latest change
        db.execute(
            'insert into pending_extraction (event_id, reason, since) values (?, ?, ?) '
            'on conflict (event_id) do update set since = excluded.since',
            (i, 'new' if r.old is None else 'description changed', today),
        )
    return write_poster(db, fetch, r.row)


def finish(db: Transaction, report: Report, events: int, gone: list[int], posters: int) -> None:
    """Delete the events the site no longer lists, with everything that refers to them, and log the step."""
    for t in event_tables(db):
        db.executemany(f'delete from {sqlite_db.name(t)} where event_id = ?', [(i,) for i in gone])  # noqa: S608 (the database's own table names, quoted)
    db.executemany('delete from events where id = ?', [(i,) for i in gone])
    details = {
        'events': events,
        'new': len(report.added),
        'changed': len(report.changed),
        'deleted': len(gone),
        'posters_downloaded': posters,
        'pending_extraction': db.value(int, 'select count(*) from pending_extraction'),
    }
    db.execute(
        """update pipeline_steps set performed_at = ?, performed_by = 'pipeline/scrape.py (curl_cffi)',
        inputs = ?, outputs = 'tables events, event_categories, event_tags, event_links, event_images,
        pending_extraction; event_genres and event_features (source site_tag)',
        details = ? where step = '1_scrape'""",
        (
            now(),
            f'{SITE}/wp-json/tribe/events/v1/events from {FIRST_DAY}; each new, changed or upcoming event page',
            json.dumps(details),
        ),
    )
    print(details)


def run(src: Path, *, dry_run: bool) -> None:
    with sqlite_db.opened(src, 'ro' if dry_run else 'rw') as db:
        known = {r.id: r for r in db.rows(EventRow, f'select {", ".join(map(sqlite_db.name, COLUMNS))} from events')}  # noqa: S608 (the record's own column names, quoted)
        today = now().date()
        fetch = Fetcher()
        events = [api_fields(e) for e in listed(fetch)]
        print(f'{len(events)} events listed; {len(known)} in the source DB')
        if len(events) < LISTED_SHARE * sum(1 for e in known.values() if day_of(e.start_date) >= FIRST_DAY):
            sys.exit('the site lists far fewer events than before; stopping instead of deleting them')
        report, posters = Report(), 0
        for listing in events:
            r = refreshed(fetch, listing, known.get(listing[0].id), today)
            report.note(r)
            if not dry_run:
                with db.transaction() as tx:  # each event apart: the crawl takes no lock but while it writes one
                    posters += write(tx, fetch, r, today)
        gone = sorted(set(known) - {e.id for e, _, _ in events})
        report.show([known[i].title for i in gone])
        if not dry_run:
            with db.transaction() as tx:
                describe(tx)
                finish(tx, report, len(events), gone, posters)


class Args(argparse.Namespace):
    dry_run: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Refresh the events in the source DB from kizomba-world.com.')
    _ = ap.add_argument('--dry-run', action='store_true', help='fetch and report the changes without writing')
    a = ap.parse_args(namespace=Args())
    run(sqlite_db.export(), dry_run=a.dry_run)


if __name__ == '__main__':
    main()
