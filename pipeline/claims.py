"""Claims decide the facts no step can derive: that two artists are one, where an artist is from, which artist a
festival's line-up means, and what a ticket site waits for.

A claim is a record of what it says, about one subject, when it was made, with a note. Its source is the channel that
delivers it, never read from the claim itself, and its source gives its priority (states.py, claim_source: admin above
organiser above model). Per subject, the claim that comes first decides it: the highest source, then the latest made,
then the one whose id (the digest of its text) is greatest, so that the outcome is one function of the set of claims,
whatever their order (resolved).

The admin channel is the repository clombion/kiz-radar-claims, which kiz-radar holds as a git submodule (CLAIMS): one
JSON file per claim, named by its digest, so that writing a claim again changes nothing and two claims never share a
file. The model channel is the merge review's answers to its current prompt (pipeline/extract/merge_review.py), each
made when it was answered.
"""

import datetime as dt
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, Discriminator, Field, TypeAdapter, ValidationError, model_validator

from pipeline import countries, data, files, states
from pipeline.enums import ClaimSource, MergeDecision, Waiting
from pipeline.extract import merge_review
from pipeline.records import Record, Stamp, Text, digest, errors

CLAIMS = 'claims'  # the submodule of clombion/kiz-radar-claims: every admin claim, <its digest>.json


def country(code: str) -> str:
    if code not in countries.NAMES:
        raise ValueError(f'{code!r} is no country of countries.NAMES')
    return code


Country = Annotated[str, AfterValidator(country)]
Key = Annotated[str, Field(pattern=r'^[pcog]:\S+$')]  # an artist's key as a mention gives it (resolve_artists)
Decided = Literal[MergeDecision.MERGE, MergeDecision.SEPARATE]  # what a merge claim decides; unsure decides nothing


class MergeClaim(Record):
    """Whether two artists, by their keys, are one."""

    field: Literal['merge']
    keys: tuple[Key, Key]
    decision: Decided
    made_at: Stamp
    note: Text

    @model_validator(mode='after')
    def in_order(self) -> Self:
        if self.keys[0] >= self.keys[1]:
            raise ValueError('a pair is written in key order, the lesser first, so that it is written one way')
        return self


class HomeClaim(Record):
    """Where an artist, by their key, is from."""

    field: Literal['home']
    key: Key
    country: Country
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


type AnyClaim = MergeClaim | HomeClaim | BookingClaim | SiteClaim
type Claim = Annotated[AnyClaim, Discriminator('field')]
CLAIM: TypeAdapter[MergeClaim | HomeClaim | BookingClaim | SiteClaim] = TypeAdapter(Claim)
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


def parsed(path: Path) -> AnyClaim | list[str]:
    """A claim file's claim, or why it is none: its record refuses it, or it is not named by its digest."""
    try:
        c = CLAIM.validate_json(path.read_bytes())
    except ValidationError as e:
        return errors(e, f'{CLAIMS}/{path.name}')
    if path.stem != (named := digest(text(c))):
        return [f'{CLAIMS}/{path.name}: a claim is named by its digest, {named}.json']
    return c


def claim_files() -> list[Path]:
    return sorted(data(CLAIMS).glob('*.json'))


def admin() -> list[Made]:
    """Every claim of the claims repository, each a file named by its digest, its source admin whatever it says (a
    file that says its source is refused, as a claim has no such field)."""
    folder = data(CLAIMS)
    if not folder.is_dir() or not any(folder.iterdir()):
        raise SystemExit(
            f'{CLAIMS}/ is empty or missing: its submodule is not checked out (git submodule update --init)'
        )
    out: list[Made] = []
    refused: list[str] = []
    for path in claim_files():
        match parsed(path):
            case list() as why:
                refused += why
            case c:
                out.append(Made(c, ClaimSource.ADMIN))
    if refused:
        raise SystemExit('\n'.join(refused))
    return out


def model() -> list[Made]:
    """The merge review's current answers (merge_review.current); one it could not settle (unsure) decides nothing."""
    return [
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


def write(claims: Sequence[AnyClaim]) -> None:
    """Write admin claims into the claims repository, each as its file: one already there is left as it is."""
    for c in claims:
        path = data(CLAIMS) / f'{digest(text(c))}.json'
        if not path.exists():
            files.write(path, text(c))


def sites() -> dict[str, SiteClaim]:
    """The ticket sites whose festivals wait for something else than they would by default, by host: the admin's, as
    no other channel makes a site claim."""
    return {m.claim.host: m.claim for m in resolved(admin()).values() if isinstance(m.claim, SiteClaim)}
