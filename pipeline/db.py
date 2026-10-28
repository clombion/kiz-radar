"""Opening the pipeline's SQLite databases, and the one way the steps use them (Db).

Every connection names what it may do with the file: read it (ro), write it (rw), or create it (rwc); only a step that
builds a database may create one, so a wrong path is an error, never a new empty database, and a connection is closed
with its block. Every connection holds its tables to their foreign keys, refuses a string in double quotes (SQLite
would read it as a column name, or as text when no column has it), and is in autocommit: a write happens only inside
a transaction (Db.transaction), which commits when its block ends and is rolled back when the block raises. A row is
read as a record (Db.rows), each column by its name, so no row is read by position. A day or a time is written as the
text records read (2026-10-27, 2026-10-27T17:38:51+00:00). The export the steps work on is opened through
pipeline/export.py."""

import argparse
import datetime as dt
import sqlite3
from collections.abc import Generator, Iterable, Mapping, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, TypeAdapter

sqlite3.register_adapter(dt.date, dt.date.isoformat)
sqlite3.register_adapter(dt.datetime, dt.datetime.isoformat)

type Mode = Literal['ro', 'rw', 'rwc']


def name(identifier: str) -> str:
    """A table's or a column's name, quoted for SQL whatever it holds."""
    return '"' + identifier.replace('"', '""') + '"'


def uri(path: Path | str, mode: Mode) -> str:
    """The database file's URI, its path percent-encoded (a `#` or `?` in it names no other database)."""
    return f'{Path(path).resolve().as_uri()}?mode={mode}'


class Unheld(BaseModel):
    """A row foreign_key_check finds referring to none."""

    table: str
    rowid: int | None
    parent: str
    fkid: int


class Reader:
    """What any use of a database may do: read rows, each as a record."""

    def __init__(self, con: sqlite3.Connection) -> None:
        self._con = con

    def rows[R: BaseModel](self, record: type[R], sql: str, params: Sequence[object] = ()) -> list[R]:
        """The query's rows as records, each column by its name; two columns of one name are an error. A row holds
        text and numbers, so it is read as its record's types from those (lax: 'dj' is Role.DJ)."""
        cursor = self._con.execute(sql, params)
        names = [str(d[0]) for d in cursor.description]
        if len(set(names)) < len(names):
            raise ValueError(f'two columns named alike: {names}')
        fetched: list[tuple[object, ...]] = cursor.fetchall()
        return [record.model_validate(dict(zip(names, row, strict=True)), strict=False) for row in fetched]

    def column[T](self, kind: type[T], sql: str, params: Sequence[object] = ()) -> list[T]:
        """The query's one column, each value as its type."""
        cursor = self._con.execute(sql, params)
        if len(cursor.description) != 1:
            raise ValueError(f'a column is one: {[d[0] for d in cursor.description]}')
        fetched: list[tuple[object]] = cursor.fetchall()
        adapter = TypeAdapter(kind)
        return [adapter.validate_python(v, strict=False) for (v,) in fetched]

    def value[T](self, kind: type[T], sql: str, params: Sequence[object] = ()) -> T:
        """The query's one value: one row of one column."""
        found = self.column(kind, sql, params)
        if len(found) != 1:
            raise ValueError(f'one row, not {len(found)}: {sql}')
        return found[0]

    def exists(self, sql: str, params: Sequence[object] = ()) -> bool:
        """Whether the query finds a row."""
        return self._con.execute(sql, params).fetchone() is not None


