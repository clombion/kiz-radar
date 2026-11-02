"""The review dashboard's read model (pipeline/review.py), as the build writes it beside the site's database: a claim
the dashboard writes for a home names a key a mention produces, so it is never orphaned; a pair an admin's claim
decides is not asked again; and the festivals listed are exactly those an agent or the admin settles."""

from pathlib import Path

from pydantic import BaseModel

from pipeline import build_site_db, review
from pipeline import db as sqlite_db
from pipeline.enums import HomeBasis
from pipeline.records import StatusRow
from tests import exports


class KeyOf(BaseModel):
    match_key: str
    artist_id: int


def built(site_db: Path) -> review.Review:
    return review.Review.model_validate_json((site_db.parent / Path(build_site_db.REVIEW_JSON).name).read_bytes())


def test_a_home_is_named_by_a_key_a_mention_produces(site_db: Path) -> None:
    r = built(site_db)
    with sqlite_db.opened(exports.EXPORT, 'ro') as db:
        produced = set(db.column(str, 'select match_key from artist_keys where produced = 1'))
    assert r.homes
    assert [h.key for h in r.homes if h.key not in produced] == []


def test_a_home_listed_is_unknown_or_contested(site_db: Path) -> None:
    r = built(site_db)
    with sqlite_db.opened(exports.EXPORT, 'ro') as db:
        artist_of = {k.match_key: k.artist_id for k in db.rows(KeyOf, 'select match_key, artist_id from artist_keys')}
    with sqlite_db.opened(site_db, 'ro') as db:
        unknown = set(db.column(int, 'select artist_id from artist_stats where home_country is null'))
    assert {h.basis for h in r.homes} <= {None, HomeBasis.CONTESTED}
    assert sorted(artist_of[h.key] for h in r.homes) == sorted(unknown)


def test_no_pair_an_admin_decides_is_asked_again(site_db: Path) -> None:
    r = built(site_db)
    with sqlite_db.opened(exports.EXPORT, 'ro') as db:
        rows = db.rows(review.ClaimRow, 'select id, subject, claim, source, state from claims')
    decided = review.admin_pairs(rows)
    assert decided
    assert [(m.a.key, m.b.key) for m in r.merges if (m.a.key, m.b.key) in decided] == []


def test_the_festivals_are_those_an_agent_or_the_admin_settles(site_db: Path) -> None:
    exports.committed(StatusRow.FILE)
    acted = {
        r.event_id
        for r in StatusRow.read()
        if ('waits_for', r.waits_for) in review.ACTED_ON or ('first_read', r.first_read) in review.ACTED_ON
    }
    assert {f.event_id for f in built(site_db).festivals} == acted
