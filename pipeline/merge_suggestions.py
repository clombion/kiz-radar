"""List likely duplicate artists for review: pipeline/artist_merge_suggestions.csv.

Two sources:
  - couples whose two names match another couple's, allowing spelling variants and either order
    ("Lukasz & Karolina" / "Karolina & Łukasz", "Jojo & Jenni" / "Jojo & Jenny");
  - the source pipeline's own merge candidates that it left undecided.
Each pair is scored by name similarity, raised when both artists come from the same country (stated in
line-ups, else where they are booked most) and lowered when line-ups state different countries for them.
A country inferred from bookings never lowers the score: touring artists are booked everywhere.
The calendar adjusts it too: two artists booked at overlapping short events in different cities are different
people; turning up in the same city or with the same organiser counts mildly for a match. Both being named in
one line-up is noted but not scored (festivals list artists per room, so names repeat).
Pairs already decided in pipeline/artist_merges.csv (merge or separate) are left out. To act on a
suggestion, copy its row into artist_merges.csv with decision "merge" or "separate".

    mise run suggest-merges
"""

import argparse
import collections
import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel

from pipeline import build_site_db, export
from pipeline.countries import codes
from pipeline.db import Reader
from pipeline.enums import MergeDecision, MergeReason, Role
from pipeline.extract.prices import COUPLE
from pipeline.names import norm, sim
from pipeline.records import ArtistMergeRow, Suggestion

COUNTRY_BONUS, COUNTRY_PENALTY = 0.1, 0.25  # score = name similarity, adjusted by country of origin …
CLASH_PENALTY, CIRCUIT_BONUS = 0.5, 0.05  # … and by the calendar (see calendar_signal)
SHORT_EVENT_DAYS = 4  # longer events (week-long all-in-ones) never count as a clash
SIMILAR, SIMILAR_IF_ONE_SAME = 0.72, 0.6  # how alike both of two couples' names must be, or one when the other is
# French overseas territories count as France: artists list either.
FR_TERRITORIES = {'RE', 'GP', 'MQ', 'GF', 'YT', 'MF', 'BL', 'NC', 'PF', 'PM', 'WF'}


def decided() -> tuple[set[frozenset[str]], Callable[[str], str]]:
    """Pairs already decided, and a function giving each key's merge group (merges chain: A<-B, A<-C groups B and C)."""
    rows = ArtistMergeRow.read()
    parent: dict[str, str] = {}

    def group(k: str) -> str:
        while parent.get(k, k) != k:
            k = parent[k]
        return k

    for r in rows:
        if r.decision == MergeDecision.MERGE:
            a, b = group(r.keep_key), group(r.merge_key)
            if a != b:
                parent[b] = a
    return {frozenset((r.keep_key, r.merge_key)) for r in rows}, group


def as_fr(cs: set[str]) -> set[str]:
    return {'FR' if cc in FR_TERRITORIES else cc for cc in cs}


@dataclass(frozen=True)
class Event:
    start: dt.date
    end: dt.date
    short: bool
    city: str | None  # lower case, to compare; None when the event names none
    place: str  # as shown: city, country


