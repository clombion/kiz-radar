"""Write the files built from the code, or check that they still say what it does.

    mise run generate          # write them
    mise run generate:check    # exit 1 naming each one that differs

pipeline/enums.py holds the code's enums of the states and site/states.ts the site's words for them; each is
written here and nowhere else, so a new state is one row of pipeline/states.py and then this command. site/classes.ts
names the classes public/css/ defines, the only ones the site's h() takes, so a class is one rule of the stylesheet and
then this command. docs/reference/ holds the commands, the files and the states (pipeline/reference.py).
"""

import argparse
import re
import sys
from collections.abc import Callable
from pathlib import Path

from pipeline import ROOT, files, reference, states

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


FILES: dict[Path, Callable[[], str]] = {
    ROOT / 'pipeline' / 'enums.py': states.enums_module,
    ROOT / 'site' / 'states.ts': states.ts_module,
    ROOT / 'site' / 'classes.ts': classes_module,
    **reference.PAGES,
}


class Args(argparse.Namespace):
    check: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Write the files built from the code, or check them.')
    ap.add_argument('--check', action='store_true', help='exit 1 naming each file that differs, writing nothing')
    check = ap.parse_args(namespace=Args()).check
    stale = [path for path, build in FILES.items() if not path.exists() or path.read_text(encoding='utf-8') != build()]
    if check:
        if stale:
            sys.exit(
                '\n'.join(
                    f'{p.relative_to(ROOT)} differs from what it is built from: run mise run generate' for p in stale
                )
            )
        return
    for path in stale:
        files.write(path, FILES[path]())
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
