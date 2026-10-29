"""Build docs/data/kiz.sqlite, the database the site loads, from the kizomba-world source DB. It is built, never
committed: Publish builds it with the site (mise run build:data), and a step that reads it reads one built() for it.

Keeps facts (titles, dates, places, genres, features, line-ups) and links back to kizomba-world;
drops descriptions, images and extraction quotes. Adds places, airports, per-event and per-artist
statistics, a fares table filled from docs/data/fares.csv, and the states every coded column can hold (states, from
pipeline/states.py).

    mise run build:data
"""

import argparse
import collections
import datetime as dt
import json
import math
import sys
import tempfile
import unicodedata
from collections.abc import Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from pipeline import airports, data, enums, export, states
from pipeline import db as sqlite_db
from pipeline.countries import NAMES, codes
from pipeline.db import Reader, Transaction
from pipeline.enums import Feature, Genre, HomeBasis, PassKind, People, Role, Style
from pipeline.records import (
    Fare,
    Person,
    Place,
    PlanRow,
    Promo,
    Rate,
    day_of,
    now,
)

SITE_DATA = 'docs/data'  # the site's data files, published with it
OUT = f'{SITE_DATA}/kiz.sqlite'
SITE_JSON = f'{SITE_DATA}/site.json'  # what the page shows before the database loads
POPULAR = 10  # bookings that make an artist "popular"
MAX_AIRPORT_KM = 250
EARTH_KM = 6371  # the Earth's radius
KIZ = tuple(g for g, s in states.STYLE_OF.items() if s == Style.KIZOMBA)
BOOKED_ROLES = tuple(map(Role, states.counted(states.BOOKING)))  # the roles an artist's bookings count
LINEUP_ROLES = tuple(map(Role, states.counted(states.LINEUP)))  # the roles a line-up counts
FRIDAY, LATEST_START = 4, 3  # a Friday's weekday; a trip leaves on the Friday after a start this many days before
COPIED = (  # the export's tables the site keeps, each in the order it refers to the others
    'event_categories',
    'event_tags',
    'artist_mentions',
    'artists',
    'artist_aliases',
    'couple_members',
    'genre_definitions',
    'feature_definitions',
    'role_definitions',
    'pipeline_steps',
    'event_genres',
    'event_features',
    'event_rooms',
    'event_room_list',
    'event_passes',
    'ticket_pages',
    'price_status',
    'pass_tiers',
)
# the site's tables, each filled once from the export and the committed data (copied: a column the export has, as it
# has it); a table whose key is not its row id is stored as its key (without rowid), so the key is the table rather
# than an index beside it
DDL = """
create table events (
    id integer primary key,
    title text not null,          -- as a card shows it (the export's event_display)
    listed_title text not null,   -- as kizomba-world lists it
    url text not null unique,
    slug text,
    start_date text not null check (length(start_date) = 10 and date(start_date) = start_date),
    end_date text not null check (length(end_date) = 10 and date(end_date) = end_date),
    timezone text,
    all_day integer not null check (all_day in (0, 1)),
    featured integer not null check (featured in (0, 1)),
    cancelled integer check (cancelled in (0, 1)),
    listing text not null check (listing in ({listing})),  -- gone: kept for its plans and links, listed no more
    venue text check (venue != ''),
    city text check (city != ''),
    country text check (country != ''),
    website text,
    published_at text,
    modified_at text,
    country_code text references countries(code) deferrable initially deferred,
    lat real check (lat is null or city is not null),  -- a place on the map is a city's
    lon real check ((lon is null) = (lat is null)),
    airport text references airports(code) deferrable initially deferred,
    airport_km integer check ((airport_km is null) = (airport is null)),
    weekend_friday text not null check (length(weekend_friday) = 10 and date(weekend_friday) = weekend_friday),
    check (end_date >= start_date)
) strict;
create table event_categories (
    event_id integer not null references events(id) deferrable initially deferred,
    category text not null,
    primary key (event_id, category)
) strict, without rowid;
create table event_tags (
    event_id integer not null references events(id) deferrable initially deferred,
    tag text not null,
    primary key (event_id, tag)
) strict, without rowid;
create table artist_mentions (
    id integer primary key,
    event_id integer not null references events(id) deferrable initially deferred,
    role text not null check (role in ({role})),
    name_as_written text not null,
    style text,
    country text
) strict;
create table artists (
    id integer primary key,
    display_name text not null,
    kind text not null check (kind in ({artist_kind})),
    match_key text not null unique
) strict;
create table artist_aliases (
    artist_id integer not null references artists(id) deferrable initially deferred,
    alias text not null,
    mentions integer not null,
    primary key (artist_id, alias)
) strict, without rowid;
create table couple_members (
    couple_id integer not null references artists(id) deferrable initially deferred,
    member_id integer not null references artists(id) deferrable initially deferred,
    primary key (couple_id, member_id)
) strict, without rowid;
create index couple_members_member on couple_members(member_id);
create table artist_redirects (
    old_id integer primary key,
    new_id integer not null references artists(id) deferrable initially deferred
) strict;
create table event_artists (
    event_id integer not null references events(id) deferrable initially deferred,
    artist_id integer not null references artists(id) deferrable initially deferred,
    role text not null check (role in ({role})),
    as_couple integer references artists(id) deferrable initially deferred,
    primary key (event_id, artist_id, role)
) strict, without rowid;
create index event_artists_artist on event_artists(artist_id);
create table genre_definitions (
    genre text primary key check (genre in ({genre})),
    definition text not null
) strict, without rowid;
create table feature_definitions (
    feature text primary key check (feature in ({feature})),
    definition text not null
) strict, without rowid;
create table role_definitions (
    role text primary key check (role in ({role})),
    definition text not null
) strict, without rowid;
create table pipeline_steps (
    step text primary key,
    description text not null,
    performed_at text not null,
    performed_by text not null,
    model text,
    prompt text,
    inputs text,
    outputs text,
    details text
) strict, without rowid;
create table event_genres (
    event_id integer not null references events(id) deferrable initially deferred,
    genre text not null check (genre in ({genre})),
    source text not null check (source in ({source})),
    other_name text not null,
    genre_as_written text,
    primary key (event_id, genre, source, other_name)
) strict, without rowid;
create table event_features (
    event_id integer not null references events(id) deferrable initially deferred,
    feature text not null check (feature in ({feature})),
    source text not null check (source in ({source})),
    primary key (event_id, feature, source)
) strict, without rowid;
create table event_rooms (
    event_id integer primary key references events(id) deferrable initially deferred,
    party_rooms integer,
    class_rooms integer
) strict;
create table event_room_list (
    event_id integer not null references events(id) deferrable initially deferred,
    room_no integer not null,
    name_as_written text,
    kind text not null check (kind in ({room_kind})),
    genres text not null,
    primary key (event_id, room_no)
) strict, without rowid;
create table airports (
    code text primary key,
    name text not null,
    city text not null,
    country_code text not null,
    lat real not null,
    lon real not null,
    home integer not null check (home in (0, 1))
) strict, without rowid;
create table countries (
    code text primary key,
    name text not null
) strict, without rowid;
create table fares (
    airport text not null,
    depart text not null,
    return text not null,
    price real not null,
    currency text not null,
    fetched_at text not null,
    primary key (airport, depart, return)
) strict, without rowid;
create table artist_origin (
    artist_id integer not null references artists(id) deferrable initially deferred,
    country_code text not null,
    festivals integer not null,   -- the festivals whose line-ups state it next to their name
    primary key (artist_id, country_code)
) strict, without rowid;
create table artist_stats (
    artist_id integer primary key references artists(id) deferrable initially deferred,
    bookings integer not null,
    {booked_roles},  -- the events booked in each role
    first_date text not null,
    last_date text not null,
    home_country text,
    home_basis text check (home_basis in ({home_basis})),
    booked_most_in text,
    countries integer not null,
    abroad_bookings integer,      -- outside their home country; null when it is not known
    popular integer not null check (popular in (0, 1)),
    couple_bookings integer not null,
    check ((home_country is null) = (home_basis is null or home_basis = '{contested}'))
) strict;
create table artist_countries (
    artist_id integer not null references artists(id) deferrable initially deferred,
    country_code text not null,
    bookings integer not null,
    is_home integer not null check (is_home in (0, 1)),
    primary key (artist_id, country_code)
) strict, without rowid;
create table event_promos (
    event_id integer primary key references events(id) deferrable initially deferred,
    code text not null check (code != ''),
    offer text check (offer != '')
) strict;
create table event_passes (
    event_id integer not null references events(id) deferrable initially deferred,
    pass_no integer not null,
    kind text not null check (kind in ({pass_kind})),
    style text check (style in ({style})),
    label text,
    group_size integer,
    people text not null check (people in ({people})),
    days integer,
    includes_hotel integer not null check (includes_hotel in (0, 1)),
    source text not null check (source in ({pass_source})),
    primary key (event_id, pass_no)
) strict, without rowid;
create table ticket_pages (
    event_id integer primary key references events(id) deferrable initially deferred,
    page text not null,
    reseller text,
    read_on text not null,
    unread integer not null check (unread >= 0)
) strict;
create table price_status (
    event_id integer primary key references events(id) deferrable initially deferred,
    price text not null check (price in ({price})),
    page text,
    card_pass integer,
    check ((price = '{priced}') = (card_pass is not null)),
    foreign key (event_id, card_pass) references event_passes(event_id, pass_no) deferrable initially deferred
) strict;
create table pass_tiers (
    event_id integer not null,
    pass_no integer not null,
    tier_no integer not null,
    amount real not null,
    currency text not null,
    fee real,
    alt_amount real,
    alt_currency text check ((alt_amount is null) = (alt_currency is null)),
    valid_from text,
    valid_until text,
    quantity integer,
    door integer not null check (door in (0, 1)),
    sold_out integer not null check (sold_out in (0, 1)),
    current integer not null check (current in (0, 1)),
    check (valid_from <= valid_until),
    primary key (event_id, pass_no, tier_no),
    foreign key (event_id, pass_no) references event_passes(event_id, pass_no) deferrable initially deferred
) strict, without rowid;
create table rates (
    currency text primary key,
    per_eur real not null check (per_eur > 0),
    date text not null
) strict, without rowid;
create table event_stats (
    event_id integer primary key references events(id) deferrable initially deferred,
    lineup integer not null,
    popular_artists integer not null,
    imported integer not null,    -- line-up artists whose home country is another
    unknown_country integer not null,  -- line-up artists whose home country is not known
    kiz integer not null check (kiz in (0, 1)),
    kiz_only integer not null check (kiz_only in (0, 1)),
    taxi_dancers integer not null check (taxi_dancers in (0, 1)),
    all_in_one integer not null check (all_in_one in (0, 1)),
    genres text not null,
    features text not null
) strict;
create table people (
    id integer primary key,
    key text not null unique,
    name text not null,
    featured integer not null check (featured in (0, 1))
) strict;
create table person_artists (
    person_id integer not null references people(id) deferrable initially deferred,
    artist_id integer not null references artists(id) deferrable initially deferred,
    primary key (person_id, artist_id)
) strict, without rowid;
create table plans (
    person_id integer not null references people(id) deferrable initially deferred,
    event_id integer not null references events(id) deferrable initially deferred,
    status text not null check (status in ({plan})),
    primary key (person_id, event_id)
) strict, without rowid;
create index plans_event on plans(event_id);
create table states (
    point text not null,
    key text not null,
    criterion text not null,
    disposition text not null,
    wording text,
    owner text,
    icon text,
    link text,
    primary key (point, key)
) strict, without rowid;
create table meta (
    key text primary key,
    value text not null
) strict, without rowid;
create table table_docs (
    name text primary key,
    description text not null
) strict, without rowid;
create view event_fares as
    select e.id as event_id, e.airport, e.weekend_friday as depart, f.return, f.price, f.fetched_at,
      (select min(price) from fares m where m.airport = e.airport
         and substr(m.depart, 1, 7) = substr(e.weekend_friday, 1, 7)) as month_min
    from events e left join fares f on f.airport = e.airport and f.depart = e.weekend_friday;
create view artist_events as
    select ea.artist_id, ea.event_id, ea.role, '{direct}' as via, null as via_artist_id from event_artists ea
    where ea.as_couple is null
    union all
    select cm.member_id, ea.event_id, ea.role, '{member}', ea.artist_id
    from event_artists ea join couple_members cm on cm.couple_id = ea.artist_id;
create view country_stats as
    select e.country_code, c.name, count(*) as events, sum(s.kiz_only) as kiz_only, sum(s.taxi_dancers) as taxi_dancers,
      round(avg(s.lineup), 1) as avg_lineup, sum(s.popular_artists) as popular_bookings,
      round(100.0 * sum(s.imported) / nullif(sum(s.lineup) - sum(s.unknown_country), 0)) as imported_pct,
      sum(s.unknown_country) as unknown_country,
      (select airport from events e2 where e2.country_code = e.country_code and e2.airport is not null
         group by airport order by count(*) desc limit 1) as main_airport
    from events e join event_stats s on s.event_id = e.id left join countries c on c.code = e.country_code
    where e.cancelled is not 1 and e.listing = '{listed}' group by e.country_code;
-- what the site reads for festivals: each event with its statistics, and whether it is still to come (evaluated when
-- queried, so "upcoming" means the same thing on every page)
create view event_rows as
    select e.id, e.title, e.url, e.start_date, e.end_date, e.city, e.country_code, e.lat, e.lon, e.airport,
      e.airport_km, a.city as airport_city, e.weekend_friday, e.cancelled, e.listing, e.venue, s.lineup,
      s.popular_artists,
      s.kiz_only, s.taxi_dancers, s.all_in_one, s.genres, s.features,
      e.end_date >= date('now') and e.cancelled is not 1 and e.listing = '{listed}' as upcoming,
      p.price as price_state, p.page as ticket_page, p.card_pass
    from events e join event_stats s on s.event_id = e.id left join airports a on a.code = e.airport
      left join price_status p on p.event_id = e.id;
create view plan_rows as
    select p.person_id, pe.key, pe.name, pe.featured, p.event_id, p.status,
      (select ea.role from person_artists pa join event_artists ea on ea.event_id = p.event_id and ea.as_couple is null
         and (ea.artist_id = pa.artist_id
              or ea.artist_id in (select couple_id from couple_members where member_id = pa.artist_id))
       where pa.person_id = p.person_id and ea.role in ({booked_as})
       order by ea.role = '{teacher}' desc limit 1) as booked_as
    from plans p join people pe on pe.id = p.person_id;
"""
TABLES = sqlite_db.declared(
    DDL.format_map(
        states.SQL_IN
        | {
            'booked_as': states.sql_in('role', BOOKED_ROLES),
            'booked_roles': ',\n    '.join(f'{r} integer not null' for r in BOOKED_ROLES),
            'priced': enums.Price.PRICED,
            'teacher': Role.TEACHER,
            'listed': enums.Listing.LISTED,
            'contested': HomeBasis.CONTESTED,
            'direct': enums.Via.DIRECT,
            'member': enums.Via.MEMBER,
        }
    )
)