@dataclass(frozen=True)
class Evidence:
    """What the source and site databases say of each artist: its name, key and bookings, its stated and booked
    countries, and its calendar (each event's dates, city and organisers)."""

    art: dict[int, tuple[str, str]]  # id -> (display name, match key)
    booked: collections.Counter[int]
    stated: collections.defaultdict[int, collections.Counter[str]]
    booked_in: collections.defaultdict[int, collections.Counter[str]]
    ev: dict[int, Event] = field(default_factory=dict[int, Event])
    organisers: collections.defaultdict[int, set[int]] = field(default_factory=lambda: collections.defaultdict(set))
    events_of: collections.defaultdict[int, set[int]] = field(default_factory=lambda: collections.defaultdict(set))
    direct_roles: collections.defaultdict[int, set[tuple[int, str]]] = field(
        default_factory=lambda: collections.defaultdict(set)
    )

    def origin(self, a: int) -> tuple[set[str], bool]:
        """(Country of origin, whether only inferred): what line-ups state next to the name (flags or text);
        members without one take their couple's; failing that, the country where the artist is booked most."""
        if self.stated[a]:
            return {cc for cc, _ in self.stated[a].most_common()}, False
        if self.booked_in[a]:
            return {self.booked_in[a].most_common(1)[0][0]}, True
        return set(), True

    def shown(self, a: int) -> str:
        """The artist's origin, marked '~' when only inferred."""
        countries, inferred = self.origin(a)
        return ('~' if inferred and countries else '') + ' '.join(sorted(countries))

    def country_signal(self, a: int, b: int) -> tuple[str, float]:
        """Only a stated origin speaks for where someone is from: touring artists are booked everywhere, so a
        country inferred from bookings can confirm a match but never contradict one. Line-ups often show a
        heritage flag in one listing and a home base in another, so any overlap counts as the same."""
        (oa, ia), (ob, ib) = self.origin(a), self.origin(b)
        oa, ob = as_fr(oa), as_fr(ob)
        if not oa or not ob:
            return 'unknown', 0
        if oa & ob:
            return 'same', COUNTRY_BONUS if not (ia and ib) else COUNTRY_BONUS / 2
        if not ia and not ib:
            return 'different', -COUNTRY_PENALTY
        return 'unclear', 0

    def calendar_signal(self, a: int, b: int) -> tuple[str, float, str]:
        """Different people can't be in two places at once, and one act isn't booked twice in one line-up. Both
        named in one line-up proves nothing either way: big festivals list artists per room or section, so one act
        can appear twice ("ADELAIDE CARVALHO" and "ADELAIDE*" in one Porto line-up). It is shown for the reviewer
        but does not change the score. Only named in the same role counts, since one person listed as a DJ and
        again within a couple is the usual way the source splits a person in two."""
        ea, eb = self.events_of[a], self.events_of[b]
        if both := self.direct_roles[a] & self.direct_roles[b]:
            eid, role = min(both)
            return (
                'same line-up',
                0,
                f'both listed as {role} at the event of {self.ev[eid].start} in {self.ev[eid].place}',
            )
        for x in ea:
            for y in eb:
                ex, ey = self.ev[x], self.ev[y]
                apart = ex.city is not None and ey.city is not None and ex.city != ey.city
                if ex.short and ey.short and ex.start <= ey.end and ey.start <= ex.end and apart:
                    return 'clash', -CLASH_PENALTY, f'{ex.start}: booked in {ex.place} and in {ey.place}'
        cities = ({self.ev[e].city for e in ea} & {self.ev[e].city for e in eb}) - {None}
        orgs_a = set[int]().union(*(self.organisers[e] for e in ea))
        orgs = orgs_a & set[int]().union(*(self.organisers[e] for e in eb)) if ea and eb else set[int]()
        if cities or orgs:
            where = sorted(c_ for c_ in cities if c_ is not None)[:3]
            return 'shared circuit', CIRCUIT_BONUS, 'same city: ' + ', '.join(where) if where else 'same organiser'
        return 'no clash', 0, ''


class Stated(BaseModel):
    artist_id: int
    country: str | None


class Member(BaseModel):
    couple_id: int
    member_id: int


class Dates(BaseModel):
    id: int
    start_date: dt.date
    end_date: dt.date
    city: str | None
    country: str | None


class Organised(BaseModel):
    event_id: int
    artist_id: int


class Appearance(BaseModel):
    artist_id: int
    event_id: int
    role: Role
    via: str


class Named(BaseModel):
    id: int
    display_name: str
    match_key: str


class Keyed(BaseModel):
    match_key: str
    artist_id: int


class Redirect(BaseModel):
    old_id: int
    new_id: int


class Undecided(BaseModel):
    key_a: str
    key_b: str
    reason: MergeReason
    similarity: float


