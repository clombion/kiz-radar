"""Every pipeline command is a task of tasks.toml, and the Actions, the docs and the modules' docstrings run the tasks,
never a module: a task they name exists, and a task installs what its module needs (the packages imported by the
module and by every pipeline module it imports, anywhere in their code, are in the dependency groups the task names in
pyproject.toml, with the project's own dependencies)."""

import ast
import re
import sqlite3
import subprocess
import sys
import tomllib
from collections.abc import Iterator
from contextlib import closing
from importlib.metadata import packages_distributions
from pathlib import Path

import pytest
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from pipeline import ROOT, db

SOURCES = [
    *sorted((ROOT / '.github' / 'workflows').glob('*.yml')),
    *sorted((ROOT / '.github' / 'actions').rglob('*.yml')),
    ROOT / 'README.md',
    ROOT / 'CLAUDE.md',
    *sorted((ROOT / 'pipeline').rglob('*.py')),
]
COMMAND = re.compile(r'(?:uv run(?: -q)?((?: --group [\w-]+)*)|python3) -m (pipeline(?:\.\w+)+)')
TASK = re.compile(r'\bmise run(?: -q)? ([\w:-]+)')
NAME = re.compile(r'[=<>~!\[ ]')  # where a requirement's name ends


class Toml(BaseModel):
    model_config = ConfigDict(extra='ignore', frozen=True)


class Include(Toml):
    include_group: str = Field(alias='include-group')


class Project(Toml):
    dependencies: tuple[str, ...]


class Pyproject(Toml):
    """What pyproject.toml says the steps install."""

    project: Project
    groups: dict[str, tuple[str | Include, ...]] = Field(alias='dependency-groups')


class Task(Toml):
    run: str = ''


PYPROJECT = Pyproject.model_validate(tomllib.loads((ROOT / 'pyproject.toml').read_text()))
TASKS = TypeAdapter(dict[str, Task]).validate_python(tomllib.loads((ROOT / 'tasks.toml').read_text()))


def commands() -> Iterator[tuple[str, str, list[str]]]:
    """(where, module, groups) for each pipeline command of tasks.toml."""
    for name, task in TASKS.items():
        for m in COMMAND.finditer(task.run):
            yield f'tasks.toml [{name}]: {m[0]}', m[2], re.findall(r'--group ([\w-]+)', m[1] or '')


def test_a_module_is_run_by_its_task_only() -> None:
    """A command written beside its task would drift from it: the group it installs, the options it passes."""
    written = [
        f'{p.relative_to(ROOT)}: {m[0]}' for p in SOURCES for m in COMMAND.finditer(p.read_text(encoding='utf-8'))
    ]
    assert written == []


def test_every_task_named_is_one() -> None:
    named = {
        (p.relative_to(ROOT).as_posix(), m[1]) for p in SOURCES for m in TASK.finditer(p.read_text(encoding='utf-8'))
    }
    assert {(where, task) for where, task in named if task not in TASKS} == set()


def group_packages(name: str) -> set[str]:
    out: set[str] = set()
    for item in PYPROJECT.groups[name]:
        out |= group_packages(item.include_group) if isinstance(item, Include) else {NAME.split(item)[0]}
    return out


def module_path(module: str) -> Path:
    return ROOT / (module.replace('.', '/') + '.py')


def imported(node: ast.AST) -> list[str]:
    match node:
        case ast.Import(names=names):
            return [a.name for a in names]
        case ast.ImportFrom(module=str(module), names=names):
            return [module] + [f'{module}.{a.name}' for a in names]
        case _:
            return []


def imports(module: str, seen: set[str] | None = None) -> set[str]:
    """The top-level names a pipeline module and the pipeline modules it imports import, anywhere in their code."""
    seen = set() if seen is None else seen
    if module in seen:
        return set()
    seen.add(module)
    names: set[str] = set()
    for node in ast.walk(ast.parse(module_path(module).read_text(encoding='utf-8'))):
        for name in imported(node):
            if not name.startswith('pipeline'):
                names.add(name.split('.')[0])
            elif module_path(name).exists():
                names |= imports(name, seen)
    return names


def test_commands_install_what_their_modules_import() -> None:
    dists = packages_distributions()
    wrong: list[str] = []
    for where, module, named in commands():
        if not module_path(module).exists():
            wrong.append(f'{where}: no module {module}')
            continue
        have = set[str]().union(*(group_packages(g) for g in named))
        if where.split(': ', 1)[1].startswith('uv run'):
            have |= {NAME.split(d)[0] for d in PYPROJECT.project.dependencies}
        need = {d for n in imports(module) - set(sys.stdlib_module_names) for d in dists.get(n, [n])}
        if missing := need - {h.replace('_', '-').lower() for h in have} - have:
            wrong.append(f'{where}: needs {sorted(missing)}')
    assert wrong == []


def test_commands_are_found() -> None:
    assert len(list(commands())) > 10


def test_every_module_a_command_runs_answers_help() -> None:
    """A command's module parses its arguments, so a wrong or missing one gets a usage line, not a traceback."""
    failing: list[str] = []
    for module in sorted({m for _, m, _ in commands()}):
        r = subprocess.run(  # noqa: S603 (this interpreter, on a module of the repository)
            [sys.executable, '-m', module, '--help'], cwd=ROOT, capture_output=True, text=True, timeout=60, check=False
        )
        if r.returncode != 0 or 'usage:' not in r.stdout:
            failing.append(f'{module}: {(r.stderr.strip().splitlines() or ["no usage line"])[-1]}')
    assert failing == []


def test_databases_are_opened_with_a_mode() -> None:
    """Only pipeline/db.py calls sqlite3.connect, so every connection, the tests' too, holds its tables to their foreign
    keys, and a file's says whether it reads, writes or creates, and is closed with its block."""
    calls = [
        f'{p.relative_to(ROOT)}:{n.lineno}'
        for p in sorted([*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py')])
        if p.relative_to(ROOT).as_posix() != 'pipeline/db.py'
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8')))
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == 'connect'
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == 'sqlite3'
    ]
    assert calls == []


def test_a_wrong_path_is_an_error_not_a_new_database(tmp_path: Path) -> None:
    with pytest.raises(sqlite3.OperationalError), db.opened(tmp_path / 'missing.sqlite', 'rw'):
        pass
    assert not (tmp_path / 'missing.sqlite').exists()


def test_packages_are_pinned_in_pyproject_only() -> None:
    """A version written anywhere else would drift from the one uv.lock installs."""
    pins = [
        f'{p.relative_to(ROOT)}: {m[0]}'
        for p in [*SOURCES, ROOT / '.github' / 'workflows']
        if p.is_file()
        for m in re.finditer(r'\b[\w.-]+==\d[\w.]*', p.read_text(encoding='utf-8'))
    ]
    assert pins == []


def test_a_connection_holds_its_references_at_commit() -> None:
    """A row may refer to one written later in the transaction, but not to none once it commits."""
    with closing(db.memory()) as con:
        _ = con.execute('create table parent (id integer primary key)')
        _ = con.execute('create table child (parent_id integer references parent(id) deferrable initially deferred)')
        _ = con.execute('insert into child values (1)')
        _ = con.execute('insert into parent values (1)')
        con.commit()
        _ = con.execute('insert into child values (2)')
        with pytest.raises(sqlite3.IntegrityError, match='FOREIGN KEY'):
            con.commit()
