"""Resolve artist mentions into artists, couples and groups, and link them to events.

Reads artist_mentions (from load_extract.py) and pipeline/extract/merges.csv; writes:
  artists                 id, display_name, kind (person | couple | group | organisation), match_key
  artist_aliases          every name an artist was written as
  couple_members          couple/group id -> member person id
  event_artists           event -> artist links, one per mention (role, style, country, mention id)
  artist_merge_candidates pairs that may be the same artist, with evidence, for review
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
  - Near-matches are written to artist_merge_candidates, only when backed by evidence (a shared stated
    country, events in a shared country, or a shared partner), and only merged when pipeline/extract/merges.csv says so.

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

Usage: uv run --group artists -m pipeline.extract.resolve_artists source/<events>.sqlite
"""

import argparse
import itertools
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import NamedTuple

import pycountry

from pipeline import db as sqlite_db
from pipeline import states
from pipeline.countries import CODE_LENGTH, INDICATOR_A, indicator
from pipeline.enums import ArtistKind, MergeDecision, Role
from pipeline.extract import run_log
from pipeline.extract.answers import log, logged
from pipeline.extract.prices import COUPLE
from pipeline.records import Group, MergeReview, MergeRow, Record

MERGES = run_log.HERE / 'merges.csv'
GROUPS = run_log.HERE / 'groups.csv'
SPLIT_ROLES = {Role.TEACHER, Role.DJ, Role.PERFORMER, Role.MC}
ORG_ROLES = {Role.ORGANISER, Role.MEDIA, Role.CREW}
SEPARATORS = re.compile(r'\s*&\s*|\s*\+\s*|\s+(?:and|et|e|y|und)\s+', re.IGNORECASE)
PREFIX = re.compile(r'^(?:dj|deejay|d\.j\.|mc)\s+', re.IGNORECASE)
SHORTEST_NAME = 2  # a member's name key shorter than this is a letter of a name built around "&" ("D&L Beats")
PAIR = 2  # the keys of a decision on two artists; one key's decides a single name

