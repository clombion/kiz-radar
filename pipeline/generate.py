"""Write the files built from pipeline/states.py, or check that they still say what it does.

    uv run -m pipeline.generate          # write them
    uv run -m pipeline.generate --check  # exit 1 naming each one that differs

pipeline/enums.py holds the code's enums of the states, docs/js/states.js the site's words for them; each is
written here and nowhere else, so a new state is one row of pipeline/states.py and then this command.
"""

import argparse
import sys
from collections.abc import Callable
from pathlib import Path

from pipeline import states

ROOT = Path(__file__).parent.parent
FILES: dict[Path, Callable[[], str]] = {
    ROOT / 'pipeline' / 'enums.py': states.enums_module,
    ROOT / 'docs' / 'js' / 'states.js': states.js_module,
}


class Args(argparse.Namespace):
    check: bool = False


def main() -> None:
    ap = argparse.ArgumentParser(description='Write the files built from pipeline/states.py, or check them.')
    ap.add_argument('--check', action='store_true', help='exit 1 naming each file that differs, writing nothing')
    check = ap.parse_args(namespace=Args()).check
    stale = [path for path, build in FILES.items() if not path.exists() or path.read_text(encoding='utf-8') != build()]
    if check:
        if stale:
            sys.exit(
                '\n'.join(
                    f'{p.relative_to(ROOT)} differs from pipeline/states.py: run mise run generate' for p in stale
                )
            )
        return
    for path in stale:
        _ = path.write_text(FILES[path](), encoding='utf-8')
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
