"""The repository as git has it, for the tests that hold what is committed."""

import subprocess

from pipeline import ROOT, build_site_db

# what builds make (build:site's folders, build_site_db's files), which build:data writes beside the tests while the
# checks run (for the site's tests): never committed, and no test's to write; *.building and its journal are a build's
# half-written database
BUILT = ('public/js/', 'public/vendor/', build_site_db.OUT, build_site_db.SITE_JSON, build_site_db.REVIEW_JSON)


def built(path: str) -> bool:
    """Whether a path, from the repository, is one a build makes."""
    return path.startswith(BUILT) or (path.startswith(build_site_db.SITE_DATA) and '.building' in path)


def tracked(*patterns: str) -> list[str]:
    """The committed files matching git's pathspecs, by their paths from the repository."""
    ls = ['git', 'ls-files', '--', *patterns]
    return subprocess.run(ls, cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()  # noqa: S603 (git, on this repository)
