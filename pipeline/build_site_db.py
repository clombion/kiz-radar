"""Build public/data/kiz.sqlite, the database the site loads, from the kizomba-world source DB. It is built, never
committed: Publish builds it with the site (mise run build:data), and a step that reads it reads one built() for it.

Keeps facts (titles, dates, places, genres, features, line-ups) and links back to kizomba-world;
drops descriptions, images and extraction quotes. Adds places, airports, per-event and per-artist
statistics, a fares table filled from pipeline/fares.csv, and the states every coded column can hold (states, from
pipeline/states.py).

    mise run build:data
"""

import argparse
import collections
import datetime as dt
import hashlib
import json
import sys
import tempfile
import unicodedata
from collections.abc import Generator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from pipeline import airports, data, enums, export, files, review, states
from pipeline import db as sqlite_db
from pipeline import fares as fare_search
from pipeline.countries import NAMES, codes
from pipeline.db import Reader, Transaction
from pipeline.enums import Feature, Genre, HomeBasis, PassKind, People, Role, Style
from pipeline.extract import resolve_artists
from pipeline.records import (
    Community,
    Fare,
    Membership,
    Person,
    PlanRow,
    Promo,
    Rate,
    Seeded,
    StayRow,
    Travel,
    day_of,
    now,
    today,
)

