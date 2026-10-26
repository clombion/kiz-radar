"""Resolve artist mentions into artists, couples and groups, and link them to events.

Reads artist_mentions (from load_extract.py) and pipeline/extract/merges.csv; writes:
  artists                 id, display_name, kind (person | couple | group | organisation), match_key
  artist_aliases          every name an artist was written as
  couple_members          couple/group id -> member person id
  event_artists           event -> artist links, one per mention (role, style, country, mention id)
  artist_merge_candidates pairs that may be the same artist, with evidence, for review
  artist_merge_decisions  every merge/separate decision applied, copied from pipeline/extract/merges.csv
  artist_group_definitions, artist_group_aliases
                          the named groups from pipeline/extract/groups.csv: note, members and the spellings that mean them
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

pipeline/extract/merges.csv columns: key_a, key_b, decision (merge | separate), note. Keys are match_key values.

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
import csv
import itertools
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher

from pipeline import db as sqlite_db
from pipeline.extract import run_log
from pipeline.extract.answers import log

import pycountry

MERGES = run_log.HERE / "merges.csv"
GROUPS = run_log.HERE / "groups.csv"
SPLIT_ROLES = {"teacher", "dj", "performer", "mc"}
ORG_ROLES = {"organiser", "media", "crew"}
SEPARATORS = re.compile(r"\s*&\s*|\s*\+\s*|\s+(?:and|et|e|y|und)\s+", re.I)
PREFIX = re.compile(r"^(?:dj|deejay|d\.j\.|mc)\s+", re.I)

SCHEMA = """
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
    kind TEXT NOT NULL CHECK (kind IN ('person', 'couple', 'group', 'organisation')),
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
    role TEXT NOT NULL,
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
    decision TEXT,                -- from pipeline/extract/merges.csv, NULL = not reviewed
    PRIMARY KEY (key_a, key_b)
);
CREATE TABLE artist_merge_decisions (
    key_a TEXT NOT NULL,          -- match_key values, as in artist_keys
    key_b TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('merge', 'separate')),
    source TEXT NOT NULL,         -- the review prompt version that decided it, or 'manual'
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
CREATE TABLE IF NOT EXISTS artist_ids (
    artist_id INTEGER PRIMARY KEY,  -- every artist id ever given; never reused
    match_key TEXT NOT NULL         -- the key it was given to
);
CREATE VIEW artist_events AS
    SELECT ea.artist_id, ea.event_id, ea.role, 'direct' AS via, NULL AS via_artist_id
    FROM event_artists ea
    UNION ALL
    SELECT cm.member_id, ea.event_id, ea.role, 'member', ea.artist_id
    FROM event_artists ea JOIN couple_members cm ON cm.couple_id = ea.artist_id;
