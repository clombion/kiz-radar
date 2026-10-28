"""The pipeline's steps run whole on the committed kizomba-world export, each into a copy or a folder of the test's
own: each builds what it says, and run again it changes nothing, but the time its run log says it ran."""

import collections
import json
import re
from collections.abc import Iterable
from pathlib import Path

import pytest
from pydantic import BaseModel

from pipeline import build_site_db, data, merge_suggestions, scrape
from pipeline import db as sqlite_db
from pipeline.db import Reader
from pipeline.extract import load_extract, resolve_artists, run_log
from pipeline.records import Json
from tests import jsons
from tests.exports import EVERYTHING, EXPORT, Made, committed, content, copied, run, trimmed
from tests.fakes import Memory

# a whole run of a step takes seconds, its runs here a few of them
pytestmark = pytest.mark.timeout(120)


@pytest.fixture(autouse=True)
def committed_data() -> None:
    """Everything the steps read beside the export, as committed."""
    committed(*EVERYTHING)


def without_when(page: Json) -> dict[str, Json]:
    """What the build gives the page, but when it was built."""
    assert isinstance(page, dict)
    return {k: v for k, v in page.items() if k != 'built_at'}


def test_the_site_database_builds_alike_twice_with_every_table_documented(
    site_db: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = copied()
    run(build_site_db.main, monkeypatch)
    built = data(build_site_db.OUT)
    assert content(built) == content(site_db)
    with sqlite_db.opened(built, 'ro') as db:
        names = set(db.column(str, "select name from sqlite_master where type in ('table', 'view')"))
        documented = set(db.column(str, 'select name from table_docs'))
        built_at = db.column(str, "select value from meta where key = 'built_at'")
    assert names == documented
    page = jsons.read(data(build_site_db.SITE_JSON))
    assert [jsons.at(page, 'built_at')] == built_at
    assert without_when(page) == without_when(jsons.read(site_db.with_name(Path(build_site_db.SITE_JSON).name)))
    assert not list(data(build_site_db.SITE_DATA).glob('*.building'))  # swapped in once built


def test_loading_the_answers_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied()
    run(load_extract.main, monkeypatch)
    once = content(src)
    run(load_extract.main, monkeypatch)
    assert content(src) == once


def test_a_load_leaves_the_artists_but_none_of_the_mentions_it_replaced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """load_extract makes its mentions again, under new ids: the bookings of the old ones go with them (a reference
    that cascades), and the artists stay, for resolve_artists to book the new mentions."""
    src = copied()
    with sqlite_db.opened(src, 'ro') as db:
        artists = db.value(int, 'select count(*) from artists')
        assert db.exists('select 1 from event_artists')
    run(load_extract.main, monkeypatch)
    with sqlite_db.opened(src, 'ro') as db:
        assert not db.exists('select 1 from event_artists')
        assert db.value(int, 'select count(*) from artists') == artists


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


# a reference, its table and columns matched whole, and what it does when its row goes, that is not held until commit
UNDEFERRED = re.compile(
    r'\breferences\s+"?\w++"?+(?:\s*\([^)]*\))?+(?:\s+on\s+(?:delete|update)\s+(?:cascade|restrict|set\s+null))*+'
    r'(?!\s*deferrable initially deferred)',
    re.IGNORECASE,
)
# every table and view of the export, by the step that declares it: the ones it makes again each run, and the ones it
# keeps, which change by migration (pipeline/export.py)
DECLARED = (scrape.KEPT, run_log.KEPT, resolve_artists.KEPT, resolve_artists.TABLES, load_extract.TABLES)


class Declared(BaseModel):
    """A column as SQLite has it declared."""

    name: str
    type: str
    notnull: int


# a column's CHECK over the states it may hold, in the export's DDL
STATE_CHECK = re.compile(r'\b(\w+) TEXT[^,]*?CHECK \(\1 IN \(([^)]*)\)\)', re.IGNORECASE)


def test_the_site_keeps_a_copied_column_as_the_export_declares_it(site_db: Path) -> None:
    """A table the site copies keeps each column it copies as the export declares it: its type, NOT NULL, and the states
    its CHECK allows."""
    with sqlite_db.opened(site_db, 'ro') as site:
        site.attach('src', EXPORT, 'ro')
        for t in build_site_db.COPIED:
            columns = 'select name, upper(type) as type, "notnull" from pragma_table_info(?, ?)'
            ours = {c.name: c for c in site.rows(Declared, columns, (t, 'main'))}
            theirs = {c.name: c for c in site.rows(Declared, columns, (t, 'src'))}
            assert ours == {n: theirs[n] for n in ours}, t
            exported = site.value(str, 'select sql from src.sqlite_master where name = ?', (t,))
            kept = ' '.join(site.value(str, 'select sql from sqlite_master where name = ?', (t,)).lower().split())
            for m in STATE_CHECK.finditer(exported):
                if m[1] in ours:
                    assert f'check ({m[1]} in ({m[2].lower()}))' in kept, (t, m[1])


def test_every_reference_is_held_at_commit(site_db: Path) -> None:
    """A step drops and rebuilds its tables in one transaction, so a reference holds when the step commits, not
    between its statements (pipeline/db.py turns the references on): read in the tables as SQLite stores them, however
    the code assembled them."""
    found: set[str] = set()
    for path in (EXPORT, site_db):
        with sqlite_db.opened(path, 'ro') as db:
            made = db.rows(Made, "select type, name, sql from sqlite_master where type = 'table'")
            found |= {m.name for m in made if m.sql and UNDEFERRED.search(m.sql)}
    assert found == set()


def test_every_table_of_the_export_is_strict() -> None:
    """A value is stored as its column's type or refused, never kept as whatever it came as."""
    with sqlite_db.opened(EXPORT, 'ro') as db:
        loose = db.column(
            str,
            "select name from pragma_table_list where type = 'table' and schema = 'main' and not strict "
            "and name not like 'sqlite_%'",
        )
    assert loose == []


def test_every_table_of_the_export_is_one_steps() -> None:
    """A step drops and makes again only its own tables: one another step made too would lose that step's rows."""
    owners = collections.Counter(n for tables in DECLARED for n in tables)
    assert [n for n, c in owners.items() if c > 1] == []
    with sqlite_db.opened(EXPORT, 'ro') as db:
        made = db.column(str, "select name from sqlite_master where type in ('table', 'view')")
    assert set(owners) == set(made)


def tables(db: Reader, names: Iterable[str]) -> dict[str, str]:
    """The create statements of these tables, as SQLite reads them: without comments, in lower case, spaced alike."""
    found = db.rows(
        Made,
        'select type, name, sql from sqlite_master where name in (select value from json_each(?))',
        (json.dumps(list(names)),),
    )
    shaped = {m.name: ' '.join(re.sub(r'--[^\n]*', '', m.sql or '').lower().split()) for m in found}
    return {n: re.sub(r'\s*([(),])\s*', r'\1', sql) for n, sql in shaped.items()}


def test_the_export_has_the_tables_the_steps_write_as_they_declare_them(memory: Memory) -> None:
    declared = memory()
    with declared.transaction() as tx:
        for ddl in (d for tables in DECLARED for d in tables.values()):
            tx.script(ddl)
    # every table, index and view they declare
    names = declared.column(str, 'select name from sqlite_master where sql is not null')
    with sqlite_db.opened(EXPORT, 'ro') as db:
        assert tables(db, names) == tables(declared, names)