SITE_DATA = 'public/data'  # the site's data files, published with it
OUT = f'{SITE_DATA}/kiz.sqlite'
SITE_JSON = f'{SITE_DATA}/site.json'  # what the page shows before the database loads
REVIEW_JSON = f'{SITE_DATA}/review.json'  # what the review dashboard lists (pipeline/review.py)
POPULAR = 10  # bookings that make an artist "popular"
KEPT_DAYS = 3  # how many days after a trip ends its travel and stays are still published, then left out to be deleted
KIZ = tuple(g for g, s in states.STYLE_OF.items() if s == Style.KIZOMBA)
BOOKED_ROLES = tuple(map(Role, states.counted(states.BOOKING)))  # the roles an artist's bookings count
LINEUP_ROLES = tuple(map(Role, states.counted(states.LINEUP)))  # the roles a line-up counts
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
# has it); a table whose key is not its row id and whose rows are short (under 200 bytes on average, a twentieth of a
# 4 KB page, as SQLite advises) is stored as its key (without rowid), so the key is the table rather than an index
# beside it: the database is 2.7 MB so, 3.8 MB with every table by row id. A table of longer rows keeps its row id.
DDL = """
create table events (
    id integer primary key,
    title text not null,          -- as a card shows it (the export's event_display)
    listed_title text not null,   -- as kizomba-world lists it
    url text not null unique check (url like 'https://%' or url like 'http://%'),  -- a link the site makes
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
create table artist_names (  -- the names the artist's page says: a rename, or the names each role knows them by
    artist_id integer not null references artists(id) deferrable initially deferred,
    match_key text not null,
    name text not null,
    roles text not null,
    first_date text not null,
    last_date text not null,
    festivals integer not null,
    renamed integer not null check (renamed in (0, 1)),
    as_roles text,
    primary key (artist_id, match_key)
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
) strict;  -- rows of 750 bytes on average: by row id (DDL)
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
    fetched_at text not null,
    primary key (airport, depart)
) strict, without rowid;
create table artist_origin (
    artist_id integer not null references artists(id) deferrable initially deferred,
    country_code text not null,
    festivals integer not null,   -- the festivals whose line-ups state it next to their name
    primary key (artist_id, country_code)
) strict, without rowid;
create table artist_stats (
    artist_id integer primary key references artists(id) deferrable initially deferred,
    bookings integer not null check (bookings > 0),  -- an artist booked only in a couple has no row
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
    page text not null check (page like 'https://%' or page like 'http://%'),
    reseller text,
    read_on text not null,
    unread integer not null check (unread >= 0)
) strict;
create table price_status (
    event_id integer primary key references events(id) deferrable initially deferred,
    price text not null check (price in ({price})),
    page text check (page like 'https://%' or page like 'http://%'),
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
    genres text not null,
    features text not null
) strict;
-- the cities people live in and the site's home city (its home airport's), where geocode.csv puts them
create table homes (
    city text primary key,
    lat real not null,
    lon real not null
) strict;
create table people (
    id integer primary key,
    key text not null unique,
    name text not null,
    featured integer not null check (featured in (0, 1)),
    home text references homes(city) deferrable initially deferred
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
create table communities (
    id integer primary key,
    key text not null unique,
    name text not null,
    manager_id integer not null references people(id) deferrable initially deferred
) strict;
create table community_members (
    community_id integer not null references communities(id) deferrable initially deferred,
    person_id integer not null references people(id) deferrable initially deferred,
    primary key (community_id, person_id)
) strict, without rowid;
-- the people a community's manager added, who have not joined: one row per person and festival
create table community_seeded (
    id integer primary key,
    community_id integer not null references communities(id) deferrable initially deferred,
    name text not null,
    event_id integer not null references events(id) deferrable initially deferred,
    status text not null check (status in ({plan}))
) strict;
create index community_seeded_community on community_seeded(community_id);
-- how a member travels to a festival they plan (pipeline/travel.csv): arrive and leave as local times, to the minute,
-- either end null when not said
create table travel (
    person_id integer not null references people(id) deferrable initially deferred,
    event_id integer not null references events(id) deferrable initially deferred,
    arrive text,
    arrive_at text,
    leave text,
    leave_from text,
    check (arrive is not null or leave is not null),
    -- a day (YYYY-MM-DD) or a day and time (YYYY-MM-DDTHH:MM), as records.Moment writes them; their order is the
    -- build's (Moment.before), by day when either has no time
    check (arrive is null or date(substr(arrive, 1, 10)) = substr(arrive, 1, 10) and (length(arrive) = 10
      or (substr(arrive, 11, 1) = 'T' and time(substr(arrive, 12) || ':00') = substr(arrive, 12) || ':00'))),
    check (leave is null or date(substr(leave, 1, 10)) = substr(leave, 1, 10) and (length(leave) = 10
      or (substr(leave, 11, 1) = 'T' and time(substr(leave, 12) || ':00') = substr(leave, 12) || ':00'))),
    check (arrive_at is null or arrive is not null and length(arrive) = 16),
    check (leave_from is null or leave is not null and length(leave) = 16),
    primary key (person_id, event_id)
) strict, without rowid;
-- where a member stays at a festival they plan (pipeline/stays.csv), from a night to a night by their evenings' dates
create table stays (
    person_id integer not null references people(id) deferrable initially deferred,
    event_id integer not null references events(id) deferrable initially deferred,
    first_night text not null,
    last_night text not null check (last_night >= first_night),
    place text not null,
    primary key (person_id, first_night)
) strict, without rowid;
create table seeded_artists (
    seeded_id integer not null references community_seeded(id) deferrable initially deferred,
    artist_id integer not null references artists(id) deferrable initially deferred,
    primary key (seeded_id, artist_id)
) strict, without rowid;
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
-- the day the festivals are seen from: the build's, which the site sets to the visitor's own on opening the database
-- (db.ts), so that "still to come" is their day's on every page and in every query
create table today (
    one integer primary key check (one = 1),
    day text not null check (day glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
) strict;
create table table_docs (
    name text primary key,
    description text not null
) strict, without rowid;
create view event_fares as
    select e.id as event_id, e.airport, e.weekend_friday as depart, f.return, f.price, f.fetched_at,
      (select min(price) from fares m where m.airport = e.airport
         and substr(m.depart, 1, 7) = substr(e.weekend_friday, 1, 7)) as month_min
    from events e left join fares f on f.airport = e.airport and f.depart = e.weekend_friday;
create view country_stats as
    select e.country_code, c.name, count(*) as events, sum(s.kiz_only) as kiz_only,
      sum(exists (select 1 from event_features f where f.event_id = e.id and f.feature = '{taxi_dancers}'))
        as taxi_dancers,
      round(avg(s.lineup), 1) as avg_lineup, sum(s.popular_artists) as popular_bookings,
      round(100.0 * sum(s.imported) / nullif(sum(s.lineup) - sum(s.unknown_country), 0)) as imported_pct,
      sum(s.unknown_country) as unknown_country
    from events e join event_stats s on s.event_id = e.id left join countries c on c.code = e.country_code
    where e.cancelled is not 1 and e.listing = '{listed}' group by e.country_code;
-- what the site reads for festivals: each event with its statistics, and where it stands on the day in today (phase,
-- evaluated when queried, so it means the same thing on every page), upcoming when it is still to attend: to come, or
-- on now
create view event_rows as
    select r.*, r.phase in ('{ahead}', '{on}') as upcoming from (
      select e.id, e.title, e.url, e.start_date, e.end_date, e.city, e.country_code, e.lat, e.lon, e.airport,
        e.airport_km, a.city as airport_city, e.weekend_friday, e.cancelled, e.listing, e.venue, s.lineup,
        s.popular_artists,
        s.kiz_only, s.genres, s.features,
        case when e.listing != '{listed}' then '{phase_gone}' when e.cancelled = 1 then '{cancelled}'
             when e.start_date > (select day from today) then '{ahead}'
             when e.end_date >= (select day from today) then '{on}' else '{ended}' end as phase,
        p.price as price_state, p.page as ticket_page, p.card_pass
      from events e join event_stats s on s.event_id = e.id left join airports a on a.code = e.airport
        left join price_status p on p.event_id = e.id
    ) r;
create view plan_rows as
    select p.person_id, pe.key, pe.name, pe.featured, p.event_id, p.status, {plan_booked_as} as booked_as
    from plans p join people pe on pe.id = p.person_id;
-- each person a manager added, with booked_as as a plan has it, and the artist record that booking is (theirs, or
-- their couple's), which their name links to
create view seeded_rows as
    select s.id, s.community_id, s.name, s.event_id, s.status, {seeded_booked_as} as booked_as,
      {seeded_booked_artist} as artist_id
    from community_seeded s;
"""


# the role someone going to a festival is in its line-up as, from the artist records they are (artists, of whom whose
# holds), alone or in a couple: teacher first, then the others by name; null when they are in none
BOOKED_AS = """(select {column} from {artists} pa
       join event_artists ea on ea.event_id = {event} and ea.as_couple is null
         and (ea.artist_id = pa.artist_id
              or ea.artist_id in (select couple_id from couple_members where member_id = pa.artist_id))
       where {whose} and ea.role in ({roles})
       order by ea.role = '{teacher}' desc, ea.role limit 1)"""


def booked_as(artists: str, whose: str, event: str, column: str = 'ea.role') -> str:
    """BOOKED_AS for one table of artist records: the role of the booking (or, with column, its artist record)."""
    return BOOKED_AS.format_map(
        {
            'column': column,
            'artists': artists,
            'whose': whose,
            'event': event,
            'roles': states.sql_in('role', BOOKED_ROLES),
            'teacher': Role.TEACHER,
        }
    )


