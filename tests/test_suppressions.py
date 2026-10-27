"""Every suppressed check is listed here, by module and rules: a noqa or pyright ignore names its rules (and a noqa its
reason, in parentheses), a biome-ignore its rule and reason, a @ts-expect-error its reason, and adding one, dropping one
or moving one to another module changes this list. Rules ignored for a whole file are in pyproject.toml and biome.jsonc,
each with its reason."""

import io
import re
import tokenize
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent
NOQA = re.compile(r'# noqa: (?P<rules>[A-Z]+\d+(?:, [A-Z]+\d+)*) \((?P<reason>[^)]+)\)$')
PYRIGHT = re.compile(r'# pyright: ignore\[(?P<rules>\w+(?:, \w+)*)\]$')
SUPPRESSION = re.compile(r'# (?:noqa|pyright: ?ignore|type: ?ignore)[^#]*')
ALLOWED = Counter(
    {
        ('pipeline/build_site_db.py', 'S608'): 6,
        ('pipeline/extract/check_output.py', 'S105'): 1,
        ('pipeline/extract/load_extract.py', 'S608'): 2,
        ('pipeline/fares.py', 'S603'): 1,
        ('pipeline/read_page.py', 'S606, S607'): 1,
        ('pipeline/scrape.py', 'S608'): 3,
        ('pipeline/web.py', 'S310'): 2,
        ('tests/conftest.py', 'S607'): 1,
        ('tests/test_audit.py', 'S105'): 1,
        ('tests/test_commands.py', 'S603'): 1,
        ('tests/test_records.py', 'S607'): 1,
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
        ('docs/css/site.css', 'lint/complexity/noImportantStyles'): 1,
        ('site/festivals.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
        ('site/rows.ts', 'lint/nursery/noUnsafeTypeAssertion'): 1,
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
    files = sorted([*ROOT.glob('site/*.ts'), *ROOT.glob('tests/site/*.ts'), *ROOT.glob('docs/css/*.css')])
    found = Counter((p.relative_to(ROOT).as_posix(), rules) for p in files for rules in site_suppressions(p))
    assert found == SITE_ALLOWED


def suppressions(path: Path) -> list[str]:
    """The rules each suppressing comment of a module names; a comment that suppresses without naming them fails."""
    out: list[str] = []
    for tok in tokenize.generate_tokens(io.StringIO(path.read_text()).readline):
        if tok.type != tokenize.COMMENT:
            continue
        for part in SUPPRESSION.finditer(tok.string):
            text = part[0].rstrip()
            found = NOQA.fullmatch(text) or PYRIGHT.fullmatch(text)
            assert found, f'{path.relative_to(ROOT)}:{tok.start[0]}: {text!r} names no rules (or no reason)'
            out.append(found['rules'])
    return out


def test_every_suppression_is_allowed() -> None:
    files = sorted([*ROOT.glob('pipeline/**/*.py'), *ROOT.glob('tests/**/*.py')])
    found = Counter((p.relative_to(ROOT).as_posix(), rules) for p in files for rules in suppressions(p))
    assert found == ALLOWED
