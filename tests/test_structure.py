"""The repository's Python, read as code: a function is written once, in the module the others import it from; the
repository's folder is found once, as pipeline.ROOT, and a step finds its data through pipeline.data(); and a table of
the export is the export's, which no step creates when it is missing. The Actions take their tools from mise.toml and
check the claims out, and the steps their export from pipeline/export.py, at its schema's version."""

import ast
import collections
import re
import tomllib
from pathlib import Path

import pytest

from pipeline import ROOT
from tests.repository import BUILDING, BUILT, files, git, tracked, wrote


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


def climbs(tree: ast.AST) -> list[int]:
    """The lines where code climbs from a folder past its parent: .parent.parent, or .parents[...]."""
    return [
        n.lineno
        for n in ast.walk(tree)
        if isinstance(n, ast.Attribute)
        and (
            n.attr == 'parents'
            or (n.attr == 'parent' and isinstance(n.value, ast.Attribute) and n.value.attr == 'parent')
        )
    ]


@pytest.mark.parametrize(
    'code', ['Path(__file__).parent.parent', 'Path(__file__).parents[1]', "Path(__file__).resolve().parents[1] / 'x'"]
)
def test_a_climb_is_seen_however_it_is_written(code: str) -> None:
    assert climbs(ast.parse(code)) == [1]