def origins(c: Reader) -> collections.defaultdict[int, collections.Counter[str]]:
    """The countries line-ups state next to each artist's name (flags or text); members without one take their
    couple's."""
    stated: collections.defaultdict[int, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for said in c.rows(
        Stated, "select artist_id, country from event_artists where country is not null and country != ''"
    ):
        for cc in codes(said.country):
            stated[said.artist_id][cc] += 1
    for m in c.rows(Member, 'select couple_id, member_id from couple_members'):
        if not stated[m.member_id] and stated[m.couple_id]:
            stated[m.member_id].update(stated[m.couple_id])
    return stated


def calendar(found: Evidence, c: Reader, site: Reader) -> None:
    """Every event an artist appears at (directly or through a couple), with dates, city and organisers."""
    for e in site.rows(Dates, 'select id, start_date, end_date, city, country from events'):
        place = ', '.join(p for p in (e.city, e.country) if p is not None) or 'a place not given'
        short = (e.end_date - e.start_date).days <= SHORT_EVENT_DAYS
        city = None if e.city is None else e.city.strip().lower()
        found.ev[e.id] = Event(e.start_date, e.end_date, short, city, place)
    for o in c.rows(Organised, "select event_id, artist_id from event_artists where role = 'organiser'"):
        found.organisers[o.event_id].add(o.artist_id)
    for a in c.rows(Appearance, 'select artist_id, event_id, role, via from artist_events'):
        if a.role == Role.ORGANISER:
            continue
        found.events_of[a.artist_id].add(a.event_id)  # any appearance, also through a couple
        if a.via == 'direct':
            found.direct_roles[a.artist_id].add((a.event_id, a.role))  # (event, role) where the artist itself is named


def evidence(c: Reader, site: Reader) -> Evidence:
    booked_in: collections.defaultdict[int, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    where = 'select ea.artist_id, e.country from event_artists ea join events e on e.id = ea.event_id'
    for w in c.rows(Stated, where):
        for cc in codes(w.country)[:1]:
            booked_in[w.artist_id][cc] += 1
    art = {
        a.id: (a.display_name, a.match_key) for a in c.rows(Named, 'select id, display_name, match_key from artists')
    }
    bookings = collections.Counter(c.column(int, 'select artist_id from event_artists'))
    found = Evidence(art, bookings, origins(c), booked_in)
    calendar(found, c, site)
    return found


def couple_pairs(members: dict[int, list[str]]) -> list[tuple[int, int, float]]:
    """(couple, couple, similarity) of the couples whose two names match, in either order."""
    couples = [i for i, m in members.items() if len(m) == COUPLE]
    by_initial: collections.defaultdict[str, set[int]] = collections.defaultdict(set)
    for i in couples:
        for n in members[i]:
            by_initial[n[:1]].add(i)
    out: list[tuple[int, int, float]] = []
    for i in couples:
        a1, b1 = members[i]
        for j in by_initial[a1[:1]] | by_initial[b1[:1]]:
            if j <= i:
                continue
            a2, b2 = members[j]
            s1, s2 = max(((sim(a1, a2), sim(b1, b2)), (sim(a1, b2), sim(b1, a2))), key=min)
            lo, hi = sorted((s1, s2))
            if lo >= SIMILAR or (hi == 1 and lo >= SIMILAR_IF_ONE_SAME):
                out.append((i, j, (s1 + s2) / 2))
    return out


def suggestions(c: Reader, site: Reader) -> list[Suggestion]:
    """Likely duplicates, the likeliest first, from the source DB and the built site DB, which knows every merge,
    including members merged along with their couples, and has the events as days."""
    known = evidence(c, site)
    art, booked = known.art, known.booked
    key_id = {k.match_key: k.artist_id for k in c.rows(Keyed, 'select match_key, artist_id from artist_keys')}
    members: collections.defaultdict[int, list[str]] = collections.defaultdict(list)
    for m in c.rows(Member, 'select couple_id, member_id from couple_members'):
        members[m.couple_id].append(norm(art[m.member_id][0]))
    done, group = decided()
    moved = {r.old_id: r.new_id for r in site.rows(Redirect, 'select old_id, new_id from artist_redirects')}
    rows: dict[tuple[int, int], Suggestion] = {}

    def add(a: int, b: int, score: float, reason: MergeReason) -> None:
        ka, kb = art[a][1], art[b][1]
        same = a == b or moved.get(a, a) == moved.get(b, b)
        if same or frozenset((ka, kb)) in done or group(ka) == group(kb):
            return
        keep, merge = sorted((a, b), key=lambda i: (-booked[i], i))  # keep the more booked one
        k = (keep, merge)
        if k in rows and rows[k].similarity >= score:
            return
        signal, adj = known.country_signal(keep, merge)
        cal, cadj, cnote = known.calendar_signal(keep, merge)
        rows[k] = Suggestion(
            decision=None,
            keep_key=art[keep][1],
            merge_key=art[merge][1],
            keep_name=art[keep][0],
            merge_name=art[merge][0],
            keep_bookings=booked[keep],
            merge_bookings=booked[merge],
            keep_countries=known.shown(keep),
            merge_countries=known.shown(merge),
            countries=signal,
            calendar=cal,
            calendar_note=cnote,
            similarity=round(score, 2),
            score=round(score + adj + cadj, 2),
            reason=reason,
        )

    for i, j, score in couple_pairs(members):
        add(i, j, score, MergeReason.COUPLES_WITH_MATCHING_NAMES)
    # the source pipeline's undecided candidates
    undecided = 'select key_a, key_b, reason, similarity from artist_merge_candidates where decision is null'
    for u in c.rows(Undecided, undecided):
        a, b = key_id.get(u.key_a), key_id.get(u.key_b)
        if a and b:
            add(a, b, u.similarity, u.reason)

    return sorted(rows.values(), key=lambda r: (-r.score, r.keep_name.lower()))


def main() -> None:
    ap = argparse.ArgumentParser(description='List likely duplicate artists for review.')
    _ = ap.parse_args()
    with export.opened('ro') as c, build_site_db.built(export.path()) as site:
        rows = suggestions(c, site)
    Suggestion.write(rows)
    print(f'{len(rows)} suggestions in {Suggestion.FILE}')


if __name__ == '__main__':
    main()
