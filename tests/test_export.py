"""The export's schema changes by numbered migrations, each applied once, in order: a step that writes the export
brings it to the code's version, and a step that reads it, the site's build included, refuses another version."""

from pathlib import Path

import pytest

from pipeline import build_site_db, export
from tests.exports import EXPORT, copied

LATER = 'create table later (x integer)'  # a migration the code has and the export hasn't had
FAILING = 'create table later (x integer); select * from nowhere'  # one that stops halfway


def tables(path: Path) -> set[str]:
    with export.opened('ro', path) as db:
        return set(db.column(str, "select name from sqlite_master where type = 'table'"))


def test_the_committed_export_is_at_the_codes_version() -> None:
    with export.opened('ro', EXPORT) as db:
        assert export.version(db) == len(export.MIGRATIONS)


def test_a_step_that_writes_applies_a_new_migration_once(monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied()
    monkeypatch.setattr(export, 'MIGRATIONS', (*export.MIGRATIONS, LATER))
    for _ in range(2):  # applied again, the table it makes would be there already
        with export.opened('rw') as db:
            assert export.version(db) == len(export.MIGRATIONS)
    assert 'later' in tables(src)


def test_a_step_that_reads_refuses_an_export_behind_the_code(monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied()
    monkeypatch.setattr(export, 'MIGRATIONS', (*export.MIGRATIONS, LATER))
    with pytest.raises(SystemExit, match='a step that writes it migrates it'), export.opened('ro'):
        pass
    with pytest.raises(SystemExit, match='a step that writes it migrates it'), build_site_db.built(src):
        pass


def test_a_step_refuses_an_export_ahead_of_the_code(monkeypatch: pytest.MonkeyPatch) -> None:
    _ = copied()
    monkeypatch.setattr(export, 'MIGRATIONS', export.MIGRATIONS[:-1])
    with pytest.raises(SystemExit, match='newer than this code'), export.opened('rw'):
        pass


def test_a_migration_that_fails_leaves_the_export_as_it_was(monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied()
    monkeypatch.setattr(export, 'MIGRATIONS', (*export.MIGRATIONS, FAILING))
    with pytest.raises(Exception, match='no such table: nowhere'), export.opened('rw'):
        pass
    monkeypatch.setattr(export, 'MIGRATIONS', export.MIGRATIONS[:-1])
    with export.opened('ro') as db:
        assert export.version(db) == len(export.MIGRATIONS)
    assert 'later' not in tables(src)
