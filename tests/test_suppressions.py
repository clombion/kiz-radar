"""Every suppressed check is listed here, by module and rule, and adding one, dropping one or moving one to another
module changes this list. What ruff's noqa comments suppress is what ruff itself reports once it ignores them, so a
suppression of any form counts (a file's `# ruff: noqa` included); each noqa names its rules and its reason, in
parentheses, and a pyright comment is only ever `pyright: ignore[rules]`. On the site, a biome-ignore names its rule and
reason, an oxlint-disable-next-line its rule and, after --, its reason (oxlint-disable-line on a line a biome-ignore
already holds, which must come right before it), a @ts-expect-error its reason. Rules ignored for a whole file are in
pyproject.toml, biome.jsonc and .oxlintrc.json, each with its reason."""

import io
import re
import subprocess
import sys
import tokenize
from collections import Counter
from pathlib import Path

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


# the site's: Biome's and oxlint's on one line, each with its rule and reason, and TypeScript's only as an expected
# error with its reason
BIOME = re.compile(r'biome-ignore (?P<rules>lint/\w+/\w+): \S.*')
OXLINT = re.compile(r'oxlint-disable-(?:next-)?line (?P<rules>[\w-]+/[\w-]+) -- \S.*')
TS_EXPECT = re.compile(r'@ts-expect-error: \S.*')
SITE_SUPPRESSION = re.compile(r'(?:biome-ignore|oxlint-(?:disable|enable)|@ts-|eslint-disable)[^*]*')
SITE_ALLOWED = Counter(
    {
        ('public/css/site.css', 'lint/complexity/noImportantStyles'): 1,
        ('site/artists.ts', 'lint/plugin/states'): 1,
        ('site/json.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/routes.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/rows.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/wording.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        # oxlint's, each in docs/lint-false-positives.md
        ('site/globals.d.ts', 'import/no-namespace'): 1,
        ('site/json.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/routes.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/rows.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/wording.ts', 'typescript/no-unsafe-type-assertion'): 1,
        ('site/wording.ts', 'typescript/no-unnecessary-condition'): 2,
        ('tests/site/app.browser.test.ts', 'unicorn/new-for-builtins'): 1,
        ('tests/site/calendar.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/community.browser.test.ts', 'unicorn/numeric-separators-style'): 1,
        ('tests/site/elements.browser.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/main.browser.test.ts', 'jest/no-done-callback'): 1,
        ('tests/site/main.browser.test.ts', 'typescript/no-misused-promises'): 1,
        ('tests/site/server.browser.test.ts', 'jest/no-done-callback'): 1,
        ('vitest.config.ts', 'node/no-process-env'): 1,
        ('tests/site/roster.test.ts', '@ts-expect-error'): 2,  # the shapes the types no longer hold
        ('tests/site/states.test.ts', '@ts-expect-error'): 2,
    }
)


def site_suppressions(path: Path) -> list[str]:
    """The rules each suppressing comment of a site module, test or stylesheet names; one naming none fails."""
    out: list[str] = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for part in SITE_SUPPRESSION.finditer(line):
            text = part[0].rstrip()
            if TS_EXPECT.fullmatch(text):
                out.append('@ts-expect-error')
                continue
            found = BIOME.fullmatch(text) or OXLINT.fullmatch(text)
            assert found, f'{path.relative_to(ROOT)}:{n}: {text!r} names no rule (or no reason)'
            out.append(found['rules'])
    return out


def biome_files() -> list[str]:
    """The committed files Biome checks: those biome.jsonc's files.includes names, its globs read as git's."""
    found = re.search(r'"files": \{\s*"includes": (\[[^\]]*\])', (ROOT / 'biome.jsonc').read_text(encoding='utf-8'))
    assert found, 'biome.jsonc names its files in files.includes, first in files'
    includes = TypeAdapter(list[str]).validate_json(found[1])
    return tracked(*(f':(exclude){g[1:]}' if g.startswith('!') else f':(glob){g}' for g in includes))


def oxlint_files() -> list[str]:
    """The committed files oxlint checks: what lint:oxlint names (site/, tests/, lint/, vitest.config.ts), but the
    folders .oxlintrc.json's ignorePatterns leaves out."""
    return tracked(
        ':(glob)site/**/*.ts',
        ':(glob)tests/**/*.ts',
        ':(glob)lint/**/*.ts',
        'vitest.config.ts',
        ':(exclude)tests/site/lint',
        ':(exclude)lint/fixtures',
    )


def site_files() -> list[str]:
    """The files Biome or oxlint checks."""
    return sorted({*biome_files(), *oxlint_files()})


def test_the_site_suppressions_are_read_in_every_file_biome_or_oxlint_checks() -> None:
    files = site_files()
    assert {
        'site/main.ts',
        'tests/site/states.test.ts',
        'public/css/site.css',
        'biome.jsonc',
        'vitest.config.ts',
        'lint/plugin.ts',
    } <= set(files)
    assert 'pnpm-lock.yaml' not in files
    assert not any(f.startswith(('tests/site/lint/', 'lint/fixtures/')) for f in files)


def test_every_site_suppression_is_allowed() -> None:
    found = Counter((f, rules) for f in site_files() for rules in site_suppressions(ROOT / f))
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
