"""List likely duplicate artists for review: pipeline/artist_merge_suggestions.csv.

Two sources:
  - couples whose two names match another couple's, allowing spelling variants and either order
    ("Lukasz & Karolina" / "Karolina & Łukasz", "Jojo & Jenni" / "Jojo & Jenny");
  - resolve_artists' merge candidates that no decision settled.
Each pair is scored by name similarity, raised when line-ups state a country for both artists that they share and
lowered when they state countries for both and share none (the site's artist_origin, which home countries come from:
where an artist is booked says nothing of where they are from). The calendar adjusts it too: two artists booked at
overlapping short events in different cities are different people; turning up in the same city or with the same
organiser counts mildly for a match. Both being named in one line-up is noted but not scored (festivals list artists
per room, so names repeat). Bookings are the site's (artist_stats). Pairs already decided (a claim or a reviewed
decision, merge or separate) are left out. To act on a suggestion, write a merge claim naming its two keys
(pipeline/claims.py), with decision "merge" or "separate".

    mise run suggest-merges
"""

import argparse
import collections
import datetime as dt
import json
from dataclasses import dataclass, field

from pydantic import BaseModel

from pipeline import build_site_db, export, states
from pipeline.countries import nation
from pipeline.db import Reader
from pipeline.enums import MergeReason, Role, SuggestionCalendar, SuggestionCountries, Via
from pipeline.extract.prices import COUPLE
from pipeline.names import norm, sim
from pipeline.records import Suggestion

COUNTRY_BONUS, COUNTRY_PENALTY = 0.1, 0.25  # score = name similarity, adjusted by country of origin …
CLASH_PENALTY, CIRCUIT_BONUS = 0.5, 0.05  # … and by the calendar (see calendar_signal)
SHORT_EVENT_DAYS = 4  # longer events (week-long all-in-ones) never count as a clash
SIMILAR, SIMILAR_IF_ONE_SAME = 0.72, 0.6  # how alike both of two couples' names must be, or one when the other is
# French overseas territories count as France: artists list either.


class Pair(BaseModel):
    a: int
    b: int


def decided(c: Reader) -> set[frozenset[int]]:
    """The pairs of artists a claim or a reviewed decision has decided (artist_merge_decisions): a merged pair is one
    artist now, a separate one is not to be suggested again."""
    pairs = c.rows(
        Pair,
        'select ka.artist_id as a, kb.artist_id as b from artist_merge_decisions d'
        ' join artist_keys ka on ka.match_key = d.key_a join artist_keys kb on kb.match_key = d.key_b',
    )
    return {frozenset((p.a, p.b)) for p in pairs}


def as_fr(cs: set[str]) -> set[str]:
    return {nation(cc) for cc in cs}


@dataclass(frozen=True)
class Event:
    start: dt.date
    end: dt.date
    short: bool
    city: str | None  # lower case, to compare; None when the event names none
    place: str  # as shown: city, country


@dataclass(frozen=True)
class Evidence:
    """What the source and site databases say of each artist: its name, its bookings and the countries line-ups state
    for it (the site's, which its page shows), and its calendar (each event's dates, city and organisers)."""

    art: dict[int, str]  # id -> display name
    booked: collections.Counter[int]
    stated: collections.defaultdict[int, set[str]]
    ev: dict[int, Event] = field(default_factory=dict[int, Event])
    organisers: collections.defaultdict[int, set[int]] = field(default_factory=lambda: collections.defaultdict(set))
    events_of: collections.defaultdict[int, set[int]] = field(default_factory=lambda: collections.defaultdict(set))
    direct_roles: collections.defaultdict[int, set[tuple[int, str]]] = field(
        default_factory=lambda: collections.defaultdict(set)
    )

    def shown(self, a: int) -> str:
        return ' '.join(sorted(self.stated[a]))

    def country_signal(self, a: int, b: int) -> tuple[SuggestionCountries, float]:
        """Line-ups often show a heritage flag in one listing and a home base in another, so any country stated for
        both counts as the same."""
        oa, ob = as_fr(self.stated[a]), as_fr(self.stated[b])
        if not oa or not ob:
            return SuggestionCountries.UNKNOWN, 0
        if oa & ob:
            return SuggestionCountries.SAME, COUNTRY_BONUS
        return SuggestionCountries.DIFFERENT, -COUNTRY_PENALTY

    def calendar_signal(self, a: int, b: int) -> tuple[SuggestionCalendar, float, str]:
        """Different people can't be in two places at once, and one act isn't booked twice in one line-up. Both
        named in one line-up proves nothing either way: big festivals list artists per room or section, so one act
        can appear twice ("ADELAIDE CARVALHO" and "ADELAIDE*" in one Porto line-up). It is shown for the reviewer
        but does not change the score. Only named in the same role counts, since one person listed as a DJ and
        again within a couple is the usual way the source splits a person in two."""
        ea, eb = self.events_of[a], self.events_of[b]
        if both := self.direct_roles[a] & self.direct_roles[b]:
            eid, role = min(both)
            return (
                SuggestionCalendar.SAME_LINE_UP,
                0,
                f'both listed as {role} at the event of {self.ev[eid].start} in {self.ev[eid].place}',
            )
        for x in ea:
            for y in eb:
                ex, ey = self.ev[x], self.ev[y]
                apart = ex.city is not None and ey.city is not None and ex.city != ey.city
                if ex.short and ey.short and ex.start <= ey.end and ey.start <= ex.end and apart:
                    return (
                        SuggestionCalendar.CLASH,
                        -CLASH_PENALTY,
                        f'{ex.start}: booked in {ex.place} and in {ey.place}',
                    )
        cities = ({self.ev[e].city for e in ea} & {self.ev[e].city for e in eb}) - {None}
        orgs_a = set[int]().union(*(self.organisers[e] for e in ea))
        orgs = orgs_a & set[int]().union(*(self.organisers[e] for e in eb)) if ea and eb else set[int]()
        if cities or orgs:
            where = sorted(c_ for c_ in cities if c_ is not None)[:3]
            return (
                SuggestionCalendar.SHARED_CIRCUIT,
                CIRCUIT_BONUS,
                'same city: ' + ', '.join(where) if where else 'same organiser',
            )
        return SuggestionCalendar.NO_CLASH, 0, ''


