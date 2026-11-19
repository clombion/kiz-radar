"""The review dashboard's read model (public/data/review.json, built with the site's database): what the pipeline did
lately, and every data point waiting for an agent or the admin (pipeline/states.py, an owner of either), each with what
settles it. The dashboard (site/review.ts) writes the admin's claims for the homes and merges it lists; the festivals,
the cities and the orphaned claims it lists are settled in a session (docs/guides/).

    homes      the artists booked whose home country is unknown or contested (home_basis), by bookings
    merges     the pairs the merge review left unsure, which no admin claim decides
    festivals  the festivals whose prices wait for an agent (waits_for), or whose first read is disputed
    cities     the cities of festivals to come that no decision of the admin's says the airports of
               (claims.CityClaim), each with the research session's proposal
    orphaned   the claims that name a key no mention produces any more
    steps      the pipeline's steps, latest first; reads, the latest ticket-page reads
"""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path

from pydantic import BaseModel, TypeAdapter

from pipeline import claims, countries, export, states, tickets_state
from pipeline.countries import codes
from pipeline.db import Reader
from pipeline.enums import CityTier, ClaimSource, ClaimState, FirstRead, HomeBasis, MergeDecision, Status, Waiting
from pipeline.extract import merge_review
from pipeline.records import CityKey, CountryCode, Date, Record, ReviewMention, Stamp, StatusRow, today

REPOSITORY = 'clombion/kiz-radar-claims'  # where the admin's claims are written (pipeline/claims.py, CLAIMS)
SUBJECT = TypeAdapter(tuple[str, ...])  # what a claim decides, as the export's claims table holds it (claims.subject)
READS = 40  # the latest ticket-page reads the timeline shows
EVENTS = 3  # the festivals, countries or spellings an item shows of each kind
# the states an agent or the admin settles, and what the one who settles each does
ACTED_ON = {(s.point, s.key): s.owner for s in states.ROWS if s.owner and s.owner.startswith(('agent', 'admin'))}


class Place(Record):
    code: str
    name: str


class Stated(Record):
    code: str
    festivals: int  # the festivals whose line-ups state it next to the artist's name
    events: tuple[str, ...]  # those festivals, latest first, as many as EVENTS


class Home(Record):
    artist_id: int  # the artist's page on the site
    key: str  # a key a mention produces, which a home claim names
    name: str
    kind: str
    bookings: int
    basis: HomeBasis | None  # contested, or None: no line-up states a country
    stated: tuple[Stated, ...]
    booked_in: tuple[str, ...]  # where they are booked most, as many as EVENTS: which says nothing of home


class Booked(Record):
    """An artist booked, as the join tool finds them: the least of the keys their mentions produce, which a merge claim
    names, their name and kind, and their latest festivals."""

    key: str
    name: str
    kind: str
    bookings: int
    latest: tuple[str, ...]  # their latest festivals, as many as EVENTS: "Bachaturo Festival 2027"


class Side(Record):
    """One key of a pair, as its mentions show it: what the merge review weighed."""

    key: str
    name: str
    festivals: int
    roles: tuple[str, ...]
    stated: tuple[str, ...]  # the countries its line-ups state next to the name
    booked_in: tuple[str, ...]  # the countries of its festivals
    written: tuple[str, ...]  # how line-ups write it, as many as EVENTS


class Merge(Record):
    a: Side
    b: Side
    shared: int  # the festivals whose line-ups name both
    rationale: str  # why the merge review was unsure


class Festival(Record):
    event_id: int
    event: str
    start: Date
    waits_for: Waiting
    first_read: FirstRead
    page: str | None
    to_do: str  # what settles it (the owner of the state that lists it, pipeline/states.py)


class Proposal(Record):
    """The research session's decision for a city (claims.CityClaim), which a claim of the admin's overrides."""

    tier: CityTier
    gateways: tuple[str, ...]  # none for a city not served
    note: str


