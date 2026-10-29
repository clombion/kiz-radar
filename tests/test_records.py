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