TABLES = """
BEGIN;
DROP VIEW IF EXISTS artist_events;
DROP TABLE IF EXISTS event_artists;
DROP TABLE IF EXISTS couple_members;
DROP TABLE IF EXISTS artist_aliases;
DROP TABLE IF EXISTS artist_keys;
DROP TABLE IF EXISTS artist_merge_candidates;
DROP TABLE IF EXISTS artist_merge_decisions;
DROP TABLE IF EXISTS artist_group_aliases;
DROP TABLE IF EXISTS artist_group_definitions;
DROP TABLE IF EXISTS artists;
CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ({artist_kind})),
    match_key TEXT NOT NULL UNIQUE
);
CREATE TABLE artist_keys (
    match_key TEXT PRIMARY KEY,   -- every key a mention or member produced, including merged ones
    artist_id INTEGER NOT NULL REFERENCES artists(id)
);
CREATE TABLE artist_aliases (
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    alias TEXT NOT NULL,
    mentions INTEGER NOT NULL,
    PRIMARY KEY (artist_id, alias)
);
CREATE TABLE couple_members (
    couple_id INTEGER NOT NULL REFERENCES artists(id),
    member_id INTEGER NOT NULL REFERENCES artists(id),
    PRIMARY KEY (couple_id, member_id)
);
CREATE TABLE event_artists (
    mention_id INTEGER PRIMARY KEY REFERENCES artist_mentions(id),
    event_id INTEGER NOT NULL REFERENCES events(id),
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    role TEXT NOT NULL CHECK (role IN ({role})),
    style TEXT,
    country TEXT
);
CREATE INDEX event_artists_artist ON event_artists(artist_id);
CREATE TABLE artist_merge_candidates (
    key_a TEXT NOT NULL,
    key_b TEXT NOT NULL,
    name_a TEXT NOT NULL,
    name_b TEXT NOT NULL,
    reason TEXT NOT NULL,
    similarity REAL NOT NULL,
    evidence TEXT NOT NULL,
    decision TEXT CHECK (decision IN ({stored_decision})),   -- from pipeline/extract/merges.csv, NULL = not reviewed
    PRIMARY KEY (key_a, key_b)
);
CREATE TABLE artist_merge_decisions (
    key_a TEXT NOT NULL,          -- match_key values, as in artist_keys
    key_b TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ({stored_decision})),
    prompt TEXT,                  -- the hash of the review prompt that decided it, NULL when decided by hand
    note TEXT,
    PRIMARY KEY (key_a, key_b)
);
CREATE TABLE artist_group_definitions (
    group_key TEXT PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    display_name TEXT NOT NULL,
    note TEXT
);
CREATE TABLE artist_group_aliases (
    group_key TEXT NOT NULL REFERENCES artist_group_definitions(group_key),
    match_key TEXT NOT NULL,      -- a spelling's key whose mentions count as the group's
    PRIMARY KEY (group_key, match_key)
);
CREATE VIEW artist_events AS
    SELECT ea.artist_id, ea.event_id, ea.role, 'direct' AS via, NULL AS via_artist_id
    FROM event_artists ea
    UNION ALL
    SELECT cm.member_id, ea.event_id, ea.role, 'member', ea.artist_id
    FROM event_artists ea JOIN couple_members cm ON cm.couple_id = ea.artist_id;
"""
# the export's table of every id given, which this step only adds to (tests/test_steps.py holds the export to it)
ARTIST_IDS = """CREATE TABLE artist_ids (
    artist_id INTEGER PRIMARY KEY,  -- every artist id ever given; never reused
    match_key TEXT NOT NULL         -- the key it was given to
)"""
# a review that could not tell (unsure) decides nothing: the pair stays a candidate, and merges.csv never holds it
STORED = (MergeDecision.MERGE, MergeDecision.SEPARATE)
SCHEMA = TABLES.format_map(
    {p.name: states.sql_in(p.name) for p in states.POINTS}
    | {'stored_decision': states.sql_in('merge_decision', STORED)}
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


def load_merges() -> dict[frozenset[str], MergeDecision]:
    return {frozenset((r.key_a, r.key_b)): r.decision for r in MergeRow.read(MERGES)}


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
    'a team) or an organisation, with the most common spelling as display name.',
    'artist_aliases': 'Every spelling an artist was written as, with how many mentions used it.',
    'artist_keys': 'Every name key a mention or couple member produced, and the artist it resolved to (merged keys '
    'included). The keys in artist_merge_candidates, artist_merge_decisions and artist_group_aliases '
    'are these keys.',
    'couple_members': "The people in each couple or group (couple_id is the couple's or group's artist id).",
    'event_artists': 'Each artist mention (artist_mentions.id) linked to its event and resolved artist, with role, '
    'style and stated country.',
    'artist_events': "Every event an artist appears at: directly (via 'direct') or as a member of a couple or group "
    "(via 'member', via_artist_id = the couple or group). Use it for a person's full event history.",
    'artist_merge_candidates': 'Pairs of name keys that may be the same artist, with the reason, similarity and '
    'evidence; decision is NULL when no merge or separate decision exists (left apart).',
    'artist_merge_decisions': 'Every merge or separate decision applied, with the review prompt that made it (its '
    'hash; null when it was decided by hand) and rationale.',
    'artist_group_definitions': 'Named groups defined by hand (a DJ duo booked under one name), with a note; members '
    'are '
    'in couple_members.',
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


def record_steps(con: sqlite3.Connection, resolved: Resolved) -> None:
    n_mentions, kinds_count, n_candidates, n_unsupported, n_groups = resolved
    run_log.document(con, TABLE_DOCS, 'pipeline/extract/resolve_artists.py')
    reviews = sorted((run_log.HERE / 'answers' / 'merge_review').glob('*.json'))
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
                'whether '
                'they are (merge), are not (separate), or the evidence does not settle it (unsure, left unmerged). '
                'Decisions are written to pipeline/extract/merges.csv, where manual decisions override them.',
                f'{len(reviews)} subagents (claude-haiku-5-5), one batch each',
                performed_at=max(logged(followed, f'merge_review/{f.name}').answered_at for f in reviews),
                model='claude-haiku-5-5',
                prompt=', '.join(sorted(counts)),
                inputs='each pair with every mention of both sides',
                outputs='pipeline/extract/merges.csv; table artist_merge_decisions',
                details={'decisions_by_prompt': {k: dict(v) for k, v in counts.items()}, 'batches': len(reviews)},
            ),
        )
    rows = MergeRow.read(MERGES)
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
            outputs='tables artists, artist_aliases, artist_keys, couple_members, event_artists, '
            'artist_merge_candidates, artist_merge_decisions, artist_group_definitions, artist_group_aliases; '
            'view artist_events',
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


