"""Every test runs on a data folder of its own: the steps read and write there, never in the repository, and a test
reads committed data only by copying it in (exports.committed). Each module also checks that the repository's files,
ignored ones included, are as it found them."""

import json
from collections.abc import Iterator
from contextlib import ExitStack
from pathlib import Path

import pytest

import pipeline
from pipeline import build_site_db, claims, db
from pipeline.records import Spent, StatusRow
from tests import exports
from tests.fakes import SITE_CLAIMS, Memory
from tests.repository import files, wrote


@pytest.fixture(autouse=True, scope='module')
def repository_untouched() -> Iterator[None]:
    before = files()
    yield
    assert not (changed := wrote(before, files())), f'a test in this module wrote into the repository: {changed}'


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
def site_claims(data_folder: Path) -> None:
    """The tests' own claims in the test's data folder, so that a test depends on no claim of the committed ones."""
    claims.write(SITE_CLAIMS)


@pytest.fixture(scope='session')
def site_db(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The site database, built once from the committed export and data, for the tests that read it, with what the
    build gives the pages beside it (build_site_db.SITE_JSON, REVIEW_JSON)."""
    folder = tmp_path_factory.mktemp('site')
    with pytest.MonkeyPatch.context() as m:
        m.setattr(pipeline, 'DATA', folder)
        exports.committed(*exports.EVERYTHING)
        claims.write(SITE_CLAIMS)
        StatusRow.write([])  # the build says what festivals wait for from their files, not from status.csv
        out = folder / 'site.sqlite'
        made = build_site_db.build(exports.EXPORT, out)
    _ = (folder / Path(build_site_db.SITE_JSON).name).write_text(
        json.dumps(made.site, ensure_ascii=False, indent=1), encoding='utf-8'
    )
    _ = (folder / Path(build_site_db.REVIEW_JSON).name).write_text(made.review.model_dump_json(), encoding='utf-8')
    return out


@pytest.fixture
def memory() -> Iterator[Memory]:
    """In-memory databases for a test, each closed when it ends."""
    with ExitStack() as opened:
        yield lambda: opened.enter_context(db.memory())