class Undecided(Record):
    """A city festivals to come are in, which no decision of the admin's says the airports of: with the research
    session's proposal, when it has made one."""

    key: CityKey
    name: str
    country_code: CountryCode
    festivals: int  # its festivals to come
    events: tuple[str, ...]  # the first of them, as many as EVENTS
    proposal: Proposal | None


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
    artists: tuple[Booked, ...]  # every artist booked, most booked first, for joining any two
    festivals: tuple[Festival, ...]
    cities: tuple[Undecided, ...]
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


class BookedRow(BaseModel):
    artist_id: int
    key: str
    name: str
    kind: str
    bookings: int


class LatestRow(BaseModel):
    artist_id: int
    event: str


class StatedAt(BaseModel):
    artist_id: int
    country: str
    event: str


class BookedIn(BaseModel):
    artist_id: int
    code: str


class ClaimRow(BaseModel):
    id: str
    subject: str
    claim: str
    source: ClaimSource
    state: ClaimState


def firsts[T](rows: Iterable[tuple[int, T]]) -> dict[int, list[T]]:
    """Each id's values in order, each once, as many as EVENTS."""
    out: dict[int, list[T]] = {}
    for i, v in rows:
        if v not in (kept := out.setdefault(i, [])) and len(kept) < EVENTS:
            kept.append(v)
    return out


def homes(x: Reader) -> list[Home]:
    """Each artist booked with no home, or a contested one, named by the least of the keys its mentions produce: the
    countries line-ups state with the festivals that state them, and where they are booked."""
    rows = x.rows(
        HomeRow,
        """select s.artist_id, min(k.match_key) as key, a.display_name as name, a.kind, s.bookings,
        s.home_basis as basis from artist_stats s join artists a on a.id = s.artist_id
        join src.artist_keys k on k.artist_id = s.artist_id and k.produced = 1
        where s.home_country is null group by s.artist_id order by s.bookings desc, a.display_name, key""",
    )
    said = x.rows(
        StatedAt,
        """select ma.artist_id, m.country, e.title as event from src.mention_artists ma
        join src.artist_mentions m on m.id = ma.mention_id join events e on e.id = m.event_id
        where m.country is not null and m.country != '' order by e.start_date desc, e.title""",
    )
    events: dict[tuple[int, str], list[str]] = {}
    for r in said:
        for c in codes(r.country):
            if r.event not in (kept := events.setdefault((r.artist_id, c), [])) and len(kept) < EVENTS:
                kept.append(r.event)
    stated: dict[int, list[Stated]] = {}
    for r in x.rows(
        StatedRow, 'select artist_id, country_code as code, festivals from artist_origin order by 1, 3 desc, 2'
    ):
        stated.setdefault(r.artist_id, []).append(
            Stated(code=r.code, festivals=r.festivals, events=tuple(events.get((r.artist_id, r.code), [])))
        )
    booked = firsts(
        (b.artist_id, b.code)
        for b in x.rows(
            BookedIn, 'select artist_id, country_code as code from artist_countries order by 1, bookings desc, 2'
        )
    )
    return [
        Home(
            artist_id=r.artist_id,
            key=r.key,
            name=r.name,
            kind=r.kind,
            bookings=r.bookings,
            basis=r.basis,
            stated=tuple(stated.get(r.artist_id, [])),
            booked_in=tuple(booked.get(r.artist_id, [])),
        )
        for r in rows
    ]


def booked(x: Reader) -> list[Booked]:
    """Every artist booked, most booked first, by the least key their mentions produce, with their latest festivals."""
    latest = firsts(
        (r.artist_id, r.event)
        for r in x.rows(
            LatestRow,
            """select ea.artist_id, e.title || ' ' || substr(e.start_date, 1, 4) as event from event_artists ea
            join events e on e.id = ea.event_id order by e.start_date desc, e.title""",
        )
    )
    rows = x.rows(
        BookedRow,
        """select s.artist_id, min(k.match_key) as key, a.display_name as name, a.kind, s.bookings
        from artist_stats s join artists a on a.id = s.artist_id
        join src.artist_keys k on k.artist_id = s.artist_id and k.produced = 1
        group by s.artist_id order by s.bookings desc, a.display_name, key""",
    )
    return [
        Booked(key=r.key, name=r.name, kind=r.kind, bookings=r.bookings, latest=tuple(latest.get(r.artist_id, [])))
        for r in rows
    ]


