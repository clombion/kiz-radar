"""The review dashboard's read model (public/data/review.json, built with the site's database): what the pipeline did
lately, and every data point waiting for an agent or the admin (pipeline/states.py, an owner of either), each with what
settles it. The dashboard (site/review.ts) writes the admin's claims for the homes and merges it lists; the festivals
and the orphaned claims it lists are settled in a session (docs/guides/).

    homes      the artists booked whose home country is unknown or contested (home_basis), by bookings
    merges     the pairs the merge review left unsure, which no admin claim decides
    festivals  the festivals whose prices wait for an agent (waits_for), or whose first read is disputed
    orphaned   the claims that name a key no mention produces any more
    steps      the pipeline's steps, latest first; reads, the latest ticket-page reads
"""

from collections.abc import Sequence

from pydantic import BaseModel, TypeAdapter

from pipeline import countries, states, tickets_store
from pipeline.db import Reader
from pipeline.enums import ClaimSource, ClaimState, FirstRead, HomeBasis, MergeDecision, Status, Waiting
from pipeline.extract import merge_review
from pipeline.records import Date, Record, Stamp, StatusRow

REPOSITORY = 'clombion/kiz-radar-claims'  # where the admin's claims are written (pipeline/claims.py, CLAIMS)
SUBJECT = TypeAdapter(tuple[str, ...])  # what a claim decides, as the export's claims table holds it (claims.subject)
READS = 40  # the latest ticket-page reads the timeline shows
# the states an agent or the admin settles, and what the one who settles each does
ACTED_ON = {(s.point, s.key): s.owner for s in states.ROWS if s.owner and s.owner.startswith(('agent', 'admin'))}


class Place(Record):
    code: str
    name: str


class Stated(Record):
    code: str
    festivals: int  # the festivals whose line-ups state it next to the artist's name


class Home(Record):
    key: str  # a key a mention produces, which a home claim names
    name: str
    kind: str
    bookings: int
    basis: HomeBasis | None  # contested, or None: no line-up states a country
    stated: tuple[Stated, ...]


class Merge(Record):
    key_a: str
    key_b: str
    name_a: str
    name_b: str
    evidence: str
    rationale: str  # why the merge review was unsure


class Festival(Record):
    event_id: int
    event: str
    start: Date
    waits_for: Waiting
    first_read: FirstRead
    page: str | None
    to_do: str  # what settles it (the owner of the state that lists it, pipeline/states.py)


class Orphaned(Record):
    id: str
    claim: str  # as its file holds it


class Step(Record):
    step: str
    description: str
    performed_at: str
    performed_by: str


class PageRead(Record):
    at: Stamp
    event_id: int
    event: str
    status: Status


class Review(Record):
    built_at: str
    repository: str
    countries: tuple[Place, ...]
    homes: tuple[Home, ...]
    merges: tuple[Merge, ...]
    festivals: tuple[Festival, ...]
    orphaned: tuple[Orphaned, ...]
    steps: tuple[Step, ...]
    reads: tuple[PageRead, ...]


class HomeRow(BaseModel):
    artist_id: int
    key: str
    name: str
    kind: str
    bookings: int
    basis: HomeBasis | None


class StatedRow(BaseModel):
    artist_id: int
    code: str
    festivals: int


class Question(BaseModel):
    question: str


class ClaimRow(BaseModel):
    id: str
    subject: str
    claim: str
    source: ClaimSource
    state: ClaimState


def homes(x: Reader) -> list[Home]:
    """Each artist booked with no home, or a contested one, named by the least of the keys its mentions produce."""
    rows = x.rows(
        HomeRow,
        """select s.artist_id, min(k.match_key) as key, a.display_name as name, a.kind, s.bookings,
        s.home_basis as basis from artist_stats s join artists a on a.id = s.artist_id
        join src.artist_keys k on k.artist_id = s.artist_id and k.produced = 1
        where s.home_country is null group by s.artist_id order by s.bookings desc, a.display_name, key""",
    )
    stated: dict[int, list[Stated]] = {}
    for r in x.rows(
        StatedRow, 'select artist_id, country_code as code, festivals from artist_origin order by 1, 3 desc, 2'
    ):
        stated.setdefault(r.artist_id, []).append(Stated(code=r.code, festivals=r.festivals))
    return [
        Home(
            key=r.key,
            name=r.name,
            kind=r.kind,
            bookings=r.bookings,
            basis=r.basis,
            stated=tuple(stated.get(r.artist_id, [])),
        )
        for r in rows
    ]


def admin_pairs(rows: Sequence[ClaimRow]) -> set[tuple[str, str]]:
    """The pairs an admin's merge claim is about, whatever it decides."""
    out: set[tuple[str, str]] = set()
    for r in rows:
        match SUBJECT.validate_json(r.subject):
            case ('merge', a, b) if r.source == ClaimSource.ADMIN:
                out.add((a, b))
            case _:
                pass
    return out


def merges(x: Reader, decided: set[tuple[str, str]]) -> list[Merge]:
    """The pairs whose current review is unsure, which no admin claim decides, as the review was asked them."""
    asked = {(q.key_a, q.key_b): q for q in merge_review.questions(x)}
    out: list[Merge] = []
    for r in merge_review.current():
        q = asked.get((r.key_a, r.key_b))
        if r.answer.decision == MergeDecision.UNSURE and (r.key_a, r.key_b) not in decided and q:
            out.append(
                Merge(
                    key_a=r.key_a,
                    key_b=r.key_b,
                    name_a=q.name_a,
                    name_b=q.name_b,
                    evidence=q.evidence,
                    rationale=r.answer.rationale,
                )
            )
    return sorted(out, key=lambda m: (m.key_a, m.key_b))


def festivals(rows: Sequence[StatusRow]) -> list[Festival]:
    return [
        Festival(
            event_id=r.event_id,
            event=r.event,
            start=r.start,
            waits_for=r.waits_for,
            first_read=r.first_read,
            page=r.page,
            to_do=to_do,
        )
        for r in rows
        if (to_do := ACTED_ON.get(('waits_for', r.waits_for)) or ACTED_ON.get(('first_read', r.first_read)))
    ]


def reads(rows: Sequence[StatusRow]) -> list[PageRead]:
    """The latest ticket-page reads, of every festival's log."""
    every = [
        PageRead(at=e.at, event_id=r.event_id, event=r.event, status=e.status)
        for r in rows
        for e in tickets_store.log(r.event_id)
    ]
    return sorted(every, key=lambda r: (r.at, r.event_id), reverse=True)[:READS]


def review(x: Reader, built_at: str) -> Review:
    """The read model, from the site's database being built (the export attached as src) and the pipeline's files."""
    claimed = x.rows(ClaimRow, 'select id, subject, claim, source, state from src.claims order by id')
    status = StatusRow.read()
    return Review(
        built_at=built_at,
        repository=REPOSITORY,
        countries=tuple(Place(code=c, name=n) for c, n in sorted(countries.NAMES.items(), key=lambda kv: kv[1])),
        homes=tuple(homes(x)),
        merges=tuple(merges(x, admin_pairs(claimed))),
        festivals=tuple(festivals(status)),
        orphaned=tuple(Orphaned(id=r.id, claim=r.claim) for r in claimed if r.state == ClaimState.ORPHANED),
        steps=tuple(
            x.rows(
                Step,
                'select step, description, performed_at, performed_by from pipeline_steps order by performed_at desc',
            )
        ),
        reads=tuple(reads(status)),
    )
