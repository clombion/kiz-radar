"""Committed data for tests that read it: files copied into the test's data folder, and the kizomba-world export, run on
whole by some tests: copies of it, whole or with only its latest festivals, every table's content, and a step's main
run as its command line would."""

import functools
import json
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest
from pydantic import BaseModel

import pipeline
from pipeline import ROOT, export, prompt, tickets_store
from pipeline import db as sqlite_db
from pipeline.db import Transaction
from pipeline.records import ANSWERS, CsvRow

EXPORT = export.path_in(ROOT / export.SOURCE)  # the repository's, whatever the data folder
# when a step ran, which a second run changes and nothing else should: read without it (a column, or the rows a
# where clause leaves out)
WHEN_COLUMNS = {'pipeline_steps': 'performed_at', 'today': 'day'}
WHEN_ROWS = {'meta': "key != 'built_at'"}


# everything the steps read beside the export: every CSV file, the answers, the ticket reads and their log, and the
# prompts they followed
EVERYTHING = (*(r.FILE for r in CsvRow.records()), ANSWERS, tickets_store.READS, tickets_store.LOG, prompt.ASKED)


def committed(*paths: str) -> None:
    """Copy these committed files or folders (paths from the repository's folder) into the test's data folder."""
    for path in paths:
        src, dst = ROOT / path, pipeline.data(path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        _ = shutil.copytree(src, dst, dirs_exist_ok=True) if src.is_dir() else shutil.copyfile(src, dst)


@functools.cache
def schema() -> str:
    """The export's tables, indexes and views as SQLite stores them, in the order they were made."""
    with sqlite_db.opened(EXPORT, 'ro') as db:
        made = db.column(
            str, "select sql from sqlite_master where sql is not null and name != 'sqlite_sequence' order by rowid"
        )
    return ';\n'.join(made) + ';'


def shaped(db: sqlite_db.Db) -> sqlite_db.Db:
    """The database with the export's tables, empty, at the export's version, for a test to put the rows it reads
    in."""
    with db.transaction() as tx:
        tx.script(schema())
        tx.execute(f'pragma user_version = {len(export.MIGRATIONS)}')
    return db


def festival(db: Transaction, event_id: int, **columns: object) -> None:
    """A festival of the export: the columns events requires, with a test's values, and these."""
    row: dict[str, object] = {
        'id': event_id,
        'title': f'Festival {event_id}',
        'url': f'https://www.kizomba-world.com/event/f{event_id}/',
        'start_date': '2099-01-01',
        'all_day': 1,
        'featured': 0,
        'sticky': 0,
    } | columns
    db.insert('events', [row])


class Made(BaseModel):
    """A table, index or view as SQLite stores it."""

    type: str
    name: str
    sql: str | None


def run(main: Callable[[], None], monkeypatch: pytest.MonkeyPatch, *args: object) -> None:
    monkeypatch.setattr('sys.argv', ['step', *map(str, args)])
    main()


def content(path: Path) -> dict[str, list[str]]:
    """The database's schema (each table, index and view as SQLite stores it) and every table's rows in the order they
    are stored, so a row that moves or takes another id is a change; without the time a step ran."""
    with sqlite_db.opened(path, 'ro') as db:
        made = db.rows(Made, 'select type, name, sql from sqlite_master order by type, name')
        out = {'': [repr(m) for m in made]}
        for m in made:
            if m.type == 'table':
                columns = db.column(
                    str, 'select name from pragma_table_info(?) where name != ?', (m.name, WHEN_COLUMNS.get(m.name, ''))
                )
                values = " || ',' || ".join(
                    f'quote({sqlite_db.name(c)})' for c in columns
                )  # each value as SQL writes it
                where = f' where {WHEN_ROWS[m.name]}' if m.name in WHEN_ROWS else ''
                out[m.name] = db.column(str, f'select {values} from {sqlite_db.name(m.name)}{where}')  # noqa: S608 (the database's own names, quoted)
    return out


def copied() -> Path:
    """The export, copied into the test's data folder, where the steps open it."""
    committed(f'{export.SOURCE}/{EXPORT.name}')
    return export.path()


def trimmed(festivals: int) -> Path:
    """The export in the test's data folder, with only its latest festivals that have a line-up, and every row of
    theirs."""
    src = copied()
    with sqlite_db.opened(src, 'rw') as db, db.transaction() as con:
        kept = con.column(
            int,
            'select id from events where id in (select event_id from artist_mentions) order by start_date desc limit ?',
            (festivals,),
        )
        # the events last: the source's own tables refer to them, and are held to it at once
        for t in con.column(str, "select name from sqlite_master where type = 'table' order by name = 'events'"):
            columns = set(con.column(str, 'select name from pragma_table_info(?)', (t,)))
            key = 'id' if t == 'events' else 'event_id' if 'event_id' in columns else None
            if key:
                sql = f'delete from {sqlite_db.name(t)} where {key} not in (select value from json_each(?))'  # noqa: S608 (the database's own names, quoted)
                con.execute(sql, (json.dumps(kept),))
    return src