class Transaction(Reader):
    """A transaction's use of the database: read, and write."""

    def execute(self, sql: str, params: Sequence[object] = ()) -> None:
        _ = self._con.execute(sql, params)

    def executemany(self, sql: str, rows: Iterable[Sequence[object]]) -> None:
        _ = self._con.executemany(sql, rows)

    def insert(self, table: str, rows: Iterable[Mapping[str, object]], *, unless: Sequence[str] = ()) -> None:
        """Insert rows, each by its columns' names (every row has the same ones); a row whose key, the columns unless
        names, is the table's already is left out."""
        listed = list(rows)
        if not listed:
            return
        columns = list(listed[0])
        if any(list(r) != columns for r in listed):
            raise ValueError(f'{table}: rows of different columns')
        skip = f' on conflict ({", ".join(map(name, unless))}) do nothing' if unless else ''
        sql = f'insert into {name(table)} ({", ".join(map(name, columns))}) values ({", ".join("?" * len(columns))})'  # noqa: S608 (names quoted)
        self.executemany(sql + skip, [list(r.values()) for r in listed])

    def upsert(self, table: str, key: Sequence[str], row: Mapping[str, object]) -> None:
        """Insert the row, by its columns' names, or update the one with its key to it."""
        columns = ', '.join(map(name, row))
        marks = ', '.join('?' * len(row))
        changed = ', '.join(f'{name(c)} = excluded.{name(c)}' for c in row if c not in key) or None
        target = ', '.join(map(name, key))
        on = f'do update set {changed}' if changed else 'do nothing'
        self.execute(
            f'insert into {name(table)} ({columns}) values ({marks}) on conflict ({target}) {on}',  # noqa: S608 (names quoted)
            list(row.values()),
        )

    def script(self, sql: str) -> None:
        """Statements one after the other, inside the transaction (a connection in autocommit commits nothing first)."""
        _ = self._con.executescript(sql)


class Db(Reader):
    """An open database: read it, write it in a transaction, or vacuum it, which a transaction cannot."""

    @contextmanager
    def transaction(self) -> Generator[Transaction]:
        """A write transaction, which takes the write lock at once: committed when the block ends, rolled back when it
        raises or its commit is refused (its foreign keys are checked then)."""
        _ = self._con.execute('begin immediate')
        try:
            yield Transaction(self._con)
            _ = self._con.execute('commit')  # a commit refused (a reference to no row) leaves the transaction open
        except BaseException:
            _ = self._con.execute('rollback')
            raise

    @contextmanager
    def rebuilding(self) -> Generator[Transaction]:
        """A transaction rebuilding tables as SQLite does (a new table, the rows copied, the old one dropped and the
        new renamed, sqlite.org/lang_altertable.html): references are unheld until its rows are all copied, then every
        row's checked before it commits, and a view keeps naming a table by its name."""
        _ = self._con.execute('pragma foreign_keys = off')
        _ = self._con.execute('pragma legacy_alter_table = on')
        try:
            with self.transaction() as tx:
                yield tx
                if broken := tx.rows(Unheld, 'pragma foreign_key_check'):
                    raise ValueError(f'{len(broken)} rows refer to rows that are not there, first: {broken[0]}')
        finally:
            _ = self._con.execute('pragma legacy_alter_table = off')
            _ = self._con.execute('pragma foreign_keys = on')

    def attach(self, alias: str, path: Path, mode: Mode) -> None:
        """Another database beside this one, its tables read as alias.table (outside a transaction, as SQLite needs)."""
        _ = self._con.execute(f'attach database ? as {name(alias)}', (uri(path, mode),))

    def detach(self, alias: str) -> None:
        _ = self._con.execute(f'detach database {name(alias)}')

    def vacuum(self) -> None:
        _ = self._con.execute('vacuum')


def connected(target: str) -> sqlite3.Connection:
    """A connection to the database at the URI, set up as every one of the pipeline's is."""
    con = sqlite3.connect(target, uri=True, autocommit=True)
    off = False
    for dqs in (sqlite3.SQLITE_DBCONFIG_DQS_DML, sqlite3.SQLITE_DBCONFIG_DQS_DDL):
        _ = con.setconfig(dqs, off)
    _ = con.execute('pragma foreign_keys = on')
    return con


@contextmanager
def memory() -> Generator[Db]:
    """A new in-memory database, set up as a file's is, gone when the block ends."""
    con = connected(':memory:')
    try:
        yield Db(con)
    finally:
        con.close()


@contextmanager
def opened(path: Path | str, mode: Mode) -> Generator[Db]:
    """The database, closed when the block ends."""
    con = connected(uri(path, mode))
    try:
        yield Db(con)
    finally:
        con.close()


def festival_ids(text: str) -> set[int]:
    """Festival ids written "16909,18806", as a set."""
    try:
        return {int(i) for i in text.split(',') if i.strip()}
    except ValueError as e:
        raise argparse.ArgumentTypeError(f'{text}: festival ids, separated by commas') from e
