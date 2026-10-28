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

# each a script run once, in a transaction that rebuilds tables as SQLite does (Db.rebuilding), in this order
MIGRATIONS: tuple[str, ...] = (
    # 1: no poster kept, as nothing reads one (events.image_url says where each is)
    """drop table event_images;
    delete from table_docs where name = 'event_images';
    delete from pipeline_steps where step = '2_images';""",
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
