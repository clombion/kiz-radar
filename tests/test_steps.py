"""The pipeline's steps run whole on the committed kizomba-world export, each into a copy or a folder of the test's
own: each builds what it says, and run again it changes nothing, but the time its run log says it ran."""

import collections
import datetime as dt
import json
import re
import shutil
from collections.abc import Iterable
from pathlib import Path

import pytest
from pydantic import BaseModel

from pipeline import ROOT, build_site_db, claims, data, merge_suggestions, scrape
from pipeline import db as sqlite_db
from pipeline.claims import HomeClaim, MergeClaim
from pipeline.db import Reader
from pipeline.enums import ArtistKind, ClaimSource, ClaimState, MergeDecision
from pipeline.extract import load_extract, resolve_artists, run_log
from pipeline.names import kind_of
from pipeline.records import Group, Json
from tests import jsons
from tests.exports import EVERYTHING, EXPORT, Made, committed, content, copied, run, trimmed
from tests.fakes import AT, Memory
from tests.repository import tracked

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
        built_for = db.column(str, "select value from meta where key = 'schema'")
    assert names == documented
    # the tables' digest, which the site's scripts are built for (site/schema.ts): another, and they say to reload
    assert built_for == [build_site_db.schema()]
    assert f"SCHEMA = '{build_site_db.schema()}'" in (ROOT / 'site' / 'schema.ts').read_text()
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
    that cascades), and the artists stay, for resolve_artists to book the new mentions; the site's build refuses the
    export until it has."""
    src = copied()
    with sqlite_db.opened(src, 'ro') as db:
        artists = db.value(int, 'select count(*) from artists')
        assert db.exists('select 1 from event_artists')
    run(load_extract.main, monkeypatch)
    with sqlite_db.opened(src, 'ro') as db:
        assert not db.exists('select 1 from event_artists')
        assert db.value(int, 'select count(*) from artists') == artists
    # until then, a site built from it would show every line-up empty
    with pytest.raises(SystemExit, match=r'artist mentions no artist resolves: run mise run resolve'):
        _ = build_site_db.build(src, tmp_path / 'site.db')


def test_resolving_the_artists_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # the whole export takes the step most of a minute: the latest festivals with line-ups are enough
    src = trimmed(40)
    run(resolve_artists.main, monkeypatch)
    once = content(src)
    assert once['artists']
    run(resolve_artists.main, monkeypatch)
    assert content(src) == once


class Stated(BaseModel):
    id: str
    state: ClaimState


def resolved_latest(monkeypatch: pytest.MonkeyPatch, keys: int) -> tuple[Path, list[str]]:
    """The export's latest festivals with line-ups, resolved, and the first keys their mentions produce."""
    src = trimmed(40)
    run(resolve_artists.main, monkeypatch)
    with sqlite_db.opened(src, 'ro') as db:
        return src, db.column(str, 'select match_key from artist_names order by match_key limit ?', (keys,))


def test_a_claim_naming_a_key_no_mention_produces_is_orphaned_and_decides_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    src, [key] = resolved_latest(monkeypatch, 1)
    made = [
        HomeClaim(field='home', key=key, country='PT', made_at=AT, note='n'),
        HomeClaim(field='home', key='p:nomentionnamesthis', country='AO', made_at=AT, note='n'),
        MergeClaim(
            field='merge', keys=(key, 'p:nomentionnamesthis'), decision=MergeDecision.MERGE, made_at=AT, note='n'
        ),
    ]
    claims.write(made)
    run(resolve_artists.main, monkeypatch)  # the run goes on past the orphans
    with sqlite_db.opened(src, 'ro') as db:
        state = {s.id: s.state for s in db.rows(Stated, 'select id, state from claims')}
        homes = db.column(str, 'select country from artist_homes')
        merged = db.column(
            str, "select key_b from artist_merge_decisions where 'p:nomentionnamesthis' in (key_a, key_b)"
        )
        artists = db.value(int, "select count(*) from artist_keys where match_key = 'p:nomentionnamesthis'")
    assert [state[claims.Made(c, ClaimSource.ADMIN).id] for c in made] == [
        ClaimState.APPLIED,
        ClaimState.ORPHANED,
        ClaimState.ORPHANED,
    ]
    assert (homes, merged, artists) == (['PT'], [], 0)  # neither orphan homes, merges or makes an artist


