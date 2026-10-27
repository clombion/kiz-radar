"""Every test leaves the repository's data as it found it: a test module writing into pipeline/, docs/ or source/ fails."""
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent


def data_status():
    return subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all', '--', 'pipeline', 'docs', 'source'],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout


@pytest.fixture(autouse=True, scope="module")
def repository_untouched():
    before = data_status()
    yield
    assert data_status() == before, 'a test in this module wrote into the repository'


@pytest.fixture(autouse=True)
def spend_ledger(tmp_path, monkeypatch):
    """Requests a test makes to a fake Claude go in a ledger of its own."""
    from pipeline import spend
    monkeypatch.setattr(spend, 'LEDGER', tmp_path / 'spend.csv')


@pytest.fixture(autouse=True)
def prompts_asked(tmp_path, monkeypatch):
    """Prompts a test asks are archived in a folder of its own; the archive's own prompts can still be read."""
    import shutil
    from pipeline import prompt
    asked = tmp_path / 'asked'
    asked.mkdir()
    if prompt.ASKED.exists():
        shutil.copytree(prompt.ASKED, asked, dirs_exist_ok=True)
    monkeypatch.setattr(prompt, 'ASKED', asked)
