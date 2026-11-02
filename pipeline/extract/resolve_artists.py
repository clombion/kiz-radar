"""Resolve artist mentions into artists, couples and groups, and link them to events.

Reads artist_mentions (from load_extract.py) and every claim (pipeline/claims.py); writes:
  artists                 id, display_name, kind (person | couple | group | organisation), match_key
  artist_aliases          every name an artist was written as
  couple_members          couple/group id -> member person id
  mention_artists         each mention's artist
  event_artists (view)    each artist booked at an event in a role, once however often its line-up names them, and
                          the couple a member repeats the booking of (as_couple)
  artist_merge_candidates pairs that may be the same artist, with evidence, for review
  merge_reason_definitions
                          reason -> definition, from pipeline/states.py (the reasons artist_merge_candidates gives)
  artist_merge_decisions  every merge/separate decision applied: the merge claims that decide their pair
  artist_homes            each artist's home country as a home claim gives it
  claims                  every claim, with whether it decides its subject (claim states, pipeline/states.py)
  artist_group_definitions, artist_group_aliases, artist_group_members
                          the named groups from pipeline/extract/groups.csv: note, the spellings that mean them
                          and members, each key marked when no mention produces it (orphaned)
  artist_events (view)    every event an artist appears at, directly or as a member of a couple/group

Matching rules:
  - A name's key: pipeline/names.py token_key (no DJ or MC in front, no flags, emoji, punctuation, accents, case or
    spaces), the one rule names are keyed and compared by.
  - Dancer, DJ, performer and MC names are split into members on & + and et e y und; organiser, media
    and crew names are never split.
  - Mentions merge automatically only on an exact key. A couple's key is its sorted member keys. A person's
    key is their name key when the name has several words. A single-word name is weak evidence of identity
    (many teachers share a first name), so its key is scoped: a solo single-word name to its role family
    (dj / dance), and a single-word couple member to that couple.
  - Near-matches are written to artist_merge_candidates, with their reason (pipeline/states.py, merge_reason), only
    when backed by evidence: a shared stated country or a shared partner, or, for two names of several words
    spelled alike, events in a shared country. They are only merged when a merge claim says so.

Every candidate, and every pair a review answered before, goes to artist_merge_reviews, which the merge review asks
about (pipeline/extract/merge_review.py); its answers to the current prompt are the model's merge claims. A review
that could not tell (unsure) decides nothing: the pair stays in artist_merge_candidates, undecided. A claim's keys are
mentions' (artist_keys.produced): one naming a key no mention produces any more is orphaned, and decides nothing.

pipeline/extract/groups.csv names an act that several people perform as (a DJ duo booked under one name):
group_key, display_name, members and aliases (both ';'-separated match_key values), note. Every alias
mention becomes a mention of the group, and the group is linked to its members, so each member's events
include the group's bookings. A member or alias no mention produces is orphaned, as a claim's key is: reported, marked
in artist_group_members and artist_group_aliases, the rest of its group standing. Two rows whose aliases are one artist
(one key, or keys the claims merged) are refused, naming both, before anything is written.

Artist ids are stable: artist_ids keeps every id ever given and the match_key of the artist that has it now (or had
it last, for an id no artist has). An artist keeps the id of its own key, else the lowest earlier id among the keys
it absorbed; a new artist gets the next id never used. An id no artist has any more is retired into the artist its
keys resolve to now (artist_ids.retired_into), which the site redirects it to.

Usage: mise run resolve
"""

import argparse
import collections
import functools
import itertools
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from collections.abc import Set as AbstractSet
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from fractions import Fraction
from typing import NamedTuple, Self

from pydantic import BaseModel

from pipeline import claims, export, states
from pipeline import db as sqlite_db
from pipeline.countries import codes
from pipeline.db import Reader, Transaction
from pipeline.enums import ArtistKind, ClaimState, MergeDecision, MergeReason, Model, Role, Via
from pipeline.extract import merge_review, run_log
from pipeline.extract.prices import COUPLE
from pipeline.names import PREFIX, clean_display, sim, token_key
from pipeline.records import Group, MergeQuestion, Record, ReviewMention, today
from pipeline.text import tidy_name

SPLIT_ROLES = {Role.TEACHER, Role.DJ, Role.PERFORMER, Role.MC}
ORG_ROLES = {Role.ORGANISER, Role.MEDIA, Role.CREW}
SEPARATORS = re.compile(r'\s*&\s*|\s*\+\s*|\s+(?:and|et|e|y|und)\s+', re.IGNORECASE)
SHORTEST_NAME = 2  # a member's name key shorter than this is a letter of a name built around "&" ("D&L Beats")
REVIEWER = Model.CLAUDE_HAIKU_5_5  # the merge review's model (ask.MODEL)
PAIR = 2  # the keys of a decision on two artists; one key's decides a single name

