"""The repository's Python, read as code: a function is written once, in the module the others import it from, and the
repository's folder is found once, as pipeline.ROOT; and a table of the export is the export's, which no step creates
when it is missing. The Actions take their tools from mise.toml, and the steps their export from db.export."""

import ast
import collections
import re
import tomllib
from pathlib import Path

from pipeline import ROOT


def body(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> str | None:
    """A function's parameters and statements, its docstring aside; None for a stub, whose body is ... (a
    Protocol's)."""
    if all(isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and s.value.value is ... for s in fn.body):
        return None
    docstring = ast.get_docstring(fn, clean=False) is not None
    return ast.dump(fn.args) + ''.join(map(ast.dump, fn.body[docstring:]))


def test_no_function_is_written_twice() -> None:
    written: collections.defaultdict[str, list[str]] = collections.defaultdict(list)
    for p in sorted([*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py')]):
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8'))):
            if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef) and (b := body(n)) is not None:
                written[b].append(f'{p.relative_to(ROOT)}:{n.lineno} {n.name}')
    assert [w for w in written.values() if len(w) > 1] == []


def test_the_repository_is_found_from_one_file() -> None:
    """Only pipeline/__init__.py climbs from a file's folder to its parent's (.parent.parent)."""
    climbs = [
        f'{p.relative_to(ROOT)}:{n.lineno}'
        for p in sorted([*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py')])
        if p != ROOT / 'pipeline' / '__init__.py'
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8')))
        if isinstance(n, ast.Attribute)
        and n.attr == 'parent'
        and isinstance(n.value, ast.Attribute)
        and n.value.attr == 'parent'
    ]
    assert climbs == []


def test_no_step_creates_a_table_when_it_is_missing() -> None:
    """A step that rebuilds its tables drops them first; one of the export's (tests/test_steps.py holds the export to
    them) is there, and a create ... if not exists would make a database of another shape pass for it."""
    found = [
        f'{p.relative_to(ROOT)}:{n.lineno}'
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8')))
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and 'if not exists' in n.value.lower()
    ]
    assert found == []


def test_the_actions_take_their_tools_from_mise() -> None:
    """mise.toml pins node, pnpm and uv; an Action that set one up by itself would run another version."""
    setups = re.compile(r'uses: (actions/setup-\w+|astral-sh/setup-uv|pnpm/action-setup)')
    found = [
        f'{p.relative_to(ROOT)}: {m[1]}'
        for p in sorted((ROOT / '.github').rglob('*.yml'))
        for m in setups.finditer(p.read_text(encoding='utf-8'))
    ]
    assert found == []


def test_only_db_looks_for_the_export() -> None:
    """source/ holds one export, which db.export finds; a step that looked for one itself could read another."""
    looks = re.compile(r"source/\*\.sqlite|glob\('\*\.sqlite'\)")
    found = [
        f'{p.relative_to(ROOT)}'
        for p in sorted(
            [*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py'), *(ROOT / '.github').rglob('*.yml')]
        )
        if p not in {ROOT / 'pipeline' / 'db.py', Path(__file__)} and looks.search(p.read_text(encoding='utf-8'))
    ]
    assert found == []


def test_mise_toml_holds_the_tools_alone() -> None:
    """The Actions cache the tools by mise.toml's hash; a task written there would make every edit of it download them
    all again (tasks.toml holds the tasks)."""
    assert set(tomllib.loads((ROOT / 'mise.toml').read_text(encoding='utf-8'))) == {'tools', 'task_config'}
