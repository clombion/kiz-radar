"""Resolve artist mentions into artists, couples and groups, and link them to events.

Reads artist_mentions (from load_extract.py) and pipeline/extract/merges.csv; writes:
  artists                 id, display_name, kind (person | couple | group | organisation), match_key
  artist_aliases          every name an artist was written as
  couple_members          couple/group id -> member person id
  mention_artists         each mention's artist
  event_artists (view)    each artist booked at an event in a role, once however often its line-up names them
  artist_merge_candidates pairs that may be the same artist, with evidence, for review
  merge_reason_definitions
                          reason -> definition, from pipeline/states.py (the reasons artist_merge_candidates gives)
  artist_merge_decisions  every merge/separate decision applied, copied from pipeline/extract/merges.csv
  artist_group_definitions, artist_group_aliases
                          the named groups from pipeline/extract/groups.csv: note,
                          members and the spellings that mean them
  artist_events (view)    every event an artist appears at, directly or as a member of a couple/group

Matching rules:
  - A name's key: Unicode-compatibility folded (styled letters -> plain), "DJ"/"MC" prefix removed,
    flags/emoji/punctuation removed, accents removed, case folded, spaces removed.
  - Dancer, DJ, performer and MC names are split into members on & + and et e y und; organiser, media
    and crew names are never split.
  - Mentions merge automatically only on an exact key. A couple's key is its sorted member keys. A person's
    key is their name key when the name has several words. A single-word name is weak evidence of identity
    (many teachers share a first name), so its key is scoped: a solo single-word name to its role family
    (dj / dance), and a single-word couple member to that couple.
  - Near-matches are written to artist_merge_candidates, with their reason (pipeline/states.py, merge_reason), only
    when backed by evidence: a shared stated country or a shared partner, or, for two names of several words
    spelled alike, events in a shared country. They are only merged when pipeline/extract/merges.csv says so.

pipeline/extract/merges.csv columns: key_a, key_b, decision (merge | separate), prompt (the review prompt's hash, in
pipeline/prompts/asked/; empty when decided by hand), note. Keys are match_key values. A review that could not tell
(unsure) is never stored: the pair stays in artist_merge_candidates, undecided.

pipeline/extract/groups.csv names an act that several people perform as (a DJ duo booked under one name):
group_key, display_name, members and aliases (both ';'-separated match_key values), note. Every alias
mention becomes a mention of the group, and the group is linked to its members, so each member's events
include the group's bookings.

Artist ids are stable: artist_ids keeps every id ever given and the match_key it was given to. An artist
keeps the id of its own key, else the lowest earlier id among the keys it absorbed; a new artist gets the
next id never used. An id whose artist was merged into another reads, through its key in artist_keys, as
the artist that absorbed it.

Usage: mise run resolve
"""

import argparse
import functools
import itertools
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

import pycountry
from pydantic import BaseModel

from pipeline import data, export, states
from pipeline import db as sqlite_db
from pipeline.countries import CODE_LENGTH, INDICATOR_A, indicator
from pipeline.db import Reader, Transaction
from pipeline.enums import ArtistKind, MergeDecision, MergeReason, Model, Role
from pipeline.extract import run_log
from pipeline.extract.answers import log, logged
from pipeline.extract.prices import COUPLE
from pipeline.records import ANSWERS, Group, MergeReview, MergeRow, Record
from pipeline.text import tidy_name