def test_the_repository_is_found_from_one_file() -> None:
    """Only pipeline/__init__.py climbs from a file's folder to the repository's (climbs)."""
    found = [
        f'{p.relative_to(ROOT)}:{line}'
        for p in sorted([*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py')])
        if p != ROOT / 'pipeline' / '__init__.py'
        for line in climbs(ast.parse(p.read_text(encoding='utf-8')))
    ]
    assert found == []


def test_a_step_finds_its_data_through_the_data_folder() -> None:
    """ROOT is where the code is: only the modules that read or write code (the prompt templates, the generated files)
    name it, and every data file is found through pipeline.data(), which a test points elsewhere."""
    naming = {
        p.relative_to(ROOT).as_posix()
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        if p != ROOT / 'pipeline' / '__init__.py'
        and any(isinstance(n, ast.Name) and n.id == 'ROOT' for n in ast.walk(ast.parse(p.read_text(encoding='utf-8'))))
    }
    assert naming == {'pipeline/prompt.py', 'pipeline/generate.py', 'pipeline/reference.py'}


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


def test_a_job_takes_from_the_one_before_only_data() -> None:
    """A job that reads the web hands its work on as a patch, which the next job (with the API key, or the token that
    pushes) applies: each take names the paths it may change, and none of them holds code, so a patch that changed
    code the job then runs is refused (.github/actions/handoff)."""
    take = re.compile(r'mode: take\n\s+name: (?P<name>\S+)\n(?:\s+paths: >-\n(?P<paths>(?:\s{12,}\S.*\n)+))?')
    takes = [m for p in sorted((ROOT / '.github').rglob('*.yml')) for m in take.finditer(p.read_text(encoding='utf-8'))]
    assert takes
    code = re.compile(r'\.(?:py|ts|js|mjs|toml|ya?ml|sh|grit)$|(?:^|/)(?:\.github|\.claude|lint|site|tests)/')
    for m in takes:
        paths = (m['paths'] or '').split()
        assert paths, f'the take of {m["name"]} names no paths'
        held = [f for path in paths for f in tracked(path) if code.search(f)]
        assert [path for path in paths if code.search(path)] + held == [], m['name']


def test_no_query_takes_its_day_from_the_clock() -> None:
    """The site's queries see the festivals from the day in its today table, which the page sets to the visitor's own;
    a date('now') would be the UTC day, a day off for a visitor past midnight east of Greenwich."""
    clock = re.compile(
        r"\b(?:date|datetime|julianday|strftime)\s*\([^)]*'now'|current_(?:date|timestamp)\b", re.IGNORECASE
    )
    found = [
        f'{p.relative_to(ROOT)}:{n.lineno}'
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        for n in ast.walk(ast.parse(p.read_text(encoding='utf-8')))
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and clock.search(n.value)
    ]
    found += [f'{f}' for f in tracked('site/*.ts') if clock.search((ROOT / f).read_text(encoding='utf-8'))]
    assert found == []


def test_a_file_is_written_only_whole() -> None:
    """Every file a step replaces goes through pipeline/files.py, whole or not at all; a log only appends a line."""
    writes = re.compile(r"\.write_(?:text|bytes)\(|\.open\(\s*'w|\bopen\([^)]*,\s*'w")
    found = [
        f'{p.relative_to(ROOT)}:{n}'
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        if p != ROOT / 'pipeline' / 'files.py'
        for n, line in enumerate(p.read_text(encoding='utf-8').splitlines(), 1)
        if writes.search(line)
    ]
    assert found == []


def test_the_steps_and_the_checks_check_the_claims_out() -> None:
    """claims/ is a submodule (pipeline/claims.py): the steps, which every Action that runs one takes, and the checks
    (the audit) read it, and a checkout without it finds no admin claim."""
    steps = (ROOT / '.github/actions/steps/action.yml').read_text(encoding='utf-8')
    tests = (ROOT / '.github/workflows/tests.yml').read_text(encoding='utf-8')
    assert 'run: git submodule update --init' in steps
    assert re.search(r'- uses: actions/checkout@\S+[^\n]*\n(\s+)with:\n\1  submodules: true\b', tests)


def test_only_export_looks_for_the_export() -> None:
    """source/ holds one export, which export.path finds; a step that looked for one itself could read another."""
    looks = re.compile(r"source/\*\.sqlite|glob\('\*\.sqlite'\)")
    found = [
        f'{p.relative_to(ROOT)}'
        for p in sorted(
            [*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py'), *(ROOT / '.github').rglob('*.yml')]
        )
        if p not in {ROOT / 'pipeline' / 'export.py', Path(__file__)} and looks.search(p.read_text(encoding='utf-8'))
    ]
    assert found == []


def test_a_step_opens_the_export_at_its_version() -> None:
    """A step opens the export with export.opened, which migrates it or refuses another version; a database is opened
    by file only where it is made (the site's, whose build refuses an export of another version)."""
    opens = re.compile(r'\bsqlite_db\.opened\(')
    found = [
        f'{p.relative_to(ROOT)}'
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        if p.name not in {'db.py', 'export.py', 'build_site_db.py'} and opens.search(p.read_text(encoding='utf-8'))
    ]
    assert found == []


def test_mise_toml_holds_the_tools_alone() -> None:
    """The Actions cache the tools by mise.toml's hash; a task written there would make every edit of it download them
    all again (tasks.toml holds the tasks). It holds the tools, where the tasks are, and what installing them also
    installs."""
    assert set(tomllib.loads((ROOT / 'mise.toml').read_text(encoding='utf-8'))) == {'tools', 'task_config', 'hooks'}


def test_what_a_build_makes_is_not_committed() -> None:
    """A built file committed would drift from what it is built from, between a change and its rebuild."""
    assert tracked(*BUILT) == []


def test_git_ignores_what_a_build_makes_and_the_guard_leaves_aside() -> None:
    """.gitignore's lines for public/ are the files and folders a build makes, which the guard leaves aside (BUILT),
    so that neither gains one without the other."""
    ignored = (ROOT / '.gitignore').read_text(encoding='utf-8').splitlines()
    assert {line for line in ignored if line.startswith('public/')} == {*BUILT, BUILDING}


def test_the_guard_sees_a_write_git_would_not_tell(tmp_path: Path) -> None:
    """The repository guard (conftest.py) reads the files themselves, not git's status, so a write into an ignored file
    or into one changed before the tests ran is a write, as is a new file; a build's files aside."""
    root = tmp_path / 'repository'
    root.mkdir()
    _ = (root / '.gitignore').write_text('ignored/\n', encoding='utf-8')
    _ = (root / 'dirty.txt').write_text('as committed\n', encoding='utf-8')
    _ = git('init', '-q', cwd=root)
    _ = git('add', '.', cwd=root)
    _ = git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', 'c', cwd=root)
    _ = (root / 'dirty.txt').write_text('changed before the tests ran\n', encoding='utf-8')
    (root / 'ignored').mkdir()
    _ = (root / 'ignored' / 'kept.txt').write_text('ignored\n', encoding='utf-8')
    before = files(root)
    _ = (root / 'dirty.txt').write_text('changed by a test\n', encoding='utf-8')
    _ = (root / 'ignored' / 'kept.txt').write_text('written by a test\n', encoding='utf-8')
    _ = (root / 'new.txt').write_text('made by a test\n', encoding='utf-8')
    (root / 'public' / 'js').mkdir(parents=True)
    _ = (root / 'public' / 'js' / 'main.js').write_text('built\n', encoding='utf-8')
    assert wrote(before, files(root)) == ['dirty.txt', 'ignored/kept.txt', 'new.txt']


def test_only_the_build_names_the_site_database() -> None:
    """A step reads the site database build_site_db.built() makes for it, never the published one, which may be of
    other files or not built at all."""
    found = [
        f'{p.relative_to(ROOT)}'
        for p in sorted([*(ROOT / 'pipeline').rglob('*.py'), *(ROOT / 'tests').rglob('*.py')])
        if p not in {ROOT / 'pipeline' / 'build_site_db.py', Path(__file__)}
        and re.search(r'kiz\.sqlite|site\.json', p.read_text(encoding='utf-8'))
    ]
    assert found == []


def test_the_home_airport_is_named_only_in_airports_csv() -> None:
    """Where every fare search leaves from is the data's (pipeline/airports.csv): no module names it."""
    found = [
        p.relative_to(ROOT).as_posix()
        for p in sorted((ROOT / 'pipeline').rglob('*.py'))
        if "'BGO'" in (text := p.read_text(encoding='utf-8')) or '"BGO"' in text
    ]
    assert found == []
