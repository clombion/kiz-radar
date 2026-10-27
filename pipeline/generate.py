"""Write the files built from pipeline/states.py, or check that they still say what it does.

    uv run -m pipeline.generate          # write them
    uv run -m pipeline.generate --check  # exit 1 naming each one that differs

pipeline/enums.py holds the code's enums of the states, site/states.ts the site's words for them and
pipeline/STATES.md's table the data points; each is written here and nowhere else, so a new state is one row of
pipeline/states.py and then this command.
"""

import argparse
import sys
from collections.abc import Callable
from pathlib import Path

from pipeline import states

ROOT = Path(__file__).parent.parent
STATES_MD = ROOT / 'pipeline' / 'STATES.md'
BEGIN = '<!-- generated from pipeline/states.py (states.points_table): mise run generate -->'
END = '<!-- points:end -->'


def states_md() -> str:
    """pipeline/STATES.md with its table of the data points written between its markers; the rest is prose."""
    text = STATES_MD.read_text(encoding='utf-8')
    head, rest = text.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    return f'{head}{BEGIN}\n\n{states.points_table()}\n\n{END}{tail}'


FILES: dict[Path, Callable[[], str]] = {
    ROOT / 'pipeline' / 'enums.py': states.enums_module,
    ROOT / 'site' / 'states.ts': states.ts_module,
    STATES_MD: states_md,
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