# the rows the build reads, each by its columns


class Listed(BaseModel):
    """An event as the export lists it, with what the site keeps of it."""

    id: int
    title: str
    listed_title: str
    url: str
    slug: str | None
    start_date: str
    end_date: str
    timezone: str | None
    all_day: int
    featured: int
    cancelled: int | None
    listing: enums.Listing
    venue: str | None
    city: str | None
    country: str | None
    website: str | None
    published_at: str | None
    modified_at: str | None


class Keyed(BaseModel):
    match_key: str
    artist_id: int


class Member(BaseModel):
    couple_id: int
    member_id: int
    display_name: str


class Given(BaseModel):
    artist_id: int
    country: str


class Redirect(BaseModel):
    old_id: int
    new_id: int


class Shown(BaseModel):
    id: int
    display_name: str


class Placed(BaseModel):
    id: int
    city: str | None
    country: str | None
    start_date: str


class Coded(BaseModel):
    id: int
    country_code: str | None


class Started(BaseModel):
    id: int
    start_date: str


class BookedRow(BaseModel):
    artist_id: int
    event_id: int
    role: Role


class Stated(BaseModel):
    artist_id: int
    event_id: int
    country: str


class Featured(BaseModel):
    event_id: int
    feature: Feature


class Genred(BaseModel):
    event_id: int
    genre: Genre