def stable_ids(con: sqlite3.Connection, final_key: Mapping[str, str]) -> dict[str, int]:
    """An id for each artist (final key): its own earlier id, else the lowest earlier id of a key it absorbed that
    no artist still owns, else the next id never given."""
    given: list[tuple[str, int]] = con.execute('SELECT match_key, artist_id FROM artist_ids').fetchall()
    issued = dict(given)
    was: list[tuple[str, int]] = con.execute('SELECT match_key, artist_id FROM artist_keys').fetchall()
    key_was = dict(was)
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
    couple's spellings of a member."""

    names: defaultdict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    kinds: dict[str, ArtistKind] = field(default_factory=dict[str, ArtistKind])
    members: dict[str, list[str]] = field(default_factory=dict[str, list[str]])
    stated_countries: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    stated_sets: defaultdict[str, set[frozenset[str]]] = field(default_factory=lambda: defaultdict(set))
    event_countries: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    partners: defaultdict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    mention_key: dict[int, str] = field(default_factory=dict[int, str])
    # couple key -> member token -> person keys seen for that member ("Chris’Py" and "Chris Py" in the same couple
    # give one single-word and one multi-word key for the same person)
    member_forms: defaultdict[str, defaultdict[str, set[str]]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(set))
    )


def person_keys(keys: Keys, m: Mention) -> tuple[str, list[str]]:
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


def keyed(mentions: Iterable[Mention]) -> Keys:
    """The keys of every mention and of its members."""
    keys = Keys()
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
    return keys


class Candidate(NamedTuple):
    """A pair of keys that may be one artist (a row of artist_merge_candidates)."""

    key_a: str
    key_b: str
    name_a: str
    name_b: str
    reason: str
    similarity: float
    evidence: str
    decision: MergeDecision | None


SIMILAR = 0.88  # how alike two spellings must be to be a candidate
SHORTEST = 3  # the shortest name a name can shorten, or begin
SIMILAR_SHORTEST = 5  # the shortest name compared by spelling


