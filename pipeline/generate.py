"""Write the files built from the code, or check that they still say what it does.

    mise run generate          # write them
    mise run generate:check    # exit 1 naming each one that differs

pipeline/enums.py holds the code's enums of the states and site/states.ts the site's words for them; each is
written here and nowhere else, so a new state is one row of pipeline/states.py and then this command. site/classes.ts
names the classes public/css/ defines, the only ones the site's h() takes, so a class is one rule of the stylesheet and
then this command. lint/states.grit refuses a state's key written in quotes on the site, from the same keys.
public/index.html and public/site.webmanifest name the home city (pipeline/airports.csv's home)
where crawlers and installs read it, without the scripts. docs/reference/ holds the commands, the files and the
states (pipeline/reference.py). public/c/<key>/index.html is a community's page for a shared link
(pipeline/communities.csv); its image, public/c/<key>/share.png, is drawn by mise run render:design, with what it was
drawn from beside it (share.json), which stale_cards compares with the data.
"""

import argparse
import hashlib
import html
import json
import re
import sys
from collections.abc import Callable
from pathlib import Path

from pydantic import BaseModel

from pipeline import ROOT, airports, files, reference, states
from pipeline.records import Community

CSS = ROOT / 'public' / 'css'
COMMENT = re.compile(r'/\*.*?\*/', re.DOTALL)
URL = re.compile(r'url\([^)]*\)')
CLASS = re.compile(r'\.(-?[A-Za-z_][\w-]*)')


def classes_module() -> str:
    """site/classes.ts: the class names the stylesheets define (Leaflet's own aside, which Leaflet sets)."""
    text = ''.join(URL.sub('', COMMENT.sub('', f.read_text(encoding='utf-8'))) for f in sorted(CSS.glob('*.css')))
    found: list[str] = CLASS.findall(text)
    names = sorted({m for m in found if not m.startswith('leaflet-')})
    union = ''.join(f"\n  | '{n}'" for n in names)
    return (
        '// The classes public/css/ defines, written by pipeline/generate.py (mise run generate): the only ones\n'
        "// dom.ts's h() takes, so an element can't be given a class no rule styles.\n"
        f'export type ClassName ={union};\n'
    )


# the rule, with KEYS where the keys go: a key in quotes, where it is compared or passed in a module of site/
STATES_RULE = r"""language js

// Written by pipeline/generate.py (mise run generate) from the keys of the states the site shows
// (pipeline/states.py). A state is compared and passed as KEY.<point>.<NAME>, which the compiler holds to the table:
// a key in quotes where one is compared (===, !==, a switch's case) or passed (a call's argument) is refused, whatever
// else the code calls by the same name. plural() takes words, not states.
pattern state_key() {
  or { JsStringLiteralExpression(), JsTemplateExpression() } as $key where {
    $key <: r"^['\"`](?:KEYS)['\"`]$",
    register_diagnostic(span=$key, message="Write a state as KEY.<point>.<NAME> (site/states.ts), held to the table.")
  }
}

or { JsCallExpression(), JsBinaryExpression(), JsCaseClause() } as $use where {
  $filename <: r".*/site/[^/]+\.ts",
  $filename <: not r"(?:.*/)?tests/.*",
  $use <: or {
    `$f($args)` where { $f <: not `plural`, $args <: some state_key() },
    or { `$a === $b`, `$a !== $b`, `$a == $b`, `$a != $b` } where { or { $a <: state_key(), $b <: state_key() } },
    JsCaseClause(test=$test) where { $test <: state_key() }
  }
}
"""


def states_rule() -> str:
    """lint/states.grit: Biome's plugin refusing a state's key written in quotes where a state is compared or passed,
    so the site reads each through KEY (site/states.ts), which the compiler holds to the table."""
    return STATES_RULE.replace('KEYS', '|'.join(sorted({k for p in states.SITE_POINTS for k in states.keys(p)})))


INDEX = ROOT / 'public' / 'index.html'
MANIFEST = ROOT / 'public' / 'site.webmanifest'
HOME_SPAN = re.compile(r'<span data-home-city>([^<]*)</span>')
HOME_META = re.compile(r'<meta [^>]*\bdata-home-city\b[^>]*>')
HOME_IN_MANIFEST = re.compile(r'("description": "[^"]* from )([^".]+)')


def home_city() -> str:
    (city,) = [a.city for a in airports.known() if a.home]
    return city


def index_page() -> str:
    """public/index.html with the home city in each element marked data-home-city: a span's text, and the city a
    meta tag's content names (the one the page's first span names), for the crawlers that read the page without its
    scripts."""
    text = INDEX.read_text(encoding='utf-8')
    found = HOME_SPAN.search(text)
    if found is None:
        sys.exit(f'{INDEX.relative_to(ROOT)} has no <span data-home-city> to name the home city in')
    was, city = found.group(1), html.escape(home_city())
    text = HOME_SPAN.sub(lambda _: f'<span data-home-city>{city}</span>', text)
    return HOME_META.sub(lambda m: m.group(0).replace(was, city), text)


