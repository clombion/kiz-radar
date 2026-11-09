"""Claims decide the facts no step can derive: that two artists are one, where an artist is from, which artist a
festival's line-up means, what a ticket site waits for, which country a city the source names is in, and which
airports dancers fly to for a city.

A claim is a record of what it says, about one subject, when it was made, with a note. Its source is the channel that
delivers it, never read from the claim itself, and its source gives its priority (states.py, claim_source: admin above
organiser above model). Per subject, the claim that comes first decides it: the highest source, then the latest made,
then the one whose id (the digest of its text) is greatest, so that the outcome is one function of the set of claims,
whatever their order (resolved).

The admin channel is the repository clombion/kiz-radar-claims, which kiz-radar holds as a git submodule (CLAIMS): one
JSON file per claim, named by its digest, so that writing a claim again changes nothing and two claims never share a
file. The model channel is the merge review's answers to its current prompt (pipeline/extract/merge_review.py), each
made when it was answered, and the research session's proposals (PROPOSALS, files as the admin's are: propose).
"""

import datetime as dt
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, NamedTuple, Self

from pydantic import AfterValidator, Discriminator, Field, TypeAdapter, ValidationError, model_validator

from pipeline import data, files, states
from pipeline.enums import CityTier, ClaimSource, MergeDecision, Waiting
from pipeline.extract import merge_review
from pipeline.records import CityKey, CountryCode, Iata, Key, Record, Spelling, Stamp, Text, digest, errors

CLAIMS = 'claims'  # the submodule of clombion/kiz-radar-claims: every admin claim, <its digest>.json
PROPOSALS = 'pipeline/proposals'  # the research session's claims, of the model channel: <its digest>.json


Decided = Literal[MergeDecision.MERGE, MergeDecision.SEPARATE]  # what a merge claim decides; unsure decides nothing


class MergeClaim(Record):
    """Whether two artists, by their keys, are one; or, of a key with itself, whether its name is one person or
    several (records.Pair), which leaves the artists as they are and settles the pair's review."""

    field: Literal['merge']
    keys: tuple[Key, Key]
    decision: Decided
    made_at: Stamp
    note: Text

    @model_validator(mode='after')
    def in_order(self) -> Self:
        if self.keys[0] > self.keys[1]:
            raise ValueError('a pair is written in key order, the lesser first, so that it is written one way')
        return self


class HomeClaim(Record):
    """Where an artist, by their key, is from."""

    field: Literal['home']
    key: Key
    country: CountryCode
    made_at: Stamp
    note: Text


class BookingClaim(Record):
    """That one festival's line-up means another artist than the one its mention resolves to."""

    field: Literal['booking']
    event_id: int
    from_key: Key
    to_key: Key
    made_at: Stamp
    note: Text


class SiteClaim(Record):
    """That every festival whose ticket page is on a site waits for something else than it would by default."""

    field: Literal['site']
    host: Text
    instead_of: Waiting
    then: Waiting
    made_at: Stamp
    note: Text

    @model_validator(mode='after')
    def departs(self) -> Self:
        if self.instead_of == self.then:
            raise ValueError(f'{self.host}: an override from {self.then} to itself')
        return self


class PlaceClaim(Record):
    """That a city as the source DB spells it, with the country it is listed under (none when it names none), is in
    another country, where it is looked for instead (pipeline/cities.py): Porto, listed under France, is in Portugal."""

    field: Literal['place']
    city: Text
    country: Text | None
    is_in: CountryCode
    made_at: Stamp
    note: Text


def distinct(codes: tuple[str, ...]) -> tuple[str, ...]:
    if len(set(codes)) < len(codes):
        raise ValueError(f'an airport named twice: {", ".join(codes)}')
    return codes


Gateways = Annotated[tuple[Iata, ...], AfterValidator(distinct)]  # airports, the quickest into the city first


class Big(Record):
    """A big city: its main airports, every one dancers fly to."""

    tier: Literal[CityTier.BIG]
    gateways: Annotated[Gateways, Field(min_length=1)]


class Small(Record):
    """A smaller city: its practical gateways, up to states.MOST_GATEWAYS."""

    tier: Literal[CityTier.SMALL]
    gateways: Annotated[Gateways, Field(min_length=1, max_length=states.MOST_GATEWAYS)]


class NotServed(Record):
    """A city no airport is near enough to be worth a flight from home."""

    tier: Literal[CityTier.NOT_SERVED]

    @property
    def gateways(self) -> tuple[str, ...]:
        """None, as no airport is flown to."""
        return ()


class CityClaim(Record):
    """Which airports dancers fly to for a city, by its key (records.City), each ordered by the time from it into the
    city, the first to be searched for any flight and the others for direct ones; or that none is. The review dashboard
    lists the cities no admin decision is of, with the research session's proposal."""

    field: Literal['city']
    key: CityKey
    decision: Annotated[Big | Small | NotServed, Discriminator('tier')]
    made_at: Stamp
    note: Text  # why: the times measured, what dancers say


type AnyClaim = MergeClaim | HomeClaim | BookingClaim | SiteClaim | PlaceClaim | CityClaim
type Claim = Annotated[AnyClaim, Discriminator('field')]
CLAIM: TypeAdapter[AnyClaim] = TypeAdapter(Claim)
PROPOSAL: TypeAdapter[CityClaim] = TypeAdapter(CityClaim)  # the one kind the research session proposes
# what each folder of claim files may hold: the admin's any claim, the research session's a city's decision
READ: Mapping[str, Callable[[bytes], AnyClaim]] = {CLAIMS: CLAIM.validate_json, PROPOSALS: PROPOSAL.validate_json}
PRIORITY = {s: i for i, s in enumerate(reversed(states.keys('claim_source')))}  # the higher, the earlier it comes


