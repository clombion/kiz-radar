"""The site database's derived tables against what they are derived from: each count the build computes in Python
(pipeline/build_site_db.py) is computed again here in SQL from the tables it reads, and the two must agree row for
row. A derivation that drops a role, counts a couple's booking for its members or a cancelled festival in a country
shows here as the rows on one side only. The tables the build copies from our files (who's going, where a festival is
and the airport it flies to, the fares) are read against those files, row for row."""

import datetime as dt
import json
import math
import re
from collections.abc import Mapping
from pathlib import Path

import pytest
from pydantic import BaseModel

from pipeline import airports, build_site_db, enums, fare_store, fare_weekends
from pipeline import db as sqlite_db
from pipeline.db import Db
from pipeline.records import (
    Airport,
    Community,
    Membership,
    Person,
    Place,
    PlanRow,
    Seeded,
    Spot,
    StayRow,
    Travel,
    today,
)
from tests.exports import EXPORT, committed
from tests.fakes import Memory

# an artist's own bookings in some roles: once per festival and role, a member's booking with their couple left to
# the couple
OWN = (
    'select artist_id, event_id, role from event_artists'
    ' where as_couple is null and role in (select value from json_each(?))'
)
# the code's own constants, which the queries name in braces
NAMES = {
    'own': OWN.replace('?', f"'{json.dumps(build_site_db.BOOKED_ROLES)}'"),
    'line_up': OWN.replace('?', f"'{json.dumps(build_site_db.LINEUP_ROLES)}'"),
    'role_columns': ', '.join(build_site_db.BOOKED_ROLES),
    'per_role': ', '.join(f"sum(role = '{r}')" for r in build_site_db.BOOKED_ROLES),
    'taxi': enums.Feature.TAXI_DANCERS,
    'listed': enums.Listing.LISTED,
    'promo_code': enums.Feature.PROMO_CODE,
    'group_deals': enums.Feature.GROUP_DEALS,
    'for_two': f"'{enums.People.COUPLE}', '{enums.People.GROUP}'",
    'grouped_kinds': f"'{enums.PassKind.FULL}', '{enums.PassKind.PARTY}', '{enums.PassKind.PACKAGE}'",
}


def differ(site_db: Path, derived: str, recomputed: str) -> list[str]:
    """The rows of either query the other lacks, each as its values."""
    a, b = derived.format_map(NAMES), recomputed.format_map(NAMES)
    with sqlite_db.opened(site_db, 'ro') as db:
        return [
            f'{side} only: {row}'
            for x, y, side in ((a, b, 'built'), (b, a, 'recomputed'))
            for row in db.column(str, f'select json_array(*) from ({x} except {y}) limit 5')  # noqa: S608 (NAMES)
        ]


def test_an_artist_s_bookings_are_their_own_festivals_in_each_role(site_db: Path) -> None:
    assert (
        differ(
            site_db,
            'select artist_id, bookings, {role_columns}, first_date, last_date, popular from artist_stats',
            """select b.artist_id, count(distinct b.event_id), {per_role}, min(e.start_date), max(e.start_date),
             count(distinct b.event_id) >= (select cast(value as integer) from meta where key = 'popular_threshold')
           from ({own}) b join events e on e.id = b.event_id group by b.artist_id""",
        )
        == []
    )


def test_an_artist_s_countries_are_those_of_their_festivals(site_db: Path) -> None:
    assert (
        differ(
            site_db,
            'select artist_id, country_code, bookings, is_home from artist_countries',
            """select b.artist_id, e.country_code, count(distinct b.event_id), e.country_code is st.home_country
           from ({own}) b join events e on e.id = b.event_id join artist_stats st on st.artist_id = b.artist_id
           where e.country_code is not null group by b.artist_id, e.country_code""",
        )
        == []
    )
    assert (
        differ(
            site_db,
            'select artist_id, countries, abroad_bookings from artist_stats',
            """select st.artist_id, count(c.country_code),
             case when st.home_country is null then null else coalesce(sum(c.bookings * (1 - c.is_home)), 0) end
           from artist_stats st left join artist_countries c on c.artist_id = st.artist_id group by st.artist_id""",
        )
        == []
    )


def test_a_line_up_counts_each_artist_once_with_where_they_are_from(site_db: Path) -> None:
    assert (
        differ(
            site_db,
            'select event_id, lineup, popular_artists, imported, unknown_country from event_stats',
            """select e.id, count(distinct l.artist_id), count(distinct case when st.popular then l.artist_id end),
             count(distinct case when st.home_country is not null and st.home_country is not e.country_code
               then l.artist_id end),
             count(distinct case when st.home_country is null and l.artist_id is not null then l.artist_id end)
           from events e left join ({line_up}) l on l.event_id = e.id
             left join artist_stats st on st.artist_id = l.artist_id
           group by e.id""",
        )
        == []
    )