@dataclass(frozen=True)
class Pairing:
    """What the candidates are judged on, per person key: its bare name, its words, and its partners' names."""

    keys: Keys
    bare: dict[str, str]
    words: dict[str, list[str]]
    partner_names: dict[str, set[str]]

    def strong(self, a: str, b: str) -> bool:
        """A shared stated country or a shared partner. Events in the same country are weak evidence (one country
        hosts a quarter of all events)."""
        k = self.keys
        return bool(k.stated_countries[a] & k.stated_countries[b] or self.partner_names[a] & self.partner_names[b])

    def reason(self, a: str, b: str) -> tuple[str, float] | None:
        """Why the pair may be one person, and how alike their names are; None when it may not, or the evidence is
        too weak (a same-name pair, or a pair of single words, needs strong evidence)."""
        ba, bb = self.bare[a], self.bare[b]
        wa, wb = self.words[a], self.words[b]
        short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
        if ba == bb:
            reason = 'same name under different keys (DJ and dancer, solo and in a couple, or in different couples)'
            return (reason, 1.0) if self.strong(a, b) else None
        if short and len(short) < len(long_) and long_[: len(short)] == short and len(short[0]) >= SHORTEST:
            reason = 'one name is the first word(s) of the other'
            return (reason, SequenceMatcher(None, ba, bb).ratio()) if self.strong(a, b) else None
        if (
            (self.partner_names[a] & self.partner_names[b])
            and min(len(ba), len(bb)) >= SHORTEST
            and (ba.startswith(bb) or bb.startswith(ba))
        ):
            return 'same partner, one name shortens the other', SequenceMatcher(None, ba, bb).ratio()
        return self.similar(a, b)

    def similar(self, a: str, b: str) -> tuple[str, float] | None:
        """A pair spelled alike, when the evidence backs it: different first names are often one letter apart
        (Daniel / Daniela), so single-word pairs need the same evidence as same-name pairs."""
        ba, bb = self.bare[a], self.bare[b]
        if min(len(ba), len(bb)) < SIMILAR_SHORTEST:
            return None
        sm = SequenceMatcher(None, ba, bb)
        # real_quick_ratio and quick_ratio are upper bounds of ratio, so they rule pairs out cheaply
        if sm.real_quick_ratio() < SIMILAR or sm.quick_ratio() < SIMILAR or (sim := sm.ratio()) < SIMILAR:
            return None
        strong = self.strong(a, b)
        supported = strong or bool(self.keys.event_countries[a] & self.keys.event_countries[b])
        several = len(self.words[a]) > 1 and len(self.words[b]) > 1
        return ('similar spelling', sim) if (several and supported) or strong else None

    def evidence(self, a: str, b: str) -> str:
        k = self.keys
        return (
            f'{k.names[a][0]!r}: countries {sorted(k.stated_countries[a]) or "-"}, events in '
            f'{sorted(k.event_countries[a])[:4]},'
            f' partners {sorted(p[2:] for p in k.partners[a])[:4]} | {k.names[b][0]!r}: countries '
            f'{sorted(k.stated_countries[b]) or "-"},'
            f' events in {sorted(k.event_countries[b])[:4]}, partners {sorted(p[2:] for p in k.partners[b])[:4]}'
        )


def candidates(keys: Keys, merges: Mapping[frozenset[str], MergeDecision]) -> tuple[list[Candidate], int]:
    """(the pairs among person keys that may be one artist, with any decision on them; how many same-name pairs were
    kept apart for want of evidence). Couples follow their members."""
    persons = sorted(k for k in keys.kinds if k.startswith('p:'))
    bare = {k: k[2:].split('@')[0] for k in persons}
    pairing = Pairing(
        keys,
        bare,
        {k: words_of(keys.names[k][0]) for k in persons},
        {k: {bare.get(p, p) for p in keys.partners[k]} for k in persons},
    )
    out: list[Candidate] = []
    unsupported = 0
    for a, b in itertools.combinations(persons, 2):
        if (found := pairing.reason(a, b)) is None:
            unsupported += bare[a] == bare[b]
            continue
        reason, sim = found
        names = keys.names
        decision = merges.get(frozenset((a, b)))
        out.append(Candidate(a, b, names[a][0], names[b][0], reason, round(sim, 3), pairing.evidence(a, b), decision))
    for k in persons:
        if '@' in k and any(not (x & y) for x, y in itertools.combinations(keys.stated_sets[k], 2)):
            name = keys.names[k][0]
            reason = 'single name stated with different countries; may be several people'
            evidence = f'countries {sorted(keys.stated_countries[k])}'
            out.append(Candidate(k, k, name, name, reason, 0.0, evidence, merges.get(frozenset((k,)))))
    return out, unsupported


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
        keys.kinds[gk] = ArtistKind.GROUP
        keys.members[gk] = [m for m in g.members if m in keys.kinds]
        for alias in g.aliases:
            if alias in keys.kinds:
                uf.union(gk, alias)
        if uf.find(gk) != gk:
            sys.exit(f"{gk}: group keys must sort before the keys they absorb (start them with 'g:')")

    def couple_root(k: str) -> str:
        return 'c:' + '+'.join(sorted(uf.find(m)[2:] for m in keys.members[k]))

    out: dict[str, str] = {}
    for k in keys.kinds:
        root = uf.find(k)
        out[k] = root if root in group_keys else couple_root(k) if k in keys.members else root
    return out