# the tables this step makes again each time it runs
DDL = """
CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ({artist_kind})),
    match_key TEXT NOT NULL UNIQUE
) STRICT;
CREATE TABLE artist_keys (
    match_key TEXT PRIMARY KEY,   -- every key a mention or member produced, merged ones included, and each artist's
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    produced INTEGER NOT NULL CHECK (produced IN (0, 1))  -- a mention's key, which a claim names; else an artist's own
) STRICT;
CREATE TABLE artist_aliases (
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    alias TEXT NOT NULL,
    mentions INTEGER NOT NULL,
    PRIMARY KEY (artist_id, alias)
) STRICT;
CREATE TABLE artist_names (
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    match_key TEXT NOT NULL,      -- a key its mentions produce: one of its names, of which a merge joined several
    name TEXT NOT NULL,           -- that key's spelling written most often
    roles TEXT NOT NULL,          -- the roles it was named in, comma-separated
    first_date TEXT NOT NULL,     -- its first and last festivals' start day, which may be editions to come
    last_date TEXT NOT NULL,
    festivals INTEGER NOT NULL,
    renamed INTEGER NOT NULL CHECK (renamed IN (0, 1)),  -- the name recent festivals use instead of the usual one
    as_roles TEXT,                -- the roles a person is known by this name in, comma-separated, where their roles'
                                  -- names differ
    PRIMARY KEY (artist_id, match_key)
) STRICT;
CREATE TABLE couple_members (
    couple_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    member_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    PRIMARY KEY (couple_id, member_id)
) STRICT;
CREATE TABLE mention_artists (
    mention_id INTEGER PRIMARY KEY REFERENCES artist_mentions(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX mention_artists_artist ON mention_artists(artist_id);
CREATE VIEW event_artists AS
    SELECT DISTINCT m.event_id, ma.artist_id, m.role,
      (SELECT min(cm.couple_id) FROM couple_members cm JOIN mention_artists c ON c.artist_id = cm.couple_id
         JOIN artist_mentions cn ON cn.id = c.mention_id
       WHERE cm.member_id = ma.artist_id AND cn.event_id = m.event_id AND cn.role = m.role) AS as_couple
    FROM mention_artists ma JOIN artist_mentions m ON m.id = ma.mention_id;
CREATE TABLE merge_reason_definitions (
    reason TEXT PRIMARY KEY,
    definition TEXT NOT NULL
) STRICT;
CREATE TABLE artist_merge_reviews (
    key_a TEXT NOT NULL,
    key_b TEXT NOT NULL,
    question TEXT NOT NULL,       -- the pair as the merge review is asked about it (records.MergeQuestion, JSON)
    PRIMARY KEY (key_a, key_b)
) STRICT;
CREATE TABLE artist_merge_candidates (
    key_a TEXT NOT NULL,
    key_b TEXT NOT NULL,
    name_a TEXT NOT NULL,
    name_b TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ({merge_reason})),
    similarity REAL NOT NULL,
    evidence TEXT NOT NULL,
    decision TEXT CHECK (decision IN ({stored_decision})),   -- the merge claim's on it, NULL = none
    PRIMARY KEY (key_a, key_b)
) STRICT;
CREATE TABLE artist_merge_decisions (
    key_a TEXT NOT NULL,          -- the keys mentions produce, as in artist_keys
    key_b TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ({stored_decision})),
    source TEXT NOT NULL CHECK (source IN ({claim_source})),  -- the claim's that decides it (claims)
    note TEXT NOT NULL,
    PRIMARY KEY (key_a, key_b)
) STRICT;
CREATE TABLE artist_homes (
    artist_id INTEGER PRIMARY KEY REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    country TEXT NOT NULL,        -- where a claim says the artist is from
    source TEXT NOT NULL CHECK (source IN ({claim_source})),
    note TEXT NOT NULL
) STRICT;
CREATE TABLE claims (
    id TEXT PRIMARY KEY,          -- the digest of its text
    source TEXT NOT NULL CHECK (source IN ({claim_source})),
    subject TEXT NOT NULL,        -- JSON: its field, and the thing of that field it is about
    claim TEXT NOT NULL,          -- JSON: the claim, as its file holds it
    made_at TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ({claim}))
) STRICT;
CREATE TABLE artist_group_definitions (
    group_key TEXT PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    display_name TEXT NOT NULL,
    note TEXT
) STRICT;
CREATE TABLE artist_group_aliases (
    group_key TEXT NOT NULL REFERENCES artist_group_definitions(group_key) DEFERRABLE INITIALLY DEFERRED,
    match_key TEXT NOT NULL,      -- a spelling's key whose mentions count as the group's
    produced INTEGER NOT NULL CHECK (produced IN (0, 1)),  -- 0: no mention produces it, so it is orphaned
    PRIMARY KEY (group_key, match_key)
) STRICT;
CREATE TABLE artist_group_members (
    group_key TEXT NOT NULL REFERENCES artist_group_definitions(group_key) DEFERRABLE INITIALLY DEFERRED,
    match_key TEXT NOT NULL,      -- a member's key, which couple_members links the group to
    produced INTEGER NOT NULL CHECK (produced IN (0, 1)),  -- 0: no mention produces it, so it is orphaned
    PRIMARY KEY (group_key, match_key)
) STRICT;
"""
# every event an artist appears at: booked as themselves (a member listed beside their couple in the same role repeats
# its booking), or through a couple or group; the site's database declares it alike, over its own event_artists
ARTIST_EVENTS = """
CREATE VIEW artist_events AS
    SELECT ea.artist_id, ea.event_id, ea.role, '{via_direct}' AS via, NULL AS via_artist_id
    FROM event_artists ea WHERE ea.as_couple IS NULL
    UNION ALL
    SELECT cm.member_id, ea.event_id, ea.role, '{via_member}', ea.artist_id
    FROM event_artists ea JOIN couple_members cm ON cm.couple_id = ea.artist_id;
"""
VIA = {'via_direct': Via.DIRECT, 'via_member': Via.MEMBER}  # the states ARTIST_EVENTS names
# the export's table of every id given, which this step only adds to (tests/test_steps.py holds the export to it)
KEPT = sqlite_db.declared("""CREATE TABLE artist_ids (
    artist_id INTEGER PRIMARY KEY,  -- every artist id ever given; never reused
    match_key TEXT NOT NULL UNIQUE, -- the key of the artist that has it, or had it last
    retired_into INTEGER            -- the artist its keys went to once no artist had it; NULL while one has
) STRICT""")
# a review that could not tell (unsure) decides nothing: the pair stays a candidate, and no claim holds it
STORED = (MergeDecision.MERGE, MergeDecision.SEPARATE)
TABLES = sqlite_db.declared(
    (DDL + ARTIST_EVENTS).format_map(states.SQL_IN | VIA | {'stored_decision': states.sql_in('merge_decision', STORED)})
)


def country_codes(text: str | None) -> frozenset[str]:
    """ISO 3166 alpha-2 codes for a country as written (countries.codes)."""
    return frozenset(codes(text))


def members_of(name: str, role: Role) -> list[str]:
    # A single letter on each side of "&" is a name built around it ("D&L Beats", "DJ M&M"), not a couple
    if role not in SPLIT_ROLES or re.search(r'(?<!\w)\w\s*&\s*\w(?!\w)', unicodedata.normalize('NFKC', name)):
        return [clean_display(name)]
    parts = [p for p in SEPARATORS.split(clean_display(name)) if token_key(p)]
    # A one-letter part means a name built around "&" (the DJ duo "D&L Beats"), not two people
    if len(parts) < COUPLE or any(len(token_key(p)) < SHORTEST_NAME for p in parts):
        return [clean_display(name)]
    return parts


def role_family(role: Role) -> str:
    return 'dj' if role == Role.DJ else 'dance'


def words_of(name: str) -> list[str]:
    return [w for w in (token_key(w) for w in PREFIX.sub('', clean_display(name)).split()) if w]


def person_key(name: str, role: Role, couple_scope: str | None) -> str:
    k = token_key(name)
    if len(words_of(name)) > 1:
        return f'p:{k}'
    return f'p:{k}@{couple_scope}' if couple_scope else f'p:{k}@{role_family(role)}'


class UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)

    def absorb(self, root: str, keys: Iterable[str]) -> None:
        """Join these keys into root, which stays their root."""
        _ = self.find(root)
        for k in keys:
            self.parent[self.find(k)] = root

    def join(self, keys: Iterable[str]) -> None:
        """Join these keys into one."""
        first, *rest = sorted(keys)
        for other in rest:
            self.union(first, other)

    def roots(self, keys: Iterable[str]) -> int:
        """How many artists these keys are."""
        return len({self.find(k) for k in keys})


