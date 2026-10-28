"""pipeline.audit: a value its record refuses is named with its file and place; an override that departs from nothing
is stale; the report is the same each time."""

import contextlib
import dataclasses
import datetime as dt
import json
import sqlite3
from pathlib import Path

import pytest

from pipeline import audit, data, exceptions, prompt, tickets
from pipeline.enums import FirstRead, Model
from pipeline.records import CsvRow, Logged, PageRecipe
from tests.exports import committed, shaped
from tests.fakes import AT, REGISTER, Memory


def copied() -> Path:
    """The data folder, with every committed CSV file."""
    committed(*(r.FILE for r in CsvRow.records()))
    return data('')


def edited(path: Path, line: int, column: int, value: str) -> None:
    """The CSV file with one value replaced."""
    lines = path.read_text(encoding='utf-8').splitlines()
    cells = lines[line - 1].split(',')
    cells[column] = value
    lines[line - 1] = ','.join(cells)
    _ = path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def test_a_hand_edited_state_is_named_with_its_file_and_place(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = copied()
    edited(root / 'pipeline/tickets/pages.csv', 2, 2, 'soon')
    found = audit.refused(set())
    assert len(found) == 1
    assert found[0].startswith('pipeline/tickets/pages.csv line 2: state: Input should be')
    assert audit.refused(set()) == found  # the same report each time


def festival(page: str | None, **change: object) -> tickets.Festival:
    base = tickets.Festival(
        id=1,
        title='F',
        start_date=dt.date(2027, 1, 1),
        end_date=dt.date(2027, 1, 2),
        country=None,
        description='',
        over=False,
        styles=(),
        links=(),
        found=None,
        first_read=None,
        log=(),
        tiers=(),
        described=None,
        page=tickets.KnownPage(page, None) if page else None,
        disputed=False,
        need=FirstRead.NONE,
    )
    return dataclasses.replace(base, **change)


def test_an_override_is_stale_once_a_recipe_reads_its_site_or_no_festival_has_its_page_there() -> None:
    o = exceptions.OVERRIDES[0]
    others = [festival(f'https://{p.host}/e') for p in exceptions.OVERRIDES[1:]]
    committed(tickets.SITES)
    known = tickets.sites()
    assert audit.stale([*others, festival(f'https://{o.host}/e', over=True)], known) == []  # past festivals count
    assert [s for s, _ in audit.stale(others, known)] == [o]  # no festival uses the site
    weezevent = known['weezevent']
    assert isinstance(weezevent.recipe, PageRecipe)
    recipe = weezevent.recipe.model_copy(update={'hosts': (o.host,), 'site': 'x'})
    stale = audit.stale([*others, festival(f'https://{o.host}/e')], known | {'x': tickets.Site(recipe, 'x@0123abcd')})
    assert [s for s, _ in stale] == [o]
    assert 'festivals 1' in stale[0][1]


def test_an_override_replaces_only_the_state_it_names() -> None:
    o = exceptions.OVERRIDES[0]
    assert tickets.waiting(festival(f'https://{o.host}/e')) == o.then
    assert tickets.waiting(festival(f'https://{o.host}/e', need=FirstRead.DISPUTED)) != o.then


def test_an_answer_to_the_current_prompt_holds_only_states_its_pass_makes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    copied()
    now, old = prompt.current('extract').hash, '0' * 16
    folder = tmp_path / 'extract'
    folder.mkdir()
    feature = {'feature': 'promo_code', 'quote': 'q', 'rationale': 'a code'}  # a feature the build makes
    for i in (1, 2):
        events = [{'event_id': i, 'artists': [], 'features': [feature]}]
        _ = (folder / f'event-{i}.json').write_text(json.dumps({'batch': 'b', 'events': events}))

    def answered(pass_name: str, ids: set[int]) -> dict[int, tuple[Path, Logged]]:
        if pass_name != 'extract':  # noqa: S105 (a pass is an extraction pass, no password)
            return {}
        return {
            i: (
                folder / f'event-{i}.json',
                Logged(file='f', answered_at=AT, model=Model.CLAUDE_HAIKU_5_5, prompt=h, answered_by='x'),
            )
            for i, h in ((1, now), (2, old))
        }

    monkeypatch.setattr(audit.answers, 'answered', answered)
    found = [f for f in audit.refused({1, 2}) if 'event-' in f]
    assert len(found) == 1
    assert 'event-1.json: events/0/features/0/feature: Input should be' in found[0]


def test_an_empty_value_is_allowed_only_where_its_column_allows_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = copied()
    edited(root / 'pipeline/pass_prices.csv', 2, 3, '')  # a pass for all its styles
    assert audit.refused(set()) == []
    edited(root / 'pipeline/tickets/status.csv', 2, 3, '')
    found = audit.refused(set())
    assert len(found) == 1
    assert found[0].startswith('pipeline/tickets/status.csv line 2: waits_for:')


def test_the_audit_exits_1_naming_what_it_found_on_stderr(
    memory: Memory, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    db = shaped(memory())

    def festivals(
        db: sqlite3.Connection, today: str, only: int | None = None, *, every: bool = False
    ) -> list[tickets.Festival]:
        return []

    monkeypatch.setattr(audit.tickets, 'src_db', lambda: contextlib.nullcontext(db))

    def refused(ids: set[int]) -> list[str]:
        return ['pages.csv line 2: state: no state']

    monkeypatch.setattr(audit, 'refused', refused)
    monkeypatch.setattr(audit.tickets, 'festivals', festivals)
    monkeypatch.setattr('sys.argv', ['audit'])
    with pytest.raises(SystemExit) as e:
        audit.main()
    out = capsys.readouterr()
    assert e.value.code == 1
    assert out.out.startswith(f'1 refused, {len(REGISTER)} stale')
    assert 'pages.csv line 2' in out.err
