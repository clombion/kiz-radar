"""The repository's Python, read as code: a function is written once, in the module the others import it from, and the
repository's folder is found once, as pipeline.ROOT; and a table of the export is the export's, which no step creates
when it is missing."""

import ast
import collections

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
