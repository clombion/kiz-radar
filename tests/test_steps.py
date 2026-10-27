"""The pipeline's steps run whole on the committed kizomba-world export, each into a copy or a folder of the test's
own: each builds what it says, and run again it changes nothing, but the time its run log says it ran."""

from pathlib import Path

import pytest

from pipeline import build_site_db, merge_suggestions
from pipeline import db as sqlite_db
from pipeline.extract import load_extract, resolve_artists
from tests import jsons
from tests.exports import EXPORT, ROOT, column, content, copied, run, trimmed

SITE_DB = ROOT / 'docs' / 'data' / 'kiz.sqlite'

# a whole run of a step takes seconds, its runs here a few of them
pytestmark = pytest.mark.timeout(120)


def test_the_site_database_builds_alike_twice_with_every_table_documented(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    built: list[Path] = []
    for name in ('a', 'b'):
        monkeypatch.setattr(build_site_db, 'OUT', tmp_path / f'{name}.sqlite')
        monkeypatch.setattr(build_site_db, 'SITE_JSON', tmp_path / f'{name}.json')
        run(build_site_db.main, monkeypatch, EXPORT)
        built.append(tmp_path / f'{name}.sqlite')
    assert content(built[0]) == content(built[1])
    with sqlite_db.opened(built[0], 'ro') as db:
        names = set(column(db, "select name from sqlite_master where type in ('table', 'view')"))
        documented = set(column(db, 'select name from table_docs'))
        built_at = column(db, "select value from meta where key = 'built_at'")
    assert names == documented
    assert [jsons.at(jsons.read(tmp_path / 'a.json'), 'built_at')] == built_at
    assert not list(tmp_path.glob('*.building'))  # swapped in once built


def test_loading_the_answers_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    src = copied(tmp_path)
    run(load_extract.main, monkeypatch, src)
    once = content(src)
    run(load_extract.main, monkeypatch, src)
    assert content(src) == once


def test_resolving_the_artists_again_changes_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # the whole export takes the step most of a minute: the latest festivals with line-ups are enough
    src = trimmed(tmp_path, 40)
    run(resolve_artists.main, monkeypatch, src)
    once = content(src)
    assert once['artists']
    run(resolve_artists.main, monkeypatch, src)
    assert content(src) == once


def test_merge_suggestions_leave_out_decided_pairs_and_keep_the_more_booked() -> None:
    with sqlite_db.opened(EXPORT, 'ro') as c, sqlite_db.opened(SITE_DB, 'ro') as site:
        rows = merge_suggestions.suggestions(c, site)
    assert rows
    assert [r.score for r in rows] == sorted((r.score for r in rows), reverse=True)
    assert all(r.keep_bookings >= r.merge_bookings for r in rows)
    done, _ = merge_suggestions.decided()
    assert not [r for r in rows if frozenset((r.keep_key, r.merge_key)) in done]
    assert all(r.decision == '' for r in rows)
