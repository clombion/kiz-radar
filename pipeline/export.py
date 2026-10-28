"""The kizomba-world export the steps work on, the one file of the data folder's source/, and its schema's version.

Every step opens the export itself, through opened (python -m pipeline.export prints its path). The derived tables are
rebuilt by the step that owns them each time it runs, so their shape is the code's. The rest are kept: the source's
own tables (scrape's) and the history no rebuild can recreate (artist_ids, prompts, pipeline_steps, table_docs,
pending_extraction). Their shape changes by numbered migrations, applied once each, in order, to the export as the
repository holds it; the database's user_version is how many it has had. A step that writes the export opens it
migrated (opened('rw')); a step that only reads it refuses an export of another version, which a writing step has not
migrated yet, or which a newer version of the code wrote.
"""

import argparse
import sys
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from pipeline import data
from pipeline import db as sqlite_db

SOURCE = 'source'  # the kizomba-world export, and the steps' tables in it


def rebuilt(ddl: str) -> str:
    """A migration that makes these tables again as the script declares them, with their rows, column for column: the
    old ones renamed aside (no reference to them follows, Db.rebuilding), their indexes dropped for the new ones'."""
    with sqlite_db.memory() as db:
        with db.transaction() as tx:
            tx.script(ddl)
        tables = db.column(str, "select name from sqlite_master where type = 'table' order by rowid")
        indexes = db.column(str, "select name from sqlite_master where type = 'index' and sql is not null")
    old = [(sqlite_db.name(t), sqlite_db.name(f'{t}__old')) for t in tables]
    return '\n'.join(
        [f'drop index if exists {sqlite_db.name(i)};' for i in indexes]
        + [f'alter table {t} rename to {o};' for t, o in old]
        + [ddl]
        + [f'insert into {t} select * from {o};\ndrop table {o};' for t, o in old]  # noqa: S608 (declared names, quoted)
    )


# each a script run once, in a transaction that rebuilds tables as SQLite does (Db.rebuilding), in this order; a
# migration's text is what it was when it was written, whatever the tables are declared as since
MIGRATIONS: tuple[str, ...] = (
    # 1: no poster kept, as nothing reads one (events.image_url says where each is)
    """drop table event_images;
    delete from table_docs where name = 'event_images';
    delete from pipeline_steps where step = '2_images';""",
    # 2: the kept tables strict, the flags 0 or 1, and an event's rows going with it, held at commit
    rebuilt(
        """create table events (
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
    page_fetched integer not null check (page_fetched in (0, 1))  -- 0 when the event page could not be fetched
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
create index events_start on events(start_date);
create index events_country on events(country);
create table pending_extraction (
    event_id integer primary key references events(id) on delete cascade deferrable initially deferred,
    reason text not null check (reason in ('new', 'description changed')),
    since text not null
) strict;
CREATE TABLE prompts (
    prompt TEXT PRIMARY KEY,      -- its hash, as pipeline_steps.prompt and the rows the prompt produced name it
    text TEXT NOT NULL            -- pipeline/prompts/asked/<prompt>.md
) STRICT;
CREATE TABLE table_docs (
    name TEXT PRIMARY KEY,        -- a table or view in this database
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    written_by TEXT NOT NULL      -- the script that creates the table and keeps this description
) STRICT;
CREATE TABLE pipeline_steps (
    step TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    performed_at TEXT NOT NULL,   -- ISO 8601, UTC; for a step spread over time, when it finished
    performed_by TEXT NOT NULL,   -- the script, the model, or 'human reviewer'
    model TEXT,
    prompt TEXT,                  -- the prompts' hashes, separated by commas
    inputs TEXT,
    outputs TEXT,
    details TEXT                  -- JSON: the step's key numbers and settings
) STRICT;
"""
    ),
    # 3: artist_ids strict, and a key given one id
    rebuilt(
        """CREATE TABLE artist_ids (
    artist_id INTEGER PRIMARY KEY,  -- every artist id ever given; never reused
    match_key TEXT NOT NULL UNIQUE  -- the key it was given to
) STRICT;
"""
    ),
)


def path() -> Path:
    """The kizomba-world export of the data folder."""
    return path_in(data(SOURCE))


def path_in(folder: Path) -> Path:
    """The export in a folder: it holds one, which the Refresh events Action replaces in place. Two would leave which
    one the steps read to chance (a checkout gives every file the same time), so they are an error."""
    found = sorted(folder.glob('*.sqlite'))
    if len(found) != 1:
        sys.exit(f'source/ holds {len(found)} exports ({", ".join(p.name for p in found)}): it holds one')
    return found[0]


def version(db: sqlite_db.Reader, schema: str = 'main') -> int:
    """How many migrations the database (or the one attached as schema) has had."""
    return db.value(int, f'pragma {sqlite_db.name(schema)}.user_version')


def current(db: sqlite_db.Reader, schema: str = 'main') -> None:
    """Refuse an export another version of the code is to read."""
    if (have := version(db, schema)) != len(MIGRATIONS):
        sys.exit(f'the export is at version {have}, the code at {len(MIGRATIONS)}: a step that writes it migrates it')


def migrate(db: sqlite_db.Db) -> int:
    """Apply the migrations the database hasn't had, each in its own transaction, and give back the room the dropped
    rows held; how many it applied."""
    have = version(db)
    if have > len(MIGRATIONS):
        sys.exit(f'the export is at version {have}, newer than this code knows ({len(MIGRATIONS)})')
    for n, script in enumerate(MIGRATIONS[have:], have + 1):
        with db.rebuilding() as tx:
            tx.script(script)
            tx.execute(f'pragma user_version = {n}')
    if have < len(MIGRATIONS):
        db.vacuum()
    return len(MIGRATIONS) - have


@contextmanager
def opened(mode: Literal['ro', 'rw'], at: Path | None = None) -> Generator[sqlite_db.Db]:
    """The export (path(), or the one at a path), to read, or to write once migrated."""
    with sqlite_db.opened(at or path(), mode) as db:
        if mode == 'rw':
            _ = migrate(db)
        else:
            current(db)
        yield db


def main() -> None:
    ap = argparse.ArgumentParser(description='Print the path of the kizomba-world export the steps work on.')
    _ = ap.parse_args()
    print(f'{SOURCE}/{path().name}')


if __name__ == '__main__':
    main()