TABLE_DOCS = {
    'artists': 'One row per resolved artist: a person, a couple, a group (several people booked under one name, or '
    'a team) or an organisation, with its most common spelling, in one casing (pipeline/text.py tidy_name), as '
    'display name.',
    'artist_aliases': 'Every spelling an artist was written as, with how many mentions used it.',
    'artist_names': 'Each name an artist was booked under (a key of theirs, a merge having joined several): its usual '
    'spelling, roles, first and last festivals, whether recent festivals renamed them to it, and the roles it names a '
    'person in when their roles know them by different names.',
    'artist_keys': 'Every name key a mention or couple member produced, and the artist it resolved to (merged keys '
    'included). The keys in artist_merge_candidates, artist_merge_decisions and artist_group_aliases '
    'are these keys.',
    'couple_members': "The people in each couple or group (couple_id is the couple's or group's artist id).",
    'mention_artists': 'The resolved artist of each mention (artist_mentions.id), whose style and stated country '
    'artist_mentions holds.',
    'event_artists': 'Each artist booked at an event, in a role: once however often its line-up names them. as_couple '
    'is set when a member is listed in the same role as their couple at the same event: that row repeats the '
    'couple’s booking and is left out of line-ups and statistics.',
    'artist_events': "Every event an artist appears at: booked as themselves (via 'direct', the rows of event_artists "
    "with no as_couple) or as a member of a couple or group (via 'member', via_artist_id = the couple or group). Use "
    "it for a person's full event history.",
    'artist_merge_candidates': 'Pairs of name keys that may be the same artist, with the reason, similarity and '
    'evidence; decision is NULL when no merge or separate decision exists (left apart).',
    'merge_reason_definitions': 'What each reason in artist_merge_candidates means.',
    'artist_merge_reviews': 'The pairs the merge review asks about (pipeline/extract/merge_review.py): every '
    'candidate, and every pair a review answered before, each with its names, reason, evidence and mentions.',
    'artist_merge_decisions': 'Every merge or separate decision applied, with the review prompt that made it (its '
    'hash; null when it was decided by hand) and rationale.',
    'artist_group_definitions': 'Named groups defined by hand (a DJ duo booked under one name), with a note; members '
    'are in couple_members.',
    'artist_group_aliases': "The name keys whose mentions count as a named group's; produced = 0 for one no "
    'mention produces, which is orphaned (it means nothing until pipeline/extract/groups.csv names the key the artist '
    'has now).',
    'artist_group_members': "Each named group's members by key, as pipeline/extract/groups.csv lists them; produced "
    '= 0 for one no mention produces, which is orphaned (couple_members links the group to the others).',
    'artist_homes': 'Each artist a home claim says where they are from (pipeline/claims.py): the country, the source '
    'of the claim that decides it, and its note.',
    'claims': 'Every claim (pipeline/claims.py), of every source: its subject and text, when it was made, and its '
    'state: applied (it decides its subject), overridden (another claim comes first) or orphaned (it names a key no '
    'mention produces, and decides nothing).',
    'artist_ids': 'Every artist id ever given, and the match_key of the artist that has it now, or had it last. An id '
    'missing from artists was retired: retired_into is the artist its keys went to, when any did.',
}


@dataclass(frozen=True)
class Claimed:
    """The claims that decide, each on keys a mention produces; and every claim's state."""

    merges: Mapping[frozenset[str], claims.Made[claims.MergeClaim]]
    homes: Sequence[claims.Made[claims.HomeClaim]]
    bookings: Sequence[claims.Made[claims.BookingClaim]]
    state: dict[str, ClaimState]  # by claim id


class Resolved(NamedTuple):
    """What resolving the mentions came to: how many mentions, artists of each kind, candidates listed, same-name
    pairs kept apart for want of evidence, named groups, and the keys of theirs no mention produces."""

    mentions: int
    kinds: Mapping[str, int]
    candidates: int
    unsupported: int
    groups: int
    orphaned_group_keys: int


def record_steps(con: Transaction, resolved: Resolved, decided: Claimed) -> None:
    n_mentions, kinds_count, n_candidates, n_unsupported, n_groups, n_orphaned = resolved
    run_log.document(con, TABLE_DOCS, 'pipeline/extract/resolve_artists.py')
    if made := merge_review.current():
        hashes = sorted({r.prompt for r in made})
        for h in hashes:
            run_log.record_prompt(con, h)
        run_log.record(
            con,
            run_log.Step(
                '6_merge_review',
                'Decide, for each pair of artist records the matching rules flagged as possibly the same artist, or a '
                'review decided before, whether they are (merge), are not (separate), or the evidence does not settle '
                'it (unsure, left unmerged). Each answer is a model claim: an admin claim on a pair comes first.',
                f'pipeline/extract/ask.py ({REVIEWER}), one pair',
                performed_at=max(r.answered_at for r in made),
                model=REVIEWER,
                prompt=', '.join(hashes),
                inputs='table artist_merge_reviews: each pair with mentions of both sides',
                outputs='pipeline/extract/answers/merge_review/; table artist_merge_decisions',
                details={'decisions': dict(Counter(str(r.answer.decision) for r in made)), 'pairs': len(made)},
            ),
        )
    else:
        run_log.forget(con, '6_merge_review')
    run_log.record(
        con,
        run_log.Step(
            '7_resolve_artists',
            'Group artist mentions into people, couples, groups and organisations: exact name keys merge automatically '
            '(single-word names only within their couple or role family), the claims decide merges (two merged '
            "couples' members too), moved bookings and given homes, named groups from pipeline/extract/groups.csv "
            'absorb their spellings, and near-matches without a decision are kept apart and listed in '
            'artist_merge_candidates.',
            'pipeline/extract/resolve_artists.py',
            inputs='table artist_mentions; the claims (pipeline/claims.py); pipeline/extract/groups.csv',
            outputs='tables artists, artist_aliases, artist_keys, couple_members, mention_artists, '
            'artist_merge_candidates, merge_reason_definitions, artist_merge_decisions, artist_homes, claims, '
            'artist_group_definitions, artist_group_aliases, artist_group_members; views event_artists, artist_events',
            details={
                'mentions': n_mentions,
                'artists_by_kind': kinds_count,
                'claims': dict(Counter(str(v) for v in decided.state.values())),
                'merge_decisions': dict(Counter(f'{m.source} {m.claim.decision}' for m in decided.merges.values())),
                'named_groups': n_groups,
                'named_group_keys_orphaned': n_orphaned,
                'candidates_listed': n_candidates,
                'same_name_pairs_kept_apart_without_evidence': n_unsupported,
            },
        ),
    )


class Keyed(BaseModel):
    match_key: str
    artist_id: int


def stable_ids(con: Reader, final_key: Mapping[str, str]) -> dict[str, int]:
    """An id for each artist (final key): its own earlier id, else the lowest earlier id of a key it absorbed that
    no artist still owns, else the next id never given."""
    issued = {r.match_key: r.artist_id for r in con.rows(Keyed, 'SELECT match_key, artist_id FROM artist_ids')}
    key_was = {r.match_key: r.artist_id for r in con.rows(Keyed, 'SELECT match_key, artist_id FROM artist_keys')}
    finals = sorted(set(final_key.values()))
    ids = {fk: issued[fk] for fk in finals if fk in issued}
    taken = set(ids.values())
    absorbed: defaultdict[str, set[int]] = defaultdict(set)
    for k, fk in final_key.items():
        if k in key_was:
            absorbed[fk].add(key_was[k])
    next_id = max([*issued.values(), *key_was.values(), 0]) + 1
    for fk in finals:
        if fk in ids:
            continue
        if free := sorted(absorbed[fk] - taken):
            ids[fk] = free[0]
        else:
            ids[fk], next_id = next_id, next_id + 1
        taken.add(ids[fk])
    return ids