TABLES = sqlite_db.declared(
    (DDL + resolve_artists.ARTIST_EVENTS).format_map(
        states.SQL_IN
        | resolve_artists.VIA
        | {
            'plan_booked_as': booked_as('person_artists', 'pa.person_id = p.person_id', 'p.event_id'),
            'seeded_booked_as': booked_as('seeded_artists', 'pa.seeded_id = s.id', 's.event_id'),
            'seeded_booked_artist': booked_as('seeded_artists', 'pa.seeded_id = s.id', 's.event_id', 'ea.artist_id'),
            'booked_roles': ',\n    '.join(f'{r} integer not null' for r in BOOKED_ROLES),
            'priced': enums.Price.PRICED,
            'teacher': Role.TEACHER,
            'taxi_dancers': Feature.TAXI_DANCERS,
            'listed': enums.Listing.LISTED,
            'ahead': enums.Phase.AHEAD,
            'on': enums.Phase.ON,
            'ended': enums.Phase.ENDED,
            'cancelled': enums.Phase.CANCELLED,
            'phase_gone': enums.Phase.GONE,
            'contested': HomeBasis.CONTESTED,
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
    cancelled: bool | None  # None when not known (kizomba_world.Paged)
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


def copied(x: Transaction, table: str, where: str = '1') -> None:
    """A site table's rows from the export's table of its name, column for column: those where holds (SQL of ours)."""
    t = sqlite_db.name(table)
    columns = ', '.join(map(sqlite_db.name, x.column(str, "select name from pragma_table_info(?, 'main')", (table,))))
    x.execute(f'insert into {t} ({columns}) select {columns} from src.{t} where {where}')  # noqa: S608 (the declared names, quoted)


def booked(x: Transaction) -> dict[str, int]:
    """Each artist booked at an event in a role once (event_artists), as_couple when it repeats its couple's booking,
    which is left out of line-ups and statistics (resolve_artists), while a different role (the couple teaches, one of
    them DJs) is a solo booking. Old ids read as the artist they went to (artist_redirects). Each key's artist
    (artist_keys), for the files that name artists by key."""
    copied(x, 'event_artists')
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
    geo, to = airports.places(), airports.known()
    listed = x.rows(
        Listed,
        """select e.id, d.title, e.title as listed_title, e.url, e.slug, e.start_date, e.end_date, e.timezone,
             e.all_day, e.featured, e.cancelled, e.listing, d.venue, nullif(e.city, '') as city,
             nullif(e.country, '') as country, e.website, e.published_at, e.modified_at
           from src.events e join src.event_display d on d.event_id = e.id""",
    )
    rows: list[Mapping[str, object]] = []
    for e in listed:
        p = airports.placed(e.city, e.country, geo, to)
        start = day_of(e.start_date)
        rows.append(
            e.model_dump()
            | {
                'start_date': start,
                'end_date': day_of(e.end_date),
                'country_code': (codes(e.country) or [None])[0],
                'lat': p and p.lat,
                'lon': p and p.lon,
                'airport': p and p.airport,
                'airport_km': p and p.km,
                'weekend_friday': airports.weekend_friday(start),
            }
        )
    x.insert('events', rows)


def fares(x: Transaction) -> None:
    """pipeline/fares.csv, each fare with the day it flies back (fares.NIGHTS after the Friday), which event_fares
    joins to the events. Refresh fares starts Publish once it has pushed, so the site has the latest."""
    back = dt.timedelta(days=fare_search.NIGHTS)
    x.insert(
        'fares',
        (
            r.model_dump(mode='json') | {'return': (r.depart + back).isoformat(), 'price': float(r.price)}
            for r in Fare.read()
        ),
    )


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


@dataclass(frozen=True)
class Bookings:
    """Each artist's own bookings (events), the events booked in each role, and the further events they are at only
    as a member of a couple or group."""

    events: collections.defaultdict[int, set[int]]
    roles: collections.defaultdict[int, collections.Counter[str]]
    in_couples: collections.defaultdict[int, set[int]]


def bookings_of(x: Transaction) -> Bookings:
    """Each artist's bookings in the roles that count (BOOKED_ROLES), their own (event_artists without as_couple) and
    through a couple (artist_events' member rows)."""
    roles = (json.dumps(BOOKED_ROLES),)
    found = Bookings(
        collections.defaultdict(set), collections.defaultdict(collections.Counter), collections.defaultdict(set)
    )
    for b in x.rows(
        BookedRow,
        'select artist_id, event_id, role from event_artists where as_couple is null and role in '
        '(select value from json_each(?))',
        roles,
    ):
        found.roles[b.artist_id][b.role] += 1  # the events booked in each role (a booking is once per event and role)
        found.events[b.artist_id].add(b.event_id)
    for m in x.rows(
        BookedRow,
        'select artist_id, event_id, role from artist_events where via = ?'
        ' and role in (select value from json_each(?))',
        (enums.Via.MEMBER, *roles),
    ):
        found.in_couples[m.artist_id].add(m.event_id)
    return found


def origins(x: Transaction) -> collections.defaultdict[int, collections.Counter[str]]:
    """The countries each festival's line-up states next to an artist's name, once each, with how many festivals state
    each (artist_origin)."""
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
    return stated


def artist_stats(x: Transaction) -> Booked:
    """Each artist's bookings, roles, countries and home. A couple's booking counts for the couple, not for each
    member: a member's own bookings are their solo work (event_artists.as_couple)."""
    ev_cc = {e.id: e.country_code for e in x.rows(Coded, 'select id, country_code from events')}
    booked = bookings_of(x)
    stated = origins(x)
    dates = {e.id: e.start_date for e in x.rows(Started, 'select id, start_date from events')}
    given = given_homes(x)
    # where a home country isn't known, none stands in for it: the artist is of unknown country in the statistics
    # (imported artists, bookings abroad), and booked_most_in only says where they are booked most
    home_of: dict[int, str | None] = {}
    stats: list[dict[str, object]] = []
    countries: list[dict[str, object]] = []
    for a, evs in booked.events.items():
        where = collections.Counter(c for e in evs if (c := ev_cc[e]))
        country, basis = home(given.get(a), stated[a])
        home_of[a] = country
        ds = sorted(dates[e] for e in evs)
        stats.append(
            {
                'artist_id': a,
                'bookings': len(evs),
                **{r: booked.roles[a][r] for r in BOOKED_ROLES},
                'first_date': ds[0],
                'last_date': ds[-1],
                'home_country': country,
                'home_basis': basis,
                'booked_most_in': where.most_common(1)[0][0] if where else None,
                'countries': len(where),
                'abroad_bookings': None if country is None else sum(n for c, n in where.items() if c != country),
                'popular': int(len(evs) >= POPULAR),
                'couple_bookings': len(booked.in_couples[a] - evs),
            }
        )
        countries.extend(
            {'artist_id': a, 'country_code': c, 'bookings': n, 'is_home': int(c == country)} for c, n in where.items()
        )
    x.insert('artist_stats', stats)
    x.insert('artist_countries', countries)
    return Booked(booked.events, home_of, ev_cc)


def features(x: Transaction) -> collections.defaultdict[int, set[str]]:
    """Each event's features: its own, a promo code of ours (pipeline/promo_codes.csv), and group deals."""
    feats: collections.defaultdict[int, set[str]] = collections.defaultdict(set)
    for f in x.rows(Featured, 'select event_id, feature from event_features'):
        feats[f.event_id].add(f.feature)
    promos = Promo.read()
    known = set(x.column(int, 'select id from events'))
    for r in promos:
        if r.event_id not in known:
            sys.exit(f'promo_codes.csv: no event {r.event_id} ({r.event})')
        feats[r.event_id].add(Feature.PROMO_CODE)
    named_as_listed(x, 'promo_codes.csv', [(r.event_id, r.event) for r in promos])
    x.insert(
        'event_promos',
        (
            {'event_id': r.event_id, 'code': r.code.strip(), 'offer': r.offer and (r.offer.strip() or None)}
            for r in promos
        ),
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
                'genres': ','.join(sorted(g)),
                'features': ','.join(sorted(f)),
            }
        )
    x.insert('event_stats', rows)


def homes(x: Transaction, people: Sequence[Person]) -> None:
    """The cities people live in, and the site's home city (its home airport's), each where geocode.csv puts it: by
    its city and country (a home written "Amsterdam, Netherlands"), or by its city alone when geocode.csv has it in one
    place only. A city it has not found, or found in two places with no country to choose, stops the build, naming the
    file that says it."""
    found: dict[str, dict[str | None, tuple[float, float]]] = {}
    for p in airports.places().values():
        if p.found:
            found.setdefault(p.city, {})[p.country] = (p.found.lat, p.found.lon)
    home = [a for a in airports.known() if a.home]
    if len(home) != 1:
        sys.exit(f'airports.csv: {len(home)} airports marked home: one is where flights leave from')
    named = {home[0].city: "airports.csv: the home airport's city"} | {
        r.home: f"people.csv: {r.name}'s home" for r in people if r.home is not None
    }
    rows: list[Mapping[str, object]] = []
    for written, whose in sorted(named.items()):
        city, _, country = written.rpartition(', ') if ', ' in written else (written, '', None)
        spots = found.get(city, {})
        at = {country: spots[country]} if country in spots else spots if country is None else {}
        if len(set(at.values())) != 1:
            said = (
                'in geocode.csv in more than one place: write its country too ("City, Country")'
                if at
                else 'not in geocode.csv'
            )
            sys.exit(f'{whose}, {written}, is {said}')
        ((lat, lon),) = set(at.values())
        rows.append({'city': written, 'lat': lat, 'lon': lon})
    x.insert('homes', rows)


class Titled(BaseModel):
    id: int
    title: str
    listed_title: str | None


def named_as_listed(x: Transaction, file: str, rows: Sequence[tuple[int, str]]) -> None:
    """The festival a row names by hand beside its event id (its event column, which says which festival the id was
    once it is no more), as the site database has it: by its title or as it is listed. A row whose words are neither
    is said, with what to write, then how many there are; never refused, as a festival renamed where it is listed would
    otherwise stop the build until each row naming it was put right."""
    titles = {e.id: e for e in x.rows(Titled, 'select id, title, listed_title from events')}
    off = [
        (i, said, e.listed_title or e.title)
        for i, said in dict.fromkeys(rows)
        if (e := titles.get(i)) is not None and said not in {e.title, e.listed_title}
    ]
    for i, said, listed in off:
        print(
            f'warning: {file}: event {i} is named {said!r}, which is listed as {listed!r}; write that', file=sys.stderr
        )
    if off:
        print(f'warning: {file} names {len(off)} of its festivals otherwise than they are listed', file=sys.stderr)


def once(file: str, what: str, keys: Sequence[object]) -> None:
    """Each row of a file by its key once: a second is refused by name, as the database would refuse it unnamed."""
    seen: set[object] = set()
    for k in keys:
        if k in seen:
            sys.exit(f'{file}: a second row of {what} {k}')
        seen.add(k)


def plans(x: Transaction, key_id: Mapping[str, int]) -> dict[str, int]:
    """Who's going (pipeline/people.csv, pipeline/plans.csv). People are ours, not the source's: a name, the artist
    records they are (if any), and whether the site names them on festival cards (featured) or only counts them. A
    plan says a person is going to a festival; booked_as says when they are in its line-up too, as themselves or in a
    couple, so the site can say "teaching" instead."""
    people = Person.read()
    once('people.csv', 'key', [r.key for r in people])
    person_id = {r.key: i for i, r in enumerate(people, 1)}
    for r in people:
        if unknown := [k for k in r.artist_keys if k not in key_id]:
            sys.exit(f'people.csv: unknown artist key {unknown[0]} ({r.name})')
    x.insert(
        'people',
        (
            {'id': person_id[r.key], 'key': r.key, 'name': r.name, 'featured': r.featured, 'home': r.home}
            for r in people
        ),
    )
    x.insert(
        'person_artists',
        ({'person_id': person_id[r.key], 'artist_id': key_id[k]} for r in people for k in r.artist_keys),
    )
    plans_ = PlanRow.read()
    once('plans.csv', 'person and event', [(r.person, r.event_id) for r in plans_])
    known = set(x.column(int, 'select id from events'))
    for r in plans_:
        if r.person not in person_id:
            sys.exit(f'plans.csv: no person {r.person} in people.csv')
        if r.event_id not in known:
            sys.exit(f'plans.csv: no event {r.event_id} ({r.event})')
    named_as_listed(x, 'plans.csv', [(r.event_id, r.event) for r in plans_])
    x.insert('plans', ({'person_id': person_id[r.person], 'event_id': r.event_id, 'status': r.status} for r in plans_))
    return person_id


class KeyName(BaseModel):
    key: str
    name: str


def communities(x: Transaction, person_id: Mapping[str, int]) -> tuple[dict[str, int], list[Membership]]:
    """Communities (pipeline/communities.csv, community_members.csv): each with its manager, one of its members; each
    community's id by its key, and the members, which the people added (added) and how members travel (travel)
    read."""
    found = Community.read()
    once('communities.csv', 'key', [r.key for r in found])
    community_id = {r.key: i for i, r in enumerate(found, 1)}
    members = Membership.read()
    once('community_members.csv', 'community and person', [(r.community, r.person) for r in members])
    for r in members:
        if r.community not in community_id:
            sys.exit(f'community_members.csv: no community {r.community} in communities.csv')
        if r.person not in person_id:
            sys.exit(f'community_members.csv: no person {r.person} in people.csv')
    joined = {(r.community, r.person) for r in members}
    for r in found:
        if (r.key, r.manager) not in joined:
            sys.exit(f'communities.csv: the manager of {r.name}, {r.manager}, is no member of it')
    x.insert(
        'communities',
        ({'id': community_id[r.key], 'key': r.key, 'name': r.name, 'manager_id': person_id[r.manager]} for r in found),
    )
    x.insert(
        'community_members',
        ({'community_id': community_id[r.community], 'person_id': person_id[r.person]} for r in members),
    )
    return community_id, members


def added(
    x: Transaction, community_id: Mapping[str, int], members: Sequence[Membership], key_id: Mapping[str, int]
) -> None:
    """The people a community's manager added who have not joined (pipeline/seeded.csv), each by their name and the
    festivals they go to, one row a person and festival, never a member's name; and the artist records they are, so a
    booking of theirs says they teach there (seeded_rows), as a member's does."""
    seeded = Seeded.read()
    known = set(x.column(int, 'select id from events'))
    for r in seeded:
        if r.community not in community_id:
            sys.exit(f'seeded.csv: no community {r.community} in communities.csv')
        if r.event_id not in known:
            sys.exit(f'seeded.csv: no event {r.event_id} ({r.event})')
        if unknown := [k for k in r.artist_keys if k not in key_id]:
            sys.exit(f'seeded.csv: unknown artist key {unknown[0]} ({r.name})')
    named_as_listed(x, 'seeded.csv', [(r.event_id, r.event) for r in seeded])
    # one person a row: the same name twice to one festival of one community is one person written twice, and a name a
    # member has would read as that member
    name_of = {r.key: r.name for r in x.rows(KeyName, 'select key, name from people')}
    names = {(m.community, name_of[m.person].casefold()) for m in members}
    seen: set[tuple[str, str, int]] = set()
    for r in seeded:
        row = (r.community, r.name.casefold(), r.event_id)
        if row in seen:
            sys.exit(f'seeded.csv: {r.name} twice for event {r.event_id} in {r.community}: one person, one row')
        seen.add(row)
        if (r.community, r.name.casefold()) in names:
            sys.exit(f'seeded.csv: {r.name} is the name of a member of {r.community}, whom it would read as')
    x.insert(
        'community_seeded',
        (
            {
                'id': i,
                'community_id': community_id[r.community],
                'name': r.name,
                'event_id': r.event_id,
                'status': r.status,
            }
            for i, r in enumerate(seeded, 1)
        ),
    )
    x.insert(
        'seeded_artists',
        ({'seeded_id': i, 'artist_id': key_id[k]} for i, r in enumerate(seeded, 1) for k in r.artist_keys),
    )


# a travel's days and a stay's nights are within this many days of their festival's: a later date is a typo
BOUND_DAYS = 7
# a flight landing before this time may follow a first night booked the evening before, at its place
EARLY = dt.time(6, 0)


class Festival(BaseModel):
    id: int
    title: str
    start_date: dt.date
    end_date: dt.date


def nights_kept(stays: Sequence[StayRow], by: Mapping[tuple[str, int], Travel]) -> None:
    """A member's nights: from the day they arrive (or the evening before, when they land before EARLY, as one who
    books the night they land in does) to the day before they leave, when they said them, and never two places on one
    night."""
    nights: dict[str, list[StayRow]] = {}
    for r in stays:
        t = by.get((r.person, r.event_id))
        came = None if t is None or t.arrive is None else t.arrive
        if came is not None:
            first = came.day - dt.timedelta(days=1) if came.time is not None and came.time < EARLY else came.day
            if r.first_night < first:
                sys.exit(
                    f'stays.csv: {r.person} stays at {r.place} from the night of {r.first_night}, before they arrive'
                    f' on {came} (event {r.event_id})'
                )
        if t is not None and t.leave is not None and r.last_night >= t.leave.day:
            sys.exit(
                f'stays.csv: {r.person} stays at {r.place} the night of {r.last_night}, though they leave on {t.leave}'
                f' (event {r.event_id})'
            )
        for o in nights.get(r.person, []):
            if r.first_night <= o.last_night and o.first_night <= r.last_night:
                sys.exit(
                    f'stays.csv: {r.person} stays at {r.place} ({r.first_night} to {r.last_night}, event {r.event_id})'
                    f' and at {o.place} ({o.first_night} to {o.last_night}, event {o.event_id}) on the same night'
                )
        nights.setdefault(r.person, []).append(r)


def bounded(trips: Sequence[Travel], stays: Sequence[StayRow], festivals: Mapping[int, Festival]) -> None:
    """A travel's days and a stay's nights within BOUND_DAYS days of their festival's: a date further off (2072 for
    2027) is a typo, which would draw a calendar of years."""
    margin = dt.timedelta(days=BOUND_DAYS)

    def near(day: dt.date, f: Festival) -> bool:
        return f.start_date - margin <= day <= f.end_date + margin

    for t in trips:
        f = festivals[t.event_id]
        for end in (t.arrive, t.leave):
            if end is not None and not near(end.day, f):
                sys.exit(f'travel.csv: {t.person} travels on {end}, more than {BOUND_DAYS} days from {f.title}')
    for r in stays:
        f = festivals[r.event_id]
        for night in (r.first_night, r.last_night):
            if not near(night, f):
                sys.exit(
                    f'stays.csv: {r.person} stays the night of {night}, more than {BOUND_DAYS} days from {f.title}'
                )


# a member's trip to a festival, which the site shows and retention keeps or not: theirs, by person and festival
type Trip = tuple[str, int]


def trip_ends(
    trips: Sequence[Travel], stays: Sequence[StayRow], festival_ends: Mapping[int, dt.date]
) -> dict[Trip, dt.date]:
    """When each member's trip to a festival ends, as the site draws it (calendar.ts extent): the day they leave, or
    else the morning after their last night or the festival's last day, whichever is later; and never before the
    festival's last day, as the trip's span on the community's page is the festival's at least. A community's trip
    ends with its last member's."""
    ends: dict[Trip, dt.date] = {}
    for t in trips:
        if t.leave is not None:
            ends[t.person, t.event_id] = max(festival_ends[t.event_id], t.leave.day)
    for r in stays:
        trip = (r.person, r.event_id)
        if trip not in {(t.person, t.event_id) for t in trips if t.leave is not None}:
            ends[trip] = max(ends.get(trip, festival_ends[r.event_id]), r.last_night + dt.timedelta(days=1))
    for t in trips:
        _ = ends.setdefault((t.person, t.event_id), festival_ends[t.event_id])
    return ends


def gone_by(ends: Mapping[Trip, dt.date], day: dt.date) -> set[Trip]:
    """The trips that ended more than KEPT_DAYS days before the day: their travel and stays are no longer published, and
    their rows are to be deleted (the build says which)."""
    return {trip for trip, end in ends.items() if (day - end).days > KEPT_DAYS}


def travel(x: Transaction, person_id: Mapping[str, int], members: set[str]) -> None:
    """How members travel and where they stay (pipeline/travel.csv, stays.csv): each row a member's, to a festival they
    plan; one travel each; a member's nights never overlapping, and between the day they arrive and the day before they
    leave when they said them; every date within BOUND_DAYS of the festival's. The people a manager adds are no members,
    so they never have either. A trip that ended more than KEPT_DAYS days ago is not published: the build warns of
    each of its rows, by what it says, to be deleted from the files, and goes on."""
    planned = {(r.person, r.event_id) for r in PlanRow.read()}
    trips, stays = Travel.read(), StayRow.read()

    def theirs(file: str, r: Travel | StayRow) -> None:
        if r.person not in members:
            sys.exit(f'{file}: {r.person} is no member of a community, and only a member says how they travel')
        if (r.person, r.event_id) not in planned:
            sys.exit(f'{file}: {r.person} has no plan for event {r.event_id} in plans.csv')

    by: dict[tuple[str, int], Travel] = {}
    for r in trips:
        theirs('travel.csv', r)
        if (r.person, r.event_id) in by:
            sys.exit(f'travel.csv: a second travel of {r.person} to event {r.event_id}')
        by[r.person, r.event_id] = r
    for r in stays:
        theirs('stays.csv', r)
    festivals = {f.id: f for f in x.rows(Festival, 'select id, title, start_date, end_date from events')}
    bounded(trips, stays, festivals)
    nights_kept(stays, by)
    ends = trip_ends(trips, stays, {i: f.end_date for i, f in festivals.items()})
    gone = gone_by(ends, today())
    # each row of a trip gone, by what it says, its festival and the day the trip ended; then how many
    said = [
        (
            (r.person, r.event_id),
            f'travel.csv: {r.person}, arriving {r.arrive or "(not said)"} and leaving {r.leave or "(not said)"}',
        )
        for r in trips
    ] + [
        ((r.person, r.event_id), f'stays.csv: {r.person} at {r.place}, {r.first_night} to {r.last_night}')
        for r in stays
    ]
    said = [(trip, row) for trip, row in said if trip in gone]
    for (person, event), row in said:
        print(
            f'warning: {row}, for {festivals[event].title} (event {event}): the trip ended on {ends[person, event]},'
            f' more than {KEPT_DAYS} days ago, so the row is no longer published; delete it',
            file=sys.stderr,
        )
    if said:
        print(
            f'warning: {len(said)} rows of trips that ended more than {KEPT_DAYS} days ago are no longer published;'
            ' delete them from travel.csv and stays.csv',
            file=sys.stderr,
        )
    trips = [r for r in trips if (r.person, r.event_id) not in gone]
    stays = [r for r in stays if (r.person, r.event_id) not in gone]
    x.insert(
        'travel',
        (
            {
                'person_id': person_id[r.person],
                'event_id': r.event_id,
                'arrive': None if r.arrive is None else str(r.arrive),
                'arrive_at': r.arrive_at,
                'leave': None if r.leave is None else str(r.leave),
                'leave_from': r.leave_from,
            }
            for r in trips
        ),
    )
    x.insert(
        'stays',
        (
            {
                'person_id': person_id[r.person],
                'event_id': r.event_id,
                'first_night': r.first_night.isoformat(),
                'last_night': r.last_night.isoformat(),
                'place': r.place,
            }
            for r in stays
        ),
    )


def schema() -> str:
    """The site database's tables and views, by a digest of their DDL: the site's scripts are built for one
    (site/schema.ts, which pipeline/generate.py writes), so a script cached from before a change says to reload rather
    than read tables that are no more."""
    return hashlib.sha256(''.join(TABLES.values()).encode()).hexdigest()[:16]


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
    x.insert('today', [{'one': 1, 'day': built_at[:10]}])  # the site's visitor's day replaces it
    x.insert(
        'meta',
        (
            {'key': k, 'value': v}
            for k, v in [
                ('home_airport', airports.home()),
                ('popular_threshold', str(POPULAR)),
                ('max_airport_km', str(airports.MAX_AIRPORT_KM)),
                ('built_at', built_at),
                ('schema', schema()),
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
    'fares': 'Round-trip economy fares from the home airport (airports.home = 1), one adult, Friday out (depart) and '
    'Monday back (return), in euros, from Google Flights via fli.',
    'event_fares': 'Each event joined to the fare for its weekend (null when Google had no price), plus the cheapest '
    'fare that month to the same airport.',
    'artist_stats': 'Per artist with bookings of their own: bookings (as '
    f'{", ".join(BOOKED_ROLES)} at distinct events; a couple’s bookings count for the couple, not its members), the '
    'events booked in each of these roles (one event can count in two), first_date and last_date (of their first and '
    'last booked festival), home_country when a source states it '
    '(home_basis: given by a claim, or the one '
    'country line-ups state most often next to their name; contested when several are stated equally often, with no '
    'home), booked_most_in (the country with most of their bookings, which '
    'says nothing of where they are from), countries booked in, bookings abroad (outside the home country; null when '
    f'that is not known), popular = at least {POPULAR} bookings, couple_bookings '
    '= further events where they appear only as part of a couple. People booked only as part of a couple have no row.',
    'artist_redirects': 'Artist ids no artist has now (merged into another, by a claim or a reviewed decision): old_id '
    'now reads as new_id.',
    'artist_countries': 'Bookings per artist and country; is_home marks the known home country in artist_stats.',
    'artist_origin': 'Countries stated next to an artist’s name in line-ups (flags or text), with how many festivals '
    'state each.',
    'event_stats': 'Per event: line-up size (teachers and DJs), popular artists booked, imported artists (home country '
    'differs from the event’s), artists of unknown country (no home known), kizomba-family genres, kiz-only (no salsa '
    'or bachata), and its genres and features as lists (the features with promo_code and group_deals, which the build '
    'derives; event_features has the rest one row each).',
    'event_passes': 'The passes a festival sells (kind): people per price (group_size, and people as a state), days, '
    'hotel included; source is description, or ticket_page (see ticket_pages).',
    'price_status': 'What each festival’s card can say of its price: priced, with the pass it prices (card_pass), or '
    'why not (price), with its ticket page when one is known.',
    'states': 'Every state a coded column can hold, by point (pipeline/states.py): what makes a value that state, what '
    'the site does with it (disposition), its words on the site, who acts on it, and how the site draws it (icon, or a '
    'link to the ticket page or the passes).',
    'ticket_pages': 'Festivals whose prices are read on their ticket page: the page, the reseller selling there when '
    'it is not the organiser, the day it was last read, and how many tickets on it are not read yet.',
    'pass_tiers': 'Each pass’s prices tier by tier, in order (tier_no): what a buyer pays and its currency (and the '
    'same price in a second currency when the page shows one: alt_amount, alt_currency), the booking fee that '
    'includes when stated, the days the tier applies, tickets at that price (quantity), door price, sold out, and '
    'current (the description calls it the current price, without dates).',
    'rates': 'Exchange rates the site converts prices with: units of each currency per euro (European Central Bank, '
    'pipeline/rates.csv).',
    'event_promos': 'Promo codes for a festival, from pipeline/promo_codes.csv (ours, not kizomba-world’s): the code, '
    'and what it gives when known.',
    'people': 'People who share their festival plans (pipeline/people.csv, ours): featured ones are named on festival '
    'cards, the others counted; home, the city they live in when they said (homes).',
    'homes': 'The cities people live in and the site’s home city (its home airport’s), where pipeline/geocode.csv '
    'puts them: the Friends tab lists the people near a place by them.',
    'person_artists': 'The artist records a person is, so their bookings and their plans meet.',
    'plans': 'Who said they are going to which festival (pipeline/plans.csv).',
    'communities': 'Communities (pipeline/communities.csv, ours): a key, which is its page’s address, a name and its '
    'manager, who is one of its members. No tab of the site links to one, but they are public, as this table is.',
    'community_members': 'Who is a member of which community (pipeline/community_members.csv).',
    'community_seeded': 'The people a community’s manager added, who have not joined (pipeline/seeded.csv): one row '
    'per person and festival, by their first name; the community’s page names them as added by its manager.',
    'travel': 'How a member travels to a festival they plan (pipeline/travel.csv): arrive and leave as local times to '
    'the minute (YYYY-MM-DDTHH:MM), either null when not said, and the airports when they fly (arrive_at, leave_from).',
    'stays': 'Where a member stays at a festival they plan (pipeline/stays.csv): a place, from its first night to its '
    'last, each by its evening’s date (YYYY-MM-DD); a member’s nights never overlap.',
    'seeded_artists': 'The artist records a person a manager added is, so a booking of theirs says they teach there.',
    'seeded_rows': 'Each person a manager added with booked_as, as plan_rows has it, and artist_id, the artist record '
    'their page is.',
    'plan_rows': 'Each plan with the person, and booked_as: their role when they are in that festival’s line-up, alone '
    'or in a couple.',
    'event_rows': 'What the site reads: each event with its event_stats (lineup, popular_artists, kiz_only, genres, '
    'features), what its card can say of its price '
    '(price_state, with its ticket_page and card_pass), where it stands on the day in today (phase: ahead, on, '
    'ended, cancelled or gone), and upcoming (phase ahead or on: still to attend).',
    'today': "The day the festivals are seen from: the build's, which the site sets to the visitor's own day.",
    'country_stats': 'Per country: events, kiz-only events, taxi dancers, average line-up, bookings of popular '
    'artists, share of imported artists among those whose home is known, artists of unknown country.',
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
    """What each table and view holds: the site's own (DOCS), and the export's for the ones it copies."""
    x.insert('table_docs', ({'name': n, 'description': d} for n, d in DOCS.items()))
    made = set(x.column(str, 'select name from sqlite_master'))
    x.insert(
        'table_docs',
        (
            {'name': doc.name, 'description': doc.description}
            for doc in x.rows(Doc, 'select name, description from src.table_docs')
            if doc.name in made and doc.name not in DOCS
        ),
    )


def resolved(db: Reader) -> None:
    """Refuse an export whose mentions resolve_artists hasn't resolved: a load makes them again, under new ids, and
    their bookings go with the old ones until resolve books the new (an empty line-up, built and published)."""
    unresolved = db.value(
        int,
        'select count(*) from src.artist_mentions m'
        ' where not exists (select 1 from src.mention_artists a where a.mention_id = m.id)',
    )
    if unresolved:
        sys.exit(f'the export has {unresolved} artist mentions no artist resolves: run mise run resolve after the load')


@dataclass(frozen=True)
class Built:
    site: dict[str, object]  # the summary site.json holds
    review: review.Review  # what review.json holds


def build(src: Path, out: Path) -> Built:
    """Build the site database from the export into out, and give what site.json and review.json hold. It is built
    beside out and swapped in at the end, so a build that stops halfway leaves out as it was."""
    building = out.with_name(out.name + '.building')
    out.parent.mkdir(parents=True, exist_ok=True)
    building.unlink(missing_ok=True)
    with sqlite_db.opened(building, 'rwc') as db:
        db.attach('src', src, 'ro')
        export.current(db, 'src')
        resolved(db)
        with db.transaction() as x:
            for ddl in TABLES.values():
                x.script(ddl)
            for table in COPIED:
                copied(x, table)
            copied(x, 'artist_names', 'renamed = 1 or as_roles is not null')  # the names an artist's page says
            places(x)
            key_id = booked(x)
            fares(x)
            event_stats(x, artist_stats(x))
            person_id = plans(x, key_id)
            homes(x, Person.read())
            community_id, members = communities(x, person_id)
            added(x, community_id, members, key_id)
            travel(x, person_id, {r.person for r in members})
            built_at = now().isoformat()
            meta(x, built_at)
            made = Built(site_json(x, built_at), review.review(x, built_at, src))
            table_docs(x)
        db.detach('src')
        db.vacuum()
    _ = building.replace(out)
    return made


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
    ap = argparse.ArgumentParser(
        description='Build public/data/kiz.sqlite and site.json, which the site loads, and review.json, which the '
        'review dashboard does.'
    )
    _ = ap.parse_args()
    out = data(OUT)
    made = build(export.path(), out)
    files.write(data(SITE_JSON), json.dumps(made.site, ensure_ascii=False, indent=1))
    files.write(data(REVIEW_JSON), made.review.model_dump_json())
    print(OUT, out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