def test_a_country_counts_its_listed_festivals_and_their_highlights(site_db: Path) -> None:
    assert (
        differ(
            site_db,
            'select country_code, events, taxi_dancers from country_stats',
            """select e.country_code, count(*),
             sum(exists (select 1 from event_features f where f.event_id = e.id and f.feature = '{taxi}'))
           from events e where e.cancelled is not 1 and e.listing = '{listed}' group by e.country_code""",
        )
        == []
    )


HAS = "select event_id from event_stats where ',' || features || ',' like '%,{feature},%'"


@pytest.mark.parametrize(
    ('feature', 'source'),
    [
        ('promo_code', 'select event_id from event_promos'),
        ('group_deals', 'select event_id from event_passes where people in ({for_two}) and kind in ({grouped_kinds})'),
    ],
)
def test_the_derived_highlights_are_in_a_festival_s_features(site_db: Path, feature: str, source: str) -> None:
    """A promo code of ours and group passes add their highlight to the festival's features, which the card reads."""
    assert differ(site_db, HAS.replace('{feature}', f'{{{feature}}}'), source) == []


class Going(BaseModel, frozen=True):
    key: str
    name: str
    featured: bool


class Is(BaseModel, frozen=True):
    person: str
    artist: str


class Plans(BaseModel, frozen=True):
    person: str
    event_id: int
    status: enums.Plan


class Where(BaseModel, frozen=True):
    id: int
    lat: float | None
    lon: float | None
    airport: str | None
    airport_km: int | None


class In(BaseModel, frozen=True):
    id: int
    city: str | None
    country: str | None


class Flight(BaseModel, frozen=True):
    airport: str
    depart: dt.date
    back: dt.date
    price: float
    fetched_at: dt.datetime
    stops_out: int | None
    stops_back: int | None
    resold: str | None


class Transfer(BaseModel, frozen=True):
    airport: str
    depart: dt.date
    price: float
    airlines: str


class Searched(BaseModel, frozen=True):
    airport: str
    depart: dt.date
    searched_at: dt.datetime
    direct: bool | None


def built[R: BaseModel](site_db: Path, record: type[R], sql: str) -> set[R]:
    with sqlite_db.opened(site_db, 'ro') as db:
        return set(db.rows(record, sql))


def test_who_s_going_is_what_people_csv_and_plans_csv_say(site_db: Path) -> None:
    committed(Person.FILE, PlanRow.FILE)
    people, plans = Person.read(), PlanRow.read()
    assert built(site_db, Going, 'select key, name, featured from people') == {
        Going(key=p.key, name=p.name, featured=p.featured) for p in people
    }
    assert built(
        site_db,
        Is,
        'select p.key as person, a.match_key as artist from person_artists pa join people p on p.id = pa.person_id'
        ' join artists a on a.id = pa.artist_id',
    ) == {Is(person=p.key, artist=k) for p in people for k in p.artist_keys}
    assert built(
        site_db, Plans, 'select p.key as person, l.event_id, l.status from plans l join people p on p.id = l.person_id'
    ) == {Plans(person=r.person, event_id=r.event_id, status=r.status) for r in plans}
    assert plans


class Managed(BaseModel, frozen=True):
    key: str
    name: str
    manager: str


class Member(BaseModel, frozen=True):
    community: str
    person: str


class AddedRow(BaseModel, frozen=True):
    community: str
    name: str
    event_id: int
    status: enums.Plan
    artist_keys: str  # ';'-separated, as seeded.csv writes them


