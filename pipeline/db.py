"""Opening the pipeline's SQLite databases. Every connection names what it may do with the file: read it (ro), write
it (rw), or create it (rwc); only a step that builds a database may create one, so a wrong path is an error, never a
new empty database, and a connection is closed with its block. A day or a time is written as the text records read
(2026-10-27, 2026-10-27T17:38:51+00:00). export() is the kizomba-world export the steps work on, the one file of
source/ (python -m pipeline.db prints its path, for the Actions), and source_arg() the command-line argument a step
takes it by."""

import argparse
import datetime as dt
import sqlite3
import sys
from collections.abc import Generator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from pipeline import ROOT

sqlite3.register_adapter(dt.date, dt.date.isoformat)
sqlite3.register_adapter(dt.datetime, dt.datetime.isoformat)


@contextmanager
def opened(path: Path | str, mode: Literal['ro', 'rw', 'rwc']) -> Generator[sqlite3.Connection]:
    """The database, closed when the block ends; what the block wrote and didn't commit is lost with it."""
    if mode not in ('ro', 'rw', 'rwc'):
        raise ValueError(f'mode {mode!r}: ro, rw or rwc')
    con = sqlite3.connect(f'file:{Path(path).resolve()}?mode={mode}', uri=True)
    try:
        yield con
    finally:
        con.close()


def records[R: BaseModel](db: sqlite3.Connection, record: type[R], sql: str, params: Sequence[object] = ()) -> list[R]:
    """The query's rows as records, each column by its name. A row holds text and numbers, so it is read as its
    record's types from those (lax: 'dj' is Role.DJ)."""
    cursor = db.execute(sql, params)
    names = [str(d[0]) for d in cursor.description]
    fetched: list[tuple[object, ...]] = cursor.fetchall()
    return [record.model_validate(dict(zip(names, row, strict=True)), strict=False) for row in fetched]


def existing(text: str) -> Path:
    if not Path(text).is_file():
        raise argparse.ArgumentTypeError(f'{text}: no such file')
    return Path(text)


def festival_ids(text: str) -> set[int]:
    """Festival ids written "16909,18806", as a set."""
    try:
        return {int(i) for i in text.split(',') if i.strip()}
    except ValueError as e:
        raise argparse.ArgumentTypeError(f'{text}: festival ids, separated by commas') from e


class Source(argparse.Namespace):
    src: Path = Path()


def source_arg(ap: argparse.ArgumentParser) -> None:
    _ = ap.add_argument('src', type=existing, help='the kizomba-world export (source/<events>.sqlite)')


def export() -> Path:
    """The kizomba-world export: source/ holds one, which the Refresh events Action replaces in place. Two would leave
    which one the steps read to chance (a checkout gives every file the same time), so they are an error."""
    found = sorted((ROOT / 'source').glob('*.sqlite'))
    if len(found) != 1:
        sys.exit(f'source/ holds {len(found)} exports ({", ".join(p.name for p in found)}): it holds one')
    return found[0]


def main() -> None:
    ap = argparse.ArgumentParser(description='Print the path of the kizomba-world export the steps work on.')
    _ = ap.parse_args()
    print(export().relative_to(ROOT))


if __name__ == '__main__':
    main()