SPLIT_ROLES = {Role.TEACHER, Role.DJ, Role.PERFORMER, Role.MC}
ORG_ROLES = {Role.ORGANISER, Role.MEDIA, Role.CREW}
SEPARATORS = re.compile(r'\s*&\s*|\s*\+\s*|\s+(?:and|et|e|y|und)\s+', re.IGNORECASE)
PREFIX = re.compile(r'^(?:dj|deejay|d\.j\.|mc)\s+', re.IGNORECASE)
SHORTEST_NAME = 2  # a member's name key shorter than this is a letter of a name built around "&" ("D&L Beats")
REVIEWER = Model.CLAUDE_HAIKU_5_5  # the model of the merge review's subagents
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
    match_key TEXT PRIMARY KEY,   -- every key a mention or member produced, including merged ones
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE artist_aliases (
    artist_id INTEGER NOT NULL REFERENCES artists(id) DEFERRABLE INITIALLY DEFERRED,
    alias TEXT NOT NULL,
    mentions INTEGER NOT NULL,
    PRIMARY KEY (artist_id, alias)
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
    SELECT DISTINCT m.event_id, ma.artist_id, m.role
    FROM mention_artists ma JOIN artist_mentions m ON m.id = ma.mention_id;
CREATE TABLE merge_reason_definitions (
    reason TEXT PRIMARY KEY,
    definition TEXT NOT NULL
) STRICT;
CREATE TABLE artist_merge_candidates (
    key_a TEXT NOT NULL,
    key_b TEXT NOT NULL,
    name_a TEXT NOT NULL,
    name_b TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ({merge_reason})),
    similarity REAL NOT NULL,
    evidence TEXT NOT NULL,
    decision TEXT CHECK (decision IN ({stored_decision})),   -- from pipeline/extract/merges.csv, NULL = not reviewed
    PRIMARY KEY (key_a, key_b)
) STRICT;
CREATE TABLE artist_merge_decisions (
    key_a TEXT NOT NULL,          -- match_key values, as in artist_keys
    key_b TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ({stored_decision})),
    prompt TEXT,                  -- the hash of the review prompt that decided it, NULL when decided by hand
    note TEXT,
    PRIMARY KEY (key_a, key_b)
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
    PRIMARY KEY (group_key, match_key)
) STRICT;
CREATE VIEW artist_events AS
    SELECT ea.artist_id, ea.event_id, ea.role, 'direct' AS via, NULL AS via_artist_id
    FROM event_artists ea
    UNION ALL
    SELECT cm.member_id, ea.event_id, ea.role, 'member', ea.artist_id
    FROM event_artists ea JOIN couple_members cm ON cm.couple_id = ea.artist_id;