class Span(BaseModel):
    first: str
    last: str


class Country(BaseModel):
    code: str
    name: str


class Doc(BaseModel):
    name: str
    description: str


def km(a: float, b: float, c: float, d: float) -> float:
    a, b, c, d = map(math.radians, (a, b, c, d))
    return (
        EARTH_KM
        * 2
        * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2 + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))
    )


def weekend_friday(start: dt.date) -> dt.date:
    """The Friday a Fri→Mon trip would leave on: the event's own Friday, or the next one for a Wed/Thu start."""
    off = (FRIDAY - start.weekday()) % 7
    return start + dt.timedelta(days=off if off <= LATEST_START else off - 7)


def copied(x: Transaction, table: str) -> None:
    """A site table's rows from the export's table of its name, column for column."""
    t = sqlite_db.name(table)
    columns = ', '.join(map(sqlite_db.name, x.column(str, "select name from pragma_table_info(?, 'main')", (table,))))
    x.execute(f'insert into {t} ({columns}) select {columns} from src.{t}')  # noqa: S608 (the declared names, quoted)


def booked(x: Transaction) -> dict[str, int]:
    """Each artist booked at an event in a role once (event_artists), marked as_couple when a member is listed in the
    same role as their couple at the same event: that repeats the couple's booking, so it is left out of line-ups and
    statistics, while a different role (the couple teaches, one of them DJs) is a solo booking. Old ids read as the
    artist they went to (artist_redirects). Each key's artist (artist_keys), for the files that name artists by key."""
    x.execute("""insert into event_artists (event_id, artist_id, role, as_couple)
       select b.event_id, b.artist_id, b.role,
         (select min(c.artist_id) from src.event_artists c join couple_members cm on cm.couple_id = c.artist_id
          where c.event_id = b.event_id and c.role = b.role and cm.member_id = b.artist_id)
       from src.event_artists b""")
    # an id no artist has now reads as the artist its keys went to, through the ids that went on in their turn
    went = {
        r.old_id: r.new_id
        for r in x.rows(
            Redirect,
            'select artist_id as old_id, retired_into as new_id from src.artist_ids where retired_into is not null',
        )
    }
    x.insert('artist_redirects', ({'old_id': o, 'new_id': settled(went, o)} for o in went))
    return {k.match_key: k.artist_id for k in x.rows(Keyed, 'select match_key, artist_id from src.artist_keys')}