def test_a_community_is_what_its_three_files_say(site_db: Path) -> None:
    """A community, its members and its manager are communities.csv and community_members.csv, and the people a
    manager added are seeded.csv row for row, each with the artist records they are: the community's page names them;
    and how members travel and where they stay are travel.csv and stays.csv."""
    committed(Community.FILE, Membership.FILE, Seeded.FILE, Travel.FILE, StayRow.FILE)
    found, members, seeded = Community.read(), Membership.read(), Seeded.read()
    assert built(
        site_db,
        Managed,
        'select c.key, c.name, p.key as manager from communities c join people p on p.id = c.manager_id',
    ) == {Managed(key=c.key, name=c.name, manager=c.manager) for c in found}
    assert built(
        site_db,
        Member,
        'select c.key as community, p.key as person from community_members m'
        ' join communities c on c.id = m.community_id join people p on p.id = m.person_id',
    ) == {Member(community=m.community, person=m.person) for m in members}
    with sqlite_db.opened(site_db, 'ro') as db:
        added = db.rows(
            AddedRow,
            'select c.key as community, s.name, s.event_id, s.status,'
            " (select coalesce(group_concat(a.match_key, ';'), '') from seeded_artists sa"
            ' join artists a on a.id = sa.artist_id where sa.seeded_id = s.id) as artist_keys'
            ' from community_seeded s join communities c on c.id = s.community_id'
            ' order by s.id',
        )
    assert added == [
        AddedRow(
            community=r.community,
            name=r.name,
            event_id=r.event_id,
            status=r.status,
            artist_keys=';'.join(r.artist_keys),
        )
        for r in seeded
    ]
    assert found
    assert members
    # those of a trip that ended more than KEPT_DAYS days ago are left out
    trips, stays = Travel.read(), StayRow.read()
    with sqlite_db.opened(site_db, 'ro') as db:
        day = dt.date.fromisoformat(db.value(str, 'select day from today'))
        ends = {
            e.id: e.end_date
            for e in db.rows(build_site_db.Festival, 'select id, title, start_date, end_date from events')
        }
    gone = build_site_db.gone_by(build_site_db.trip_ends(trips, stays, ends), day)
    trips = [t for t in trips if (t.person, t.event_id) not in gone]
    stays = [r for r in stays if (r.person, r.event_id) not in gone]
    assert built(
        site_db,
        Travel,
        'select p.key as person, t.event_id, t.arrive, t.arrive_at, t.leave, t.leave_from from travel t'
        ' join people p on p.id = t.person_id',
    ) == set(trips)
    assert built(
        site_db,
        StayRow,
        'select p.key as person, s.event_id, s.first_night, s.last_night, s.place from stays s'
        ' join people p on p.id = s.person_id',
    ) == set(stays)


KEY = 'frost-lantern-river-maple'
OTHER = 'snow-pine-harbour-light'
MANAGER = Community(key=KEY, name='Norwegians in festivals', manager='cedric', note='')
MEMBER = Membership(community=KEY, person='cedric')
ADDED = Seeded(
    community=KEY, name='Tonje', artist_keys=('p:tonje@dance',), event_id=1, status=enums.Plan.GOING, event='KUOF'
)
TRIP = Travel.model_validate(
    {
        'person': 'cedric',
        'event_id': 1,
        'arrive': '2026-11-19T21:05',
        'arrive_at': 'OSL',
        'leave': '2026-11-23T09:30',
        'leave_from': 'OSL',
    }
)
STAY = StayRow.model_validate(
    {'person': 'cedric', 'event_id': 1, 'first_night': '2026-11-19', 'last_night': '2026-11-22', 'place': 'Scandic'}
)


class Rows(BaseModel, frozen=True):
    """What the community files hold: by default a community of cedric alone, with no one added and no trip."""

    found: tuple[Community, ...] = (MANAGER,)
    members: tuple[Membership, ...] = (MEMBER,)
    seeded: tuple[Seeded, ...] = ()
    trips: tuple[Travel, ...] = ()
    stays: tuple[StayRow, ...] = ()


def community_tables(memory: Memory) -> Db:
    """The tables a community's rows go to, with cedric, his plan for the one festival and one artist in, and the
    files' rows written there."""
    db = memory()
    with db.transaction() as x:
        for table in (
            'homes',
            'people',
            'communities',
            'community_members',
            'community_seeded',
            'seeded_artists',
            'travel',
            'stays',
        ):
            x.script(build_site_db.TABLES[table])
        # what is checked of a festival or an artist: its id, and a festival's last day and names
        x.script(
            'create table events (id integer primary key, title text, listed_title text, start_date text,'
            ' end_date text); create table artists (id integer primary key)'
        )
        x.execute(
            'insert into events (id, title, listed_title, start_date, end_date)'
            " values (1, 'KUOF', 'KUOF 2026', '2026-11-20', '2026-11-22')"
        )
        x.execute('insert into artists (id) values (1)')
        x.execute('insert into people (id, key, name, featured) values (1, ?, ?, 1)', ('cedric', 'Cédric'))
    with db.transaction() as x:
        community_id, members = build_site_db.communities(x, {'cedric': 1})
        build_site_db.added(x, community_id, members, {'p:tonje@dance': 1})
        build_site_db.travel(x, {'cedric': 1}, {r.person for r in members})
    return db


