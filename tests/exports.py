"""Committed data for tests that read it: files copied into the test's data folder, and the kizomba-world export, run on
whole by some tests: copies of it, whole or with only its latest festivals, every table's content, and a step's main
run as its command line would."""

import functools
import json
import shutil
import sqlite3
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest

import pipeline
from pipeline import ROOT, prompt, tickets
from pipeline import db as sqlite_db
from pipeline.records import ANSWERS, CsvRow

EXPORT = sqlite_db.export_in(ROOT / sqlite_db.SOURCE)  # the repository's, whatever the data folder
# the tables that hold when a step ran, which a second run changes and nothing else should, read without it
WITHOUT_WHEN = {
    'meta': "select * from meta where key != 'built_at'",
    'pipeline_steps': 'select step, description, performed_by, model, prompt, inputs, outputs, details '
    'from pipeline_steps',
}


# everything the steps read beside the export: every CSV file, the answers, the ticket reads and their log, and the
# prompts they followed
EVERYTHING = (*(r.FILE for r in CsvRow.records()), ANSWERS, tickets.READS, tickets.LOG, prompt.ASKED)


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
        made: list[tuple[str]] = db.execute(
            "select sql from sqlite_master where sql is not null and name != 'sqlite_sequence' order by rowid"
        ).fetchall()
    return ';\n'.join(sql for (sql,) in made) + ';'


def shaped(db: sqlite3.Connection) -> sqlite3.Connection:
    """The database with the export's tables, empty, for a test to put the rows it reads in."""
    _ = db.executescript(schema())
    return db


def festival(db: sqlite3.Connection, event_id: int, **columns: object) -> None:
    """A festival of the export: the columns events requires, with a test's values, and these."""
    row: dict[str, object] = {
        'id': event_id,
        'title': f'Festival {event_id}',
        'url': f'https://www.kizomba-world.com/event/f{event_id}/',
        'start_date': '2099-01-01',
        'all_day': 1,
        'featured': 0,
        'sticky': 0,
        'page_fetched': 1,
    } | columns
    names = ', '.join(row)
    _ = db.execute(f'insert into events ({names}) values ({", ".join("?" * len(row))})', tuple(row.values()))  # noqa: S608 (the test's own column names)


def column(db: sqlite3.Connection, sql: str, params: Sequence[object] = ()) -> list[object]:
    """The first column of a query's rows."""
    rows: list[tuple[object, ...]] = db.execute(sql, params).fetchall()
    return [r[0] for r in rows]


def run(main: Callable[[], None], monkeypatch: pytest.MonkeyPatch, *args: object) -> None:
    monkeypatch.setattr('sys.argv', ['step', *map(str, args)])
    main()


def content(path: Path) -> dict[str, list[str]]:
    """The database's schema (each table, index and view as SQLite stores it) and every table's rows in the order they
    are stored, so a row that moves or takes another id is a change; without the time a step ran."""
    with sqlite_db.opened(path, 'ro') as db:
        schema: list[tuple[str, str, str | None]] = db.execute(
            'select type, name, sql from sqlite_master order by type, name'
        ).fetchall()
        out = {'': list(map(repr, schema))}
        for kind, t, _ in schema:
            if kind == 'table':
                rows: list[tuple[object, ...]] = db.execute(WITHOUT_WHEN.get(t, f'select * from "{t}"')).fetchall()  # noqa: S608 (the database's own table names)
                out[t] = list(map(repr, rows))
    return out


def copied() -> Path:
    """The export, copied into the test's data folder, where the steps open it."""
    committed(f'{sqlite_db.SOURCE}/{EXPORT.name}')
    return sqlite_db.export()


def trimmed(festivals: int) -> Path:
    """The export in the test's data folder, with only its latest festivals that have a line-up, and every row of
    theirs."""
    src = copied()
    with sqlite_db.opened(src, 'rw') as con:
        kept = column(
            con,
            'select id from events where id in (select event_id from artist_mentions) order by start_date desc limit ?',
            (festivals,),
        )
        # the events last: the source's own tables refer to them, and are held to it at once
        tables: list[tuple[str]] = con.execute(
            "select name from sqlite_master where type = 'table' order by name = 'events'"
        ).fetchall()
        for (t,) in tables:
            columns = set(column(con, f'select name from pragma_table_info("{t}")'))  # noqa: S608 (the database's own names)
            key = 'id' if t == 'events' else 'event_id' if 'event_id' in columns else None
            if key:
                sql = f'delete from "{t}" where {key} not in (select value from json_each(?))'  # noqa: S608 (the database's own names)
                _ = con.execute(sql, (json.dumps(kept),))
        con.commit()
    return src
