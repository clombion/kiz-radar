"""A community's shared link: its page at public/c/<key>/ and its image, the site's share card with its name alone,
drawn again only when its name, or the site's card, changes."""

import re
import shutil
from pathlib import Path

import pytest

from pipeline import ROOT, generate
from pipeline.records import Airport, Community, Membership

KEY = 'frost-lantern-river-maple'
NAME = 'Norwegians in festivals'


@pytest.fixture
def communities(data_folder: Path) -> list[Community]:
    """The committed communities, and the airports, in the test's data folder."""
    (data_folder / 'pipeline').mkdir(exist_ok=True)
    for f in (Community.FILE, Airport.FILE):  # the site's page names the home airport's city
        _ = shutil.copy(ROOT / f, data_folder / f)
    return Community.read()


def test_every_community_has_its_card_drawn_from_its_name_and_the_sites_card(communities: list[Community]) -> None:
    """The committed images (what each was drawn from, public/c/<key>/share.json) are of the communities' names and
    of the site's card as they are: a name, or design/share-card.html, changed without mise run render:design is
    caught here."""
    assert [c.key for c in communities] == [KEY]
    assert generate.stale_cards() == []
    assert (generate.COMMUNITY_PAGES / KEY / 'share.png').stat().st_size > 10_000


def test_a_card_is_stale_when_its_name_or_the_sites_card_changes_and_only_then(
    communities: list[Community], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A new name, or another site card: the card is stale; a card of a community that is gone, too; and its members
    and trips are not what it was drawn from, so no change to them makes it stale."""
    folder = tmp_path / 'c'
    _ = shutil.copytree(generate.COMMUNITY_PAGES, folder, ignore=shutil.ignore_patterns('*.png', '*.js', '*.html'))
    assert generate.stale_cards(folder) == []
    renamed = communities[0].model_copy(update={'name': 'Norwegians at festivals'})
    Community.write([renamed])
    assert generate.stale_cards(folder) == [KEY]
    Community.write(communities)
    # anything it is drawn from changed: the card, the script that draws it, the mark on it
    for i, f in enumerate(generate.DRAWN_FROM):
        changed = tmp_path / f.name
        _ = changed.write_bytes(f.read_bytes() + b'\n')
        with monkeypatch.context() as m:
            m.setattr(generate, 'DRAWN_FROM', (*generate.DRAWN_FROM[:i], changed, *generate.DRAWN_FROM[i + 1 :]))
            assert generate.stale_cards(folder) == [KEY], f.name
    # its members and their plans are not what it is drawn from
    Membership.write([])
    assert generate.stale_cards(folder) == []
    drawn = (folder / KEY / 'share.json').read_text(encoding='utf-8')
    assert set(generate.Drawn.model_validate_json(drawn).model_dump()) == {'key', 'name', 'design'}
    (folder / 'gone').mkdir()
    _ = (folder / 'gone' / 'share.json').write_text(drawn, encoding='utf-8')
    assert generate.stale_cards(folder) == ['gone']


def test_a_communitys_page_is_the_sites_with_its_own_head_tags(communities: list[Community]) -> None:
    """Its page is index.html, line for line, but for the head tags it has its own of: its links and files from the
    site's root, its title and og:title its name, its description the one template of its name, its image its card, a
    large one, its canonical address its own; no search engine lists it. Nothing sends a visitor anywhere else."""
    page = generate.community_page(communities[0])
    meta = dict(re.findall(r'<meta (?:property|name)="([^"]+)" content="([^"]*)"', page))
    assert '<base href="../../">' in page
    assert f'<title>{NAME} · Kiz Radar</title>' in page
    assert meta['og:title'] == NAME
    assert meta['og:description'] == meta['description'] == f'{NAME} · festival plans shared on Kiz Radar'
    assert meta['og:image'] == f'{generate.SITE}c/{KEY}/share.png'
    assert meta['og:url'] == f'{generate.SITE}c/{KEY}/'
    assert f'<link rel="canonical" href="{generate.SITE}c/{KEY}/">' in page
    assert meta['twitter:card'] == 'summary_large_image'
    assert meta['robots'] == 'noindex'
    assert 'http-equiv="refresh"' not in page
    index = generate.index_page()
    assert generate.HEAD_TAG.sub('', page) == generate.HEAD_TAG.sub('', index)
    assert '<base href="./">' in index
    assert (generate.COMMUNITY_PAGES / KEY / 'index.html').read_text(encoding='utf-8') == page


def test_a_communitys_description_is_its_name_escaped_in_the_one_template(communities: list[Community]) -> None:
    """Any name reads well in it, and a name's markup stays text."""
    assert communities
    odd = Community(key='a-b-c-d', name='Kiz & "friends"', manager='cedric', note='')
    meta = dict(re.findall(r'<meta (?:property|name)="([^"]+)" content="([^"]*)"', generate.community_page(odd)))
    assert meta['og:description'] == 'Kiz &amp; &quot;friends&quot; · festival plans shared on Kiz Radar'
    assert meta['og:title'] == 'Kiz &amp; &quot;friends&quot;'


def test_a_page_of_no_community_is_stale_and_generate_removes_it(
    communities: list[Community], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A community removed, or renamed to another key, leaves its page and image in public/c/: generate --check names
    it, and generate removes it."""
    folder = tmp_path / 'c'
    _ = shutil.copytree(generate.COMMUNITY_PAGES, folder)
    (folder / 'gone-away-for-good').mkdir()
    assert communities
    monkeypatch.setattr(generate, 'COMMUNITY_PAGES', folder)
    monkeypatch.setattr(generate, 'ROOT', tmp_path)
    assert generate.orphans() == [folder / 'gone-away-for-good']
    monkeypatch.setattr(generate, 'built', dict)
    monkeypatch.setattr('sys.argv', ['generate', '--check'])
    with pytest.raises(SystemExit, match='gone-away-for-good is the page of no community'):
        generate.main()
    monkeypatch.setattr('sys.argv', ['generate'])
    generate.main()
    assert not (folder / 'gone-away-for-good').exists()
