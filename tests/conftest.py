"""Every test runs on a data folder of its own: the steps read and write there, never in the repository, and a test
reads committed data only by copying it in (exports.committed). Each module also checks that the repository's files,
ignored ones included, are as it found them."""

import json
import os
from collections.abc import Iterator
from contextlib import ExitStack, closing
from pathlib import Path

import pytest

import pipeline
from pipeline import ROOT, build_site_db, db, exceptions
from pipeline.records import Spent
from tests import exports
from tests.fakes import REGISTER, Memory

# what running the checks writes, which is no data
UNWATCHED = frozenset({'.git', '.venv', 'node_modules', '__pycache__', '.pytest_cache', '.ruff_cache', '.vitest'})


def files() -> dict[str, tuple[int, int]]:
    """Each file of the repository, by its path, with its size and when it was last written."""
    out: dict[str, tuple[int, int]] = {}
    for folder, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in UNWATCHED]
        for name in names:
            if not name.startswith('.coverage'):
                path = Path(folder) / name
                st = path.stat()
                out[path.relative_to(ROOT).as_posix()] = (st.st_size, st.st_mtime_ns)
    return out


@pytest.fixture(autouse=True, scope='module')
def repository_untouched() -> Iterator[None]:
    before = files()
    yield
    after = files()
    changed = sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))
    assert not changed, f'a test in this module wrote into the repository: {changed}'


@pytest.fixture(autouse=True)
def data_folder(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The test's own data folder: a step finds there only what the test put there, and an empty spending ledger, so
    requests a test makes to a fake Claude are counted apart."""
    folder = tmp_path / 'data'
    folder.mkdir()
    monkeypatch.setattr(pipeline, 'DATA', folder)
    Spent.write([])
    return folder


@pytest.fixture(autouse=True)
def register(monkeypatch: pytest.MonkeyPatch) -> None:
    """The tests' own register of exceptions, so that a test depends on no row of the committed one."""
    monkeypatch.setattr(exceptions, 'OVERRIDES', REGISTER)


@pytest.fixture(scope='session')
def site_db(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The site database, built once from the committed export and data, for the tests that read it, with what the
    build gives the page beside it (build_site_db.SITE_JSON)."""
    folder = tmp_path_factory.mktemp('site')
    with pytest.MonkeyPatch.context() as m:
        m.setattr(pipeline, 'DATA', folder)
        exports.committed(*exports.EVERYTHING)
        out = folder / 'site.sqlite'
        site = build_site_db.build(exports.EXPORT, out)
    _ = (folder / Path(build_site_db.SITE_JSON).name).write_text(
        json.dumps(site, ensure_ascii=False, indent=1), encoding='utf-8'
    )
    return out


@pytest.fixture
def memory() -> Iterator[Memory]:
    """In-memory databases for a test, each closed when it ends."""
    with ExitStack() as opened:
        yield lambda: opened.enter_context(closing(db.memory()))