def settled(went: Mapping[int, int], old: int) -> int:
    """Where an old id ends up, following the ids it went to."""
    seen = {old}
    while (old := went[old]) in went and old not in seen:
        seen.add(old)
    return old


def places(x: Transaction) -> None:
    """The events, each with its title and venue as shown, its days, its country, its place and nearest airport, and the
    weekend a trip to it leaves on; the airports and countries they name."""
    x.insert('airports', (a.model_dump() | {'home': int(a.home)} for a in airports.known()))
    x.insert('countries', ({'code': c, 'name': n} for c, n in sorted(NAMES.items())))
    geo = {(p.city, p.country): p for p in Place.read()}
    places_to_fly = airports.known()
    listed = x.rows(
        Listed,
        """select e.id, d.title, e.title as listed_title, e.url, e.slug, e.start_date, e.end_date, e.timezone,
             e.all_day, e.featured, e.cancelled, e.listing, d.venue, nullif(e.city, '') as city,
             nullif(e.country, '') as country, e.website, e.published_at, e.modified_at
           from src.events e join src.event_display d on d.event_id = e.id""",
    )
    rows: list[Mapping[str, object]] = []
    for e in listed:
        g = None if e.city is None else geo.get((e.city, e.country))
        lat, lon = (g.found.lat, g.found.lon) if g and g.found else (None, None)
        ap = dist = None
        if lat is not None and lon is not None:
            dist, ap = min((km(lat, lon, a.lat, a.lon), a.code) for a in places_to_fly)
            if dist > MAX_AIRPORT_KM:
                ap = dist = None
        start = day_of(e.start_date)
        rows.append(
            e.model_dump()
            | {
                'start_date': start,
                'end_date': day_of(e.end_date),
                'country_code': (codes(e.country) or [None])[0],
                'lat': lat,
                'lon': lon,
                'airport': ap,
                'airport_km': None if dist is None else round(dist),
                'weekend_friday': weekend_friday(start),
            }
        )
    x.insert('events', rows)


