"""The site database's derived tables against what they are derived from: each count the build computes in Python
(pipeline/build_site_db.py) is computed again here in SQL from the tables it reads, and the two must agree row for
row. A derivation that drops a role, counts a couple's booking for its members or a cancelled festival in a country
shows here as the rows on one side only."""

import json
from pathlib import Path

import pytest

from pipeline import build_site_db, enums
from pipeline import db as sqlite_db

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
