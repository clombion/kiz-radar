"""The pipeline's steps run whole on the committed kizomba-world export, each into a copy or a folder of the test's
own: each builds what it says, and run again it changes nothing, but the time its run log says it ran."""

import json
import re
import sqlite3
from collections.abc import Iterable
from pathlib import Path

import pytest

from pipeline import build_site_db, data, merge_suggestions, scrape
from pipeline import db as sqlite_db
from pipeline.extract import load_extract, resolve_artists, run_log
from tests import jsons
from tests.exports import EVERYTHING, EXPORT, column, committed, content, copied, run, trimmed
from tests.fakes import Memory

# a whole run of a step takes seconds, its runs here a few of them
pytestmark = pytest.mark.timeout(120)


@pytest.fixture(autouse=True)
def committed_data() -> None:
    """Everything the steps read beside the export, as committed."""
    committed(*EVERYTHING)


def test_the_site_database_builds_alike_twice_with_every_table_documented(
    site_db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = copied()
    run(build_site_db.main, monkeypatch)
    built = data(build_site_db.OUT)
    assert content(built) == content(site_db)
    with sqlite_db.opened(built, 'ro') as db:
        names = set(column(db, "select name from sqlite_master where type in ('table', 'view')"))
        documented = set(column(db, 'select name from table_docs'))
        built_at = column(db, "select value from meta where key = 'built_at'")
    assert names == documented
    assert [jsons.at(jsons.read(data(build_site_db.SITE_JSON)), 'built_at')] == built_at
    assert not list(data(build_site_db.SITE_DATA).glob('*.building'))  # swapped in once built


def test_loading_the_answers_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied()
    run(load_extract.main, monkeypatch)
    once = content(src)
    run(load_extract.main, monkeypatch)
    assert content(src) == once


def test_resolving_the_artists_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # the whole export takes the step most of a minute: the latest festivals with line-ups are enough
    src = trimmed(40)
    run(resolve_artists.main, monkeypatch)
    once = content(src)
    assert once['artists']
    run(resolve_artists.main, monkeypatch)
    assert content(src) == once


def test_merge_suggestions_leave_out_decided_pairs_and_keep_the_more_booked(site_db: Path) -> None:
    with sqlite_db.opened(EXPORT, 'ro') as c, sqlite_db.opened(site_db, 'ro') as site:
        rows = merge_suggestions.suggestions(c, site)
    assert rows
    assert [r.score for r in rows] == sorted((r.score for r in rows), reverse=True)
    assert all(r.keep_bookings >= r.merge_bookings for r in rows)
    done, _ = merge_suggestions.decided()
    assert not [r for r in rows if frozenset((r.keep_key, r.merge_key)) in done]
    assert all(r.decision is None for r in rows)


# a reference, its table and columns matched whole, that is not held until commit
UNDEFERRED = re.compile(
    r'\breferences\s+"?\w++"?+(?:\s*\([^)]*\))?+(?!\s*deferrable initially deferred)', re.IGNORECASE
)
# the source's own tables, made as kizomba-world made them: scrape declares no DDL for them yet
SOURCE_MADE = {'event_categories', 'event_tags', 'event_links', 'event_images'}


def test_every_reference_is_held_at_commit(site_db: Path) -> None:
    """A step drops and rebuilds its tables in one transaction, so a reference holds when the step commits, not
    between its statements (pipeline/db.py turns the references on): read in the tables as SQLite stores them, however
    the code assembled them."""
    found: set[str] = set()
    for path in (EXPORT, site_db):
        with sqlite_db.opened(path, 'ro') as db:
            made: list[tuple[str, str]] = db.execute(
                "select name, sql from sqlite_master where type = 'table'"
            ).fetchall()
            found |= {name for name, sql in made if UNDEFERRED.search(sql)}
    assert found == SOURCE_MADE


def tables(db: sqlite3.Connection, names: Iterable[str]) -> dict[str, str]:
    """The create statements of these tables, as SQLite reads them: without comments, in lower case, spaced alike."""
    found: list[tuple[str, str]] = db.execute(
        'select name, sql from sqlite_master where name in (select value from json_each(?))', (json.dumps(list(names)),)
    ).fetchall()
    shaped = {n: ' '.join(re.sub(r'--[^\n]*', '', sql).lower().split()) for n, sql in found}
    return {n: re.sub(r'\s*([(),])\s*', r'\1', sql) for n, sql in shaped.items()}


def test_the_export_has_the_tables_the_steps_write_as_they_declare_them(memory: Memory) -> None:
    declared = memory()
    for ddl in (run_log.SCHEMA, scrape.PENDING, resolve_artists.ARTIST_IDS):
        _ = declared.executescript(ddl)
    names: list[tuple[str]] = declared.execute("select name from sqlite_master where type = 'table'").fetchall()
    with sqlite_db.opened(EXPORT, 'ro') as db:
        assert tables(db, [n for (n,) in names]) == tables(declared, [n for (n,) in names])
