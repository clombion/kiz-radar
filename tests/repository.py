"""The repository as git has it, for the tests that hold what is committed."""

import subprocess

from pipeline import ROOT


def tracked(*patterns: str) -> list[str]:
    """The committed files matching git's pathspecs, by their paths from the repository."""
    ls = ['git', 'ls-files', '--', *patterns]
    return subprocess.run(ls, cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()  # noqa: S603 (git, on this repository)
