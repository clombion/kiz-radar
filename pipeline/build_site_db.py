"""Build docs/data/kiz.sqlite, the database the site loads, from the kizomba-world source DB. It is built, never
committed: Publish builds it with the site (mise run build:data), and a step that reads it reads one built() for it.

Keeps facts (titles, dates, places, genres, features, line-ups) and links back to kizomba-world;
drops descriptions, images and extraction quotes. Adds places, airports, per-event and per-artist
statistics, a fares table filled from docs/data/fares.csv, and the states every coded column can hold (states, from
pipeline/states.py).

    uv run -m pipeline.build_site_db "$(uv run -q -m pipeline.db)"
"""

import argparse
import collections
import datetime as dt
import itertools
import json
import math
import sqlite3
import sys
import tempfile
import unicodedata
from collections.abc import Generator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from pipeline import ROOT, enums, states
from pipeline import db as sqlite_db
from pipeline.airports import AIRPORTS, HOME
from pipeline.countries import NAMES, codes
from pipeline.enums import Feature, Genre, HomeBasis, PassKind, People, Role, Style
from pipeline.extract.prices import COUPLE
from pipeline.names import norm, sim
from pipeline.records import (
    ArtistMergeRow,
    Booking,
    Fare,
    HomeCountry,
    Person,
    Place,
    PlanRow,
    Promo,
    Rate,
    day_of,
    now,
)
from pipeline.text import soften_caps, tidy_name, tidy_title

DATA = ROOT / 'docs' / 'data'
OUT = DATA / 'kiz.sqlite'
SITE_JSON = DATA / 'site.json'  # what the page shows before the database loads
POPULAR = 10  # bookings that make an artist "popular"
MAX_AIRPORT_KM = 250
EARTH_KM = 6371  # the Earth's radius
KIZ = tuple(g for g, s in states.STYLE_OF.items() if s == Style.KIZOMBA)
BOOKED_ROLES = (Role.TEACHER, Role.DJ, Role.PERFORMER)
LINEUP_ROLES = (Role.TEACHER, Role.DJ)  # the roles a line-up counts
FRIDAY, LATEST_START = 4, 3  # a Friday's weekday; a trip leaves on the Friday after a start this many days before
DAY_CHECK = 'check (length({0}) = 10 and date({0}) = {0})'
COPIED = (
    'event_categories',
    'event_tags',
    'artists',
    'artist_aliases',
    'couple_members',
    'event_artists',
    'genre_definitions',
    'feature_definitions',
    'role_definitions',
    'pipeline_steps',
)


def km(a: float, b: float, c: float, d: float) -> float:
    a, b, c, d = map(math.radians, (a, b, c, d))
    return (
        EARTH_KM
        * 2
        * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2 + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))
    )


def weekend_friday(start: str) -> str:
    """The Friday a Fri→Mon trip would leave on: the event's own Friday, or the next one for a Wed/Thu start."""
    d = dt.date.fromisoformat(start)
    off = (FRIDAY - d.weekday()) % 7
    return (d + dt.timedelta(days=off if off <= LATEST_START else off - 7)).isoformat()


def exists(x: sqlite3.Connection, sql: str, params: tuple[object, ...]) -> bool:
    found: list[tuple[int]] = x.execute(sql, params).fetchall()
    return bool(found)


def copy_tables(x: sqlite3.Connection) -> None:
    """The source's tables the site keeps, without descriptions, images or quotes. Dates are days (the site plans
    weekends, not hours); title is tidied for display, listed_title is as listed."""
    _ = x.execute(f"""create table events (id integer primary key, title text not null, listed_title text not null,
         url text not null,
     slug text, start_date text not null {DAY_CHECK.format('start_date')},
     end_date text not null {DAY_CHECK.format('end_date')},
     timezone text, all_day integer, featured integer, cancelled integer check (cancelled in (0, 1)),
     venue text check (venue != ''),
     city text check (city != ''), country text check (country != ''),
     website text, published_at text, modified_at text, check (end_date >= start_date))""")
    events: list[
        tuple[int, str, str, str, str, str, str, int, int, int | None, str | None, *tuple[str | None, ...]]
    ] = x.execute(
        """select id, title, url, slug, start_date, end_date, timezone, all_day, featured, cancelled, venue,
             nullif(city, ''), nullif(country, ''), website, published_at, modified_at from src.events"""
    ).fetchall()
    _ = x.executemany(
        'insert into events values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
            (
                i,
                tidy_title(t),
                t,
                url,
                slug,
                day_of(start),
                day_of(end),
                tz,
                all_day,
                feat,
                canc,
                soften_caps(venue) if venue else None,
                *rest,
            )
            for i, t, url, slug, start, end, tz, all_day, feat, canc, venue, *rest in events
        ],
    )
    for t in COPIED:
        copy(x, t)
    copy(x, 'event_genres', ('event_id', 'genre', 'source', 'other_name', 'genre_as_written'))
    copy(x, 'event_features', ('event_id', 'feature', 'source'))
    copy(x, 'event_rooms', ('event_id', 'party_rooms', 'class_rooms'))
    copy(x, 'event_room_list', ('event_id', 'room_no', 'name_as_written', 'kind', 'genres'))
    copy(x, 'artist_mentions', ('id', 'event_id', 'role', 'name_as_written', 'style', 'country'))


