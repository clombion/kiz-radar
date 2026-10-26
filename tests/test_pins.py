"""A package pinned in several scripts' headers (PEP 723) is pinned at one version: each script run with uv gets its
own header's packages only, so a script that imports another repeats that one's pins."""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent


def test_every_package_has_one_pin():
    pins = {}
    for path in sorted(ROOT.glob('pipeline/**/*.py')):
        if m := re.search(r'^# dependencies = \[(.*)\]$', path.read_text(encoding='utf-8'), re.M):
            for name, version in re.findall(r'"([\w.-]+)==([\w.]+)"', m[1]):
                pins.setdefault(name, {}).setdefault(version, []).append(str(path.relative_to(ROOT)))
    assert {n: v for n, v in pins.items() if len(v) > 1} == {}
