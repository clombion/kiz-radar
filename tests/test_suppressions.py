"""Every suppressed check is listed here, by module and rule, and adding one, dropping one or moving one to another
module changes this list. What ruff's noqa comments suppress is what ruff itself reports once it ignores them, so a
suppression of any form counts (a file's `# ruff: noqa` included); each noqa names its rules and its reason, in
parentheses, and a pyright comment is only ever `pyright: ignore[rules]`. On the site, each tool's comment is read in
that tool's files alone: a biome-ignore, in the stylesheet and the JSON configs Biome checks, names its rule and reason;
in the TypeScript oxlint lints, an oxlint-disable-next-line names its rules and, after --, its reason, and a
@ts-expect-error its reason. Rules ignored for a whole file are in pyproject.toml, biome.jsonc and .oxlintrc.json, each
with its reason."""

import io
import re
import subprocess
import sys
import tokenize
from collections import Counter
from pathlib import Path

import pytest
from pydantic import BaseModel, TypeAdapter

from pipeline import ROOT
from tests.repository import tracked

NOQA = re.compile(r'# noqa: (?P<rules>[A-Z]+\d+(?:, [A-Z]+\d+)*) \((?P<reason>[^)]+)\)$')
PYRIGHT = re.compile(r'# pyright: ignore\[(?P<rules>\w+(?:, \w+)*)\]$')


class Finding(BaseModel):
    """One of ruff's findings, as its JSON output gives it."""

    filename: str
    code: str


FINDINGS = TypeAdapter(list[Finding])
# any comment a checker reads as a directive, however it is spelled
SUPPRESSION = re.compile(r'#\s*(?:noqa|ruff\s*:|pyright\s*:|type\s*:\s*ignore)[^#]*', re.IGNORECASE)
ALLOWED = Counter(
    {
        ('pipeline/build_site_db.py', 'S608'): 1,
        ('pipeline/extract/check_output.py', 'S105'): 1,
        ('pipeline/db.py', 'S608'): 2,
        ('pipeline/export.py', 'S608'): 2,
        ('pipeline/extract/load_extract.py', 'S608'): 1,
        ('pipeline/extract/merge_review.py', 'S608'): 1,
        ('pipeline/read_page.py', 'S606'): 1,
        ('pipeline/read_page.py', 'S607'): 1,
        ('pipeline/scrape.py', 'S608'): 1,
        ('pipeline/web.py', 'S310'): 2,
        ('tests/exports.py', 'S608'): 2,
        ('tests/test_commands.py', 'S603'): 1,
        ('tests/test_build.py', 'S608'): 1,
        ('tests/test_extract.py', 'S608'): 1,
        ('tests/test_fetching.py', 'S608'): 1,
        ('tests/repository.py', 'S603'): 1,
        ('tests/test_suppressions.py', 'S603'): 1,
        ('tests/test_states.py', 'reportArgumentType'): 4,
        ('tests/test_states.py', 'reportCallIssue'): 1,
        ('tests/test_states.py', 'reportIndexIssue'): 1,
    }
)