class Stated(BaseModel):
    artist_id: int
    country_code: str


class Bookings(BaseModel):
    artist_id: int
    bookings: int


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


class Presence(BaseModel):
    artist_id: int
    event_id: int
    role: Role
    via: Via


class Named(BaseModel):
    id: int
    display_name: str


class Keyed(BaseModel):
    match_key: str
    artist_id: int


class Undecided(BaseModel):
    key_a: str
    key_b: str
    reason: MergeReason
    similarity: float


def calendar(found: Evidence, c: Reader, site: Reader) -> None:
    """Every event an artist is at in a role the calendar counts (states.py, role counts), directly or through a
    couple, with its dates, city and organisers."""
    for e in site.rows(Dates, 'select id, start_date, end_date, city, country from events'):
        place = ', '.join(p for p in (e.city, e.country) if p is not None) or 'a place not given'
        short = (e.end_date - e.start_date).days <= SHORT_EVENT_DAYS
        city = None if e.city is None else e.city.strip().lower()
        found.ev[e.id] = Event(e.start_date, e.end_date, short, city, place)
    for o in c.rows(Organised, 'select event_id, artist_id from event_artists where role = ?', (Role.ORGANISER,)):
        found.organisers[o.event_id].add(o.artist_id)
    present = (json.dumps(states.counted(states.PRESENT)),)
    for a in c.rows(
        Presence,
        'select artist_id, event_id, role, via from artist_events where role in (select value from json_each(?))',
        present,
    ):
        found.events_of[a.artist_id].add(a.event_id)  # also through a couple
        if a.via == Via.DIRECT:
            found.direct_roles[a.artist_id].add((a.event_id, a.role))  # (event, role) where the artist itself is named


def evidence(c: Reader, site: Reader) -> Evidence:
    art = {a.id: a.display_name for a in c.rows(Named, 'select id, display_name from artists')}
    booked = collections.Counter({b.artist_id: b.bookings for b in site.rows(Bookings, 'select * from artist_stats')})
    stated: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    for o in site.rows(Stated, 'select artist_id, country_code from artist_origin'):
        stated[o.artist_id].add(o.country_code)
    found = Evidence(art, booked, stated)
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
    keyed = c.rows(Keyed, 'select match_key, artist_id from artist_keys where produced order by match_key desc')
    key_id = {k.match_key: k.artist_id for k in keyed}
    named = {k.artist_id: k.match_key for k in keyed}  # each artist's least mention key: one a merge claim can name
    members: collections.defaultdict[int, list[str]] = collections.defaultdict(list)
    for m in c.rows(Member, 'select couple_id, member_id from couple_members'):
        members[m.couple_id].append(norm(art[m.member_id]))
    done = decided(c)
    rows: dict[tuple[int, int], Suggestion] = {}

    def add(a: int, b: int, score: float, reason: MergeReason) -> None:
        if a == b or frozenset((a, b)) in done:
            return
        keep, merge = sorted((a, b), key=lambda i: (-booked[i], i))  # keep the more booked one
        k = (keep, merge)
        if k in rows and rows[k].similarity >= score:
            return
        signal, adj = known.country_signal(keep, merge)
        cal, cadj, cnote = known.calendar_signal(keep, merge)
        rows[k] = Suggestion(
            keep_key=named[keep],
            merge_key=named[merge],
            keep_name=art[keep],
            merge_name=art[merge],
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
    # resolve_artists' undecided candidates
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
