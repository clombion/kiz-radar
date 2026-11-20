"""The JSON configs at the repository's root, which each tool reads taking the last of two values for a key without a
word: no key is written twice in an object, nor empty, and package.json names a package in one group of dependencies
alone. A .jsonc's comments are skipped as its tools skip them, a string's // or /* left as it is; oxfmt (format:site)
refuses a config that does not parse."""

import json
from collections import Counter
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from pipeline import ROOT
from tests.repository import tracked

# the groups a package is installed by; peerDependencies and optionalDependencies may name one again
GROUPS = ('dependencies', 'devDependencies')
# a config is an object, as each of its tools wants
OBJECT = TypeAdapter(dict[str, object])


def uncommented(text: str) -> str:
    """The text with its // and /* */ comments blanked out, each newline kept so a parse error's line holds; a comment's
    opener inside a string is the string's."""
    out: list[str] = []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '"':
            end = i + 1
            while end < len(text) and text[end] != '"':
                end += 2 if text[end] == '\\' else 1
            out.append(text[i : end + 1])
            i = end + 1
        elif text.startswith('//', i):
            end = text.find('\n', i)
            i = len(text) if end < 0 else end
        elif text.startswith('/*', i):
            end = text.find('*/', i + 2)
            assert end >= 0, 'a block comment is closed'
            out.append('\n' * text.count('\n', i, end))
            i = end + 2
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def problems(text: str) -> list[str]:
    """What is wrong with a config's keys: each key written twice in one object, each empty key, and each package
    named in two of package.json's groups."""
    found: list[str] = []

    def keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        counted = Counter(k for k, _ in pairs)
        found.extend(f'{k!r} twice in one object' for k, n in counted.items() if n > 1)
        found.extend('an empty key' for k in counted if not k.strip())
        return dict(pairs)

    config = OBJECT.validate_python(json.loads(uncommented(text), object_pairs_hook=keys))
    named = Counter(p for group in GROUPS if group in config for p in OBJECT.validate_python(config[group]))
    found.extend(f'{p!r} in two groups of dependencies' for p, n in sorted(named.items()) if n > 1)
    return found


def configs() -> list[str]:
    """The committed JSON configs at the root."""
    return [f for f in tracked('*.json', '*.jsonc') if '/' not in f]


def test_the_root_configs_are_read() -> None:
    assert {'package.json', 'tsconfig.json', '.oxlintrc.json', '.oxfmtrc.jsonc', 'knip.jsonc'} <= set(configs())


@pytest.mark.parametrize('name', configs())
def test_no_config_writes_a_key_twice_or_empty(name: str) -> None:
    assert problems((ROOT / name).read_text(encoding='utf-8')) == []


def test_comments_are_skipped_and_strings_kept() -> None:
    text = '{\n  // a comment\n  "a": "// no comment", /* "b": 1, */ "c": "/* nor this */",\n  "d": "\\" // still"\n}'
    assert json.loads(uncommented(text)) == {'a': '// no comment', 'c': '/* nor this */', 'd': '" // still'}
    assert uncommented('{\n/* a\nb */\n}').count('\n') == 3


@pytest.mark.parametrize(
    ('text', 'problem'),
    [
        ('{"rules": {"a": 1, "b": 2, "a": 3}}', "'a' twice in one object"),
        ('{\n  // a comment\n  "x": 1,\n  "x": 2\n}', "'x' twice in one object"),
        ('{"a": {"": 1}}', 'an empty key'),
        ('{"devDependencies": {"vite": "1", "vite": "2"}}', "'vite' twice in one object"),
        ('{"dependencies": {"vite": "1"}, "devDependencies": {"vite": "1"}}', "'vite' in two groups of dependencies"),
    ],
)
def test_a_planted_duplicate_or_empty_key_fails(tmp_path: Path, text: str, problem: str) -> None:
    planted = tmp_path / 'planted.jsonc'
    planted.write_text(text)
    assert problems(planted.read_text()) == [problem]


def test_one_package_in_a_peer_group_too_passes() -> None:
    assert problems('{"devDependencies": {"vite": "1"}, "peerDependencies": {"vite": "1"}}') == []
