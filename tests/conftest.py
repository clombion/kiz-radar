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