def retired_into(con: Reader, final_key: Mapping[str, str], ids: Mapping[str, int]) -> dict[int, int]:
    """Each id no artist has now, and the artist its keys of the last run mostly resolve to now, when any does."""
    current = set(ids.values())
    was: defaultdict[int, Counter[int]] = defaultdict(Counter)
    for r in con.rows(Keyed, 'SELECT match_key, artist_id FROM artist_keys'):
        if r.artist_id not in current and r.match_key in final_key:
            was[r.artist_id][ids[final_key[r.match_key]]] += 1
    return {old: now.most_common(1)[0][0] for old, now in was.items()}


def retire(con: Transaction, ids: Mapping[str, int], moved_on: Mapping[int, int]) -> None:
    """Record the ids given (artist_ids) and where the ids no artist has now went. An id an artist has again is
    retired into nothing: left as it was, the id it went to could go back to it, and the two would redirect to each
    other for ever. An id an artist keeps under a key of its own (it absorbed the key the id was given to) is the
    artist's key's now: its key no other id has, as stable_ids gives an artist the id of its key when one was given."""
    con.executemany(
        'INSERT INTO artist_ids (artist_id, match_key) VALUES (?, ?)'
        ' ON CONFLICT (artist_id) DO UPDATE SET match_key = excluded.match_key, retired_into = NULL',
        [(i, fk) for fk, i in ids.items()],
    )
    con.executemany('UPDATE artist_ids SET retired_into = ? WHERE artist_id = ?', [(n, o) for o, n in moved_on.items()])


class Mention(Record):
    """An artist as one event's description names it, and the event's country."""

    id: int
    event_id: int
    role: Role
    name_as_written: str
    style: str | None
    country: str | None
    event_country: str | None
    source_line: str


@dataclass(frozen=True)
class Keys:
    """What the mentions say of each key: its names as written, its kind, its members (a couple or group's), the
    countries stated with it (all of them, and each mention's), its events' countries, its partners, and each
    couple's spellings of a member. Read-only: keyed() gathers it."""

    names: Mapping[str, Sequence[str]]
    kinds: Mapping[str, ArtistKind]
    members: Mapping[str, Sequence[str]]
    stated_countries: Mapping[str, AbstractSet[str]]
    stated_sets: Mapping[str, AbstractSet[frozenset[str]]]
    event_countries: Mapping[str, AbstractSet[str]]
    partners: Mapping[str, AbstractSet[str]]
    mention_key: Mapping[int, str]
    # couple key -> member token -> person keys seen for that member ("Chris’Py" and "Chris Py" in the same couple
    # give one single-word and one multi-word key for the same person)
    member_forms: Mapping[str, Mapping[str, AbstractSet[str]]]


@dataclass(frozen=True)
class Gathered:
    """Keys as keyed() gathers them, mention by mention."""

    names: defaultdict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    kinds: dict[str, ArtistKind] = field(default_factory=dict[str, ArtistKind])
    members: dict[str, list[str]] = field(default_factory=dict[str, list[str]])
    stated_countries: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    stated_sets: defaultdict[str, set[frozenset[str]]] = field(default_factory=lambda: defaultdict(set))
    event_countries: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    partners: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    mention_key: dict[int, str] = field(default_factory=dict[int, str])
    member_forms: defaultdict[str, defaultdict[str, set[str]]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(set))
    )

    def keys(self) -> Keys:
        """What was gathered, as plain mappings: reading a key nothing said gives no entry."""
        return Keys(
            dict(self.names),
            dict(self.kinds),
            dict(self.members),
            dict(self.stated_countries),
            dict(self.stated_sets),
            dict(self.event_countries),
            dict(self.partners),
            dict(self.mention_key),
            {k: dict(v) for k, v in self.member_forms.items()},
        )


def apart(pkeys: list[str]) -> list[str]:
    """Members' keys, each its own: members who share a name ("Chiara & Chiara") are two people, keyed by their
    place among those who share it (#1, #2)."""
    seen: collections.Counter[str] = collections.Counter()
    out: list[str] = []
    for pk in pkeys:
        seen[pk] += 1
        out.append(f'{pk}#{seen[pk]}' if pkeys.count(pk) > 1 else pk)
    return out


def person_keys(keys: Gathered, m: Mention) -> tuple[str, list[str]]:
    """(the mention's key, the person keys of its members) for a mention of people: one, a couple or a group."""
    parts = members_of(m.name_as_written, m.role)
    scope = '+'.join(sorted(token_key(p) for p in parts)) if len(parts) > 1 else None
    pkeys = apart([person_key(p, m.role, scope) for p in parts])
    for p, pk in zip(parts, pkeys, strict=True):
        keys.names[pk].append(p)
        keys.kinds[pk] = ArtistKind.PERSON
        if codes := country_codes(m.country):
            keys.stated_countries[pk].update(codes)
            keys.stated_sets[pk].add(codes)
        if m.event_country:
            keys.event_countries[pk].add(m.event_country)
        keys.partners[pk].update(set(pkeys) - {pk})
    if scope is None:
        return pkeys[0], pkeys
    key = 'c:' + scope
    keys.kinds[key] = ArtistKind.COUPLE if len(pkeys) == COUPLE else ArtistKind.GROUP
    keys.members[key] = pkeys
    for form, pk in zip(apart([token_key(p) for p in parts]), pkeys, strict=True):  # a member's spellings, by place
        keys.member_forms[key][form].add(pk)
    return key, pkeys


def keyed(mentions: Iterable[Mention], groups: Iterable[Group]) -> Keys:
    """The keys of every mention and of its members, and the named groups' keys with their members."""
    keys = Gathered()
    for m in mentions:
        pkeys_seen: list[str] = []
        if m.role in ORG_ROLES:
            key = f'o:{token_key(m.name_as_written)}'
            keys.kinds[key] = ArtistKind.ORGANISATION if m.role == Role.ORGANISER else ArtistKind.GROUP
        else:
            key, pkeys_seen = person_keys(keys, m)
        if key not in pkeys_seen:  # a solo name was already counted as its single part
            keys.names[key].append(clean_display(m.name_as_written))
        if m.event_country:
            keys.event_countries[key].add(m.event_country)
        keys.mention_key[m.id] = key
    for g in groups:
        keys.kinds[g.group_key] = ArtistKind.GROUP
        keys.members[g.group_key] = [m for m in g.members if m in keys.kinds]
    return keys.keys()


def named(c: claims.AnyClaim) -> tuple[str, ...]:
    """The keys a claim names, which a mention must produce for it to apply."""
    match c:
        case claims.MergeClaim():
            return c.keys
        case claims.HomeClaim():
            return (c.key,)
        case claims.BookingClaim():
            return (c.from_key, c.to_key)
        case claims.SiteClaim():  # tickets applies it
            return ()


