"""The documentation leads somewhere: every link between its pages reaches a file, and every state an agent or the admin
acts on is named in a guide, so whoever meets one in the data finds what to do."""

import re

from pipeline import ROOT, states
from tests.repository import tracked

LINK = re.compile(r'\]\(([^)\s]+)\)')


def test_every_link_between_pages_reaches_a_file() -> None:
    broken = [
        f'{name}: {m[1]}'
        for name in tracked('*.md')
        for m in LINK.finditer((ROOT / name).read_text(encoding='utf-8'))
        if not re.match(r'[a-z]+:|#', m[1]) and not (ROOT / name).parent.joinpath(m[1].split('#')[0]).exists()
    ]
    assert broken == []


def test_every_state_an_agent_or_the_admin_acts_on_is_in_a_guide() -> None:
    guides = ''.join(p.read_text(encoding='utf-8') for p in sorted((ROOT / 'docs' / 'guides').glob('*.md')))
    acted_on = [
        f'{p.name} · {s.key} ({s.owner})'
        for p in states.POINTS
        for s in states.BY_POINT[p.name]
        if s.owner and s.owner.startswith(('agent', 'admin')) and f'`{s.key}`' not in guides
    ]
    assert acted_on == []