"""
# the export's table of every id given, which this step only adds to (tests/test_steps.py holds the export to it)
KEPT = sqlite_db.declared("""CREATE TABLE artist_ids (
    artist_id INTEGER PRIMARY KEY,  -- every artist id ever given; never reused
    match_key TEXT NOT NULL UNIQUE  -- the key it was given to
) STRICT""")
# a review that could not tell (unsure) decides nothing: the pair stays a candidate, and merges.csv never holds it
STORED = (MergeDecision.MERGE, MergeDecision.SEPARATE)
TABLES = sqlite_db.declared(
    DDL.format_map(states.SQL_IN | {'stored_decision': states.sql_in('merge_decision', STORED)})
)


# Country spellings pycountry does not know: sports (IOC/FIFA) codes and French, Spanish, Portuguese and
# Italian names that line-ups use
COUNTRY_ALIASES = {
    'ger': 'DE',
    'sui': 'CH',
    'swi': 'CH',
    'ned': 'NL',
    'hol': 'NL',
    'por': 'PT',
    'uk': 'GB',
    'eng': 'GB',
    'cro': 'HR',
    'den': 'DK',
    'gre': 'GR',
    'bul': 'BG',
    'slo': 'SI',
    'rsa': 'ZA',
    'ang': 'AO',
    'cpv': 'CV',
    'england': 'GB',
    'scotland': 'GB',
    'holland': 'NL',
    'cape verde': 'CV',
    'cabo verde': 'CV',
    'allemagne': 'DE',
    'alemania': 'DE',
    'alemanha': 'DE',
    'germania': 'DE',
    'espagne': 'ES',
    'espana': 'ES',
    'españa': 'ES',
    'espanha': 'ES',
    'spagna': 'ES',
    'italie': 'IT',
    'italia': 'IT',
    'itália': 'IT',
    'suisse': 'CH',
    'suiza': 'CH',
    'suíça': 'CH',
    'svizzera': 'CH',
    'angleterre': 'GB',
    'inglaterra': 'GB',
    'royaume-uni': 'GB',
    'brésil': 'BR',
    'bresil': 'BR',
    'brasil': 'BR',
    'belgique': 'BE',
    'bélgica': 'BE',
    'belgio': 'BE',
    'pays-bas': 'NL',
    'países bajos': 'NL',
    'pologne': 'PL',
    'polonia': 'PL',
    'polônia': 'PL',
    'ukraine': 'UA',
    'ucrania': 'UA',
    'ucrânia': 'UA',
    'guadeloupe': 'GP',
    'guadalupe': 'GP',
    'guadelupe': 'GP',
    'martinique': 'MQ',
    'maroc': 'MA',
    'marruecos': 'MA',
    'sénégal': 'SN',
    'cameroun': 'CM',
    "côte d'ivoire": 'CI',
    'grèce': 'GR',
    'grecia': 'GR',
    'autriche': 'AT',
    'austria': 'AT',
    'suède': 'SE',
    'suecia': 'SE',
    'république tchèque': 'CZ',
    'rep. checa': 'CZ',
    'tchéquie': 'CZ',
    'hongrie': 'HU',
    'hungría': 'HU',
    'roumanie': 'RO',
    'rumania': 'RO',
    'croatie': 'HR',
    'croacia': 'HR',
    'turquie': 'TR',
    'turquía': 'TR',
    'états-unis': 'US',
    'etats-unis': 'US',
    'estados unidos': 'US',
    'usa': 'US',
}


def country_codes(text: str | None) -> frozenset[str]:
    """ISO 3166 alpha-2 codes for a country as written: flag emoji, country names or codes."""
    if not text:
        return frozenset()
    codes: set[str] = set()
    indicators = [chr(ord(ch) - INDICATOR_A + ord('A')) for ch in text if indicator(ord(ch))]
    codes.update(''.join(indicators[i : i + CODE_LENGTH]) for i in range(0, len(indicators) - 1, CODE_LENGTH))
    words = re.sub(r'[\U0001F1E6-\U0001F1FF]', ' ', unicodedata.normalize('NFKC', text))
    for written in re.split(r'[/,;&()–—\-]+|\s+and\s+|\s+et\s+', words):
        part = written.strip(' .')
        if len(part) < CODE_LENGTH:
            continue
        if alias := COUNTRY_ALIASES.get(part.casefold()):
            codes.add(alias)
            continue
        try:
            found: object = pycountry.countries.lookup(part)
        except LookupError:
            continue
        if isinstance(code := getattr(found, 'alpha_2', None), str):
            codes.add(code)
    return frozenset(codes)


def clean_display(name: str) -> str:
    """The name as a reader would want it shown: plain letters, no flags or emoji."""
    s = re.sub(r'\([^)]*\)|\[[^\]]*\]', ' ', unicodedata.normalize('NFKC', name))
    s = ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LNPZ' or ch in "&+'’")
    return ' '.join(s.split()).strip(' -–—•·*:,;')


def token_key(name: str) -> str:
    s = PREFIX.sub('', clean_display(name))
    s = unicodedata.normalize('NFKD', s)
    return ''.join(ch for ch in s if ch.isalnum() and not unicodedata.combining(ch)).casefold()


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


def decided(rows: Iterable[MergeRow]) -> dict[frozenset[str], MergeDecision]:
    """Each decision, by the keys it decides."""
    return {frozenset((r.key_a, r.key_b)): r.decision for r in rows}


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
    'artist_keys': 'Every name key a mention or couple member produced, and the artist it resolved to (merged keys '
    'included). The keys in artist_merge_candidates, artist_merge_decisions and artist_group_aliases '
    'are these keys.',
    'couple_members': "The people in each couple or group (couple_id is the couple's or group's artist id).",
    'mention_artists': 'The resolved artist of each mention (artist_mentions.id), whose style and stated country '
    'artist_mentions holds.',
    'event_artists': 'Each artist booked at an event, in a role: once however often its line-up names them.',
    'artist_events': "Every event an artist appears at: directly (via 'direct') or as a member of a couple or group "
    "(via 'member', via_artist_id = the couple or group). Use it for a person's full event history.",
    'artist_merge_candidates': 'Pairs of name keys that may be the same artist, with the reason, similarity and '
    'evidence; decision is NULL when no merge or separate decision exists (left apart).',
    'merge_reason_definitions': 'What each reason in artist_merge_candidates means.',
    'artist_merge_decisions': 'Every merge or separate decision applied, with the review prompt that made it (its '
    'hash; null when it was decided by hand) and rationale.',
    'artist_group_definitions': 'Named groups defined by hand (a DJ duo booked under one name), with a note; members '
    'are in couple_members.',
    'artist_group_aliases': "The name keys whose mentions count as a named group's.",
    'artist_ids': 'Every artist id ever given and the match_key it was given to. An id missing from artists was merged '
    'into another artist: artist_keys gives the artist its key belongs to now.',
}


class Resolved(NamedTuple):
    """What resolving the mentions came to: how many mentions, artists of each kind, candidates listed, same-name
    pairs kept apart for want of evidence, and named groups."""

    mentions: int
    kinds: Mapping[str, int]
    candidates: int
    unsupported: int
    groups: int


def record_steps(con: Transaction, resolved: Resolved, rows: Sequence[MergeRow]) -> None:
    n_mentions, kinds_count, n_candidates, n_unsupported, n_groups = resolved
    run_log.document(con, TABLE_DOCS, 'pipeline/extract/resolve_artists.py')
    reviews = sorted((data(ANSWERS) / 'merge_review').glob('*.json'))
    if reviews:
        counts: defaultdict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
        followed = log()
        for f in reviews:
            for d in MergeReview.parse(f.read_bytes()).decisions:
                counts[logged(followed, f'merge_review/{f.name}').prompt][d.decision] += 1
        for h in counts:
            run_log.record_prompt(con, h)
        run_log.record(
            con,
            run_log.Step(
                '6_merge_review',
                'Decide, for each pair of artist records the matching rules flagged as possibly the same artist, '
                'whether they are (merge), are not (separate), or the evidence does not settle it (unsure, left '
                'unmerged). '
                'Decisions are written to pipeline/extract/merges.csv, where manual decisions override them.',
                f'{len(reviews)} subagents ({REVIEWER}), one batch each',
                performed_at=max(logged(followed, f'merge_review/{f.name}').answered_at for f in reviews),
                model=REVIEWER,
                prompt=', '.join(sorted(counts)),
                inputs='each pair with every mention of both sides',
                outputs='pipeline/extract/merges.csv; table artist_merge_decisions',
                details={'decisions_by_prompt': {k: dict(v) for k, v in counts.items()}, 'batches': len(reviews)},
            ),
        )
    run_log.record(
        con,
        run_log.Step(
            '7_resolve_artists',
            'Group artist mentions into people, couples, groups and organisations: exact name keys merge automatically '
            '(single-word names only within their couple or role family), reviewed and manual merge decisions are '
            'applied, named groups from pipeline/extract/groups.csv absorb their spellings, and near-matches without a '
            'decision are kept apart and listed in artist_merge_candidates.',
            'pipeline/extract/resolve_artists.py',
            inputs='table artist_mentions; pipeline/extract/merges.csv; pipeline/extract/groups.csv',
            outputs='tables artists, artist_aliases, artist_keys, couple_members, mention_artists, '
            'artist_merge_candidates, merge_reason_definitions, artist_merge_decisions, artist_group_definitions, '
            'artist_group_aliases; '
            'views event_artists, artist_events',
            details={
                'mentions': n_mentions,
                'artists_by_kind': kinds_count,
                'merge_decisions': {str(d): sum(1 for r in rows if r.decision == d) for d in STORED},
                'manual_decisions': sum(1 for r in rows if r.prompt is None),
                'named_groups': n_groups,
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


class Mention(Record):
    """An artist as one event's description names it, and the event's country."""

    id: int
    event_id: int
    role: Role
    name_as_written: str
    style: str | None
    country: str | None
    event_country: str | None


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


def person_keys(keys: Gathered, m: Mention) -> tuple[str, list[str]]:
    """(the mention's key, the person keys of its members) for a mention of people: one, a couple or a group."""
    parts = members_of(m.name_as_written, m.role)
    scope = '+'.join(sorted(token_key(p) for p in parts)) if len(parts) > 1 else None
    pkeys = [person_key(p, m.role, scope) for p in parts]
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
    for p, pk in zip(parts, pkeys, strict=True):
        keys.member_forms[key][token_key(p)].add(pk)
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


SIMILAR = Fraction(22, 25)  # how alike two spellings must be to be a candidate, exactly
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
    # Once partners are merged, further couples' single-word members align: repeat until no new merge appears.
    before = 0
    while (now := uf.roots(keys.kinds)) != before:
        before = now
        for spellings in same_members(keys, uf):
            uf.join(spellings)
    return uf


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


def final_keys(keys: Keys, uf: UnionFind, groups: Iterable[Group]) -> dict[str, str]:
    """Each key's artist: its named group, its couple re-keyed from its members' artists, or the key it was merged
    into. Named groups fold in their alias keys and are linked to their members."""
    group_keys: set[str] = set()
    for g in groups:
        gk = g.group_key
        group_keys.add(gk)
        aliases = [a for a in g.aliases if a in keys.kinds]
        if taken := sorted({uf.find(a) for a in aliases} & (group_keys - {gk})):
            sys.exit(f'{gk}: its aliases are already the group {", ".join(taken)}')
        uf.absorb(gk, aliases)

    def couple_root(k: str) -> str:
        return 'c:' + '+'.join(sorted(uf.find(m)[2:] for m in keys.members[k]))

    out: dict[str, str] = {}
    for k in keys.kinds:
        root = uf.find(k)
        out[k] = root if root in group_keys else couple_root(k) if k in keys.members else root
    return out


def write_artists(
    con: Transaction, keys: Keys, final_key: Mapping[str, str], groups: list[Group], ids: Mapping[str, int]
) -> None:
    """The artists, their spellings, keys and members."""
    group_display = {g.group_key: g.display_name for g in groups}
    alias_counts: defaultdict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    for k, ns in keys.names.items():
        for n in ns:
            alias_counts[final_key[k]][n] += 1
    first: dict[str, str] = {}  # each artist's first key, whose kind it is unless it is a group
    for k in keys.kinds:
        _ = first.setdefault(final_key[k], k)
    artists: list[dict[str, object]] = []
    for fk in sorted(set(final_key.values())):
        display = group_display.get(fk) or (
            max(alias_counts[fk].items(), key=lambda kv: (kv[1], -len(kv[0])))[0] if alias_counts[fk] else fk
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
    con.insert('artist_keys', ({'match_key': k, 'artist_id': ids[fk]} for k, fk in final_key.items()))
    con.insert(
        'couple_members',
        (
            {'couple_id': ids[final_key[k]], 'member_id': ids[final_key[m]]}
            for k, ms in keys.members.items()
            for m in ms
        ),
        unless=('couple_id', 'member_id'),
    )


class Counted(BaseModel):
    kind: str
    n: int


def main() -> None:
    ap = argparse.ArgumentParser(description='Resolve artist mentions into artists, with stable ids.')
    _ = ap.parse_args()
    with export.opened('rw') as db, db.transaction() as con:
        mentions = con.rows(
            Mention,
            'SELECT m.id, m.event_id, m.role, m.name_as_written, m.style, m.country, e.country AS event_country'
            ' FROM artist_mentions m JOIN events e ON e.id = m.event_id',
        )
        groups = Group.read()
        keys = keyed(mentions, groups)
        rows = MergeRow.read()
        merges = decided(rows)
        found, unsupported_same_name = candidates(keys, merges)
        final_key = final_keys(keys, merged(keys, merges), groups)

        # keeping the ids artists had
        ids = stable_ids(con, final_key)
        con.remake(TABLES)
        con.insert('artist_ids', ({'artist_id': i, 'match_key': fk} for fk, i in ids.items()), unless=('artist_id',))
        write_artists(con, keys, final_key, groups, ids)
        con.insert(
            'merge_reason_definitions',
            ({'reason': s.key, 'definition': s.criterion} for s in states.of('merge_reason')),
        )
        found = [c for c in found if c.key_a == c.key_b or final_key[c.key_a] != final_key[c.key_b]]
        con.insert(
            'mention_artists',
            ({'mention_id': m.id, 'artist_id': ids[final_key[keys.mention_key[m.id]]]} for m in mentions),
        )
        con.insert('artist_merge_candidates', (c._asdict() for c in found))
        con.insert(
            'artist_merge_decisions',
            (
                {'key_a': r.key_a, 'key_b': r.key_b, 'decision': r.decision, 'prompt': r.prompt, 'note': r.note}
                for r in rows
            ),
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
            'artist_group_aliases', ({'group_key': g.group_key, 'match_key': a} for g in groups for a in g.aliases)
        )
        kinds_count = {k.kind: k.n for k in con.rows(Counted, 'SELECT kind, count(*) AS n FROM artists GROUP BY kind')}
        record_steps(con, Resolved(len(mentions), kinds_count, len(found), unsupported_same_name, len(groups)), rows)
        print(
            f'mentions {len(mentions)} -> artists {sum(kinds_count.values())} {kinds_count};'
            f' candidates {len(found)} ({sum(1 for c in found if c.decision)} reviewed);'
            f' same-name pairs kept apart for lack of evidence: {unsupported_same_name}'
        )


if __name__ == '__main__':
    main()
