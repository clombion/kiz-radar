"""Claims decide what no step derives: per subject, the highest source, then the latest, then the greatest id."""

import datetime as dt
import itertools
import re

import pytest
from pydantic import ValidationError

from pipeline import claims, data
from pipeline.claims import CLAIMS, Big, CityClaim, Decided, HomeClaim, Made, MergeClaim, NotServed, SiteClaim, Small
from pipeline.enums import CityTier, ClaimSource, MergeDecision, Waiting
from pipeline.records import digest
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
    with pytest.raises(ValidationError, match='the lesser first'):
        _ = MergeClaim(field='merge', keys=('p:b', 'p:a'), decision=MergeDecision.MERGE, made_at=AT, note='n')
    # a name with itself: whether it is one person or several, as the merge review asks of it (records.Pair)
    _ = MergeClaim(field='merge', keys=('p:a', 'p:a'), decision=MergeDecision.SEPARATE, made_at=AT, note='n')
    with pytest.raises(ValidationError, match="'XX' is no country"):
        _ = home('XX')
    with pytest.raises(ValidationError, match='to itself'):
        _ = SiteClaim(field='site', host='h', instead_of=Waiting.RECIPE, then=Waiting.RECIPE, made_at=AT, note='n')


def city(decision: Big | Small | NotServed, at: dt.datetime = AT) -> CityClaim:
    return CityClaim(field='city', key='lisbon-pt', decision=decision, made_at=at, note='n')


@pytest.mark.parametrize(
    'decision',
    [
        {'tier': 'small', 'gateways': ['LIS', 'OPO', 'FAO', 'SVQ']},  # more than a smaller city flies to
        {'tier': 'small', 'gateways': []},
        {'tier': 'big', 'gateways': []},
        {'tier': 'big', 'gateways': ['LIS', 'LIS']},  # an airport twice
        {'tier': 'not_served', 'gateways': ['LIS']},  # no airport is one too far to fly to
        {'tier': 'small', 'gateways': ['Lisbon']},  # no IATA code
    ],
)
def test_a_city_decision_names_the_airports_its_tier_allows(decision: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _ = claims.CLAIM.validate_python(
            {'field': 'city', 'key': 'lisbon-pt', 'decision': decision, 'made_at': AT, 'note': 'n'}
        )


def test_a_decision_of_each_tier_is_its_airports_or_none() -> None:
    made = [
        city(Big(tier=CityTier.BIG, gateways=('CDG', 'ORY', 'BVA'))),
        city(Small(tier=CityTier.SMALL, gateways=('GLA', 'EDI', 'PIK'))),
        city(NotServed(tier=CityTier.NOT_SERVED)),
    ]
    assert [claims.CLAIM.validate_json(claims.text(c)) for c in made] == made  # each read back as written


def test_a_proposal_is_the_model_s_and_the_admin_s_claim_on_its_city_overrides_it() -> None:
    """The research session proposes a decision (PROPOSALS), of the model channel; the admin's claim on the city is
    apart from it, whenever either was made, and the queue lists the city until the admin decides it."""
    proposed = city(Small(tier=CityTier.SMALL, gateways=('LIS', 'OPO')), AT + dt.timedelta(days=1))
    claims.propose([proposed])
    assert [m for m in claims.model() if m.claim == proposed] == [Made(proposed, ClaimSource.MODEL)]
    assert claims.decisions() == claims.Decisions(admin={}, proposed={'lisbon-pt': proposed})
    admin = city(NotServed(tier=CityTier.NOT_SERVED))
    claims.write([admin])
    assert claims.decisions() == claims.Decisions(admin={'lisbon-pt': admin}, proposed={'lisbon-pt': proposed})
    assert claims.resolved(claims.every())[('city', 'lisbon-pt')] == Made(admin, ClaimSource.ADMIN)


def test_the_proposals_hold_a_city_s_decision_and_nothing_else() -> None:
    """A merge claim in the proposals folder, named by its digest, is refused, and stops the run naming it."""
    one = merge(MergeDecision.MERGE)
    path = data(claims.PROPOSALS) / f'{digest(claims.text(one))}.json'
    path.parent.mkdir(parents=True)
    _ = path.write_text(claims.text(one), encoding='utf-8')
    assert isinstance(claims.parsed(path, claims.PROPOSALS), list)
    with pytest.raises(SystemExit, match=re.escape(f'{claims.PROPOSALS}/{path.name}')):
        _ = claims.model()
