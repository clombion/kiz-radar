"""Every command the Actions and the docs give installs what its module needs: the packages imported by the module
and by every pipeline module it imports, anywhere in their code, are in the dependency groups the command names
(pyproject.toml). A module run with plain python3 imports only the standard library."""

import ast
import re
import subprocess
import sys
import tomllib
from importlib.metadata import packages_distributions
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCES = [
    *sorted((ROOT / '.github' / 'workflows').glob('*.yml')),
    ROOT / 'README.md',
    ROOT / 'CLAUDE.md',
    *sorted((ROOT / 'pipeline').rglob('*.py')),
]
COMMAND = re.compile(r'(?:uv run(?: -q)?((?: --group [\w-]+)*)|python3) -m (pipeline(?:\.\w+)+)')


def commands():
    """(where, module, groups) for each command written in the Actions, the docs and the modules' docstrings."""
    for path in SOURCES:
        for m in COMMAND.finditer(path.read_text(encoding='utf-8')):
            yield f'{path.relative_to(ROOT)}: {m[0]}', m[2], re.findall(r'--group ([\w-]+)', m[1] or '')


def group_packages(name, groups):
    out = set()
    for item in groups[name]:
        out |= (
            group_packages(item['include-group'], groups)
            if isinstance(item, dict)
            else {re.split(r'[=<>~!\[ ]', item)[0]}
        )
    return out


def imports(module, seen=None):
    """The top-level names a pipeline module and the pipeline modules it imports import, anywhere in their code."""
    seen = set() if seen is None else seen
    if module in seen:
        return set()
    seen.add(module)
    path = ROOT / (module.replace('.', '/') + '.py')
    names = set()
    for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
        found = (
            [a.name for a in node.names]
            if isinstance(node, ast.Import)
            else [node.module] + [f'{node.module}.{a.name}' for a in node.names]
            if isinstance(node, ast.ImportFrom) and node.module
            else []
        )
        for name in found:
            if name.startswith('pipeline'):
                if (ROOT / (name.replace('.', '/') + '.py')).exists():
                    names |= imports(name, seen)
            else:
                names.add(name.split('.')[0])
    return names


def test_commands_install_what_their_modules_import():
    groups = tomllib.loads((ROOT / 'pyproject.toml').read_text())['dependency-groups']
    dists = packages_distributions()
    wrong = []
    for where, module, named in commands():
        if not (ROOT / (module.replace('.', '/') + '.py')).exists():
            wrong.append(f'{where}: no module {module}')
            continue
        have = set().union(*(group_packages(g, groups) for g in named)) if named else set()
        need = {d for n in imports(module) - set(sys.stdlib_module_names) for d in dists.get(n, [n])}
        if missing := need - {h.replace('_', '-').lower() for h in have} - {h for h in have}:
            wrong.append(f'{where}: needs {sorted(missing)}')
    assert wrong == []


def test_commands_are_found():
    assert len(list(commands())) > 30


def test_every_module_a_command_runs_answers_help():
    """A command's module parses its arguments, so a wrong or missing one gets a usage line, not a traceback."""
    failing = []
    for module in sorted({m for _, m, _ in commands()}):
        r = subprocess.run(
            [sys.executable, '-m', module, '--help'], cwd=ROOT, capture_output=True, text=True, timeout=60
        )
        if r.returncode != 0 or 'usage:' not in r.stdout:
            failing.append(f'{module}: {(r.stderr.strip().splitlines() or ["no usage line"])[-1]}')
    assert failing == []


def test_databases_are_opened_with_a_mode():
    """Only pipeline/db.py calls sqlite3.connect, so every connection says whether it reads, writes or creates."""
    calls = [
        f'{p.relative_to(ROOT)}:{n.lineno}'
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        if p.name != 'db.py'
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8')))
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == 'connect'
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == 'sqlite3'
    ]
    assert calls == []


def test_a_wrong_path_is_an_error_not_a_new_database(tmp_path):
    import sqlite3

    import pytest

    from pipeline import db

    with pytest.raises(sqlite3.OperationalError):
        db.connect(tmp_path / 'missing.sqlite', 'rw')
    assert not (tmp_path / 'missing.sqlite').exists()


def test_packages_are_pinned_in_pyproject_only():
    """A version written anywhere else would drift from the one uv.lock installs."""
    pins = [
        f'{p.relative_to(ROOT)}: {m[0]}'
        for p in SOURCES + [ROOT / '.github' / 'workflows']
        if p.is_file()
        for m in re.finditer(r'\b[\w.-]+==\d[\w.]*', p.read_text(encoding='utf-8'))
    ]
    assert pins == []