def write_artists(
    con: sqlite3.Connection, keys: Keys, final_key: Mapping[str, str], groups: list[Group], ids: Mapping[str, int]
) -> None:
    """The artists, their spellings, keys and members."""
    group_display = {g.group_key: g.display_name for g in groups}
    alias_counts: defaultdict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    for k, ns in keys.names.items():
        for n in ns:
            alias_counts[final_key[k]][n] += 1
    for fk in sorted(set(final_key.values())):
        src = next(k for k in keys.kinds if final_key[k] == fk)
        display = group_display.get(fk) or (
            max(alias_counts[fk].items(), key=lambda kv: (kv[1], -len(kv[0])))[0] if alias_counts[fk] else fk
        )
        kind = ArtistKind.GROUP if fk in group_display else keys.kinds[src]
        _ = con.execute('INSERT INTO artists VALUES (?, ?, ?, ?)', (ids[fk], display, kind, fk))
        _ = con.executemany(
            'INSERT INTO artist_aliases VALUES (?, ?, ?)', [(ids[fk], a, n) for a, n in alias_counts[fk].items()]
        )
    _ = con.executemany('INSERT INTO artist_keys VALUES (?, ?)', [(k, ids[fk]) for k, fk in final_key.items()])
    for k, ms in keys.members.items():
        _ = con.executemany(
            'INSERT INTO couple_members VALUES (?, ?) ON CONFLICT DO NOTHING',
            [(ids[final_key[k]], ids[final_key[m]]) for m in ms],
        )


def main() -> None:
    ap = argparse.ArgumentParser(description='Resolve artist mentions into artists, with stable ids.')
    sqlite_db.source_arg(ap)
    with sqlite_db.opened(ap.parse_args(namespace=sqlite_db.Source()).src, 'rw') as con:
        mentions = sqlite_db.records(
            con,
            Mention,
            'SELECT m.id, m.event_id, m.role, m.name_as_written, m.style, m.country, e.country AS event_country'
            ' FROM artist_mentions m JOIN events e ON e.id = m.event_id',
        )
        keys = keyed(mentions)
        merges = load_merges()
        found, unsupported_same_name = candidates(keys, merges)
        groups = Group.read(GROUPS)
        final_key = final_keys(keys, merged(keys, merges), groups)

        # keeping the ids artists had
        ids = stable_ids(con, final_key)
        _ = con.executescript(SCHEMA)
        _ = con.executemany(
            'INSERT INTO artist_ids VALUES (?, ?) ON CONFLICT DO NOTHING', [(i, fk) for fk, i in ids.items()]
        )
        write_artists(con, keys, final_key, groups, ids)
        found = [c for c in found if c.key_a == c.key_b or final_key[c.key_a] != final_key[c.key_b]]
        _ = con.executemany(
            'INSERT INTO event_artists VALUES (?, ?, ?, ?, ?, ?)',
            [(m.id, m.event_id, ids[final_key[keys.mention_key[m.id]]], m.role, m.style, m.country) for m in mentions],
        )
        _ = con.executemany('INSERT OR REPLACE INTO artist_merge_candidates VALUES (?, ?, ?, ?, ?, ?, ?, ?)', found)
        _ = con.executemany(
            'INSERT OR REPLACE INTO artist_merge_decisions VALUES (?, ?, ?, ?, ?)',
            [(r.key_a, r.key_b, r.decision, r.prompt, r.note) for r in MergeRow.read(MERGES)],
        )
        for g in groups:
            _ = con.execute(
                'INSERT INTO artist_group_definitions VALUES (?, ?, ?, ?)',
                (g.group_key, ids[g.group_key], g.display_name, g.note),
            )
            _ = con.executemany('INSERT INTO artist_group_aliases VALUES (?, ?)', [(g.group_key, a) for a in g.aliases])
        counted: list[tuple[str, int]] = con.execute('SELECT kind, count(*) FROM artists GROUP BY kind').fetchall()
        kinds_count = dict(counted)
        record_steps(con, Resolved(len(mentions), kinds_count, len(found), unsupported_same_name, len(groups)))
        con.commit()
        print(
            f'mentions {len(mentions)} -> artists {sum(kinds_count.values())} {kinds_count};'
            f' candidates {len(found)} ({sum(1 for c in found if c.decision)} reviewed);'
            f' same-name pairs kept apart for lack of evidence: {unsupported_same_name}'
        )


if __name__ == '__main__':
    main()
