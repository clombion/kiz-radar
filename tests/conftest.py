"""Every test leaves the repository's data as it found it: a test module writing into pipeline/, docs/ or source/
fails."""

import shutil
import sqlite3
import subprocess
from collections.abc import Iterator
from contextlib import ExitStack, closing
from pathlib import Path

import pytest

from pipeline import ROOT, prompt, spend
from tests.fakes import Memory


def data_status() -> str:
    return subprocess.run(
        ['git', 'status', '--porcelain', '--untracked-files=all', '--', 'pipeline', 'docs', 'source'],  # noqa: S607 (git, from PATH)
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout


@pytest.fixture(autouse=True, scope='module')
def repository_untouched() -> Iterator[None]:
    before = data_status()
    yield
    assert data_status() == before, 'a test in this module wrote into the repository'


@pytest.fixture(autouse=True)
def spend_ledger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Requests a test makes to a fake Claude go in a ledger of its own."""
    monkeypatch.setattr(spend, 'LEDGER', tmp_path / 'spend.csv')


@pytest.fixture(autouse=True)
def prompts_asked(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Prompts a test asks are archived in a folder of its own; the archive's own prompts can still be read."""
    asked = tmp_path / 'asked'
    asked.mkdir()
    if prompt.ASKED.exists():
        _ = shutil.copytree(prompt.ASKED, asked, dirs_exist_ok=True)
    monkeypatch.setattr(prompt, 'ASKED', asked)


@pytest.fixture
def memory() -> Iterator[Memory]:
    """In-memory databases for a test, each closed when it ends."""
    with ExitStack() as opened:
        yield lambda: opened.enter_context(closing(sqlite3.connect(':memory:')))
