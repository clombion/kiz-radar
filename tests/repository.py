"""The repository as git has it, for the tests that hold what is committed; and as the file system has it, for the guard
that holds every test to writing none of it (conftest.py)."""

import os
import subprocess
from pathlib import Path

from pipeline import ROOT, build_site_db

# what builds make (build:site's folders, build_site_db's files), which build:data writes beside the tests while the
# checks run (for the site's tests): never committed, and no test's to write; *.building and its journal are a build's
# half-written database. .gitignore lists each (tests/test_structure.py holds the two to one another).
BUILT = ('public/js/', 'public/vendor/', build_site_db.OUT, build_site_db.SITE_JSON, build_site_db.REVIEW_JSON)
BUILDING = f'{build_site_db.SITE_DATA}/*.building*'  # as .gitignore writes it
# what running the checks writes, which is no data
UNWATCHED = frozenset({'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', '.ruff_cache', '.vitest'})


def built(path: str) -> bool:
    """Whether a path, from the repository, is one a build makes."""
    return path.startswith(BUILT) or (path.startswith(build_site_db.SITE_DATA) and '.building' in path)


def git(*args: str, cwd: Path = ROOT) -> str:
    """What git prints, run on the repository (or the one at cwd)."""
    command = ['git', *args]
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=True).stdout  # noqa: S603 (git, on a repository of the tests)


def tracked(*patterns: str) -> list[str]:
    """The committed files matching git's pathspecs, by their paths from the repository."""
    return git('ls-files', '--', *patterns).split()


def files(root: Path = ROOT) -> dict[str, tuple[int, int]]:
    """Each file under root, by its path from it, with its size and when it was last written, whatever git makes of it
    (ignored, already changed, untracked); what builds make aside, which build:data writes while the tests run (mise run
    check)."""
    out: dict[str, tuple[int, int]] = {}
    for folder, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in UNWATCHED]
        for name in names:
            path = Path(folder) / name
            if not (name.startswith('.coverage') or built(at := path.relative_to(root).as_posix())):
                st = path.stat()
                out[at] = (st.st_size, st.st_mtime_ns)
    return out


def wrote(before: dict[str, tuple[int, int]], after: dict[str, tuple[int, int]]) -> list[str]:
    """The files written, made or removed between two of files()'s readings."""
    return sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))