def copy(x: sqlite3.Connection, table: str, columns: Sequence[str] | None = None) -> None:
    """A table of the source with all its rows: as it is declared there, or with only these of its columns, each with
    its declared type, key and reference (a check over the columns left out goes with them)."""
    if columns is None:
        found: list[tuple[str]] = x.execute(
            "select sql from src.sqlite_master where type = 'table' and name = ?", (table,)
        ).fetchall()
        _ = x.execute(found[0][0])
        _ = x.execute(f'insert into {table} select * from src.{table}')  # noqa: S608 (a table of the source's)
        return
    declared: list[tuple[str, str, int, int]] = x.execute(
        'select name, type, "notnull", pk from pragma_table_info(?, \'src\')', (table,)
    ).fetchall()
    refs: list[tuple[int, str, str, str]] = x.execute(
        'select id, "from", "table", "to" from pragma_foreign_key_list(?, \'src\') order by id, seq', (table,)
    ).fetchall()
    kept = [d for d in declared if d[0] in columns]
    if missing := set(columns) - {d[0] for d in kept}:
        sys.exit(f'{table}: the source has no column {", ".join(sorted(missing))}')
    key = [name for name, _, _, pk in sorted(kept, key=lambda d: d[3]) if pk]
    lines = [f'{name} {kind}' + (' not null' if notnull else '') for name, kind, notnull, _ in kept]
    lines += [f'primary key ({", ".join(key)})'] if key else []
    for _, group in itertools.groupby(refs, key=lambda r: r[0]):
        ref = list(group)
        if all(c in columns for _, c, _, _ in ref):
            ends = ', '.join(c for _, c, _, _ in ref), ', '.join(to for _, _, _, to in ref)
            lines.append(f'foreign key ({ends[0]}) references {ref[0][2]}({ends[1]})')
    names = ', '.join(columns)
    _ = x.execute(f'create table {table} ({", ".join(lines)})')
    _ = x.execute(f'insert into {table} ({names}) select {names} from src.{table}')  # noqa: S608 (a table of the source's and its columns)


def stored_by_key(x: sqlite3.Connection) -> None:
    """Each table whose key is not an integer row id is stored as its key (WITHOUT ROWID), so the key is the table
    rather than a second index beside it, and no column of the key can be null."""
    _ = x.execute('pragma legacy_alter_table = on')  # views name the table, not its renamed copy
    found: list[tuple[str, str]] = x.execute("select name, sql from sqlite_master where type = 'table'").fetchall()
    for name, ddl in found:
        key: list[tuple[str]] = x.execute('select upper(type) from pragma_table_info(?) where pk', (name,)).fetchall()
        if not key or key == [('INTEGER',)] or ddl.rstrip().lower().endswith('without rowid'):
            continue
        _ = x.execute(f'alter table {name} rename to {name}_rowid')
        _ = x.execute(f'{ddl} without rowid')
        _ = x.execute(f'insert into {name} select * from {name}_rowid')  # noqa: S608 (a table of ours)
        _ = x.execute(f'drop table {name}_rowid')
    _ = x.execute('pragma legacy_alter_table = off')


@dataclass
class Artists:
    """The artists as the site has them: each source key's artist, and the artists folded into others."""

    key_id: dict[str, int]
    parent: dict[int, int] = field(default_factory=dict[int, int])

    def root(self, a: int) -> int:
        while self.parent.get(a, a) != a:
            a = self.parent[a]
        return a

    def join(self, keep: int, merge: int) -> None:
        keep, merge = self.root(keep), self.root(merge)
        if keep != merge:
            self.parent[merge] = keep


def merged(x: sqlite3.Connection) -> tuple[Artists, int]:
    """The manual artist merges (pipeline/artist_merges.csv), and how many merge rows there are. Each "merge" row
    folds merge_key's artist into keep_key's. Merging two couples also merges their members pairwise, by closest
    name."""
    keys: list[tuple[str, int]] = x.execute('select match_key, artist_id from src.artist_keys').fetchall()
    own: list[tuple[str, int]] = x.execute('select match_key, id from artists').fetchall()
    found = Artists(dict(keys) | dict(own))
    merge_rows = [r for r in ArtistMergeRow.read(ROOT / 'pipeline' / 'artist_merges.csv') if r.decision == 'merge']
    members_of: collections.defaultdict[int, list[tuple[int, str]]] = collections.defaultdict(list)
    names: list[tuple[int, int, str]] = x.execute(
        'select cm.couple_id, cm.member_id, a.display_name from couple_members cm join artists a on a.id = cm.member_id'
    ).fetchall()
    for cid, mid, name in names:
        members_of[cid].append((mid, norm(name)))
    for r in merge_rows:
        keep, merge = found.key_id.get(r.keep_key), found.key_id.get(r.merge_key)
        if not keep or not merge:
            print(f'artist_merges.csv: unknown key in {r.keep_name} / {r.merge_name}; skipped', file=sys.stderr)
            continue
        found.join(keep, merge)
        km_, mm = members_of.get(keep, []), members_of.get(merge, [])
        if len(km_) == len(mm) == COUPLE:
            straight = sim(km_[0][1], mm[0][1]) + sim(km_[1][1], mm[1][1])
            crossed = sim(km_[0][1], mm[1][1]) + sim(km_[1][1], mm[0][1])
            pairs = zip(km_, mm, strict=True) if straight >= crossed else zip(km_, reversed(mm), strict=True)
            for (k_id, _), (m_id, _) in pairs:
                found.join(k_id, m_id)
    return found, len(merge_rows)