class GroupKey(BaseModel):
    match_key: str
    produced: bool


def test_a_group_key_no_mention_produces_is_marked_and_two_groups_of_one_artist_are_refused_before_a_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    src, [alias, member] = resolved_latest(monkeypatch, 2)

    def group(key: str, aliases: str) -> Group:
        row = {'group_key': key, 'display_name': key, 'members': f'{member};p:gone', 'aliases': aliases, 'note': ''}
        return Group.model_validate(row)

    Group.write([group('g:one', f'{alias};p:nomentionnamesthis')])
    run(resolve_artists.main, monkeypatch)
    keyed = 'select match_key, produced from {} order by match_key'
    with sqlite_db.opened(src, 'ro') as db:
        assert db.rows(GroupKey, keyed.format('artist_group_aliases')) == [
            GroupKey(match_key=alias, produced=True),
            GroupKey(match_key='p:nomentionnamesthis', produced=False),
        ]
        assert db.rows(GroupKey, keyed.format('artist_group_members')) == [
            GroupKey(match_key=member, produced=True),
            GroupKey(match_key='p:gone', produced=False),
        ]
    once = content(src)
    Group.write([group('g:one', alias), group('g:two', alias)])
    with pytest.raises(SystemExit, match=r'line 2 \(g:one, .*\) and line 3 \(g:two, '):
        run(resolve_artists.main, monkeypatch)
    assert content(src) == once


def test_merge_suggestions_leave_out_decided_pairs_and_keep_the_more_booked(site_db: Path) -> None:
    with sqlite_db.opened(EXPORT, 'ro') as c, sqlite_db.opened(site_db, 'ro') as site:
        rows = merge_suggestions.suggestions(c, site)
        done = merge_suggestions.decided(c)
        ids = {k.match_key: k.artist_id for k in c.rows(merge_suggestions.Keyed, 'select * from artist_keys')}
    assert rows
    assert [r.score for r in rows] == sorted((r.score for r in rows), reverse=True)
    assert all(r.keep_bookings >= r.merge_bookings for r in rows)
    assert not [r for r in rows if frozenset((ids[r.keep_key], ids[r.merge_key])) in done]


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


class Appearance(BaseModel):
    artist_id: int
    event_id: int
    role: str
    via: str
    via_artist_id: int | None


def test_an_artists_events_are_the_same_in_the_export_and_on_the_site(site_db: Path) -> None:
    """artist_events means one thing wherever it is read: a member listed beside their couple in the same role is there
    through the couple, not booked as themselves."""
    every = 'select artist_id, event_id, role, via, via_artist_id from artist_events order by 1, 2, 3, 4, 5'
    with sqlite_db.opened(EXPORT, 'ro') as export_db, sqlite_db.opened(site_db, 'ro') as site:
        exported = export_db.rows(Appearance, every)
        assert exported == site.rows(Appearance, every)
        repeats = 'select count(*) from event_artists where as_couple is not null'
        assert export_db.value(int, repeats) > 0  # some line-ups name a member beside their couple


def test_every_artist_is_the_key_its_id_was_last_given_to() -> None:
    """artist_ids holds each artist's id with the artist's own key, which the next run keeps it by."""
    with sqlite_db.opened(EXPORT, 'ro') as db:
        apart = db.value(
            int,
            'select count(*) from artists a'
            ' where not exists (select 1 from artist_ids i where i.artist_id = a.id and i.match_key = a.match_key)',
        )
    assert apart == 0


