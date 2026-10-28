"""The committed kizomba-world export, for tests that run a step on it whole: copies of it, whole or with only its
latest festivals, every table's content, and a step's main run as its command line would."""

import json
import shutil
import sqlite3
from collections.abc import Callable, Sequence
from pathlib import Path

import pytest

from pipeline import db as sqlite_db

EXPORT = sqlite_db.export()
# the tables that hold when a step ran, which a second run changes and nothing else should, read without it
WITHOUT_WHEN = {
    'meta': "select * from meta where key != 'built_at'",
    'pipeline_steps': 'select step, description, performed_by, model, prompt, inputs, outputs, details '
    'from pipeline_steps',
}


def column(db: sqlite3.Connection, sql: str, params: Sequence[object] = ()) -> list[object]:
    """The first column of a query's rows."""
    rows: list[tuple[object, ...]] = db.execute(sql, params).fetchall()
    return [r[0] for r in rows]


def run(main: Callable[[], None], monkeypatch: pytest.MonkeyPatch, *args: object) -> None:
    monkeypatch.setattr('sys.argv', ['step', *map(str, args)])
    main()


def content(path: Path) -> dict[str, list[str]]:
    """Every table's rows, in order, without the time a step ran."""
    out: dict[str, list[str]] = {}
    with sqlite_db.opened(path, 'ro') as db:
        tables: list[tuple[str]] = db.execute("select name from sqlite_master where type = 'table'").fetchall()
        for (t,) in tables:
            rows: list[tuple[object, ...]] = db.execute(WITHOUT_WHEN.get(t, f'select * from "{t}"')).fetchall()  # noqa: S608 (the database's own table names)
            out[t] = sorted(map(repr, rows))
    return out


def copied(tmp_path: Path) -> Path:
    path = tmp_path / EXPORT.name
    _ = shutil.copyfile(EXPORT, path)
    return path


def trimmed(tmp_path: Path, festivals: int) -> Path:
    """The export with only its latest festivals that have a line-up, and every row of theirs."""
    src = copied(tmp_path)
    with sqlite_db.opened(src, 'rw') as con:
        kept = column(
            con,
            'select id from events where id in (select event_id from artist_mentions) order by start_date desc limit ?',
            (festivals,),
        )
        tables: list[tuple[str]] = con.execute("select name from sqlite_master where type = 'table'").fetchall()
        for (t,) in tables:
            columns = set(column(con, f'select name from pragma_table_info("{t}")'))  # noqa: S608 (the database's own names)
            key = 'id' if t == 'events' else 'event_id' if 'event_id' in columns else None
            if key:
                sql = f'delete from "{t}" where {key} not in (select value from json_each(?))'  # noqa: S608 (the database's own names)
                _ = con.execute(sql, (json.dumps(kept),))
        con.commit()
    return src