def fold(x: sqlite3.Connection, old: int, new: int) -> None:
    """An artist folded into another: its bookings, members, spellings and name become the other's."""
    _ = x.execute('update event_artists set artist_id = ? where artist_id = ?', (new, old))
    for side in ('couple_id', 'member_id'):  # a pair the other already has is left to the delete
        _ = x.execute(f'update or ignore couple_members set {side} = ? where {side} = ?', (new, old))  # noqa: S608 (a column of ours)
        _ = x.execute(f'delete from couple_members where {side} = ?', (old,))  # noqa: S608 (a column of ours)
    aliases: list[tuple[str, int]] = x.execute(
        'select alias, mentions from artist_aliases where artist_id = ?', (old,)
    ).fetchall()
    for alias, n in aliases:
        if not x.execute(
            'update artist_aliases set mentions = mentions + ? where artist_id = ? and alias = ?', (n, new, alias)
        ).rowcount:
            _ = x.execute('insert into artist_aliases values (?,?,?)', (new, alias, n))
    _ = x.execute('delete from artist_aliases where artist_id = ?', (old,))
    names: list[tuple[str]] = x.execute('select display_name from artists where id = ?', (old,)).fetchall()
    ((old_name,),) = names
    _ = x.execute(
        """insert into artist_aliases select ?, ?, 0
         where not exists (select 1 from artist_aliases where artist_id = ? and alias = ?)""",
        (new, old_name, new, old_name),
    )
    _ = x.execute('delete from artists where id = ?', (old,))


def merge_artists(x: sqlite3.Connection) -> Artists:
    """Apply the manual merges and the moved bookings; old ids stay reachable through artist_redirects."""
    artists, n_merges = merged(x)
    root = artists.root
    redirects = [(a, root(a)) for a in list(artists.parent) if root(a) != a]
    _ = x.execute('create table artist_redirects (old_id integer primary key, new_id integer)')
    _ = x.executemany('insert into artist_redirects values (?,?)', redirects)
    for old, new in redirects:
        fold(x, old, new)
    # ids the source pipeline retired when it merged artists (src.artist_ids keeps every id it gave) read as the
    # artist their key belongs to now, so a shared link to one still opens
    retired: list[tuple[int, int]] = x.execute("""select i.artist_id,
             k.artist_id from src.artist_ids i join src.artist_keys k on k.match_key = i.match_key
               where i.artist_id not in (select id from src.artists)""").fetchall()
    _ = x.executemany('insert or ignore into artist_redirects values (?,?)', [(old, root(new)) for old, new in retired])
    # A name listed alone can stand for different people across festivals ("Christina"). Each row of
    # pipeline/artist_bookings.csv moves one festival's booking from the record it was filed under to the person it is.
    moves = Booking.read(ROOT / 'pipeline' / 'artist_bookings.csv')
    for r in moves:
        frm, to = artists.key_id.get(r.from_key), artists.key_id.get(r.to_key)
        if not frm or not to:
            sys.exit(f'artist_bookings.csv: unknown key in {r.from_name} → {r.to_name}')
        if not x.execute(
            'update event_artists set artist_id = ? where event_id = ? and artist_id = ?',
            (root(to), r.event_id, root(frm)),
        ).rowcount:
            sys.exit(f'artist_bookings.csv: {r.from_name} is not booked at {r.event}')
    # a merge or a moved booking can name the same artist twice in one line-up: the first mention stays
    _ = x.execute("""delete from event_artists where mention_id not in (
       select min(mention_id) from event_artists group by event_id, artist_id, role)""")
    print(f'{n_merges} merge rows, {len(redirects)} artists folded into others, {len(moves)} bookings moved')

    # one casing for names across the site: "AMI & JULIEN" → "Ami & Julien", "Dj Chico" → "DJ Chico"
    listed: list[tuple[int, str]] = x.execute('select id, display_name from artists').fetchall()
    renamed = [(new, i) for i, n in listed if (new := tidy_name(n)) != n]
    _ = x.executemany('update artists set display_name = ? where id = ?', renamed)
    print(f'{len(renamed)} artist names recased')
    return artists