def claimed(keys: Keys, made: Sequence[claims.Made]) -> Claimed:
    """Each subject's deciding claim, kept when every key it names is one a mention produces, else orphaned (ignored
    until re-pointed, never stopping the run); the others are overridden."""
    state = {m.id: ClaimState.OVERRIDDEN for m in made}
    merges: dict[frozenset[str], claims.Made[claims.MergeClaim]] = {}
    homes: list[claims.Made[claims.HomeClaim]] = []
    bookings: list[claims.Made[claims.BookingClaim]] = []
    for m in claims.resolved(made).values():
        if any(k not in keys.kinds for k in named(m.claim)):
            state[m.id] = ClaimState.ORPHANED
            continue
        state[m.id] = ClaimState.APPLIED
        match m.claim:
            case claims.MergeClaim() as c:
                merges[frozenset(c.keys)] = claims.Made(c, m.source)
            case claims.HomeClaim() as c:
                homes.append(claims.Made(c, m.source))
            case claims.BookingClaim() as c:
                bookings.append(claims.Made(c, m.source))
            case claims.SiteClaim():
                pass
    return Claimed(merges, homes, bookings, state)


class Candidate(NamedTuple):
    """A pair of keys that may be one artist (a row of artist_merge_candidates)."""

    key_a: str
    key_b: str
    name_a: str
    name_b: str
    reason: MergeReason
    similarity: float
    evidence: str
    decision: MergeDecision | None


SIMILAR = Fraction(22, 25)  # how alike two keys must be (names.sim, exactly) to be spellings of one name
SHORTEST = 3  # the shortest name a name can shorten, or begin
SIMILAR_SHORTEST = 5  # the shortest name compared by spelling


def letters(name: str) -> list[tuple[str, int]]:
    """A name's letters as a set: each letter with how many times it came before ('anna': a1 n1 n2 a2)."""
    seen: Counter[str] = Counter()
    out: list[tuple[str, int]] = []
    for ch in name:
        seen[ch] += 1
        out.append((ch, seen[ch]))
    return out


def spelled_alike(names: Mapping[str, str]) -> set[tuple[str, str]]:
    """The pairs of keys whose names have letters enough in common to be SIMILAR by quick_ratio (twice the letters in
    common over both lengths), an upper bound of ratio. A name SIMILAR to another has SIMILAR / (2 - SIMILAR) of its
    letters in common with it, so the two share a letter among each name's first letters past that many, in one
    order of all letters, rarest first; only names sharing one of those are compared."""
    of = {k: letters(n) for k, n in names.items()}
    rarity = Counter(t for ls in of.values() for t in ls)
    first: defaultdict[tuple[str, int], list[str]] = defaultdict(list)
    for k, ls in of.items():
        common = math.ceil(SIMILAR * len(ls) / (2 - SIMILAR))
        for t in sorted(ls, key=lambda t: (rarity[t], t))[: len(ls) - common + 1]:
            first[t].append(k)
    return {
        pair
        for g in first.values()
        for pair in itertools.combinations(sorted(g), 2)
        if SequenceMatcher(None, names[pair[0]], names[pair[1]]).quick_ratio() >= SIMILAR
    }


@dataclass(frozen=True)
class Person:
    """What a person key's pairs are judged on: its bare name, its words, the countries stated with it, its events'
    countries and its partners' bare names."""

    bare: str
    words: tuple[str, ...]
    stated: frozenset[str]
    stated_sets: frozenset[frozenset[str]]  # each mention's
    events: frozenset[str]
    partners: frozenset[str]

    @functools.cached_property
    def strong_evidence(self) -> frozenset[str]:
        """What two people must have in common for strong evidence: a stated country or a partner. Events in the same
        country are weak evidence (one country hosts a quarter of all events)."""
        return frozenset({f'country {c}' for c in self.stated} | {f'partner {n}' for n in self.partners})

    def strong(self, other: Self) -> bool:
        return bool(self.strong_evidence & other.strong_evidence)

    def several(self) -> bool:
        """Of several words, and long enough to be compared by spelling."""
        return len(self.words) > 1 and len(self.bare) >= SIMILAR_SHORTEST


def similar(a: Person, b: Person) -> float | None:
    """How alike the two are spelled, when at least SIMILAR."""
    if min(len(a.bare), len(b.bare)) < SIMILAR_SHORTEST:
        return None
    sm = SequenceMatcher(None, a.bare, b.bare)
    # real_quick_ratio and quick_ratio are upper bounds of ratio, so they rule pairs out cheaply
    if sm.real_quick_ratio() < SIMILAR or sm.quick_ratio() < SIMILAR or (sim := sm.ratio()) < SIMILAR:
        return None
    return sim


def strongly(a: Person, b: Person) -> tuple[MergeReason, float] | None:
    """Why a pair with strong evidence may be one person, and how alike their names are."""
    short, long_ = (a.words, b.words) if len(a.words) <= len(b.words) else (b.words, a.words)
    if a.bare == b.bare:
        return MergeReason.SAME_NAME__DIFFERENT_KEYS, 1.0
    if short and len(short) < len(long_) and long_[: len(short)] == short and len(short[0]) >= SHORTEST:
        return MergeReason.FIRST_WORDS_OF_THE_OTHER, SequenceMatcher(None, a.bare, b.bare).ratio()
    if (
        a.partners & b.partners
        and min(len(a.bare), len(b.bare)) >= SHORTEST
        and (a.bare.startswith(b.bare) or b.bare.startswith(a.bare))
    ):
        return MergeReason.SAME_PARTNER__SHORTENED_NAME, SequenceMatcher(None, a.bare, b.bare).ratio()
    return None if (sim := similar(a, b)) is None else (MergeReason.SIMILAR_SPELLING, sim)


def weakly(a: Person, b: Person) -> tuple[MergeReason, float] | None:
    """A pair with weak evidence: names of several words each spelled alike, at events in one country. Different
    first names are often one letter apart (Daniel / Daniela), and many people share one, so single words, and
    same names, need strong evidence."""
    if not (a.several() and b.several() and a.events & b.events):
        return None
    return None if (sim := similar(a, b)) is None else (MergeReason.SIMILAR_SPELLING, sim)


@dataclass(frozen=True)
class Pairing:
    """The person keys, and what their pairs are judged on."""

    keys: Keys
    people: dict[str, Person]

    @classmethod
    def of(cls, keys: Keys) -> Self:
        """The pairing of the person keys."""
        bare = {k: k[2:].split('@')[0] for k in keys.kinds if k.startswith('p:')}
        people = {
            k: Person(
                b,
                tuple(words_of(keys.names[k][0])),
                frozenset(keys.stated_countries.get(k, ())),
                frozenset(keys.stated_sets.get(k, ())),
                frozenset(keys.event_countries.get(k, ())),
                frozenset(bare[p] for p in keys.partners[k]),
            )
            for k, b in bare.items()
        }
        return cls(keys, people)

    def reason(self, a: str, b: str) -> tuple[MergeReason, float] | None:
        """Why the pair may be one person, and how alike their names are; None when it may not, or the evidence is
        too weak."""
        pa, pb = self.people[a], self.people[b]
        return strongly(pa, pb) if pa.strong(pb) else weakly(pa, pb)

    def judged(self) -> set[tuple[str, str]]:
        """The pairs reason() can accept: those with strong evidence in common, and those weakly() can, of several
        words each and spelled alike."""
        shared: defaultdict[str, list[str]] = defaultdict(list)
        for k, p in self.people.items():
            for e in p.strong_evidence:
                shared[e].append(k)
        strong = {pair for g in shared.values() for pair in itertools.combinations(sorted(g), 2)}
        return strong | spelled_alike({k: p.bare for k, p in self.people.items() if p.several()})

    def evidence(self, a: str, b: str) -> str:
        """What a reviewer weighs: each side's name, stated countries, events' countries and partners."""
        k = self.keys

        def side(x: str) -> str:
            p = self.people[x]
            return (
                f'{k.names[x][0]!r}: countries {sorted(p.stated) or "-"}, events in {sorted(p.events)[:4]},'
                f' partners {sorted(q[2:] for q in k.partners[x])[:4]}'
            )

        return f'{side(a)} | {side(b)}'