def side(key: str, name: str, mentions: Sequence[ReviewMention]) -> Side:
    def each[T](values: Iterable[T | None]) -> tuple[T, ...]:
        return tuple(dict.fromkeys(v for v in values if v is not None))

    return Side(
        key=key,
        name=name,
        festivals=len({m.event_id for m in mentions}),
        roles=each(m.role for m in mentions),
        stated=each(c for m in mentions for c in codes(m.country or '')),
        booked_in=each(countries.ALIASES.get((m.event_country or '').lower(), m.event_country) for m in mentions),
        written=each(m.name_as_written for m in mentions)[:EVENTS],
    )


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
                    a=side(q.key_a, q.name_a, q.a),
                    b=side(q.key_b, q.name_b, q.b),
                    shared=len({m.event_id for m in q.a} & {m.event_id for m in q.b}),
                    rationale=r.answer.rationale,
                )
            )
    return sorted(out, key=lambda m: (m.a.key, m.b.key))


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


class CityRow(BaseModel):
    key: str
    name: str
    country_code: str
    event: str


def proposal(c: claims.CityClaim) -> Proposal:
    return Proposal(tier=c.decision.tier, gateways=c.decision.gateways, note=c.note)


def undecided(x: Reader, decided: claims.Decisions) -> list[Undecided]:
    """The cities of festivals to come no decision of the admin's is of, those with the most festivals first, then by
    name, each with its proposal."""
    rows = x.rows(
        CityRow,
        """select c.key, c.name, c.country_code, e.title as event from event_rows e join cities c on c.key = e.city_key
        where e.upcoming order by e.start_date, e.title, e.id""",
    )
    by: defaultdict[str, list[CityRow]] = defaultdict(list)
    for r in rows:
        if r.key not in decided.admin:
            by[r.key].append(r)
    found = [
        Undecided(
            key=k,
            name=rs[0].name,
            country_code=rs[0].country_code,
            festivals=len(rs),
            events=tuple(r.event for r in rs[:EVENTS]),
            proposal=None if (p := decided.proposed.get(k)) is None else proposal(p),
        )
        for k, rs in by.items()
    ]
    return sorted(found, key=lambda u: (-u.festivals, u.name, u.key))


def reads(fs: Sequence[tickets_state.Festival]) -> list[PageRead]:
    """The latest ticket-page reads, of every festival's log."""
    every = [PageRead(at=e.at, event_id=f.id, event=f.title, status=e.status) for f in fs for e in f.log]
    return sorted(every, key=lambda r: (r.at, r.event_id), reverse=True)[:READS]


def review(x: Reader, built_at: str, src: Path) -> Review:
    """The read model, from the site's database being built (the export attached as src), the export itself (src)
    and the pipeline's files. The festivals are as the ticket files say today (tickets_state), not as
    tickets/status.csv, an output for people, last said it."""
    claimed = x.rows(ClaimRow, 'select id, subject, claim, source, state from src.claims order by id')
    with export.opened('ro', src) as db:
        fs = tickets_state.festivals(db, today(), every=True)
    status = tickets_state.status_rows(fs)
    return Review(
        built_at=built_at,
        repository=REPOSITORY,
        countries=tuple(Place(code=c, name=n) for c, n in sorted(countries.NAMES.items(), key=lambda kv: kv[1])),
        homes=tuple(homes(x)),
        merges=tuple(merges(x, admin_pairs(claimed))),
        artists=tuple(booked(x)),
        festivals=tuple(festivals(status)),
        cities=tuple(undecided(x, claims.decisions())),
        orphaned=tuple(Orphaned(id=r.id, claim=r.claim) for r in claimed if r.state == ClaimState.ORPHANED),
        steps=tuple(
            x.rows(
                Step,
                'select step, description, performed_at, performed_by from pipeline_steps order by performed_at desc',
            )
        ),
        reads=tuple(reads(fs)),
    )