def fares(x: Transaction) -> None:
    """A snapshot of docs/data/fares.csv (the site reloads the live file), which event_fares joins to the events."""
    x.insert('fares', (r.model_dump(mode='json', by_alias=True) | {'price': float(r.price)} for r in Fare.read()))


@dataclass(frozen=True)
class Booked:
    """Each artist's own bookings (events), and the home country, or the country booked most in, it counts from."""

    bookings: collections.defaultdict[int, set[int]]
    home_of: dict[int, str | None]
    ev_cc: dict[int, str | None]


def home(given: str | None, stated: collections.Counter[str]) -> tuple[str | None, HomeBasis | None]:
    """An artist's home country, only as a source states it: given (a home claim, pipeline/claims.py), else the one
    country line-ups state most often next to their name (each festival's once); when several are stated equally often,
    the home is contested and none is shown. Where they are booked says nothing of it."""
    if given:
        return given, HomeBasis.GIVEN
    top = stated.most_common(2)
    if not top:
        return None, None
    if len(top) > 1 and top[0][1] == top[1][1]:
        return None, HomeBasis.CONTESTED
    return top[0][0], HomeBasis.STATED


def given_homes(x: Transaction) -> dict[int, str]:
    """Home countries a claim gives (the export's artist_homes, pipeline/claims.py)."""
    return {h.artist_id: h.country for h in x.rows(Given, 'select artist_id, country from src.artist_homes')}


