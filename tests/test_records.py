"""A record writes what it read: a CSV file is the text its record writes, and its numbers read back as the same
values."""

import subprocess

import pytest

from pipeline import ROOT
from pipeline.records import CsvRow, number_text
from tests.exports import committed


@pytest.mark.parametrize('value', [80.0, 80.5, 8.25, 12999.99, 129999.5, 1234567.0, 0.1 + 0.2])
def test_a_number_reads_back_as_itself(value: float) -> None:
    assert float(number_text(value)) == value


def test_every_csv_file_has_its_record() -> None:
    tracked = subprocess.run(['git', 'ls-files', '*.csv'], cwd=ROOT, capture_output=True, text=True, check=True)  # noqa: S607 (git, from PATH)
    assert sorted(tracked.stdout.split()) == sorted(r.FILE for r in CsvRow.records())


@pytest.mark.parametrize('record', CsvRow.records(), ids=[r.FILE for r in CsvRow.records()])
def test_a_csv_file_is_what_its_record_writes(record: type[CsvRow]) -> None:
    committed(record.FILE)
    rows = record.read()
    record.write(rows)
    assert record.path().read_bytes() == (ROOT / record.FILE).read_bytes()
