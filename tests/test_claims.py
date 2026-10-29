"""Claims decide what no step derives: per subject, the highest source, then the latest, then the greatest id."""

import datetime as dt
import itertools

import pytest
from pydantic import ValidationError

from pipeline import claims, data
from pipeline.claims import CLAIMS, Decided, HomeClaim, Made, MergeClaim, SiteClaim
from pipeline.enums import ClaimSource, MergeDecision, Waiting
from tests.fakes import AT, SITE_CLAIMS


def merge(decision: Decided, at: dt.datetime = AT, note: str = 'n') -> MergeClaim:
    return MergeClaim(field='merge', keys=('p:a', 'p:b'), decision=decision, made_at=at, note=note)


def home(country: str, at: dt.datetime = AT) -> HomeClaim:
    return HomeClaim(field='home', key='p:a', country=country, made_at=at, note='n')


MADE: list[Made] = [
    Made(merge(MergeDecision.MERGE), ClaimSource.MODEL),
    Made(merge(MergeDecision.SEPARATE, AT - dt.timedelta(days=9)), ClaimSource.ADMIN),
    Made(merge(MergeDecision.MERGE, AT + dt.timedelta(days=1)), ClaimSource.MODEL),
    Made(home('PT'), ClaimSource.ADMIN),
    Made(home('AO', AT + dt.timedelta(days=1)), ClaimSource.ADMIN),
    Made(home('CV', AT + dt.timedelta(days=1)), ClaimSource.ADMIN),  # as late: the greater id decides
]


def test_the_outcome_is_one_function_of_the_claims_whatever_their_order_or_repeats() -> None:
    once = claims.resolved(MADE)
    for order in itertools.permutations(MADE):  # every order, and each with some of its claims again
        assert claims.resolved(order) == once
        assert claims.resolved([*order, *order[:3]]) == once


def test_an_admin_claim_beats_any_model_claim_and_a_later_claim_an_earlier() -> None:
    decided = claims.resolved(MADE)
    pair = decided[('merge', 'p:a', 'p:b')].claim
    assert isinstance(pair, MergeClaim)
    assert pair.decision == MergeDecision.SEPARATE  # the admin's, though older
    ao, cv = (Made[HomeClaim](home(c, AT + dt.timedelta(days=1)), ClaimSource.ADMIN) for c in ('AO', 'CV'))
    assert decided[('home', 'p:a')] == max(ao, cv, key=lambda m: m.rank())


def test_a_claim_is_written_once_and_read_as_admin_whatever_it_says() -> None:
    claims.write([merge(MergeDecision.MERGE), merge(MergeDecision.MERGE)])
    files = sorted(data(CLAIMS).glob('*.json'))
    assert len(files) == len(SITE_CLAIMS) + 1  # writing a claim again changes nothing
    assert {m.source for m in claims.admin()} == {ClaimSource.ADMIN}


def test_a_file_that_says_its_source_or_is_misnamed_stops_the_run() -> None:
    text = claims.text(merge(MergeDecision.MERGE))
    bad = data(CLAIMS) / f'{claims.digest(text)}.json'
    _ = bad.write_text(text.replace('"field"', '"source": "model",\n "field"'), encoding='utf-8')
    with pytest.raises(SystemExit, match='source'):
        _ = claims.admin()
    bad.unlink()
    _ = (data(CLAIMS) / 'any.json').write_text(text, encoding='utf-8')
    with pytest.raises(SystemExit, match='named by its digest'):
        _ = claims.admin()


def test_an_empty_claims_folder_is_a_submodule_not_checked_out() -> None:
    for p in data(CLAIMS).iterdir():
        p.unlink()
    with pytest.raises(SystemExit, match='submodule'):
        _ = claims.admin()


def test_a_claim_is_typed_and_changes_something() -> None:
    with pytest.raises(ValidationError):
        _ = MergeClaim(field='merge', keys=('p:b', 'p:a'), decision=MergeDecision.MERGE, made_at=AT, note='n')
    with pytest.raises(ValidationError):
        _ = home('XX')  # no country
    with pytest.raises(ValidationError, match='to itself'):
        _ = SiteClaim(field='site', host='h', instead_of=Waiting.RECIPE, then=Waiting.RECIPE, made_at=AT, note='n')
