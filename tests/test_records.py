"""A record writes what it read: a CSV file is the text its record writes, and its numbers read back as the same
values."""

import subprocess
from pathlib import Path

import pytest

from pipeline import ROOT, audit
from pipeline.records import CsvRow, number_text


@pytest.mark.parametrize('value', [80.0, 80.5, 8.25, 12999.99, 129999.5, 1234567.0, 0.1 + 0.2])
def test_a_number_reads_back_as_itself(value: float) -> None:
    assert float(number_text(value)) == value


def test_every_csv_file_has_its_record() -> None:
    tracked = subprocess.run(['git', 'ls-files', '*.csv'], cwd=ROOT, capture_output=True, text=True, check=True)  # noqa: S607 (git, from PATH)
    assert sorted(tracked.stdout.split()) == sorted(audit.FILES)


@pytest.mark.parametrize(('file', 'record'), audit.FILES.items())
def test_a_csv_file_is_what_its_record_writes(tmp_path: Path, file: str, record: type[CsvRow]) -> None:
    out = tmp_path / 'out.csv'
    record.write(out, record.read(ROOT / file))
    assert out.read_bytes() == (ROOT / file).read_bytes()