def places(x: sqlite3.Connection) -> None:
    """Each event's country, place and nearest airport, and the weekend a trip to it leaves on."""
    geo = {(p.city, p.country): p for p in Place.read(ROOT / 'pipeline' / 'geocode.csv')}
    _ = x.execute(
        'create table airports (code text primary key, name text not null, city text not null, country_code text, lat '
        'real, lon real, home integer)'
    )
    _ = x.executemany(
        'insert into airports values (?,?,?,?,?,?,?)',
        [(a.code, a.name, a.city, a.country_code, a.lat, a.lon, int(a.home == 1)) for a in AIRPORTS],
    )
    # a place on the map is a city's
    for col in (
        'country_code text',
        'lat real check (lat is null or city is not null)',
        'lon real',
        'airport text',
        'airport_km real',
        'weekend_friday text',
    ):
        _ = x.execute(f'alter table events add column {col}')
    events: list[tuple[int, str | None, str | None, str]] = x.execute(
        'select id, city, country, start_date from events'
    ).fetchall()
    for eid, city, country, start in events:
        cc = (codes(country) or [None])[0]
        g = None if city is None else geo.get((city, country))
        lat, lon = (g.found.lat, g.found.lon) if g and g.found else (None, None)
        ap = dist = None
        if lat is not None and lon is not None:
            dist, ap = min((km(lat, lon, a.lat, a.lon), a.code) for a in AIRPORTS)
            if dist > MAX_AIRPORT_KM:
                ap = dist = None
        _ = x.execute(
            'update events set country_code=?, lat=?, lon=?, airport=?, airport_km=?, weekend_friday=? where id=?',
            (cc, lat, lon, ap, round(dist) if dist is not None else None, weekend_friday(start), eid),
        )
    _ = x.execute('create table countries (code text primary key, name text)')
    _ = x.executemany('insert into countries values (?,?)', sorted(NAMES.items()))


def fares(x: sqlite3.Connection) -> None:
    """A snapshot of docs/data/fares.csv (the site reloads the live file), and each event's fare."""
    _ = x.execute("""create table fares (airport text, depart text, return text, price real, currency text,
         fetched_at text,
     primary key (airport, depart, return))""")
    _ = x.executemany(
        'insert or replace into fares values (?,?,?,?,?,?)',
        [
            (r.airport, r.depart, r.return_, float(r.price), r.currency, r.fetched_at)
            for r in Fare.read(DATA / 'fares.csv')
        ],
    )
    _ = x.execute("""create view event_fares as
     select e.id as event_id, e.airport, e.weekend_friday as depart, f.return, f.price, f.fetched_at,
       (select min(price) from fares m where m.airport = e.airport
          and substr(m.depart, 1, 7) = substr(e.weekend_friday, 1, 7)) as month_min
     from events e left join fares f on f.airport = e.airport and f.depart = e.weekend_friday""")


@dataclass(frozen=True)
class Booked:
    """Each artist's own bookings (events), and the home country, or the country booked most in, it counts from."""

    bookings: collections.defaultdict[int, set[int]]
    home_of: dict[int, str | None]
    ev_cc: dict[int, str | None]


def home(
    a: int, given: dict[int, str], stated: collections.Counter[str], where: collections.Counter[str]
) -> tuple[str | None, HomeBasis | None]:
    """A home country is known when it is given in pipeline/artist_countries.csv or stated in a line-up they are
    booked in."""
    booked_origins = [c for c, _ in stated.most_common() if where.get(c)]
    if a in given:
        return given[a], HomeBasis.GIVEN
    if booked_origins:
        return max(booked_origins, key=lambda c: where[c]), HomeBasis.STATED
    return None, None


def given_homes(x: sqlite3.Connection, artists: Artists) -> dict[int, str]:
    """Home countries known from outside the line-ups (pipeline/artist_countries.csv), by the source's match_key."""
    given: dict[int, str] = {}
    for r in HomeCountry.read(ROOT / 'pipeline' / 'artist_countries.csv'):
        if r.match_key not in artists.key_id:
            sys.exit(f'artist_countries.csv: unknown match_key {r.match_key} ({r.name})')
        if not exists(x, 'select 1 from countries where code = ?', (r.country,)):
            sys.exit(f'artist_countries.csv: unknown country {r.country} ({r.name})')
        given[artists.root(artists.key_id[r.match_key])] = r.country
    return given


