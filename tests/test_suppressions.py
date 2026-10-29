"""Every suppressed check is listed here, by module and rule, and adding one, dropping one or moving one to another
module changes this list. What ruff's noqa comments suppress is what ruff itself reports once it ignores them, so a
suppression of any form counts (a file's `# ruff: noqa` included); each noqa names its rules and its reason, in
parentheses, and a pyright comment is only ever `pyright: ignore[rules]`. On the site, a biome-ignore names its rule and
reason, a @ts-expect-error its reason. Rules ignored for a whole file are in pyproject.toml and biome.jsonc, each with
its reason."""

import io
import re
import subprocess
import sys
import tokenize
from collections import Counter
from pathlib import Path

from pydantic import BaseModel, TypeAdapter

from pipeline import ROOT

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
        ('pipeline/fares.py', 'S603'): 1,
        ('pipeline/read_page.py', 'S606'): 1,
        ('pipeline/read_page.py', 'S607'): 1,
        ('pipeline/scrape.py', 'S608'): 1,
        ('pipeline/web.py', 'S310'): 2,
        ('tests/exports.py', 'S608'): 2,
        ('tests/test_audit.py', 'S105'): 1,
        ('tests/test_commands.py', 'S603'): 1,
        ('tests/test_build.py', 'S608'): 1,
        ('tests/test_extract.py', 'S608'): 1,
        ('tests/test_fetching.py', 'S608'): 1,
        ('tests/test_records.py', 'S607'): 1,
        ('tests/test_structure.py', 'S603'): 1,
        ('tests/test_suppressions.py', 'S603'): 1,
        ('tests/test_states.py', 'reportArgumentType'): 4,
        ('tests/test_states.py', 'reportCallIssue'): 1,
        ('tests/test_states.py', 'reportIndexIssue'): 1,
    }
)


# the site's: Biome's on one line, with its rule and reason, and TypeScript's only as an expected error with its reason
BIOME = re.compile(r'biome-ignore (?P<rules>lint/\w+/\w+): \S.*')
TS_EXPECT = re.compile(r'@ts-expect-error: \S.*')
SITE_SUPPRESSION = re.compile(r'(?:biome-ignore|@ts-|eslint-disable)[^*]*')
SITE_ALLOWED = Counter(
    {
        ('public/css/site.css', 'lint/complexity/noImportantStyles'): 1,
        ('site/festivals.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/rows.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/wording.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
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
            found = BIOME.fullmatch(text)
            assert found, f'{path.relative_to(ROOT)}:{n}: {text!r} names no rule (or no reason)'
            out.append(found['rules'])
    return out


def test_every_site_suppression_is_allowed() -> None:
    files = sorted([*ROOT.glob('site/*.ts'), *ROOT.glob('tests/site/*.ts'), *ROOT.glob('public/css/*.css')])
    found = Counter((p.relative_to(ROOT).as_posix(), rules) for p in files for rules in site_suppressions(p))
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