def candidates(keys: Keys, merges: Mapping[frozenset[str], MergeDecision]) -> tuple[list[Candidate], int]:
    """(the pairs among person keys that may be one artist, with any decision on them; how many same-name pairs were
    kept apart for want of evidence). Couples follow their members."""
    pairing = Pairing.of(keys)
    names = keys.names
    out: list[Candidate] = []
    for a, b in sorted(pairing.judged()):
        if (found := pairing.reason(a, b)) is not None:
            reason, sim = found
            decision = merges.get(frozenset((a, b)))
            out.append(
                Candidate(a, b, names[a][0], names[b][0], reason, round(sim, 3), pairing.evidence(a, b), decision)
            )
    for k, p in sorted(pairing.people.items()):
        if '@' in k and any(not (x & y) for x, y in itertools.combinations(p.stated_sets, 2)):
            name = names[k][0]
            evidence = f'countries {sorted(p.stated)}'
            out.append(
                Candidate(
                    k,
                    k,
                    name,
                    name,
                    MergeReason.SINGLE_NAME__SEVERAL_COUNTRIES,
                    0.0,
                    evidence,
                    merges.get(frozenset((k,))),
                )
            )
    # a same-name pair is a candidate exactly when the evidence is strong; the others were kept apart
    same_name = sum(n * (n - 1) // 2 for n in Counter(p.bare for p in pairing.people.values()).values())
    return out, same_name - sum(c.reason == MergeReason.SAME_NAME__DIFFERENT_KEYS for c in out)


REVIEWED_MENTIONS = 12  # the mentions of each side a review is shown, the first by event


def reviews(
    keys: Keys, mentions: Sequence[Mention], found: Sequence[Candidate], answered: Iterable[tuple[str, str]]
) -> list[MergeQuestion]:
    """The pairs the merge review asks about: every candidate, and every pair of person keys a review answered before
    (answered), each with its names, the candidate's reason (none for a pair no candidate now), its evidence and each
    side's mentions."""
    pairing = Pairing.of(keys)
    of_key: defaultdict[str, list[Mention]] = defaultdict(list)
    for m in sorted(mentions, key=lambda m: (m.event_id, m.id)):
        of_key[keys.mention_key[m.id]].append(m)

    def side(k: str) -> tuple[ReviewMention, ...]:
        return tuple(
            ReviewMention(
                event_id=m.event_id,
                event_country=m.event_country,
                role=m.role,
                name_as_written=m.name_as_written,
                style=m.style,
                country=m.country,
                source_line=m.source_line,
            )
            for m in of_key[k][:REVIEWED_MENTIONS]
        )

    asked: dict[tuple[str, str], tuple[MergeReason | None, str]] = {
        (c.key_a, c.key_b): (c.reason, c.evidence) for c in found
    }
    for a, b in answered:
        if (a, b) not in asked and a != b and a in pairing.people and b in pairing.people:
            asked[a, b] = (None, pairing.evidence(a, b))
    return [
        MergeQuestion(
            key_a=a,
            key_b=b,
            name_a=keys.names[a][0],
            name_b=keys.names[b][0],
            reason=reason,
            evidence=evidence,
            a=side(a),
            b=side(b),
        )
        for (a, b), (reason, evidence) in sorted(asked.items())
    ]


def merged(keys: Keys, merges: Mapping[frozenset[str], MergeDecision]) -> UnionFind:
    """The keys joined: a couple's spellings of one member, the reviewed merges, and the same single-word member of
    couples whose partners are one person."""
    uf = UnionFind()
    for k in keys.kinds:
        _ = uf.find(k)
    for forms in keys.member_forms.values():
        for spellings in forms.values():
            uf.join(spellings)
    for pair, decision in merges.items():
        if decision == MergeDecision.MERGE and len(pair) == PAIR and all(k in keys.kinds for k in pair):
            uf.join(pair)
            for members in paired(keys, *sorted(pair)):
                uf.join(members)
    # Once partners are merged, further couples' single-word members align: repeat until no new merge appears.
    before = 0
    while (now := uf.roots(keys.kinds)) != before:
        before = now
        for spellings in same_members(keys, uf):
            uf.join(spellings)
    return uf


def paired(keys: Keys, a: str, b: str) -> list[tuple[str, str]]:
    """Two couples' members, each with the other's member of the closest name: the people two merged couples are."""
    ma, mb = keys.members.get(a, ()), keys.members.get(b, ())
    if not len(ma) == len(mb) == COUPLE:
        return []

    def alike(x: str, y: str) -> float:
        return sim(token_key(keys.names[x][0]), token_key(keys.names[y][0]))

    straight = alike(ma[0], mb[0]) + alike(ma[1], mb[1])
    crossed = alike(ma[0], mb[1]) + alike(ma[1], mb[0])
    return list(zip(ma, mb if straight >= crossed else list(reversed(mb)), strict=True))


def same_members(keys: Keys, uf: UnionFind) -> list[set[str]]:
    """The single-word members that are one person. A single-word member is scoped to its couple's spelling of the
    partner ("ISA" in "MADY & ISA" and in "Mady Keita & ISA"); once the partners are merged, the same single word with
    the same partner is the same person."""
    same: defaultdict[tuple[str, tuple[str, ...]], set[str]] = defaultdict(set)
    for ms in keys.members.values():
        for m in ms:
            if '@' in m:
                partner_roots = tuple(sorted(uf.find(x) for x in ms if x != m))
                same[(m[2:].split('@')[0], partner_roots)].add(m)
    return list(same.values())


def orphaned(keys: Keys, groups: Iterable[Group]) -> dict[str, list[str]]:
    """Each named group's members and aliases no mention produces (a re-extraction respelled them), by group: they
    mean nothing until groups.csv names the key the artist has now, and the rest of the group stands."""
    return {g.group_key: dead for g in groups if (dead := [k for k in (*g.members, *g.aliases) if k not in keys.kinds])}


def contested(keys: Keys, uf: UnionFind, groups: Sequence[Group]) -> list[str]:
    """The groups.csv rows whose aliases are one artist with another row's (the same key, or keys the claims merged):
    each such pair of rows, by line, which no run can fold into one group or the other."""
    rows: defaultdict[str, list[tuple[int, Group, str]]] = defaultdict(list)
    for line, g in enumerate(groups, 2):  # the header is line 1
        for a in g.aliases:
            if a in keys.kinds:
                rows[uf.find(a)].append((line, g, a))
    return [
        f'{Group.FILE} line {la} ({ga.group_key}, alias {a}) and line {lb} ({gb.group_key}, alias {b}): one artist,'
        ' which one group can take'
        for found in rows.values()
        for (la, ga, a), (lb, gb, b) in itertools.combinations(found, 2)
        if ga.group_key != gb.group_key
    ]


def final_keys(keys: Keys, uf: UnionFind, groups: Iterable[Group]) -> dict[str, str]:
    """Each key's artist: its named group, its couple re-keyed from its members' artists, or the key it was merged
    into. Named groups fold in their alias keys (none contested: one artist's keys fold into one group) and are linked
    to their members."""
    group_keys: set[str] = set()
    for g in groups:
        group_keys.add(g.group_key)
        uf.absorb(g.group_key, [a for a in g.aliases if a in keys.kinds])

    def couple_root(k: str) -> str:
        return 'c:' + '+'.join(sorted(uf.find(m)[2:] for m in keys.members[k]))

    out: dict[str, str] = {}
    for k in keys.kinds:
        root = uf.find(k)
        out[k] = root if root in group_keys else couple_root(k) if k in keys.members else root
    return out


@dataclass(frozen=True)
class Use:
    """A key named at a festival: when it starts, and in which role."""

    event_id: int
    start: str
    role: Role


DAY = 10  # a start's day, YYYY-MM-DD, of its date and time
RECENT = 2  # the seasons (calendar years, this one and the last) a rename shows in
RENAMED = 2  # the festivals of those seasons a newer name needs, where the usual one appears at none


def renamed_key(uses: Mapping[str, Sequence[Use]], year: int) -> str | None:
    """The key of an artist's that recent festivals use instead of the one named most often: at RENAMED of them in
    the last RECENT seasons, where the usual one is at none, which is a rename; a one-off spelling or a far-off edition
    doesn't make one. None when there is no rename."""
    if not uses:
        return None
    usual = max(sorted(uses), key=lambda k: len(uses[k]))

    def recent(k: str) -> set[int]:
        return {u.event_id for u in uses[k] if int(u.start[:4]) > year - RECENT}

    newer = [k for k in sorted(uses) if k != usual and len(recent(k)) >= RENAMED]
    return max(newer, key=lambda k: len(recent(k))) if newer and not recent(usual) else None


def spelled_apart(a: str, b: str) -> bool:
    """Whether two names are two names, not two spellings of one: a DJ prefix on one makes a name of its own ("DJ
    Ichigo" / "Ichigo"); otherwise they are one name written alike (SIMILAR), or two (Kevin Djassy / DJ Kevin)."""
    ka, kb = token_key(a), token_key(b)
    if ka == kb:
        return bool(PREFIX.match(clean_display(a))) != bool(PREFIX.match(clean_display(b)))
    return SequenceMatcher(None, ka, kb).ratio() < SIMILAR


def role_names(names: Mapping[str, str], uses: Mapping[str, Sequence[Use]]) -> dict[str, list[Role]]:
    """A person's keys that name them in a role, by key, when the names of their roles are two names or more: each
    role's name is its key named at most festivals there. Empty when every role knows them by one name."""
    best: dict[Role, str] = {}
    for role in sorted({u.role for us in uses.values() for u in us}):
        best[role] = max(sorted(uses), key=lambda k: len({u.event_id for u in uses[k] if u.role == role}))
    shown = {names[k] for k in best.values()}
    if not any(spelled_apart(a, b) for a in shown for b in shown):
        return {}
    out: dict[str, list[Role]] = defaultdict(list)
    for role, k in best.items():
        out[k].append(role)
    return dict(out)


def bare(name: str) -> str:
    return ''.join(ch for ch in unicodedata.normalize('NFD', name) if not unicodedata.combining(ch))


def usual_spelling(counts: Mapping[str, int]) -> str:
    """The spelling written most often, as the site shows it (tidy_name): spellings it tidies alike count together
    ("DJ Vasco", "Dj Vasco", "DJ VASCO"). One in capitals with no accent (capitals drop them) stands for the spelling in
    small letters it could be that is written most ("CESAR" for "César", "BONIFACIO" for "Bonifácio" written twice to
    "Bonifacio"'s once), and for neither of two written as often; one in capitals with accents is as written. Of two as
    often, the one written most often as such, then the shorter, then the one seen first."""
    small: Counter[str] = Counter()
    for written, n in counts.items():
        if written != written.upper():
            small[tidy_name(written)] += n
    tidied: Counter[str] = Counter()
    most: Counter[str] = Counter()
    for written, n in counts.items():
        t = tidy_name(written)
        if written == written.upper() and bare(t) == t:  # capitals with no accent: which spelling's?
            could = sorted((w for w in small if bare(w) == bare(t)), key=lambda w: -small[w])
            if len(could) > 1 and small[could[0]] == small[could[1]]:
                continue  # either spelling's, so neither's
            t = could[0] if could else t
        tidied[t] += n
        most[t] = max(most[t], n)
    return max(tidied, key=lambda t: (tidied[t], most[t], -len(t)))


def spelled(names: Sequence[str]) -> str:
    """A key's usual spelling (usual_spelling)."""
    return usual_spelling(Counter(names))


@dataclass(frozen=True)
class Named:
    """What names an artist beside their keys: a named group's own name, and when and as what each key was named."""

    groups: Mapping[str, str]  # a group key's display name (pipeline/extract/groups.csv)
    uses: Mapping[str, Sequence[Use]]


def write_artists(
    con: Transaction, keys: Keys, final_key: Mapping[str, str], ids: Mapping[str, int], named_by: Named
) -> None:
    """The artists, their names (each key's, with when and as what it was named), spellings, keys and members."""
    group_display, uses = named_by.groups, named_by.uses
    alias_counts: defaultdict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    for k, ns in keys.names.items():
        for n in ns:
            alias_counts[final_key[k]][n] += 1
    first: dict[str, str] = {}  # each artist's first key, whose kind it is unless it is a group
    for k in keys.kinds:
        _ = first.setdefault(final_key[k], k)
    keys_of: defaultdict[str, list[str]] = defaultdict(list)
    for k, fk in final_key.items():
        keys_of[fk].append(k)
    year = today().year
    renamed: set[str] = set()
    as_roles: dict[str, list[Role]] = {}
    artists: list[dict[str, object]] = []
    for fk in sorted(set(final_key.values())):
        used = {k: uses[k] for k in keys_of[fk] if uses.get(k) and keys.names.get(k)}
        new = renamed_key(used, year)
        if new is not None:
            renamed.add(new)
        if fk not in group_display and keys.kinds[first[fk]] == ArtistKind.PERSON:
            as_roles |= role_names({k: spelled(keys.names[k]) for k in used}, used)
        display = group_display.get(fk) or (
            spelled(keys.names[new])  # a rename shows the new name
            if new is not None and keys.names.get(new)
            else usual_spelling(alias_counts[fk])
            if alias_counts[fk]
            else fk
        )
        kind = ArtistKind.GROUP if fk in group_display else keys.kinds[first[fk]]
        artists.append({'id': ids[fk], 'display_name': tidy_name(display), 'kind': kind, 'match_key': fk})
    con.insert('artists', artists)
    con.insert(
        'artist_aliases',
        (
            {'artist_id': ids[fk], 'alias': a, 'mentions': n}
            for fk in sorted(set(final_key.values()))
            for a, n in alias_counts[fk].items()
        ),
    )
    con.insert(
        'artist_names',
        (
            {
                'artist_id': ids[fk],
                'match_key': k,
                'name': tidy_name(spelled(keys.names[k])),
                'roles': ','.join(sorted({u.role for u in uses[k]})),
                'first_date': min(u.start for u in uses[k])[:DAY],
                'last_date': max(u.start for u in uses[k])[:DAY],
                'festivals': len({u.event_id for u in uses[k]}),
                'renamed': int(k in renamed),
                'as_roles': ','.join(sorted(as_roles[k])) if k in as_roles else None,
            }
            for k, fk in sorted(final_key.items())
            if uses.get(k) and keys.names.get(k)
        ),
    )
    con.insert(
        'artist_keys', ({'match_key': k, 'artist_id': ids[fk], 'produced': 1} for k, fk in sorted(final_key.items()))
    )
    con.insert(  # each artist's own key, a couple's made of its members' when no mention produced it
        'artist_keys',
        ({'match_key': fk, 'artist_id': i, 'produced': 0} for fk, i in sorted(ids.items())),
        unless=('match_key',),
    )
    con.insert(
        'couple_members',
        (
            {'couple_id': ids[final_key[k]], 'member_id': ids[final_key[m]]}
            for k, ms in keys.members.items()
            for m in ms
        ),
        unless=('couple_id', 'member_id'),
    )


class Started(BaseModel):
    id: int
    start_date: str


class Counted(BaseModel):
    kind: str
    n: int


def main() -> None:
    ap = argparse.ArgumentParser(description='Resolve artist mentions into artists, with stable ids.')
    _ = ap.parse_args()
    with export.opened('rw') as db, db.transaction() as con:
        mentions = con.rows(
            Mention,
            'SELECT m.id, m.event_id, m.role, m.name_as_written, m.style, m.country, e.country AS event_country,'
            ' m.source_line'
            ' FROM artist_mentions m JOIN events e ON e.id = m.event_id',
        )
        groups = Group.read()
        keys = keyed(mentions, groups)
        made = claims.every()
        decided = claimed(keys, made)
        merges = {pair: MergeDecision(m.claim.decision) for pair, m in decided.merges.items()}
        found, unsupported_same_name = candidates(keys, merges)
        joined = merged(keys, merges)
        if refused := contested(keys, joined, groups):
            sys.exit('\n'.join(refused))  # before anything is written
        dead_keys = orphaned(keys, groups)
        for g, dead in dead_keys.items():
            print(f'{Group.FILE}: {g} names keys no mention produces, orphaned: {", ".join(dead)}', file=sys.stderr)
        final_key = final_keys(keys, joined, groups)

        # keeping the ids artists had, and where the ids no artist has now went
        ids = stable_ids(con, final_key)
        moved_on = retired_into(con, final_key, ids)
        con.remake(TABLES)
        retire(con, ids, moved_on)
        starts = {e.id: e.start_date for e in con.rows(Started, 'SELECT id, start_date FROM events')}
        uses: defaultdict[str, list[Use]] = defaultdict(list)
        for m in mentions:
            uses[keys.mention_key[m.id]].append(Use(m.event_id, starts[m.event_id], m.role))
        write_artists(con, keys, final_key, ids, Named({g.group_key: g.display_name for g in groups}, uses))
        con.insert(
            'merge_reason_definitions',
            ({'reason': s.key, 'definition': s.criterion} for s in states.of('merge_reason')),
        )
        asked = reviews(keys, mentions, found, merge_review.reviewed())
        con.insert(
            merge_review.TABLE, ({'key_a': q.key_a, 'key_b': q.key_b, 'question': q.model_dump_json()} for q in asked)
        )
        found = [c for c in found if c.key_a == c.key_b or final_key[c.key_a] != final_key[c.key_b]]
        artist_of = {m.id: ids[final_key[keys.mention_key[m.id]]] for m in mentions}
        for b in decided.bookings:  # one festival's line-up means another artist
            c = b.claim
            frm, to = ids[final_key[c.from_key]], ids[final_key[c.to_key]]
            hits = [m.id for m in mentions if m.event_id == c.event_id and artist_of[m.id] == frm]
            if not hits:
                decided.state[b.id] = ClaimState.ORPHANED
            artist_of |= dict.fromkeys(hits, to)
        con.insert('mention_artists', ({'mention_id': i, 'artist_id': a} for i, a in artist_of.items()))
        homes: dict[int, claims.Made[claims.HomeClaim]] = {}
        for h in sorted(decided.homes, key=lambda h: h.rank()):  # one artist's keys: the claim that comes first
            homes[ids[final_key[h.claim.key]]] = h
        con.insert(
            'artist_homes',
            (
                {'artist_id': a, 'country': h.claim.country, 'source': h.source, 'note': h.claim.note}
                for a, h in homes.items()
            ),
        )
        con.insert('artist_merge_candidates', (c._asdict() for c in found))
        con.insert(
            'artist_merge_decisions',
            (
                {
                    'key_a': m.claim.keys[0],
                    'key_b': m.claim.keys[1],
                    'decision': m.claim.decision,
                    'source': m.source,
                    'note': m.claim.note,
                }
                for m in decided.merges.values()
            ),
        )
        con.insert(
            'claims',
            (
                {
                    'id': m.id,
                    'source': m.source,
                    'subject': json.dumps(claims.subject(m.claim)),
                    'claim': claims.text(m.claim),
                    'made_at': m.claim.made_at,
                    'state': decided.state[m.id],
                }
                for m in made
            ),
            unless=('id',),
        )
        con.insert(
            'artist_group_definitions',
            (
                {
                    'group_key': g.group_key,
                    'artist_id': ids[g.group_key],
                    'display_name': g.display_name,
                    'note': g.note,
                }
                for g in groups
            ),
        )
        con.insert(
            'artist_group_aliases',
            (
                {'group_key': g.group_key, 'match_key': a, 'produced': int(a in keys.kinds)}
                for g in groups
                for a in g.aliases
            ),
        )
        con.insert(
            'artist_group_members',
            (
                {'group_key': g.group_key, 'match_key': m, 'produced': int(m in keys.kinds)}
                for g in groups
                for m in g.members
            ),
        )
        kinds_count = {k.kind: k.n for k in con.rows(Counted, 'SELECT kind, count(*) AS n FROM artists GROUP BY kind')}
        record_steps(
            con,
            Resolved(
                len(mentions),
                kinds_count,
                len(found),
                unsupported_same_name,
                len(groups),
                sum(map(len, dead_keys.values())),
            ),
            decided,
        )
        print(
            f'mentions {len(mentions)} -> artists {sum(kinds_count.values())} {kinds_count};'
            f' candidates {len(found)} ({sum(1 for c in found if c.decision)} reviewed);'
            f' same-name pairs kept apart for lack of evidence: {unsupported_same_name};'
            f' claims {dict(Counter(str(v) for v in decided.state.values()))}'
        )


if __name__ == '__main__':
    main()