class Kinded(BaseModel):
    kind: ArtistKind
    match_key: str


def test_every_artists_key_says_its_kind() -> None:
    with sqlite_db.opened(EXPORT, 'ro') as db:
        artists = db.rows(Kinded, 'select kind, match_key from artists')
    assert [a for a in artists if kind_of(a.match_key) != a.kind] == []


SHORT_ROW = 200  # bytes on average: a twentieth of a 4 KB page, under which SQLite advises a table stored by its key


def test_a_site_table_stored_by_its_key_has_short_rows(site_db: Path) -> None:
    """build_site_db's rule: a table is without rowid only when its rows are short, each as SQL writes its values."""
    rows = content(site_db)
    with sqlite_db.opened(site_db, 'ro') as db:
        keyed = db.column(str, "select name from pragma_table_list where wr and schema = 'main'")
    average = {t: sum(map(len, rows[t])) / len(rows[t]) for t in keyed if rows[t]}
    assert {t: round(a) for t, a in average.items() if a >= SHORT_ROW} == {}


class Documented(BaseModel):
    name: str
    written_by: str


def test_every_table_of_the_export_is_described_by_the_step_that_makes_it() -> None:
    """table_docs names, for each table and view, the module that declares it, which keeps its description."""
    owners = {
        n: module
        for module, declared in (
            ('pipeline/scrape.py', scrape.KEPT),
            ('pipeline/extract/run_log.py', run_log.KEPT),
            ('pipeline/extract/resolve_artists.py', resolve_artists.KEPT | resolve_artists.TABLES),
            ('pipeline/extract/load_extract.py', load_extract.TABLES),
        )
        for n in declared
    }
    with sqlite_db.opened(EXPORT, 'ro') as db:
        made = db.column(str, "select name from sqlite_master where type in ('table', 'view')")
        written = {d.name: d.written_by for d in db.rows(Documented, 'select name, written_by from table_docs')}
    assert written == {n: owners[n] for n in made}


def test_every_step_of_the_export_names_the_file_that_performed_it() -> None:
    """A step's row says which of the repository's scripts ran it (beside the model it asked), never a file that
    isn't there."""
    with sqlite_db.opened(EXPORT, 'ro') as db:
        performed = db.column(str, 'select performed_by from pipeline_steps')
    files = set(tracked('*.py'))
    named = {p: re.findall(r'[\w/.-]+\.py\b', p) for p in performed}
    assert {p: n for p, n in named.items() if not n or not set(n) <= files} == {}


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


class Phased(BaseModel):
    phase: str
    upcoming: bool


class Span(BaseModel):
    id: int
    start_date: dt.date
    end_date: dt.date


def test_a_festival_is_seen_from_the_day_in_today(site_db: Path, tmp_path: Path) -> None:
    """The site sets today to the visitor's day (db.ts): a festival is ahead until its first day, on from its first to
    its last day, both included, and ended the next; still to attend (upcoming) until then."""
    copy = tmp_path / 'site.sqlite'
    _ = shutil.copyfile(site_db, copy)
    with sqlite_db.opened(copy, 'rw') as db:
        (e,) = db.rows(
            Span,
            "select id, start_date, end_date from event_rows where phase in ('ahead', 'on', 'ended')"
            ' and start_date < end_date order by id limit 1',
        )
        day = dt.timedelta(days=1)
        for seen, phase in (
            (e.start_date - day, 'ahead'),
            (e.start_date, 'on'),
            (e.end_date, 'on'),
            (e.end_date + day, 'ended'),
        ):
            with db.transaction() as tx:
                tx.execute('update today set day = ?', (seen.isoformat(),))
            (r,) = db.rows(Phased, 'select phase, upcoming from event_rows where id = ?', (e.id,))
            assert (r.phase, r.upcoming) == (phase, phase != 'ended'), seen
