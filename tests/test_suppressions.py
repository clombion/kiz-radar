"""Every suppressed check is listed here: a noqa or pyright ignore names its rules (and a noqa its reason, in
parentheses), and adding, moving or dropping one changes this list. Rules ignored for a whole file are in
pyproject.toml, each with its reason."""

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
        ('pipeline/fares.py', 'S603'): 1,
        ('pipeline/read_page.py', 'S606, S607'): 1,
        ('pipeline/web.py', 'S310'): 2,
        ('tests/conftest.py', 'S607'): 1,
        ('tests/test_commands.py', 'S603'): 1,
        ('tests/test_states.py', 'reportArgumentType'): 4,
        ('tests/test_states.py', 'reportCallIssue'): 1,
        ('tests/test_states.py', 'reportIndexIssue'): 1,
    }
)


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