def subject(c: AnyClaim) -> tuple[str, ...]:
    """What a claim decides: its field, and the thing of that field it is about."""
    match c:
        case MergeClaim():
            return ('merge', *c.keys)
        case HomeClaim():
            return ('home', c.key)
        case BookingClaim():
            return ('booking', str(c.event_id), c.from_key)
        case SiteClaim():
            return ('site', c.host)
        case PlaceClaim():
            return ('place', c.city, c.country or '')
        case CityClaim():
            return ('city', c.key)


@dataclass(frozen=True)
class Made[C: AnyClaim = AnyClaim]:
    """A claim, the channel it came by, and its id: the digest of its text."""

    claim: C
    source: ClaimSource

    @property
    def id(self) -> str:
        return digest(text(self.claim))

    def rank(self) -> tuple[int, dt.datetime, str]:
        return PRIORITY[self.source], self.claim.made_at, self.id


def text(c: AnyClaim) -> str:
    """A claim as its file holds it."""
    return c.dumped()


def parsed(path: Path, folder: str = CLAIMS) -> AnyClaim | list[str]:
    """A claim file's claim, or why it is none: its folder holds no claim of its kind (READ), or it is not named by
    its digest."""
    try:
        c = READ[folder](path.read_bytes())
    except ValidationError as e:
        return errors(e, f'{folder}/{path.name}')
    if path.stem != (named := digest(text(c))):
        return [f'{folder}/{path.name}: a claim is named by its digest, {named}.json']
    return c


def claim_files(folder: str = CLAIMS) -> list[Path]:
    return sorted(data(folder).glob('*.json'))


def filed(folder: str, source: ClaimSource) -> list[Made]:
    """Every claim of a folder of claim files, each named by its digest, of the channel the folder is; a file its
    record refuses, or misnamed, stops the run naming it."""
    out: list[Made] = []
    refused: list[str] = []
    for path in claim_files(folder):
        match parsed(path, folder):
            case list() as why:
                refused += why
            case c:
                out.append(Made(c, source))
    if refused:
        raise SystemExit('\n'.join(refused))
    return out


def admin() -> list[Made]:
    """Every claim of the claims repository, each a file named by its digest, its source admin whatever it says (a
    file that says its source is refused, as a claim has no such field)."""
    folder = data(CLAIMS)
    if not folder.is_dir() or not any(folder.iterdir()):
        raise SystemExit(
            f'{CLAIMS}/ is empty or missing: its submodule is not checked out (git submodule update --init)'
        )
    return filed(CLAIMS, ClaimSource.ADMIN)


def model() -> list[Made]:
    """The merge review's current answers (merge_review.current), of which one it could not settle (unsure) decides
    nothing, and the research session's proposals (PROPOSALS)."""
    answered: list[Made] = [
        Made(
            MergeClaim(
                field='merge',
                keys=(r.key_a, r.key_b),
                decision=r.answer.decision,
                made_at=r.answered_at,
                note=r.answer.rationale,
            ),
            ClaimSource.MODEL,
        )
        for r in merge_review.current()
        if r.answer.decision != MergeDecision.UNSURE
    ]
    return [*proposals(), *answered]


def every() -> list[Made]:
    """Every claim, of every channel."""
    return [*admin(), *model()]


def resolved(made: Iterable[Made]) -> dict[tuple[str, ...], Made]:
    """Per subject, the claim that decides it: the highest source, then the latest made, then the greatest id."""
    out: dict[tuple[str, ...], Made] = {}
    for m in made:
        s = subject(m.claim)
        if s not in out or m.rank() > out[s].rank():
            out[s] = m
    return out


def filed_as(folder: str, claim: AnyClaim) -> None:
    """A claim as its file in a folder of claim files, named by its digest: one already there is left as it is."""
    path = data(folder) / f'{digest(text(claim))}.json'
    if not path.exists():
        files.write(path, text(claim))


def write(claims: Sequence[AnyClaim]) -> None:
    """Write admin claims into the claims repository."""
    for c in claims:
        filed_as(CLAIMS, c)


def propose(claims: Sequence[CityClaim]) -> None:
    """Write the research session's proposals (PROPOSALS), which the admin's claims override."""
    for c in claims:
        filed_as(PROPOSALS, c)


def sites() -> dict[str, SiteClaim]:
    """The ticket sites whose festivals wait for something else than they would by default, by host: the admin's, as
    no other channel makes a site claim."""
    return {m.claim.host: m.claim for m in resolved(admin()).values() if isinstance(m.claim, SiteClaim)}


def places() -> dict[Spelling, PlaceClaim]:
    """The cities the source DB names that are in another country than they are listed under, by city and country as
    listed: the admin's, as no other channel makes a place claim."""
    return {
        Spelling(m.claim.city, m.claim.country): m.claim
        for m in resolved(admin()).values()
        if isinstance(m.claim, PlaceClaim)
    }


def proposals() -> list[Made]:
    """The research session's proposals (PROPOSALS), of the model channel: each a city's decision."""
    return filed(PROPOSALS, ClaimSource.MODEL)


class Decisions(NamedTuple):
    """The cities' decisions, by key: the admin's, and the research session's proposals, which the admin's
    override."""

    admin: dict[str, CityClaim]
    proposed: dict[str, CityClaim]


def decisions() -> Decisions:
    def of(made: Iterable[Made]) -> dict[str, CityClaim]:
        return {m.claim.key: m.claim for m in resolved(made).values() if isinstance(m.claim, CityClaim)}

    return Decisions(admin=of(admin()), proposed=of(proposals()))