"""


# Country spellings pycountry does not know: sports (IOC/FIFA) codes and French, Spanish, Portuguese and
# Italian names that line-ups use
COUNTRY_ALIASES = {
    "ger": "DE", "sui": "CH", "swi": "CH", "ned": "NL", "hol": "NL", "por": "PT", "uk": "GB", "eng": "GB",
    "cro": "HR", "den": "DK", "gre": "GR", "bul": "BG", "slo": "SI", "rsa": "ZA", "ang": "AO", "cpv": "CV",
    "england": "GB", "scotland": "GB", "holland": "NL", "cape verde": "CV", "cabo verde": "CV",
    "allemagne": "DE", "alemania": "DE", "alemanha": "DE", "germania": "DE",
    "espagne": "ES", "espana": "ES", "españa": "ES", "espanha": "ES", "spagna": "ES",
    "italie": "IT", "italia": "IT", "itália": "IT",
    "suisse": "CH", "suiza": "CH", "suíça": "CH", "svizzera": "CH",
    "angleterre": "GB", "inglaterra": "GB", "royaume-uni": "GB",
    "brésil": "BR", "bresil": "BR", "brasil": "BR",
    "belgique": "BE", "bélgica": "BE", "belgio": "BE",
    "pays-bas": "NL", "países bajos": "NL",
    "pologne": "PL", "polonia": "PL", "polônia": "PL",
    "ukraine": "UA", "ucrania": "UA", "ucrânia": "UA",
    "guadeloupe": "GP", "guadalupe": "GP", "guadelupe": "GP", "martinique": "MQ",
    "maroc": "MA", "marruecos": "MA", "sénégal": "SN", "cameroun": "CM", "côte d'ivoire": "CI",
    "grèce": "GR", "grecia": "GR", "autriche": "AT", "austria": "AT", "suède": "SE", "suecia": "SE",
    "république tchèque": "CZ", "rep. checa": "CZ", "tchéquie": "CZ", "hongrie": "HU", "hungría": "HU",
    "roumanie": "RO", "rumania": "RO", "croatie": "HR", "croacia": "HR", "turquie": "TR", "turquía": "TR",
    "états-unis": "US", "etats-unis": "US", "estados unidos": "US", "usa": "US",
}


def country_codes(text: str | None) -> frozenset[str]:
    """ISO 3166 alpha-2 codes for a country as written: flag emoji, country names or codes."""
    if not text:
        return frozenset()
    codes = set()
    indicators = [chr(ord(ch) - 0x1F1E6 + ord("A")) for ch in text if 0x1F1E6 <= ord(ch) <= 0x1F1FF]
    codes.update("".join(indicators[i : i + 2]) for i in range(0, len(indicators) - 1, 2))
    words = re.sub(r"[\U0001F1E6-\U0001F1FF]", " ", unicodedata.normalize("NFKC", text))
    for part in re.split(r"[/,;&()–—\-]+|\s+and\s+|\s+et\s+", words):
        part = part.strip(" .")
        if len(part) < 2:
            continue
        if alias := COUNTRY_ALIASES.get(part.casefold()):
            codes.add(alias)
            continue
        try:
            codes.add(pycountry.countries.lookup(part).alpha_2)
        except LookupError:
            pass
    return frozenset(codes)


def clean_display(name: str) -> str:
    """The name as a reader would want it shown: plain letters, no flags or emoji."""
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", unicodedata.normalize("NFKC", name))
    s = "".join(ch for ch in s if unicodedata.category(ch)[0] in "LNPZ" or ch in "&+'’")
    return " ".join(s.split()).strip(" -–—•·*:,;")


def token_key(name: str) -> str:
    s = PREFIX.sub("", clean_display(name))
    s = unicodedata.normalize("NFKD", s)
    return "".join(ch for ch in s if ch.isalnum() and not unicodedata.combining(ch)).casefold()


def members_of(name: str, role: str) -> list[str]:
    # A single letter on each side of "&" is a name built around it ("D&L Beats", "DJ M&M"), not a couple
    if role not in SPLIT_ROLES or re.search(r"(?<!\w)\w\s*&\s*\w(?!\w)", unicodedata.normalize("NFKC", name)):
        return [clean_display(name)]
    parts = [p for p in SEPARATORS.split(clean_display(name)) if token_key(p)]
    # A one-letter part means a name built around "&" (the DJ duo "D&L Beats"), not two people
    if len(parts) < 2 or any(len(token_key(p)) < 2 for p in parts):
        return [clean_display(name)]
    return parts


def role_family(role: str) -> str:
    return "dj" if role == "dj" else "dance"


def words_of(name: str) -> list[str]:
    return [w for w in (token_key(w) for w in PREFIX.sub("", clean_display(name)).split()) if w]


def person_key(name: str, role: str, couple_scope: str | None) -> str:
    k = token_key(name)
    if len(words_of(name)) > 1:
        return f"p:{k}"
    return f"p:{k}@{couple_scope}" if couple_scope else f"p:{k}@{role_family(role)}"


def load_groups() -> list[dict]:
    if not GROUPS.exists():
        return []
    with GROUPS.open() as f:
        return [
            {**r, "members": [k for k in r["members"].split(";") if k], "aliases": [k for k in r["aliases"].split(";") if k]}
            for r in csv.DictReader(f)
        ]


def load_merge_rows() -> list[dict]:
    if not MERGES.exists():
        return []
    with MERGES.open() as f:
        return list(csv.DictReader(f))


def load_merges() -> dict[frozenset, str]:
    return {frozenset((r["key_a"], r["key_b"])): r["decision"] for r in load_merge_rows()}


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


TABLE_DOCS = {
    "artists": "One row per resolved artist: a person, a couple, a group (several people booked under one name, or "
               "a team) or an organisation, with the most common spelling as display name.",
    "artist_aliases": "Every spelling an artist was written as, with how many mentions used it.",
    "artist_keys": "Every name key a mention or couple member produced, and the artist it resolved to (merged keys "
                   "included). The keys in artist_merge_candidates, artist_merge_decisions and artist_group_aliases "
                   "are these keys.",
    "couple_members": "The people in each couple or group (couple_id is the couple's or group's artist id).",
    "event_artists": "Each artist mention (artist_mentions.id) linked to its event and resolved artist, with role, "
                     "style and stated country.",
    "artist_events": "Every event an artist appears at: directly (via 'direct') or as a member of a couple or group "
                     "(via 'member', via_artist_id = the couple or group). Use it for a person's full event history.",
    "artist_merge_candidates": "Pairs of name keys that may be the same artist, with the reason, similarity and evidence; "
                               "decision is NULL when no merge or separate decision exists (left apart).",
    "artist_merge_decisions": "Every merge or separate decision applied, with its source (a review prompt version or "
                              "'manual') and rationale.",
    "artist_group_definitions": "Named groups defined by hand (a DJ duo booked under one name), with a note; members are "
                                "in couple_members.",
    "artist_group_aliases": "The name keys whose mentions count as a named group's.",
    "artist_ids": "Every artist id ever given and the match_key it was given to. An id missing from artists was merged "
                  "into another artist: artist_keys gives the artist its key belongs to now.",
}


def record_steps(con, n_mentions: int, kinds_count: dict, n_candidates: int, n_unsupported: int, n_groups: int) -> None:
    run_log.document(con, TABLE_DOCS, "pipeline/extract/resolve_artists.py")
    reviews = sorted((run_log.HERE / "answers" / "merge_review").glob("*.json"))
    if reviews:
        counts = defaultdict(lambda: defaultdict(int))
        for f in reviews:
            out = json.loads(f.read_text())
            for d in out["decisions"]:
                counts[out["prompt_version"]][d["decision"]] += 1
        for v in counts:
            run_log.record_prompt(con, v, run_log.HERE / "prompts" / f"{v}.md")
        run_log.record(
            con, "6_merge_review",
            "Decide, for each pair of artist records the matching rules flagged as possibly the same artist, whether "
            "they are (merge), are not (separate), or the evidence does not settle it (unsure, left unmerged). "
            "Decisions are written to pipeline/extract/merges.csv, where manual decisions override them.",
            f"{len(reviews)} subagents (claude-haiku-5-5), one batch each",
            performed_at=max(log()[f"merge_review/{f.name}"]["answered_at"] for f in reviews), model="claude-haiku-5-5",
            prompt_version=", ".join(sorted(counts)),
            inputs="each pair with every mention of both sides",
            outputs="pipeline/extract/merges.csv; table artist_merge_decisions",
            details={"decisions_by_prompt_version": {k: dict(v) for k, v in counts.items()}, "batches": len(reviews)},
        )
    rows = load_merge_rows()
    run_log.record(
        con, "7_resolve_artists",
        "Group artist mentions into people, couples, groups and organisations: exact name keys merge automatically "
        "(single-word names only within their couple or role family), reviewed and manual merge decisions are "
        "applied, named groups from pipeline/extract/groups.csv absorb their spellings, and near-matches without a decision "
        "are kept apart and listed in artist_merge_candidates.",
        "pipeline/extract/resolve_artists.py",
        inputs="table artist_mentions; pipeline/extract/merges.csv; pipeline/extract/groups.csv",
        outputs="tables artists, artist_aliases, artist_keys, couple_members, event_artists, artist_merge_candidates, "
                "artist_merge_decisions, artist_group_definitions, artist_group_aliases; view artist_events",
        details={"mentions": n_mentions, "artists_by_kind": kinds_count,
                 "merge_decisions": {d: sum(1 for r in rows if r["decision"] == d) for d in ("merge", "separate")},
                 "manual_decisions": sum(1 for r in rows if r.get("source") == "manual"),
                 "named_groups": n_groups, "candidates_listed": n_candidates,
                 "same_name_pairs_kept_apart_without_evidence": n_unsupported},
    )


def stable_ids(con: sqlite3.Connection, final_key: dict[str, str]) -> dict[str, int]:
    """An id for each artist (final key): its own earlier id, else the lowest earlier id of a key it absorbed that
    no artist still owns, else the next id never given."""
    tables = {t for t, in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    issued = dict(con.execute("SELECT match_key, artist_id FROM artist_ids" if "artist_ids" in tables
                              else "SELECT match_key, id FROM artists" if "artists" in tables else "SELECT 1, 1 WHERE 0"))
    key_was = dict(con.execute("SELECT match_key, artist_id FROM artist_keys")) if "artist_keys" in tables else {}
    finals = sorted(set(final_key.values()))
    ids = {fk: issued[fk] for fk in finals if fk in issued}
    taken = set(ids.values())
    absorbed = defaultdict(set)
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


def main() -> None:
    ap = argparse.ArgumentParser(description='Resolve artist mentions into artists, with stable ids.')
    sqlite_db.source_arg(ap)
    con = sqlite_db.connect(ap.parse_args().src, 'rw')
    mentions = con.execute(
        "SELECT m.id, m.event_id, m.role, m.name_as_written, m.style, m.country, e.country"
        " FROM artist_mentions m JOIN events e ON e.id = m.event_id"
    ).fetchall()

    # 1. Keys for every mention and its members
    names: dict[str, list[str]] = defaultdict(list)      # key -> names as written
    kinds: dict[str, str] = {}
    members: dict[str, list[str]] = {}                   # couple/group key -> member person keys
    stated_countries: dict[str, set] = defaultdict(set)      # key -> ISO codes stated with the name
    stated_sets: dict[str, set] = defaultdict(set)           # key -> each mention's code set
    event_countries: dict[str, set] = defaultdict(set)
    partners: dict[str, set] = defaultdict(set)
    mention_key: dict[int, str] = {}
    # couple key -> member token -> person keys seen for that member ("Chris’Py" and "Chris Py" in the
    # same couple give one single-word and one multi-word key for the same person)
    member_forms: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))
    for mid, eid, role, name, style, country, ev_country in mentions:
        pkeys_seen: list[str] = []
        if role in ORG_ROLES:
            key = f"o:{token_key(name)}"
            kinds[key] = "organisation" if role == "organiser" else "group"
        else:
            parts = members_of(name, role)
            scope = "+".join(sorted(token_key(p) for p in parts)) if len(parts) > 1 else None
            pkeys = [person_key(p, role, scope) for p in parts]
            for p, pk in zip(parts, pkeys):
                names[pk].append(p)
                kinds[pk] = "person"
                if codes := country_codes(country):
                    stated_countries[pk].update(codes)
                    stated_sets[pk].add(codes)
                if ev_country:
                    event_countries[pk].add(ev_country)
                partners[pk].update(set(pkeys) - {pk})
            pkeys_seen = pkeys
            if len(pkeys) == 1:
                key = pkeys[0]
            else:
                key = "c:" + scope
                kinds[key] = "couple" if len(pkeys) == 2 else "group"
                members[key] = pkeys
                for p, pk in zip(parts, pkeys):
                    member_forms[key][token_key(p)].add(pk)
        if key not in pkeys_seen:  # a solo name was already counted as its single part
            names[key].append(clean_display(name))
        if ev_country:
            event_countries[key].add(ev_country)
        mention_key[mid] = key

    # 2. Candidate pairs among person keys (couples follow their members) and among organisations
    merges = load_merges()
    candidates = []
    unsupported_same_name = 0
    persons = sorted(k for k in kinds if k.startswith("p:"))
    bare = {k: k[2:].split("@")[0] for k in persons}
    words = {k: words_of(names[k][0]) for k in persons}
    partner_names = {k: {bare.get(p, p) for p in partners[k]} for k in persons}
    for a, b in itertools.combinations(persons, 2):
        ba, bb = bare[a], bare[b]
        # Events in the same country are weak evidence (one country hosts a quarter of all events),
        # so a same-name pair needs a shared stated country or a shared partner
        strong = bool(stated_countries[a] & stated_countries[b] or partner_names[a] & partner_names[b])
        supported = strong or bool(event_countries[a] & event_countries[b])
        wa, wb = words[a], words[b]
        short, long_ = (wa, wb) if len(wa) <= len(wb) else (wb, wa)
        if ba == bb:
            reason, sim = "same name under different keys (DJ and dancer, solo and in a couple, or in different couples)", 1.0
            if not strong:
                unsupported_same_name += 1
                continue
        elif short and len(short) < len(long_) and long_[: len(short)] == short and len(short[0]) >= 3:
            reason, sim = "one name is the first word(s) of the other", SequenceMatcher(None, ba, bb).ratio()
            if not strong:
                continue
        elif (partner_names[a] & partner_names[b]) and min(len(ba), len(bb)) >= 3 and (ba.startswith(bb) or bb.startswith(ba)):
            reason, sim = "same partner, one name shortens the other", SequenceMatcher(None, ba, bb).ratio()
        else:
            if min(len(ba), len(bb)) < 5:
                continue
            sm = SequenceMatcher(None, ba, bb)
            # real_quick_ratio and quick_ratio are upper bounds of ratio, so they rule pairs out cheaply
            if sm.real_quick_ratio() < 0.88 or sm.quick_ratio() < 0.88 or (sim := sm.ratio()) < 0.88:
                continue
            # Different first names are often one letter apart (Daniel / Daniela), so single-word
            # pairs need the same evidence as same-name pairs
            if not ((len(wa) > 1 and len(wb) > 1 and supported) or strong):
                continue
            reason = "similar spelling"
        evidence = (
            f"{names[a][0]!r}: countries {sorted(stated_countries[a]) or '-'}, events in {sorted(event_countries[a])[:4]},"
            f" partners {sorted(p[2:] for p in partners[a])[:4]} | {names[b][0]!r}: countries {sorted(stated_countries[b]) or '-'},"
            f" events in {sorted(event_countries[b])[:4]}, partners {sorted(p[2:] for p in partners[b])[:4]}"
        )
        candidates.append((a, b, names[a][0], names[b][0], reason, round(sim, 3), evidence, merges.get(frozenset((a, b)))))
    for k in persons:
        disjoint = any(not (x & y) for x, y in itertools.combinations(stated_sets[k], 2))
        if disjoint and "@" in k:
            candidates.append((k, k, names[k][0], names[k][0], "single name stated with different countries; may be several people",
                               0.0, f"countries {sorted(stated_countries[k])}", merges.get(frozenset((k,)))))

    # 3. Apply reviewed merges (person and organisation keys); couples re-key from their members
    uf = UnionFind()
    for k in kinds:
        uf.find(k)
    for forms in member_forms.values():
        for keys in forms.values():
            first, *rest = sorted(keys)
            for other in rest:
                uf.union(first, other)
    for pair, decision in merges.items():
        if decision == "merge" and len(pair) == 2 and all(k in kinds for k in pair):
            uf.union(*pair)
    # A single-word member is scoped to its couple's spelling of the partner ("ISA" in "MADY & ISA" and in
    # "Mady Keita & ISA"). Once the partners are merged, the same single word with the same partner is the
    # same person; repeat until no new merge appears, since each merge can align further couples.
    while True:
        same_member = defaultdict(set)
        for ms in members.values():
            for m in ms:
                if "@" in m:
                    partner_roots = tuple(sorted(uf.find(x) for x in ms if x != m))
                    same_member[(m[2:].split("@")[0], partner_roots)].add(m)
        before = len({uf.find(k) for k in kinds})
        for keys in same_member.values():
            first, *rest = sorted(keys)
            for other in rest:
                uf.union(first, other)
        if len({uf.find(k) for k in kinds}) == before:
            break

    # Named groups: fold their alias keys into the group key and link the group to its members
    groups = load_groups()
    group_keys = {g["group_key"] for g in groups}
    group_display = {g["group_key"]: g["display_name"] for g in groups}
    for g in groups:
        gk = g["group_key"]
        kinds[gk] = "group"
        members[gk] = [m for m in g["members"] if m in kinds]
        for alias in g["aliases"]:
            if alias in kinds:
                uf.union(gk, alias)
        if uf.find(gk) != gk:
            sys.exit(f"{gk}: group keys must sort before the keys they absorb (start them with 'g:')")

    def couple_root(k: str) -> str:
        return "c:" + "+".join(sorted(uf.find(m)[2:] for m in members[k]))

    final_key = {}
    for k in kinds:
        root = uf.find(k)
        final_key[k] = root if root in group_keys else couple_root(k) if k in members else root

    # 4. Write tables, keeping the ids artists had
    ids = stable_ids(con, final_key)
    con.executescript(SCHEMA)
    con.executemany("INSERT OR IGNORE INTO artist_ids VALUES (?, ?)", [(i, fk) for fk, i in ids.items()])
    alias_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for k, ns in names.items():
        for n in ns:
            alias_counts[final_key[k]][n] += 1
    for fk in sorted(set(final_key.values())):
        src = next(k for k in kinds if final_key[k] == fk)
        display = group_display.get(fk) or (
            max(alias_counts[fk].items(), key=lambda kv: (kv[1], -len(kv[0])))[0] if alias_counts[fk] else fk
        )
        kind = "group" if fk in group_keys else kinds[src]
        con.execute("INSERT INTO artists VALUES (?, ?, ?, ?)", (ids[fk], display, kind, fk))
        con.executemany("INSERT INTO artist_aliases VALUES (?, ?, ?)", [(ids[fk], a, n) for a, n in alias_counts[fk].items()])
    con.executemany("INSERT INTO artist_keys VALUES (?, ?)", [(k, ids[fk]) for k, fk in final_key.items()])
    candidates = [c for c in candidates if c[0] == c[1] or final_key[c[0]] != final_key[c[1]]]
    for k, ms in members.items():
        con.executemany(
            "INSERT OR IGNORE INTO couple_members VALUES (?, ?)",
            [(ids[final_key[k]], ids[final_key[m]]) for m in ms],
        )
    con.executemany(
        "INSERT INTO event_artists VALUES (?, ?, ?, ?, ?, ?)",
        [(mid, eid, ids[final_key[mention_key[mid]]], role, style, country) for mid, eid, role, _, style, country, _ in mentions],
    )
    con.executemany("INSERT OR REPLACE INTO artist_merge_candidates VALUES (?, ?, ?, ?, ?, ?, ?, ?)", candidates)
    con.executemany(
        "INSERT OR REPLACE INTO artist_merge_decisions VALUES (?, ?, ?, ?, ?)",
        [(r["key_a"], r["key_b"], r["decision"], r.get("source") or "manual", r.get("note")) for r in load_merge_rows()],
    )
    for g in groups:
        con.execute(
            "INSERT INTO artist_group_definitions VALUES (?, ?, ?, ?)",
            (g["group_key"], ids[g["group_key"]], g["display_name"], g.get("note")),
        )
        con.executemany(
            "INSERT INTO artist_group_aliases VALUES (?, ?)", [(g["group_key"], a) for a in g["aliases"]]
        )
    con.commit()
    kinds_count = dict(con.execute("SELECT kind, count(*) FROM artists GROUP BY kind").fetchall())
    record_steps(con, len(mentions), kinds_count, len(candidates), unsupported_same_name, len(groups))
    print(f"mentions {len(mentions)} -> artists {sum(kinds_count.values())} {kinds_count};"
          f" candidates {len(candidates)} ({sum(1 for c in candidates if c[7])} reviewed);"
          f" same-name pairs kept apart for lack of evidence: {unsupported_same_name}")


if __name__ == "__main__":
    main()
