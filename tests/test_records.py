"""A record writes what it read: a CSV file is the text its record writes, and its numbers read back as the same
values."""

import typing

import pytest
from pydantic import BaseModel

from pipeline import ROOT, records
from pipeline.enums import Role
from pipeline.records import CsvRow, number_text
from tests.exports import committed
from tests.repository import tracked


@pytest.mark.parametrize('value', [80.0, 80.5, 8.25, 12999.99, 129999.5, 1234567.0, 0.1 + 0.2])
def test_a_number_reads_back_as_itself(value: float) -> None:
    assert float(number_text(value)) == value


def test_every_csv_file_has_its_record() -> None:
    assert sorted(tracked('*.csv')) == sorted(r.FILE for r in CsvRow.records())


@pytest.mark.parametrize('record', CsvRow.records(), ids=[r.FILE for r in CsvRow.records()])
def test_a_csv_file_is_what_its_record_writes(record: type[CsvRow]) -> None:
    committed(record.FILE)
    rows = record.read()
    record.write(rows)
    assert record.path().read_bytes() == (ROOT / record.FILE).read_bytes()


def marked_fields(record: type[BaseModel], where: str = '') -> set[str]:
    """The paths of a record type's Verbatim texts, through the records it holds."""
    out: set[str] = set()
    for name, info in record.model_fields.items():
        here = f'{where}.{name}' if where else name
        if records.verbatim(info):
            out.add(here)
        args: tuple[object, ...] = (info.annotation, *typing.get_args(info.annotation))
        for a in (x for arg in args for x in (arg, *typing.get_args(arg))):
            if isinstance(a, type) and issubclass(a, BaseModel):
                out |= marked_fields(a, here)
    return out


def test_every_text_an_answer_copies_is_marked_verbatim() -> None:
    """The checker looks for a marked text in the festival's words (check_output.found_in); a copied text left
    unmarked would go unchecked, as genre_as_written and an artist's country and style once did."""
    assert marked_fields(records.Extracted) == {
        'artists.name_as_written',
        'artists.style',
        'artists.country',
        'artists.source_line',
        'features.quote',
    }
    assert marked_fields(records.RoomsGenres) == {
        'party_rooms.quote',
        'class_rooms.quote',
        'rooms.name_as_written',
        'rooms.quote',
        'genres.genre_as_written',
        'genres.quote',
    }
    assert marked_fields(records.Priced) == {'passes.label_quote', 'passes.tiers.quote', 'rule_quotes'}
    # a first read's are checked each against its own text, its tickets' or the description's (read_problems)
    assert marked_fields(records.FirstReadAnswer) == {'passes.label_quote', 'passes.tiers.date_quote', 'rule_quotes'}


def test_copied_finds_each_marked_text_by_its_path() -> None:
    artist = records.Artist(
        name_as_written='DJ Ana', role=Role.DJ, style=None, country='(PT)', source_line='DJ Ana (PT)'
    )
    found = records.copied(records.Extracted(event_id=1, artists=(artist,), features=()))
    assert found == [
        ('artists[0].name_as_written', 'DJ Ana'),
        ('artists[0].country', '(PT)'),
        ('artists[0].source_line', 'DJ Ana (PT)'),
    ]


AIRPORT = {
    'code': 'OSL',
    'name': 'Oslo',
    'city': 'Oslo',
    'country_code': 'NO',
    'lat': '60.2',
    'lon': '11.1',
    'home': '0',
}
FARE = {'airport': 'OSL', 'depart': '2026-11-06', 'price': '120', 'fetched_at': '2026-10-31T11:14:48+00:00'}
JOB = {'airport': 'OSL', 'depart': '2026-11-06', 'last_run': '2026-10-31T11:14:48+00:00'}
SUGGESTION = {
    'keep_key': 'p:ana@dj',
    'merge_key': 'p:ana@dance',
    'keep_name': 'DJ Ana',
    'merge_name': 'Ana',
    'keep_bookings': '2',
    'merge_bookings': '1',
    'keep_countries': 'PT',
    'merge_countries': 'PT',
    'countries': 'same',
    'calendar': 'shared circuit',
    'calendar_note': '',
    'similarity': '1.0',
    'score': '1.15',
    'reason': 'same name, different keys',
}
COMMUNITY = {'key': 'frost-lantern-river-maple', 'name': 'Norwegians in festivals', 'manager': 'cedric', 'note': ''}
TRIP = {
    'person': 'cedric',
    'event_id': '19033',
    'arrive': '2026-11-19T21:05',
    'arrive_at': 'OSL',
    'leave': '2026-11-23T09:30',
    'leave_from': '',
    'stay': 'Scandic Holberg',
}
SEEDED = {
    'community': 'frost-lantern-river-maple',
    'name': 'Tonje',
    'artist_keys': '',
    'event_id': '19033',
    'status': 'going',
    'event': 'KUOF 2026 – Kizomba & Urban Kiz Oslo Festival',
}


@pytest.mark.parametrize(
    ('record', 'row', 'column', 'value'),
    [
        (records.Airport, AIRPORT, 'code', 'osl'),
        (records.Airport, AIRPORT, 'country_code', 'XX'),
        (records.Fare, FARE, 'airport', 'OSLO'),
        (records.Job, JOB, 'airport', 'Os'),
        (records.Suggestion, SUGGESTION, 'keep_key', 'ana'),
        (records.Suggestion, SUGGESTION, 'merge_key', 'p:ana dj'),
        (records.Community, COMMUNITY, 'key', 'frost-lantern'),
        (records.Trip, TRIP, 'arrive_at', 'osl'),
        (records.Trip, TRIP, 'arrive', '2026-11-19 21:05'),
        (records.Trip, TRIP, 'arrive', '2026-02-30T21:05'),
        (records.Trip, TRIP, 'arrive', '2026-11-24T08:00'),  # after it leaves
        (records.Trip, TRIP, 'stay', 'https://scandic.no/holberg'),
        (records.Trip, TRIP, 'stay', '@scandic'),
        (records.Trip, TRIP, 'stay', 'ana@example.com'),
        *(
            (records.Seeded, SEEDED, 'name', reach)
            for reach in (
                'https://instagram.com/tonje',
                'http://tonje.no',
                'www.tonje.no',
                'tonje.no',
                '@tonje',
                'tonje@example.com',
            )
        ),
    ],
)
def test_a_csv_row_refuses_a_value_outside_its_column(
    record: type[CsvRow], row: dict[str, str], column: str, value: str
) -> None:
    """An airport is its IATA code, a country one countries.NAMES has, an artist the key a mention gives, a community
    four words, a trip's times real ones to the minute, arriving before it leaves, at an airport's code. A name a
    manager writes for someone who has not joined, and where a member stays, is a name, never a link, an @handle or an
    email address, which would reach someone and only they may give (the communities' rule 2). A hand edit that is none
    is refused where the audit reads the file, not later by the step that uses it."""
    record.model_validate(record.cells(row))
    with pytest.raises(ValueError, match=column):
        record.model_validate(record.cells(row | {column: value}))


@pytest.mark.parametrize('name', ['Tonje', 'Ana-Maria', 'Mary J. Blige', 'Ole Kristian', 'Siân'])
def test_a_name_a_manager_adds_may_be_any_plain_name(name: str) -> None:
    assert records.Seeded.model_validate(records.Seeded.cells(SEEDED | {'name': name})).name == name