@pytest.mark.parametrize(
    ('rows', 'said'),
    [
        (Rows(members=(MEMBER, MEMBER.model_copy(update={'community': OTHER}))), f'no community {OTHER}'),
        (Rows(members=(MEMBER, MEMBER.model_copy(update={'person': 'nobody'}))), 'no person nobody in people.csv'),
        (
            Rows(found=(MANAGER.model_copy(update={'manager': 'nobody'}),)),
            'the manager of Norwegians in festivals, nobody',
        ),
        (Rows(seeded=(ADDED.model_copy(update={'community': OTHER}),)), f'seeded.csv: no community {OTHER}'),
        (Rows(seeded=(ADDED.model_copy(update={'event_id': 2}),)), r'seeded.csv: no event 2 \(KUOF\)'),
        (
            Rows(seeded=(ADDED.model_copy(update={'artist_keys': ('p:nobody',)}),)),
            r'seeded.csv: unknown artist key p:nobody \(Tonje\)',
        ),
        # one row a key
        (Rows(found=(MANAGER, MANAGER)), 'communities.csv: a second row of key frost-lantern-river-maple'),
        (Rows(members=(MEMBER, MEMBER)), 'community_members.csv: a second row of community and person'),
        # one person a row, never a member's name
        (Rows(seeded=(ADDED, ADDED)), 'seeded.csv: Tonje twice for event 1'),
        (
            Rows(seeded=(ADDED.model_copy(update={'name': 'CÉDRIC'}),)),
            'seeded.csv: CÉDRIC is the name of a member of frost-lantern-river-maple',
        ),
        (Rows(trips=(TRIP.model_copy(update={'person': 'nobody'}),)), 'travel.csv: nobody is no member'),
        # someone the manager added has no identity to travel under: a travel of theirs names no member
        (Rows(seeded=(ADDED,), trips=(TRIP.model_copy(update={'person': 'Tonje'}),)), 'travel.csv: Tonje is no member'),
        (
            Rows(trips=(TRIP.model_copy(update={'event_id': 2}),)),
            'travel.csv: cedric has no plan for event 2 in plans.csv',
        ),
        (Rows(trips=(TRIP, TRIP)), 'travel.csv: a second travel of cedric to event 1'),
        (Rows(stays=(STAY.model_copy(update={'person': 'nobody'}),)), 'stays.csv: nobody is no member'),
        (Rows(stays=(STAY.model_copy(update={'event_id': 2}),)), 'stays.csv: cedric has no plan for event 2'),
        # the nights between the day they arrive and the day before they leave
        (
            Rows(trips=(TRIP,), stays=(STAY.model_copy(update={'first_night': dt.date(2026, 11, 18)}),)),
            'stays.csv: cedric stays at Scandic from the night of 2026-11-18, before they arrive on 2026-11-19T21:05',
        ),
        (
            Rows(trips=(TRIP,), stays=(STAY.model_copy(update={'last_night': dt.date(2026, 11, 23)}),)),
            'stays.csv: cedric stays at Scandic the night of 2026-11-23, though they leave on 2026-11-23T09:30',
        ),
        # two places on one night
        (
            Rows(stays=(STAY, STAY.model_copy(update={'first_night': dt.date(2026, 11, 22), 'place': 'Airbnb'}))),
            re.escape(
                'stays.csv: cedric stays at Airbnb (2026-11-22 to 2026-11-22, event 1) and at Scandic (2026-11-19 to'
                ' 2026-11-22, event 1) on the same night'
            ),
        ),
    ],
)
def test_a_community_naming_what_the_data_has_not_stops_the_build(
    memory: Memory, monkeypatch: pytest.MonkeyPatch, rows: Rows, said: str
) -> None:
    """A community of no one, a member or manager who is no one in people.csv (or a manager who is not a member),
    someone added to a festival the export has not, or as an artist it has not, a travel or a stay of anyone but a
    member or to a festival they don't plan, a second travel, and nights before they arrive, from the day they leave or
    at two places at once, stop the build, saying which."""

    def built_from_them() -> Db:
        return community_tables(memory)

    PlanRow.write([PlanRow(person='cedric', event_id=1, status=enums.Plan.GOING, event='KUOF')])
    Community.write([MANAGER])
    Membership.write([MEMBER])
    Seeded.write([ADDED])
    Travel.write([TRIP])
    StayRow.write([STAY])
    monkeypatch.setattr(build_site_db, 'today', lambda: dt.date(2026, 11, 1))
    made = built_from_them()
    assert made.value(int, 'select artist_id from seeded_artists') == 1
    assert made.value(str, 'select place from stays') == 'Scandic'
    assert made.value(str, 'select arrive from travel') == '2026-11-19T21:05'
    Community.write(rows.found)
    Membership.write(rows.members)
    Seeded.write(rows.seeded)
    Travel.write(rows.trips)
    StayRow.write(rows.stays)
    with pytest.raises(SystemExit, match=said):
        _ = built_from_them()


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = (tuple(map(math.radians, p)) for p in (a, b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def where(e: In, found: Mapping[tuple[str, str | None], Spot], to: list[Airport]) -> Where:
    """Where geocode.csv found the festival's city in its country, and the nearest airport within MAX_AIRPORT_KM."""
    spot = None if e.city is None else found.get((e.city, e.country))
    if spot is None:
        return Where(id=e.id, lat=None, lon=None, airport=None, airport_km=None)
    km, code = min((haversine_km((spot.lat, spot.lon), (a.lat, a.lon)), a.code) for a in to)
    near = km <= airports.MAX_AIRPORT_KM
    return Where(
        id=e.id, lat=spot.lat, lon=spot.lon, airport=code if near else None, airport_km=round(km) if near else None
    )


def test_a_festival_is_where_geocode_csv_puts_its_city_and_flies_to_the_nearest_airport(site_db: Path) -> None:
    """A festival is on the map where geocode.csv found its city in its country, and flies to the nearest airport of
    airports.csv within MAX_AIRPORT_KM; a city not found, or with no airport near enough, has none."""
    committed(Place.FILE, Airport.FILE)
    found = {(p.city, p.country): p.found for p in Place.read() if p.found}
    to = Airport.read()
    assert built(site_db, Airport, 'select code, name, city, country_code, lat, lon, home from airports') == set(to)
    expected = {where(e, found, to) for e in built(site_db, In, 'select id, city, country from events')}
    assert built(site_db, Where, 'select id, lat, lon, airport, airport_km from events') == expected
    # festivals of every kind: not on the map, on it with no airport near enough, flying to one
    assert {(w.lat is None, w.airport is None) for w in expected} == {(True, True), (False, True), (False, False)}


def test_a_fare_is_the_one_the_fare_history_gives_its_weekend_back_the_monday_after(site_db: Path) -> None:
    committed(fare_store.FOLDER, Place.FILE, Airport.FILE)  # the history, and where the festivals fly to
    with sqlite_db.opened(EXPORT, 'ro') as db:
        listed = db.rows(fare_weekends.Listed, fare_weekends.LISTED.format(events='events'), (enums.Listing.LISTED,))
    found = fare_weekends.current(fare_store.read(), fare_weekends.weekends_of(listed, today())).values()
    monday = dt.timedelta(days=3)  # out on the Friday, back on the Monday
    flights = 'select airport, depart, return as back, price, fetched_at, stops_out, stops_back, resold from fares'
    assert built(site_db, Flight, flights) == {
        Flight(
            airport=c.searched.airport,
            depart=c.searched.depart,
            back=c.searched.depart + monday,
            price=c.fare.offer.price,
            fetched_at=c.fare.search.at,
            stops_out=c.fare.offer.stops_out,
            stops_back=c.fare.offer.stops_back,
            resold=None,  # every fare kept is Google's
        )
        for c in found
        if c.fare is not None
    }
    searches = 'select airport, depart, searched_at, direct from fare_searches'
    assert built(site_db, Searched, searches) == {
        Searched(
            airport=c.searched.airport,
            depart=c.searched.depart,
            searched_at=c.searched.at,
            direct=fare_weekends.direct_found(c.searched),
        )
        for c in found
    }
    assert any(c.fare is None for c in found)  # a weekend searched with no price has a search and no fare
    transfers = 'select airport, depart, price, airlines from fare_transfers'
    assert built(site_db, Transfer, transfers) == {
        Transfer(
            airport=c.searched.airport,
            depart=c.searched.depart,
            price=c.transfer.offer.price,
            airlines=' and '.join(dict.fromkeys(c.transfer.offer.airlines)),
        )
        for c in found
        if c.transfer is not None
    }


# Glasgow: the festival Friday 6 to Monday 9 November, Christina leaving on the Monday at 19:10, Siân arriving on the
# Thursday and saying nothing of when she leaves
GLASGOW = 18964
GLASGOW_DAYS = (dt.date(2026, 11, 6), dt.date(2026, 11, 9))
TRIP_ENDS = Path(__file__).parent / 'trip-ends.json'


class Said(BaseModel, frozen=True):
    key: str
    arrive: str | None
    leave: str | None
    nights: dict[str, dt.date] | None


class EndCase(BaseModel, frozen=True):
    said: str
    festival: dict[str, dt.date]
    people: list[Said]
    ends: dict[str, dt.date]
    trip_end: dt.date


class EndCases(BaseModel, frozen=True):
    about: str
    cases: list[EndCase]


END_CASES = EndCases.model_validate_json(TRIP_ENDS.read_text()).cases


@pytest.mark.parametrize('case', END_CASES, ids=[c.said for c in END_CASES])
def test_a_trip_ends_as_the_site_draws_it(case: EndCase) -> None:
    """Each member's trip ends on the day they leave, or else the morning after their last night, and never before the
    festival's last day; a community's with its last member's: the cases the site's tests read too (trip-ends.json)."""
    trips = [
        Travel.model_validate(
            {
                'person': p.key,
                'event_id': 1,
                'arrive': p.arrive,
                'arrive_at': None,
                'leave': p.leave,
                'leave_from': None,
            }
        )
        for p in case.people
        if p.arrive is not None or p.leave is not None
    ]
    stays = [
        StayRow(person=p.key, event_id=1, first_night=p.nights['first'], last_night=p.nights['last'], place='Scandic')
        for p in case.people
        if p.nights is not None
    ]
    ends = build_site_db.trip_ends(trips, stays, {1: case.festival['end_date']})
    assert ends == {(p.key, 1): case.ends[p.key] for p in case.people}
    assert max(ends.values()) == case.trip_end


@pytest.mark.parametrize(
    ('day', 'kept'),
    [
        ('2026-11-04', True),  # before
        ('2026-11-06', True),  # during
        ('2026-11-09', True),  # its last day, Christina leaving in the evening
        ('2026-11-10', True),  # the day after it ends
        ('2026-11-12', True),  # three days after
        ('2026-11-13', False),  # four: gone
    ],
)
def test_a_trip_is_published_until_three_days_after_it_ends(day: str, kept: bool) -> None:
    """A trip's travel and stays are published until KEPT_DAYS days after it ends."""
    ends = {('christina', GLASGOW): GLASGOW_DAYS[1]}
    assert (('christina', GLASGOW) not in build_site_db.gone_by(ends, dt.date.fromisoformat(day))) is kept


def test_one_members_long_stay_keeps_no_one_elses_trip(memory: Memory, monkeypatch: pytest.MonkeyPatch) -> None:
    """Retention is each member's: cedric staying on a week keeps his rows, never another member's."""
    stay = STAY.model_copy(update={'first_night': dt.date(2026, 11, 19), 'last_night': dt.date(2026, 11, 28)})
    ends = build_site_db.trip_ends([TRIP.model_copy(update={'person': 'ana'})], [stay], {1: dt.date(2026, 11, 22)})
    assert ends == {('ana', 1): dt.date(2026, 11, 23), ('cedric', 1): dt.date(2026, 11, 29)}
    assert build_site_db.gone_by(ends, dt.date(2026, 11, 27)) == {('ana', 1)}


def test_a_row_naming_its_festival_otherwise_than_it_is_listed_is_said_and_kept(
    memory: Memory, capsys: pytest.CaptureFixture[str]
) -> None:
    """A row's event column names its festival by its title or as it is listed; named otherwise, the build says
    what to write in its place, once a festival however many rows name it so, then how many, and goes on."""
    PlanRow.write([PlanRow(person='cedric', event_id=1, status=enums.Plan.GOING, event='KUOF')])
    Community.write([MANAGER])
    Membership.write([MEMBER])
    Travel.write([])
    StayRow.write([])
    tonje = Seeded(community=KEY, name='Tonje', artist_keys=(), event_id=1, status=enums.Plan.GOING, event='KUOF')
    for named in ('KUOF', 'KUOF 2026'):
        Seeded.write([tonje.model_copy(update={'event': named})])
        _ = community_tables(memory)
        assert capsys.readouterr().err == ''
    Seeded.write([tonje.model_copy(update={'event': 'KUOF Oslo', 'name': name}) for name in ('Tonje', 'Maja')])
    made = community_tables(memory)
    assert made.value(int, 'select count(*) from community_seeded') == 2
    assert capsys.readouterr().err.splitlines() == [
        "warning: seeded.csv: event 1 is named 'KUOF Oslo', which is listed as 'KUOF 2026'; write that",
        'warning: seeded.csv names 1 of its festivals otherwise than they are listed',
    ]


def test_the_build_leaves_out_a_trip_ended_more_than_three_days_ago_and_warns_of_its_rows(
    memory: Memory, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """The trip to KUOF ends on the Monday cedric leaves: on the Thursday after, its rows are still published; on the
    Friday they are not, and the build says which rows to delete, each by what it says, then how many, and goes on."""
    PlanRow.write([PlanRow(person='cedric', event_id=1, status=enums.Plan.GOING, event='KUOF')])
    Community.write([MANAGER])
    Membership.write([MEMBER])
    Seeded.write([])
    Travel.write([TRIP])
    StayRow.write([STAY])
    monkeypatch.setattr(build_site_db, 'today', lambda: dt.date(2026, 11, 26))
    made = community_tables(memory)
    assert [made.value(int, 'select count(*) from travel'), made.value(int, 'select count(*) from stays')] == [1, 1]
    assert capsys.readouterr().err == ''
    monkeypatch.setattr(build_site_db, 'today', lambda: dt.date(2026, 11, 27))
    made = community_tables(memory)
    assert [made.value(int, 'select count(*) from travel'), made.value(int, 'select count(*) from stays')] == [0, 0]
    gone = 'for KUOF (event 1): the trip ended on 2026-11-23, more than 3 days ago, so the row is no longer published'
    assert capsys.readouterr().err.splitlines() == [
        f'warning: travel.csv: cedric, arriving 2026-11-19T21:05 and leaving 2026-11-23T09:30, {gone}; delete it',
        f'warning: stays.csv: cedric at Scandic, 2026-11-19 to 2026-11-22, {gone}; delete it',
        (
            'warning: 2 rows of trips that ended more than 3 days ago are no longer published; delete them from'
            ' travel.csv and stays.csv'
        ),
    ]


@pytest.mark.parametrize(
    ('trip', 'stay', 'said'),
    [
        # a flight landing at 00:30 after a first night booked the evening before: kept
        ({'arrive': '2026-11-20T00:30'}, {'first_night': dt.date(2026, 11, 19)}, None),
        # the same night before a flight landing at noon: refused
        (
            {'arrive': '2026-11-20T12:00'},
            {'first_night': dt.date(2026, 11, 19)},
            'before they arrive on 2026-11-20T12:00',
        ),
        # a day so far off it is a typo
        ({'leave': '2072-11-23T09:30'}, {}, 'travels on 2072-11-23T09:30, more than 7 days from KUOF'),
        ({}, {'last_night': dt.date(2026, 12, 5)}, 'stays the night of 2026-12-05, more than 7 days from KUOF'),
    ],
)
def test_nights_and_days_are_those_of_a_trip_to_the_festival(
    memory: Memory, monkeypatch: pytest.MonkeyPatch, trip: dict[str, object], stay: dict[str, object], said: str | None
) -> None:
    PlanRow.write([PlanRow(person='cedric', event_id=1, status=enums.Plan.GOING, event='KUOF')])
    Community.write([MANAGER])
    Membership.write([MEMBER])
    Seeded.write([])
    Travel.write([TRIP.model_copy(update=trip)])
    StayRow.write([STAY.model_copy(update=stay)])
    monkeypatch.setattr(build_site_db, 'today', lambda: dt.date(2026, 11, 1))
    if said is None:
        assert community_tables(memory).value(int, 'select count(*) from stays') == 1
    else:
        with pytest.raises(SystemExit, match=re.escape(said)):
            _ = community_tables(memory)


class Lives(BaseModel, frozen=True):
    key: str
    home: str | None
    lat: float | None
    lon: float | None


def test_a_persons_home_is_where_geocode_csv_puts_their_city(site_db: Path) -> None:
    """people.csv's home, the city someone lives in, is where geocode.csv puts it (homes), as the site's home city is;
    someone who has not said has none."""
    committed(Person.FILE, Place.FILE, Airport.FILE)
    at = {p.city: p.found for p in Place.read() if p.found}
    with sqlite_db.opened(site_db, 'ro') as db:
        lives = db.rows(Lives, 'select p.key, p.home, h.lat, h.lon from people p left join homes h on h.city = p.home')
        cities = set(db.column(str, 'select city from homes'))
    assert {r.key: r.home for r in lives} == {r.key: r.home for r in Person.read()}
    for r in lives:
        spot = None if r.home is None else at[r.home]
        assert (r.lat, r.lon) == ((None, None) if spot is None else (spot.lat, spot.lon))
    assert {a.city for a in Airport.read() if a.home} <= cities
    assert {r.home for r in lives if r.home} | {a.city for a in Airport.read() if a.home} == cities


HOME_AIRPORT = Airport(code='BGO', name='Bergen', city='Bergen', country_code='NO', lat=60.3, lon=5.2, home=True)
BERGEN = Place(city='Bergen', country='Norway', found=Spot(lat=60.39, lon=5.33, name='Bergen, Norway'))


@pytest.mark.parametrize(
    ('places', 'home', 'said'),
    [
        ((BERGEN,), 'Atlantis', "people.csv: Cédric's home, Atlantis, is not in geocode.csv"),
        # a city geocode.csv has, but did not find
        (
            (BERGEN, Place(city='Atlantis', country=None, found=None)),
            'Atlantis',
            "people.csv: Cédric's home, Atlantis, is not in geocode.csv",
        ),
        # one name, two places: which is meant is not known
        (
            (BERGEN, Place(city='Bergen', country='Netherlands', found=Spot(lat=52.6, lon=4.7, name='Bergen, NL'))),
            'Bergen',
            "people.csv: Cédric's home, Bergen, is in geocode.csv in more than one place: write its country too",
        ),
        # a city and a country geocode.csv has not together
        ((BERGEN,), 'Bergen, Sweden', "people.csv: Cédric's home, Bergen, Sweden, is not in geocode.csv"),
    ],
)
def test_a_home_geocode_csv_cannot_place_stops_the_build(
    memory: Memory, places: tuple[Place, ...], home: str, said: str
) -> None:
    Place.write(list(places))
    Airport.write([HOME_AIRPORT])
    cedric = Person(key='cedric', name='Cédric', artist_keys=(), featured=True, home=home, note='')
    db = memory()
    with db.transaction() as x:
        x.script(build_site_db.TABLES['homes'])
        with pytest.raises(SystemExit, match=re.escape(said)):
            build_site_db.homes(x, [cedric])


def test_a_home_with_its_country_is_where_geocode_csv_puts_it_there(memory: Memory) -> None:
    """One name in two places: its country says which."""
    Place.write([BERGEN, Place(city='Bergen', country='Netherlands', found=Spot(lat=52.6, lon=4.7, name='Bergen, NL'))])
    Airport.write([HOME_AIRPORT.model_copy(update={'city': 'Oslo'})])
    places = [*Place.read(), Place(city='Oslo', country='Norway', found=Spot(lat=59.9, lon=10.7, name='Oslo'))]
    Place.write(places)
    cedric = Person(key='cedric', name='Cédric', artist_keys=(), featured=True, home='Bergen, Netherlands', note='')
    db = memory()
    with db.transaction() as x:
        x.script(build_site_db.TABLES['homes'])
        build_site_db.homes(x, [cedric])
    assert db.value(float, "select lat from homes where city = 'Bergen, Netherlands'") == 52.6


@pytest.mark.parametrize(
    ('airports', 'said'),
    [
        ([], 'airports.csv: 0 airports marked home'),
        ([HOME_AIRPORT, HOME_AIRPORT.model_copy(update={'code': 'OSL'})], 'airports.csv: 2 airports marked home'),
    ],
)
def test_one_home_airport_or_the_build_stops(memory: Memory, airports: list[Airport], said: str) -> None:
    Place.write([BERGEN])
    Airport.write(airports)
    db = memory()
    with db.transaction() as x:
        x.script(build_site_db.TABLES['homes'])
        with pytest.raises(SystemExit, match=said):
            build_site_db.homes(x, [])


def test_a_home_left_empty_is_none_and_the_sites_home_city_is_always_placed(memory: Memory) -> None:
    Place.write([BERGEN])
    Airport.write([HOME_AIRPORT])
    sian = Person(key='sian', name='Siân', artist_keys=(), featured=True, home=None, note='')
    db = memory()
    with db.transaction() as x:
        x.script(build_site_db.TABLES['homes'])
        build_site_db.homes(x, [sian])
    assert db.value(str, 'select city from homes') == 'Bergen'
    assert db.value(float, 'select lat from homes') == 60.39


def test_a_second_person_of_one_key_stops_the_build(memory: Memory) -> None:
    Person.write([Person(key='cedric', name='Cédric', artist_keys=(), featured=True, home=None, note='')] * 2)
    PlanRow.write([])
    db = memory()
    with db.transaction() as x, pytest.raises(SystemExit, match=re.escape('people.csv: a second row of key cedric')):
        _ = build_site_db.plans(x, {})


def test_a_person_added_links_to_the_artist_record_booked(memory: Memory) -> None:
    """Someone added who is in a line-up as half of a couple is linked to the couple's record, which is booked, and
    not to their own (seeded_rows artist_id)."""
    db = memory()
    with db.transaction() as x:
        for table in ('community_seeded', 'seeded_artists'):
            x.script(build_site_db.TABLES[table])
        x.script(
            'create table event_artists (event_id integer, artist_id integer, role text, as_couple integer);'
            ' create table couple_members (couple_id integer, member_id integer);'
            ' create table events (id integer primary key); create table artists (id integer primary key);'
            ' create table communities (id integer primary key)'
        )
        x.execute('insert into events values (5)')
        x.execute('insert into artists values (10)')
        x.execute('insert into artists values (20)')
        x.execute('insert into communities values (1)')
        x.execute("insert into community_seeded values (1, 1, 'Tonje', 5, 'going')")
        x.execute('insert into seeded_artists values (1, 10)')  # Tonje's own record
        x.execute('insert into couple_members values (20, 10)')  # the couple she is in
        x.execute("insert into event_artists values (5, 20, 'teacher', null)")  # the couple teaches
        x.script(build_site_db.TABLES['seeded_rows'])
    assert db.value(int, 'select artist_id from seeded_rows') == 20