def artist_stats(x: Transaction) -> Booked:
    """Each artist's bookings, roles, countries and home. A couple's booking counts for the couple, not for each
    member: a member's own bookings are their solo work (event_artists.as_couple)."""
    roles = (json.dumps(BOOKED_ROLES),)
    ev_cc = {e.id: e.country_code for e in x.rows(Coded, 'select id, country_code from events')}
    bookings: collections.defaultdict[int, set[int]] = collections.defaultdict(set)
    role_count: collections.defaultdict[int, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for b in x.rows(
        BookedRow,
        'select artist_id, event_id, role from event_artists where as_couple is null and role in '
        '(select value from json_each(?))',
        roles,
    ):
        role_count[b.artist_id][b.role] += 1  # the events booked in each role (a booking is once per event and role)
        bookings[b.artist_id].add(b.event_id)
    couple_bookings: collections.defaultdict[int, set[int]] = collections.defaultdict(set)  # events booked in a couple
    for m in x.rows(
        BookedRow,
        'select artist_id, event_id, role from artist_events where via = ?'
        ' and role in (select value from json_each(?))',
        (enums.Via.MEMBER, *roles),
    ):
        couple_bookings[m.artist_id].add(m.event_id)
    # the countries each festival's line-up states next to an artist's name, once each
    said: collections.defaultdict[int, set[tuple[int, str]]] = collections.defaultdict(set)
    for m in x.rows(
        Stated,
        'select ma.artist_id, m.event_id, m.country from src.mention_artists ma'
        " join src.artist_mentions m on m.id = ma.mention_id where m.country is not null and m.country != ''",
    ):
        said[m.artist_id] |= {(m.event_id, c) for c in codes(m.country)}
    stated = collections.defaultdict(
        collections.Counter, {a: collections.Counter(c for _, c in s) for a, s in said.items()}
    )
    x.insert(
        'artist_origin',
        ({'artist_id': a, 'country_code': c, 'festivals': n} for a, cnt in stated.items() for c, n in cnt.items()),
    )
    dates = {e.id: e.start_date for e in x.rows(Started, 'select id, start_date from events')}
    given = given_homes(x)
    # where a home country isn't known, none stands in for it: the artist is of unknown country in the statistics
    # (imported artists, bookings abroad), and booked_most_in only says where they are booked most
    home_of: dict[int, str | None] = {}
    stats: list[dict[str, object]] = []
    countries: list[dict[str, object]] = []
    for a, evs in bookings.items():
        where = collections.Counter(c for e in evs if (c := ev_cc[e]))
        country, basis = home(given.get(a), stated[a])
        most = where.most_common(1)[0][0] if where else None
        home_of[a] = country
        ds = sorted(dates[e] for e in evs)
        abroad = None if country is None else sum(n for c, n in where.items() if c != country)
        stats.append(
            {
                'artist_id': a,
                'bookings': len(evs),
                **{r: role_count[a][r] for r in BOOKED_ROLES},
                'first_date': ds[0],
                'last_date': ds[-1],
                'home_country': country,
                'home_basis': basis,
                'booked_most_in': most,
                'countries': len(where),
                'abroad_bookings': abroad,
                'popular': int(len(evs) >= POPULAR),
                'couple_bookings': len(couple_bookings[a] - evs),
            }
        )
        countries.extend(
            {'artist_id': a, 'country_code': c, 'bookings': n, 'is_home': int(c == country)} for c, n in where.items()
        )
    x.insert('artist_stats', stats)
    x.insert('artist_countries', countries)
    return Booked(bookings, home_of, ev_cc)


def features(x: Transaction) -> collections.defaultdict[int, set[str]]:
    """Each event's features: its own, a promo code of ours (pipeline/promo_codes.csv), and group deals."""
    feats: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    for f in x.rows(Featured, 'select event_id, feature from event_features'):
        feats[f.event_id].add(f.feature)
    promos = Promo.read()
    for r in promos:
        if not x.exists('select 1 from events where id = ?', (r.event_id,)):
            sys.exit(f'promo_codes.csv: no event {r.event_id} ({r.event})')
        feats[r.event_id].add(Feature.PROMO_CODE)
    x.insert(
        'event_promos',
        ({'event_id': r.event_id, 'code': r.code.strip(), 'offer': r.offer.strip() or None} for r in promos),
    )
    # a festival selling full, party or package passes for two or more people has the group_deals highlight
    for e in x.column(
        int,
        'select distinct event_id from event_passes where people in (select value from json_each(?)) '
        'and kind in (select value from json_each(?))',
        (json.dumps((People.COUPLE, People.GROUP)), json.dumps((PassKind.FULL, PassKind.PARTY, PassKind.PACKAGE))),
    ):
        feats[e].add(Feature.GROUP_DEALS)
    # the rates the site converts prices with
    x.insert('rates', (r.model_dump() for r in Rate.read()))
    return feats


def event_stats(x: Transaction, booked: Booked) -> None:
    genres: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    for g in x.rows(Genred, 'select event_id, genre from event_genres'):
        genres[g.event_id].add(g.genre)
    feats = features(x)
    lineups: collections.defaultdict[int, set[int]] = collections.defaultdict(set)
    for n in x.rows(
        BookedRow,
        'select artist_id, event_id, role from event_artists where role in (select value from json_each(?)) and '
        'as_couple is null',
        (json.dumps(LINEUP_ROLES),),
    ):
        lineups[n.event_id].add(n.artist_id)
    rows: list[dict[str, object]] = []
    for e, cc in booked.ev_cc.items():
        g, f, lineup = genres[e], feats[e], lineups[e]
        kiz = bool(g & set(KIZ))
        rows.append(
            {
                'event_id': e,
                'lineup': len(lineup),
                'popular_artists': sum(len(booked.bookings[a]) >= POPULAR for a in lineup),
                'imported': sum(booked.home_of.get(a) not in {None, cc} for a in lineup),
                'unknown_country': sum(booked.home_of.get(a) is None for a in lineup),
                'kiz': int(kiz),
                'kiz_only': int(kiz and not g & {Genre.SALSA, Genre.BACHATA}),
                'taxi_dancers': int(Feature.TAXI_DANCERS in f),
                'all_in_one': int(Feature.ALL_IN_ONE in f),
                'genres': ','.join(sorted(g)),
                'features': ','.join(sorted(f)),
            }
        )
    x.insert('event_stats', rows)


def plans(x: Transaction, key_id: Mapping[str, int]) -> None:
    """Who's going (pipeline/people.csv, pipeline/plans.csv). People are ours, not the source's: a name, the artist
    records they are (if any), and whether the site names them on festival cards (featured) or only counts them. A
    plan says a person is going to a festival; booked_as says when they are in its line-up too, as themselves or in a
    couple, so the site can say "teaching" instead."""
    people = Person.read()
    person_id = {r.key: i for i, r in enumerate(people, 1)}
    for r in people:
        if unknown := [k for k in r.artist_keys if k not in key_id]:
            sys.exit(f'people.csv: unknown artist key {unknown[0]} ({r.name})')
    x.insert('people', ({'id': person_id[r.key], 'key': r.key, 'name': r.name, 'featured': r.featured} for r in people))
    x.insert(
        'person_artists',
        ({'person_id': person_id[r.key], 'artist_id': key_id[k]} for r in people for k in r.artist_keys),
    )
    plans_ = PlanRow.read()
    for r in plans_:
        if r.person not in person_id:
            sys.exit(f'plans.csv: no person {r.person} in people.csv')
        if not x.exists('select 1 from events where id = ?', (r.event_id,)):
            sys.exit(f'plans.csv: no event {r.event_id} ({r.event})')
    x.insert('plans', ({'person_id': person_id[r.person], 'event_id': r.event_id, 'status': r.status} for r in plans_))


def events_range(x: Reader) -> tuple[str, str]:
    (found,) = x.rows(Span, 'select min(start_date) as first, max(start_date) as last from events')
    return found.first, found.last


def meta(x: Transaction, built_at: str) -> None:
    """What each coded column's values mean (pipeline/states.py), and the build's settings and provenance."""
    x.insert(
        'states',
        (
            {
                'point': s.point,
                'key': s.key,
                'criterion': s.criterion,
                'disposition': s.disposition,
                'wording': s.wording,
                'owner': s.owner,
                'icon': s.icon,
                'link': s.link,
            }
            for s in states.ROWS
        ),
    )
    x.insert(
        'meta',
        (
            {'key': k, 'value': v}
            for k, v in [
                ('home_airport', airports.home()),
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
            ]
        ),
    )


DOCS = {
    'events': 'One row per kizomba-world event: title (tidied: dates, years and shouting capitals removed; '
    'listed_title is as listed), dates (days), venue and city, link (url), cancelled (1 or 0; null when not known, '
    'since the source flags it only for events still listed as upcoming), listing (gone: no longer listed, kept for '
    'the plans and links to it). Added: country_code, lat/lon (OpenStreetMap geocode of the city), airport (nearest '
    'in airports, within max_airport_km), airport_km, weekend_friday (the Friday of a Fri→Mon trip to it).',
    'airports': 'Airports a festival can fly to, with the city they serve; a festival flies to the nearest within '
    'max_airport_km. home = 1 is where flights leave from.',
    'fares': 'Round-trip economy fares from the home airport (airports.home = 1), one adult, Friday out and Monday '
    'back, from Google Flights via '
    'fli. Reloaded from data/fares.csv when the page opens.',
    'event_fares': 'Each event joined to the fare for its weekend (null when Google had no price), plus the cheapest '
    'fare that month to the same airport.',
    'artist_stats': 'Per artist with bookings of their own: bookings (as '
    f'{", ".join(BOOKED_ROLES)} at distinct events; a couple’s bookings count for the couple, not its members), the '
    'events booked in each of these roles (one event can count in two), home_country when a source states it '
    '(home_basis: given by a claim, or the one '
    'country line-ups state most often next to their name; contested when several are stated equally often, with no '
    'home), booked_most_in (the country with most of their bookings, which '
    'says nothing of where they are from), countries booked in, bookings abroad (outside the home country; null when '
    f'that is not known), popular = at least {POPULAR} bookings, couple_bookings '
    '= further events where they appear only as part of a couple. People booked only as part of a couple have no row.',
    'event_artists': 'Each artist booked at an event, in a role: once however often its line-up names them. as_couple '
    'is set when a member is listed in the same role as their couple at the same event: that row repeats the '
    'couple’s booking and is left out of line-ups and statistics.',
    'artist_redirects': 'Artist ids no artist has now (merged into another, by a claim or a reviewed decision): old_id '
    'now reads as new_id.',
    'artist_events': 'Every appearance of an artist: direct (their own booking) or member (via a booked couple, '
    'via_artist_id).',
    'artist_countries': 'Bookings per artist and country; is_home marks the known home country in artist_stats.',
    'artist_origin': 'Countries stated next to an artist’s name in line-ups (flags or text), with how many festivals '
    'state each.',
    'event_stats': 'Per event: line-up size (teachers and DJs), popular artists booked, imported artists (home country '
    'differs from the event’s), artists of unknown country (no home known), kizomba-family genres, kiz-only (no salsa '
    'or bachata), taxi dancers, all-in-one hotel.',
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
    '(price_state, with its ticket_page and card_pass), and upcoming (not over yet, not cancelled and still listed, as '
    'of the moment of the query).',
    'country_stats': 'Per country: events, kiz-only events, taxi dancers, average line-up, bookings of popular '
    'artists, share of imported artists among those whose home is known, artists of unknown country, most common '
    'airport.',
    'countries': 'ISO 3166 codes and names.',
    'meta': 'Build settings and provenance.',
}


def site_json(x: Reader, built_at: str) -> dict[str, object]:
    """What the page shows before the database has loaded: the home airport and the destinations for the sentence."""
    home_city = x.value(str, 'select city from airports where code = ?', (airports.home(),))
    destinations = x.rows(
        Country,
        """select distinct e.country_code as code, c.name from events e
        join countries c on c.code = e.country_code where e.cancelled is not 1 and e.listing = ?""",
        (enums.Listing.LISTED,),
    )
    return {
        'home': {'code': airports.home(), 'city': home_city},
        'destinations': [
            {'code': d.code, 'name': d.name}
            for d in sorted(
                destinations, key=lambda d: unicodedata.normalize('NFKD', d.name).encode('ascii', 'ignore').lower()
            )
        ],
        'events_range': list(events_range(x)),
        'built_at': built_at,
    }


def table_docs(x: Transaction) -> None:
    x.insert('table_docs', ({'name': n, 'description': d} for n, d in DOCS.items()))
    for doc in x.rows(Doc, 'select name, description from src.table_docs'):
        if x.exists('select 1 from sqlite_master where name=?', (doc.name,)) and doc.name not in DOCS:
            x.insert('table_docs', [{'name': doc.name, 'description': doc.description}], unless=('name',))


def build(src: Path, out: Path) -> dict[str, object]:
    """Build the site database from the export into out, and give the summary site.json holds. It is built beside out
    and swapped in at the end, so a build that stops halfway leaves out as it was."""
    building = out.with_name(out.name + '.building')
    building.unlink(missing_ok=True)
    with sqlite_db.opened(building, 'rwc') as db:
        db.attach('src', src, 'ro')
        export.current(db, 'src')
        with db.transaction() as x:
            for ddl in TABLES.values():
                x.script(ddl)
            for table in COPIED:
                copied(x, table)
            places(x)
            key_id = booked(x)
            fares(x)
            event_stats(x, artist_stats(x))
            plans(x, key_id)
            built_at = now().isoformat()
            meta(x, built_at)
            site = site_json(x, built_at)
            table_docs(x)
        db.detach('src')
        db.vacuum()
    _ = building.replace(out)
    return site


@contextmanager
def built(src: Path) -> Generator[sqlite_db.Db]:
    """The site database built now from the export, in a folder of its own, to read: what a step that reads it reads,
    so it is never one built from other files. It is gone once the block ends."""
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / 'kiz.sqlite'
        _ = build(src, out)
        with sqlite_db.opened(out, 'ro') as db:
            yield db


def main() -> None:
    ap = argparse.ArgumentParser(description='Build docs/data/kiz.sqlite and site.json, which the site loads.')
    _ = ap.parse_args()
    out = data(OUT)
    site = build(export.path(), out)
    _ = data(SITE_JSON).write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding='utf-8')
    print(OUT, out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