def artist_stats(x: sqlite3.Connection, artists: Artists) -> Booked:
    """Each artist's bookings, roles, countries and home. A couple's booking counts for the couple, not for each
    member: a member's own bookings are their solo work. A member listed in the same role as their couple at the same
    event repeats the couple's booking, so it is marked (as_couple) and left out of line-ups and statistics; a
    different role (the couple teaches, one of them DJs) is a solo booking."""
    _ = x.execute('alter table event_artists add column as_couple integer')
    _ = x.execute("""update event_artists set as_couple = (
       select c.artist_id from event_artists c join couple_members cm on cm.couple_id = c.artist_id
       where c.event_id = event_artists.event_id and c.role = event_artists.role
         and cm.member_id = event_artists.artist_id limit 1)""")
    _ = x.execute("""create view artist_events as
    select ea.artist_id, ea.event_id, ea.role, 'direct' as via, null as via_artist_id from event_artists ea
    where ea.as_couple is null
    union all
    select cm.member_id, ea.event_id, ea.role, 'member', ea.artist_id
    from event_artists ea join couple_members cm on cm.couple_id = ea.artist_id""")
    roles = (json.dumps(BOOKED_ROLES),)
    countries: list[tuple[int, str | None]] = x.execute('select id, country_code from events').fetchall()
    ev_cc = dict(countries)
    bookings: collections.defaultdict[int, set[int]] = collections.defaultdict(set)
    role_count: collections.defaultdict[int, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    booked: list[tuple[int, int, str]] = x.execute(
        'select artist_id, event_id, role from event_artists where as_couple is null and role in '
        '(select value from json_each(?))',
        roles,
    ).fetchall()
    for a, e, role in booked:
        if e not in bookings[a]:
            role_count[a][role] += 1
        bookings[a].add(e)
    couple_bookings: collections.defaultdict[int, set[int]] = collections.defaultdict(set)  # events booked in a couple
    as_member: list[tuple[int, int]] = x.execute(
        "select artist_id, event_id from artist_events where via = 'member' and role in "
        '(select value from json_each(?))',
        roles,
    ).fetchall()
    for m, e in as_member:
        couple_bookings[m].add(e)
    stated: collections.defaultdict[int, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    said: list[tuple[int, str]] = x.execute(
        "select artist_id, country from event_artists where country is not null and country != ''"
    ).fetchall()
    for a, text in said:
        for c in codes(text):
            stated[a][c] += 1
    _ = x.execute(
        'create table artist_origin (artist_id integer, country_code text, mentions integer, primary key (artist_id, '
        'country_code))'
    )
    _ = x.executemany(
        'insert into artist_origin values (?,?,?)', [(a, c, n) for a, cnt in stated.items() for c, n in cnt.items()]
    )
    _ = x.execute(f"""create table artist_stats (artist_id integer primary key, bookings integer, teacher integer,
         dj integer,
     performer integer, first_date text, last_date text, home_country text,
     home_basis text check (home_basis in ({states.sql_in('home_basis')})),
     booked_most_in text, countries integer, abroad_bookings integer, popular integer, couple_bookings integer,
     check ((home_country is null) = (home_basis is null)))""")
    _ = x.execute(
        'create table artist_countries (artist_id integer, country_code text, bookings integer, is_home integer, '
        'primary key (artist_id, country_code))'
    )
    starts: list[tuple[int, str]] = x.execute('select id, start_date from events').fetchall()
    dates = dict(starts)
    given = given_homes(x, artists)
    # Where a home country isn't known, the country they are booked in most stands in for it in the statistics
    # (imported artists, bookings abroad), and is kept apart as booked_most_in, so the site never shows a guess as
    # where someone is from.
    home_of: dict[int, str | None] = {}
    for a, evs in bookings.items():
        where = collections.Counter(c for e in evs if (c := ev_cc[e]))
        country, basis = home(a, given, stated[a], where)
        most = where.most_common(1)[0][0] if where else None
        home_of[a] = country or most
        ds = sorted(dates[e] for e in evs)
        abroad = sum(n for c, n in where.items() if c != home_of[a])
        _ = x.execute(
            'insert into artist_stats values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (
                a,
                len(evs),
                role_count[a][Role.TEACHER],
                role_count[a][Role.DJ],
                role_count[a][Role.PERFORMER],
                ds[0],
                ds[-1],
                country,
                basis,
                most,
                len(where),
                abroad,
                int(len(evs) >= POPULAR),
                len(couple_bookings[a] - evs),
            ),
        )
        _ = x.executemany(
            'insert into artist_countries values (?,?,?,?)', [(a, c, n, int(c == country)) for c, n in where.items()]
        )
    return Booked(bookings, home_of, ev_cc)


def features(x: sqlite3.Connection) -> collections.defaultdict[int, set[str]]:
    """Each event's features: its own, a promo code of ours (pipeline/promo_codes.csv), and group deals."""
    feats: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    found: list[tuple[int, str]] = x.execute('select event_id, feature from event_features').fetchall()
    for e, f in found:
        feats[e].add(f)
    _ = x.execute(
        'create table event_promos (event_id integer primary key references events(id), code text not null check (code '
        "!= ''), offer text check (offer != ''))"
    )
    for r in Promo.read(ROOT / 'pipeline' / 'promo_codes.csv'):
        if not exists(x, 'select 1 from events where id = ?', (r.event_id,)):
            sys.exit(f'promo_codes.csv: no event {r.event_id} ({r.event})')
        _ = x.execute('insert into event_promos values (?,?,?)', (r.event_id, r.code.strip(), r.offer.strip() or None))
        feats[r.event_id].add(Feature.PROMO_CODE)
    # pass prices, from the source's prices pass (without the quotes or price notes)
    copy(
        x,
        'event_passes',
        ('event_id', 'pass_no', 'kind', 'style', 'label', 'group_size', 'people', 'days', 'includes_hotel', 'source'),
    )
    # festivals whose prices are read on their ticket page: the page, when it was read, tickets on it not read yet
    copy(x, 'ticket_pages', ('event_id', 'page', 'reseller', 'read_on', 'unread'))
    # what a card can say of each festival's price, the ticket page it links to, and the pass it prices
    _ = x.execute(f"""create table price_status (event_id integer primary key references events(id),
     price text not null check (price in ({states.sql_in('price')})), page text, card_pass integer,
     check ((price = '{enums.Price.PRICED}') = (card_pass is not null)))""")
    _ = x.execute('insert into price_status select event_id, price, page, card_pass from src.price_status')
    # a festival selling full, party or package passes for two or more people has the group_deals highlight
    deals: list[tuple[int]] = x.execute(
        'select distinct event_id from event_passes where people in (select value from json_each(?)) '
        'and kind in (select value from json_each(?))',
        (json.dumps((People.COUPLE, People.GROUP)), json.dumps((PassKind.FULL, PassKind.PARTY, PassKind.PACKAGE))),
    ).fetchall()
    for (e,) in deals:
        feats[e].add(Feature.GROUP_DEALS)
    copy(
        x,
        'pass_tiers',
        (
            'event_id',
            'pass_no',
            'tier_no',
            'amount',
            'currency',
            'fee',
            'alt_amount',
            'alt_currency',
            'valid_from',
            'valid_until',
            'quantity',
            'door',
            'sold_out',
            'current',
        ),
    )
    # the rates the site converts prices with
    _ = x.execute(
        'create table rates (currency text primary key, per_eur real not null check (per_eur > 0), date text not null)'
    )
    rates = Rate.read(ROOT / 'pipeline' / 'rates.csv')
    _ = x.executemany('insert into rates values (?,?,?)', [(r.currency, r.per_eur, r.date) for r in rates])
    return feats


def event_stats(x: sqlite3.Connection, booked: Booked) -> None:
    genres: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    found: list[tuple[int, str]] = x.execute('select event_id, genre from event_genres').fetchall()
    for e, g in found:
        genres[e].add(g)
    feats = features(x)
    lineups: collections.defaultdict[int, set[int]] = collections.defaultdict(set)
    named: list[tuple[int, int]] = x.execute(
        'select event_id, artist_id from event_artists where role in (select value from json_each(?)) and '
        'as_couple is null',
        (json.dumps(LINEUP_ROLES),),
    ).fetchall()
    for e, a in named:
        lineups[e].add(a)
    _ = x.execute("""create table event_stats (event_id integer primary key, lineup integer, popular_artists integer,
         imported integer,
     kiz integer, kiz_only integer, taxi_dancers integer, all_in_one integer, genres text, features text)""")
    for e, cc in booked.ev_cc.items():
        g, f, lineup = genres[e], feats[e], lineups[e]
        kiz = bool(g & set(KIZ))
        _ = x.execute(
            'insert into event_stats values (?,?,?,?,?,?,?,?,?,?)',
            (
                e,
                len(lineup),
                sum(len(booked.bookings[a]) >= POPULAR for a in lineup),
                sum(booked.home_of.get(a) not in {None, cc} for a in lineup),
                int(kiz),
                int(kiz and not g & {Genre.SALSA, Genre.BACHATA}),
                int(Feature.TAXI_DANCERS in f),
                int(Feature.ALL_IN_ONE in f),
                ','.join(sorted(g)),
                ','.join(sorted(f)),
            ),
        )
    _ = x.execute("""create view country_stats as
    select e.country_code, c.name, count(*) as events, sum(s.kiz_only) as kiz_only, sum(s.taxi_dancers) as taxi_dancers,
      round(avg(s.lineup), 1) as avg_lineup, sum(s.popular_artists) as popular_bookings,
      round(100.0 * sum(s.imported) / nullif(sum(s.lineup), 0)) as imported_pct,
      (select airport from events e2 where e2.country_code = e.country_code and e2.airport is not null
         group by airport order by count(*) desc limit 1) as main_airport
    from events e join event_stats s on s.event_id = e.id left join countries c on c.code = e.country_code
    where e.cancelled is not 1 group by e.country_code""")
    # What the site reads for festivals: each event with its statistics, and whether it is still to come (evaluated
    # when queried, so "upcoming" means the same thing on every page).
    _ = x.execute("""create view event_rows as
    select e.id, e.title, e.url, e.start_date, e.end_date, e.city, e.country_code, e.lat, e.lon, e.airport,
    e.airport_km,
      a.city as airport_city, e.weekend_friday, e.cancelled, e.venue, s.lineup, s.popular_artists, s.kiz_only,
      s.taxi_dancers, s.all_in_one, s.genres, s.features,
      e.end_date >= date('now') and e.cancelled is not 1 as upcoming,
      p.price as price_state, p.page as ticket_page, p.card_pass
    from events e join event_stats s on s.event_id = e.id left join airports a on a.code = e.airport
      left join price_status p on p.event_id = e.id""")


def plans(x: sqlite3.Connection, artists: Artists) -> None:
    """Who's going (pipeline/people.csv, pipeline/plans.csv). People are ours, not the source's: a name, the artist
    records they are (if any), and whether the site names them on festival cards (featured) or only counts them. A
    plan says a person is going to a festival; booked_as says when they are in its line-up too, as themselves or in a
    couple, so the site can say "teaching" instead."""
    _ = x.execute("""create table people (id integer primary key, key text not null unique, name text not null,
     featured integer not null check (featured in (0, 1)))""")
    _ = x.execute(
        'create table person_artists (person_id integer not null references people(id), artist_id integer not null '
        'references artists(id), primary key (person_id, artist_id))'
    )
    _ = x.execute(f"""create table plans (person_id integer not null references people(id),
         event_id integer not null references events(id),
     status text not null check (status in ({states.sql_in('plan')})), primary key (person_id, event_id))""")
    person_id: dict[str, int] = {}
    for i, r in enumerate(Person.read(ROOT / 'pipeline' / 'people.csv'), 1):
        person_id[r.key] = i
        _ = x.execute('insert into people values (?,?,?,?)', (i, r.key, r.name, r.featured))
        for k in r.artist_keys:
            if k not in artists.key_id:
                sys.exit(f'people.csv: unknown artist key {k} ({r.name})')
            _ = x.execute('insert into person_artists values (?,?)', (i, artists.root(artists.key_id[k])))
    for r in PlanRow.read(ROOT / 'pipeline' / 'plans.csv'):
        if r.person not in person_id:
            sys.exit(f'plans.csv: no person {r.person} in people.csv')
        if not exists(x, 'select 1 from events where id = ?', (r.event_id,)):
            sys.exit(f'plans.csv: no event {r.event_id} ({r.event})')
        _ = x.execute('insert into plans values (?,?,?)', (person_id[r.person], r.event_id, r.status))
    _ = x.execute(f"""create view plan_rows as
    select p.person_id, pe.key, pe.name, pe.featured, p.event_id, p.status,
      (select ea.role from person_artists pa join event_artists ea on ea.event_id = p.event_id and ea.as_couple is null
         and (ea.artist_id = pa.artist_id
              or ea.artist_id in (select couple_id from couple_members where member_id = pa.artist_id))
       where pa.person_id = p.person_id and ea.role in ({states.sql_in('role', (*BOOKED_ROLES, Role.MC))})
       order by ea.role = '{Role.TEACHER}' desc limit 1) as booked_as
    from plans p join people pe on pe.id = p.person_id""")  # noqa: S608 (a view: the state table's keys, no parameters)


def events_range(x: sqlite3.Connection) -> tuple[str, str]:
    found: list[tuple[str, str]] = x.execute('select min(start_date), max(start_date) from events').fetchall()
    return found[0]


def meta(x: sqlite3.Connection, built_at: str) -> None:
    """What each coded column's values mean (pipeline/states.py), and the build's settings and provenance."""
    _ = x.execute("""create table states (point text not null, key text not null, criterion text not null,
         disposition text not null,
     wording text, owner text, icon text, link text, primary key (point, key))""")
    _ = x.executemany(
        'insert into states values (?,?,?,?,?,?,?,?)',
        [(s.point, s.key, s.criterion, s.disposition, s.wording, s.owner, s.icon, s.link) for s in states.ROWS],
    )
    _ = x.execute('create table meta (key text primary key, value text)')
    _ = x.executemany(
        'insert into meta values (?,?)',
        [
            ('home_airport', HOME),
            ('popular_threshold', str(POPULAR)),
            ('max_airport_km', str(MAX_AIRPORT_KM)),
            ('built_at', built_at),
            ('events_source', 'https://kizomba-world.com/'),
            (
                'events_licence',
                (
                    'CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/: the festival data is '
                    'kizomba-world.com’s, adapted here and shared under the same licence'
                ),
            ),
            ('events_range', ' – '.join(events_range(x))),
        ],
    )


DOCS = {
    'events': 'One row per kizomba-world event: title (tidied: dates, years and shouting capitals removed; '
    'listed_title is as listed), dates (days), venue and city, link (url), cancelled (1 or 0; null when not known, '
    'since the source flags it only for events still listed as upcoming). Added: country_code, lat/lon (OpenStreetMap '
    'geocode of the city), airport (nearest in airports, within max_airport_km), airport_km, weekend_friday (the '
    'Friday of a Fri→Mon trip to it).',
    'airports': 'Airports a festival can fly to, with the city they serve; a festival flies to the nearest within '
    'max_airport_km. home = 1 is where flights leave from.',
    'fares': f'Round-trip economy fares from {HOME}, one adult, Friday out and Monday back, from Google Flights via '
    'fli. Reloaded from data/fares.csv when the page opens.',
    'event_fares': 'Each event joined to the fare for its weekend (null when Google had no price), plus the cheapest '
    'fare that month to the same airport.',
    'artist_stats': f'Per artist with bookings of their own: bookings (teacher, DJ or performer at distinct events; a '
    'couple’s bookings count for the couple, not its members), home_country when it is known (home_basis: given in '
    'pipeline/artist_countries.csv, or stated next to their name in a line-up they are booked in; null otherwise), '
    'booked_most_in (the country with most of their bookings), countries booked in, bookings abroad (outside the home '
    f'country, or outside booked_most_in when that is unknown), popular = at least {POPULAR} bookings, couple_bookings '
    '= further events where they appear only as part of a couple. People booked only as part of a couple have no row.',
    'event_artists': 'Each artist named in a line-up, resolved to an artist, with role, style and stated country. '
    'as_couple is set when a member is listed in the same role as their couple at the same event: that row repeats the '
    'couple’s booking and is left out of line-ups and statistics.',
    'artist_redirects': 'Artists merged into another, by pipeline/artist_merges.csv or by the source pipeline: old_id '
    'now reads as new_id.',
    'artist_events': 'Every appearance of an artist: direct (their own booking) or member (via a booked couple, '
    'via_artist_id).',
    'artist_countries': 'Bookings per artist and country; is_home marks the known home country in artist_stats.',
    'artist_origin': 'Countries stated next to an artist’s name in line-ups (flags or text), with how often.',
    'event_stats': 'Per event: line-up size (teachers and DJs), popular artists booked, imported artists (home country '
    'differs from the event’s), kizomba-family genres, kiz-only (no salsa or bachata), taxi dancers, all-in-one hotel.',
    'event_passes': 'The passes a festival sells (kind): people per price (group_size, and people as a state), days, '
    'hotel included; source is description, or ticket_page (see ticket_pages).',
    'price_status': 'What each festival’s card can say of its price: priced, with the pass it prices (card_pass), or '
    'why not (price), with its ticket page when one is known.',
    'states': 'Every state a coded column can hold, by point (pipeline/states.py): what makes a value that state, what '
    'the site does with it (disposition), its words on the site, who acts on it, and how the site draws it (icon, or a '
    'link to the ticket page or the passes).',
    'ticket_pages': 'Festivals whose prices are read on their ticket page: the page, the reseller selling there when '
    'it is not the organiser, the day it was last read, and how many tickets on it are not read yet.',
    'pass_tiers': 'Each pass’s prices tier by tier: what a buyer pays and its currency (and the same price in a second '
    'currency when the page shows one: alt_amount, alt_currency), the booking fee that includes when stated, the days '
    'the tier applies, tickets at that price (quantity), door price, sold out, and current (the description calls it '
    'the current price, without dates).',
    'rates': 'Exchange rates the site converts prices with: units of each currency per euro (European Central Bank, '
    'pipeline/rates.csv).',
    'event_promos': 'Promo codes for a festival, from pipeline/promo_codes.csv (ours, not kizomba-world’s): the code, '
    'and what it gives when known.',
    'people': 'People who share their festival plans (pipeline/people.csv, ours): featured ones are named on festival '
    'cards, the others counted.',
    'person_artists': 'The artist records a person is, so their bookings and their plans meet.',
    'plans': 'Who said they are going to which festival (pipeline/plans.csv).',
    'plan_rows': 'Each plan with the person, and booked_as: their role when they are in that festival’s line-up, alone '
    'or in a couple.',
    'event_rows': 'What the site reads: each event with its event_stats, what its card can say of its price '
    '(price_state, with its ticket_page and card_pass), and upcoming (not over yet and not cancelled, as of the moment '
    'of the query).',
    'country_stats': 'Per country: events, kiz-only events, taxi dancers, average line-up, bookings of popular '
    'artists, share of imported artists, most common airport.',
    'countries': 'ISO 3166 codes and names.',
    'meta': 'Build settings and provenance.',
}


def site_json(x: sqlite3.Connection, built_at: str) -> dict[str, object]:
    """What the page shows before the database has loaded: the home airport and the destinations for the sentence."""
    homes: list[tuple[str]] = x.execute('select city from airports where code = ?', (HOME,)).fetchall()
    destinations: list[tuple[str, str]] = x.execute("""select distinct e.country_code, c.name from events e
        join countries c on c.code = e.country_code where e.cancelled is not 1""").fetchall()
    return {
        'home': {'code': HOME, 'city': homes[0][0]},
        'destinations': [
            {'code': c, 'name': n}
            for c, n in sorted(
                destinations, key=lambda d: unicodedata.normalize('NFKD', d[1]).encode('ascii', 'ignore').lower()
            )
        ],
        'events_range': list(events_range(x)),
        'built_at': built_at,
    }


def table_docs(x: sqlite3.Connection) -> None:
    _ = x.execute('create table table_docs (name text primary key, description text)')
    _ = x.executemany('insert or replace into table_docs values (?,?)', DOCS.items())
    kept: list[tuple[str, str]] = x.execute('select name, description from src.table_docs').fetchall()
    for name, desc in kept:
        if exists(x, 'select 1 from sqlite_master where name=?', (name,)) and name not in DOCS:
            _ = x.execute('insert or ignore into table_docs values (?,?)', (name, desc))


def build(src: Path, out: Path) -> dict[str, object]:
    """Build the site database from the export into out, and give the summary site.json holds. It is built beside out
    and swapped in at the end, so a build that stops halfway leaves out as it was."""
    building = out.with_name(out.name + '.building')
    building.unlink(missing_ok=True)
    with sqlite_db.opened(building, 'rwc') as x:
        _ = x.execute(f"attach database 'file:{src.resolve()}?mode=ro' as src")
        copy_tables(x)
        artists = merge_artists(x)
        places(x)
        fares(x)
        event_stats(x, artist_stats(x, artists))
        plans(x, artists)
        built_at = now().isoformat()
        meta(x, built_at)
        site = site_json(x, built_at)
        table_docs(x)
        stored_by_key(x)
        broken: list[tuple[object, ...]] = x.execute('pragma foreign_key_check').fetchall()
        if broken:
            sys.exit(f'{len(broken)} rows refer to rows the site database has not, first: {broken[0]}')
        x.commit()
        _ = x.execute('detach database src')
        _ = x.execute('vacuum')
    _ = building.replace(out)
    return site


@contextmanager
def built(src: Path) -> Generator[sqlite3.Connection]:
    """The site database built now from the export, in a folder of its own, to read: what a step that reads it reads,
    so it is never one built from other files. It is gone once the block ends."""
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / 'kiz.sqlite'
        _ = build(src, out)
        with sqlite_db.opened(out, 'ro') as db:
            yield db


def main() -> None:
    ap = argparse.ArgumentParser(description='Build docs/data/kiz.sqlite and site.json, which the site loads.')
    sqlite_db.source_arg(ap)
    site = build(ap.parse_args(namespace=sqlite_db.Source()).src, OUT)
    _ = SITE_JSON.write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding='utf-8')
    print(OUT, OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