def manifest() -> str:
    """public/site.webmanifest with the home city its description names, for an installed site's listing."""
    text = MANIFEST.read_text(encoding='utf-8')
    city = json.dumps(home_city(), ensure_ascii=False)[1:-1]
    return HOME_IN_MANIFEST.sub(lambda m: m.group(1) + city, text)


SITE = 'https://clombion.github.io/kiz-radar/'  # where the site is published, as public/index.html's canonical link
COMMUNITY_PAGES = ROOT / 'public' / 'c'  # a community's page for a shared link and its image, by its key, under it
SHARE_CARD = ROOT / 'design' / 'share-card.html'  # the site's share card, of which a community's is a variant
# what a community's page for a shared link may load: its redirect's script, and nothing else
# a community's description where its link is shared, made of its name alone, so that no change to its data changes it
COMMUNITY_SAID = '{name} · festival plans shared on Kiz Radar'
COMMUNITY_CSP = "default-src 'none'; script-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"


def community_page(c: Community) -> str:
    """A community's page for a shared link (public/c/<key>/index.html), since a static host serves a page at its
    path, never its hash, and chat apps read it without its scripts: its name as the title, a description that its
    data changing never changes, its image (public/c/<key>/share.png), and at once on to its page on the site (a
    refresh, and public/c/redirect.js where scripts run); no search engine lists it."""
    key, name = c.key, html.escape(c.name)
    said = COMMUNITY_SAID.format(name=name)
    there = f'../../#community/{key}'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- a community's page for a shared link (pipeline/generate.py): what chat apps and social sites read of it, and at
     once on to its page on the site -->
<meta http-equiv="Content-Security-Policy" content="{COMMUNITY_CSP}">
<meta name="robots" content="noindex">
<meta name="kiz-community" content="{key}">
<meta http-equiv="refresh" content="0; url={there}">
<title>{name} · Kiz Radar</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kiz Radar">
<meta property="og:title" content="{name}">
<meta property="og:description" content="{said}">
<meta property="og:url" content="{SITE}c/{key}/">
<meta property="og:image" content="{SITE}c/{key}/share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{name}, on Kiz Radar’s card">
<meta name="twitter:card" content="summary_large_image">
<script src="../redirect.js"></script>
</head>
<body>
<p><a href="{there}">{name} on Kiz Radar</a></p>
</body>
</html>
"""


class Drawn(BaseModel, frozen=True):
    """What a community's share image was drawn from (public/c/<key>/share.json, by mise run render:design): its
    name, and the site's share card it is a variant of, by its file's digest."""

    key: str
    name: str
    design: str


def drawn_now(c: Community) -> Drawn:
    """What a community's share image is drawn from now."""
    return Drawn(key=c.key, name=c.name, design=hashlib.sha256(SHARE_CARD.read_bytes()).hexdigest())


def stale_cards(folder: Path = COMMUNITY_PAGES) -> list[str]:
    """The communities whose share image was drawn from another name or another site card (or that have none, or are
    no community now): theirs to draw again, with mise run render:design."""
    now = {c.key: drawn_now(c) for c in Community.read()}
    drawn = {
        p.parent.name: Drawn.model_validate_json(p.read_text(encoding='utf-8')) for p in folder.glob('*/share.json')
    }
    return sorted(k for k in now.keys() | drawn.keys() if drawn.get(k) != now.get(k))


def built() -> dict[Path, Callable[[], str]]:
    """Every file built from the code, each community's page among them."""
    pages = {COMMUNITY_PAGES / c.key / 'index.html': (lambda c=c: community_page(c)) for c in Community.read()}
    return {**FILES, **pages}


FILES: dict[Path, Callable[[], str]] = {
    ROOT / 'pipeline' / 'enums.py': states.enums_module,
    ROOT / 'site' / 'states.ts': states.ts_module,
    ROOT / 'site' / 'classes.ts': classes_module,
    ROOT / 'lint' / 'states.grit': states_rule,
    INDEX: index_page,
    MANIFEST: manifest,
    **reference.PAGES,
}


class Args(argparse.Namespace):
    check: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Write the files built from the code, or check them.')
    ap.add_argument('--check', action='store_true', help='exit 1 naming each file that differs, writing nothing')
    check = ap.parse_args(namespace=Args()).check
    files_built = built()
    stale = [
        path for path, build in files_built.items() if not path.exists() or path.read_text(encoding='utf-8') != build()
    ]
    if check:
        if stale:
            sys.exit(
                '\n'.join(
                    f'{p.relative_to(ROOT)} differs from what it is built from: run mise run generate' for p in stale
                )
            )
        return
    for path in stale:
        files.write(path, files_built[path]())
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