# the site's: Biome's in its files, oxlint's on the line before the one it suppresses, each with its rule and reason,
# and TypeScript's only as an expected error with its reason
BIOME = re.compile(r'biome-ignore (?P<rules>lint/\w+/\w+): \S.*')
OXLINT = re.compile(r'oxlint-disable-next-line (?P<rules>[\w-]+/[\w-]+(?:, [\w-]+/[\w-]+)*) -- \S.*')
TS_EXPECT = re.compile(r'@ts-expect-error: \S.*')
# each up to the comment's end: a block comment's close, or the next comment's opener, which starts another
SITE_SUPPRESSION = re.compile(r'(?:biome-ignore|oxlint-(?:disable|enable)|@ts-|eslint-disable)(?:[^*/]|/(?![/*]))*')
SITE_ALLOWED = Counter(
    {
        ('public/css/site.css', 'lint/complexity/noImportantStyles'): 1,
        # oxlint's, each in docs/lint-false-positives.md
        ('site/artists.tsx', 'house/states'): 1,
        ('site/controls.tsx', 'jsx-a11y/prefer-tag-over-role'): 2,
        ('site/dialog.tsx', 'jsx-a11y/click-events-have-key-events'): 1,
        ('site/eventcard.tsx', 'jsx-a11y/click-events-have-key-events'): 1,
        ('site/eventcard.tsx', 'jsx-a11y/no-static-element-interactions'): 1,
        ('site/gantt.tsx', 'jsx-a11y/prefer-tag-over-role'): 1,
        ('site/globals.d.ts', 'import/no-namespace'): 1,
        ('site/marks.tsx', 'jsx-a11y/prefer-tag-over-role'): 1,
        ('site/months.tsx', 'jsx-a11y/click-events-have-key-events'): 1,
        ('site/months.tsx', 'jsx-a11y/interactive-supports-focus'): 1,
        ('site/months.tsx', 'jsx-a11y/mouse-events-have-key-events'): 1,
        ('site/months.tsx', 'jsx-a11y/no-static-element-interactions'): 1,
        ('site/months.tsx', 'jsx-a11y/prefer-tag-over-role'): 5,
        ('site/json.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/routes.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/search.tsx', 'jsx-a11y/click-events-have-key-events'): 2,
        ('site/search.tsx', 'jsx-a11y/interactive-supports-focus'): 2,
        ('site/search.tsx', 'jsx-a11y/prefer-tag-over-role'): 4,
        ('site/rows.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/wording.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('tests/site/app.browser.test.ts', 'unicorn/new-for-builtins'): 1,
        ('tests/site/calendar.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/diagnosed.tsx', 'solid/no-write-in-pure-computation'): 1,
        ('tests/site/diagnosed.tsx', 'solid/reactivity'): 1,
        ('tests/site/elements.browser.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/main.browser.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/pages.browser.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/main.browser.test.ts', 'typescript/no-misused-promises'): 1,
        ('tests/site/main.browser.test.ts', 'typescript/promise-function-async'): 1,
        ('tests/site/main.browser.test.ts', 'typescript/strict-void-return'): 1,
        ('tests/site/solid.browser.test.ts', 'house/tests'): 1,
        ('vitest.config.ts', 'house/env'): 1,
        ('tests/site/roster.test.ts', '@ts-expect-error'): 2,  # the shapes the types no longer hold
        ('tests/site/states.test.ts', '@ts-expect-error'): 2,
    }
)


def site_suppressions(path: Path, *, biome: bool) -> list[str]:
    """The rules each suppressing comment of a site module, test, stylesheet or config names; one naming none fails, as
    does one of the tool that does not check the file: a biome-ignore in Biome's files only, oxlint's and TypeScript's
    in oxlint's."""
    out: list[str] = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for part in SITE_SUPPRESSION.finditer(line):
            text = part[0].rstrip()
            where = f'{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path.name}:{n}: {text!r}'
            if TS_EXPECT.fullmatch(text) and not biome:
                out.append('@ts-expect-error')
                continue
            own, other = (BIOME, (OXLINT, TS_EXPECT)) if biome else (OXLINT, (BIOME,))
            assert not any(o.fullmatch(text) for o in other), (
                f'{where} is not a comment of the tool that checks the file'
            )
            found = own.fullmatch(text)
            assert found, f'{where} names no rule (or no reason)'
            out += found['rules'].split(', ')
    return out


def biome_files() -> list[str]:
    """The committed files Biome checks: those biome.jsonc's files.includes names, its globs read as git's."""
    found = re.search(r'"files": \{\s*"includes": (\[[^\]]*\])', (ROOT / 'biome.jsonc').read_text(encoding='utf-8'))
    assert found, 'biome.jsonc names its files in files.includes, first in files'
    includes = TypeAdapter(list[str]).validate_json(found[1])
    return tracked(*(f':(exclude){g[1:]}' if g.startswith('!') else f':(glob){g}' for g in includes))


# the files oxlint lints in a folder it is given, by their extensions
OXLINTED = ('.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx')


class Package(BaseModel):
    """package.json's scripts, the one place the paths oxlint lints are named."""

    scripts: dict[str, str]


def oxlint_files() -> list[str]:
    """The committed files oxlint checks: those package.json's lint:oxlint names, a folder's by their extensions, but
    the folders .oxlintrc.json's ignorePatterns leaves out."""
    script = Package.model_validate_json((ROOT / 'package.json').read_text(encoding='utf-8')).scripts['lint:oxlint']
    command, *paths = script.split()
    assert command == 'oxlint', f'lint:oxlint runs oxlint and names its paths alone: {script!r}'
    assert paths, 'lint:oxlint names the paths oxlint lints'
    assert not any(p.startswith('-') for p in paths), (
        f'lint:oxlint passes no option; .oxlintrc.json sets them: {script!r}'
    )
    found = re.search(r'"ignorePatterns": (\[[^\]]*\])', (ROOT / '.oxlintrc.json').read_text(encoding='utf-8'))
    assert found, '.oxlintrc.json names the folders it leaves out in ignorePatterns'
    ignored = TypeAdapter(list[str]).validate_json(found[1])
    files = tracked(*paths, *(f':(exclude){g}' for g in ignored))
    return [f for f in files if f in paths or f.endswith(OXLINTED)]


def test_biome_checks_the_stylesheet_and_the_json_configs_alone() -> None:
    files = biome_files()
    assert {'public/css/site.css', 'biome.jsonc', 'package.json'} <= set(files)
    assert all(f.endswith(('.css', '.json', '.jsonc')) for f in files), files
    assert 'pnpm-lock.yaml' not in files


def test_oxlint_checks_the_site_its_tests_and_the_house_rules() -> None:
    files = oxlint_files()
    configs = {'vite.config.ts', 'vitest.config.ts'}
    assert {'site/main.ts', 'tests/site/states.test.ts', 'lint/plugin.ts', *configs} <= set(files)
    assert not any(f.startswith('lint/fixtures/') for f in files)


def test_two_suppressions_on_one_line_are_read_apart(tmp_path: Path) -> None:
    two = tmp_path / 'two.ts'
    two.write_text('// @ts-expect-error: a reason // oxlint-disable-next-line eslint/no-y -- another\n')
    assert site_suppressions(two, biome=False) == ['@ts-expect-error', 'eslint/no-y']


def test_a_suppression_of_the_tool_that_does_not_check_the_file_fails(tmp_path: Path) -> None:
    ts = tmp_path / 'own.ts'
    ts.write_text('// oxlint-disable-next-line eslint/no-y -- a reason\n')
    assert site_suppressions(ts, biome=False) == ['eslint/no-y']
    css = tmp_path / 'own.css'
    css.write_text('/* biome-ignore lint/style/noX: a reason */\n')
    assert site_suppressions(css, biome=True) == ['lint/style/noX']
    for name, comment, biome in (
        ('stray.ts', '// biome-ignore lint/style/noX: a reason', False),
        ('stray.css', '/* oxlint-disable-next-line eslint/no-y -- a reason */', True),
        ('typed.css', '/* @ts-expect-error: a reason */', True),
    ):
        stray = tmp_path / name
        stray.write_text(comment + '\n')
        with pytest.raises(AssertionError, match='not a comment of the tool'):
            site_suppressions(stray, biome=biome)


def test_a_suppression_naming_no_rule_fails(tmp_path: Path) -> None:
    bare = tmp_path / 'bare.ts'
    bare.write_text('// oxlint-disable-next-line\n')
    with pytest.raises(AssertionError, match='names no rule'):
        site_suppressions(bare, biome=False)


def test_every_site_suppression_is_allowed() -> None:
    found = Counter(
        (f, rules)
        for biome, files in ((True, biome_files()), (False, oxlint_files()))
        for f in files
        for rules in site_suppressions(ROOT / f, biome=biome)
    )
    assert found == SITE_ALLOWED


def ruff(*options: str) -> Counter[tuple[str, str]]:
    """What ruff reports, by module and rule."""
    out = subprocess.run(  # noqa: S603 (ruff, from this environment)
        [sys.executable, '-m', 'ruff', 'check', '--output-format', 'json', '--no-cache', '--exit-zero', *options],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    found = FINDINGS.validate_json(out)
    return Counter((Path(f.filename).relative_to(ROOT).as_posix(), f.code) for f in found)


def pyright_ignored(path: Path) -> list[tuple[str, str]]:
    """The rules each pyright ignore of a module names, checking every suppressing comment's form on the way."""
    out: list[tuple[str, str]] = []
    for tok in tokenize.generate_tokens(io.StringIO(path.read_text()).readline):
        if tok.type != tokenize.COMMENT:
            continue
        for part in SUPPRESSION.finditer(tok.string):
            text = part[0].rstrip()
            where = f'{path.relative_to(ROOT)}:{tok.start[0]}'
            if found := PYRIGHT.fullmatch(text):
                out += [(path.relative_to(ROOT).as_posix(), r) for r in found['rules'].split(', ')]
            else:
                assert NOQA.fullmatch(text), (
                    f'{where}: {text!r} is no noqa naming its rules and reason, nor pyright ignore'
                )
    return out


def test_every_suppression_is_allowed() -> None:
    files = sorted([*ROOT.glob('pipeline/**/*.py'), *ROOT.glob('tests/**/*.py')])
    found = ruff('--ignore-noqa') - ruff() + Counter(k for p in files for k in pyright_ignored(p))
    assert found == ALLOWED
