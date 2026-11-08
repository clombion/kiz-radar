"""The fare history: each run's searches in a Parquet file of its own, read back as the records they were, whatever
columns a file has."""

import datetime as dt
import io
import typing

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from pydantic import ValidationError

from pipeline import audit, fare_store, files
from pipeline.enums import FareMode, FareOutcome, FareTicket, FareVendor
from pipeline.records import CsvRow, Offer, Search, digest
from tests.exports import committed

AT = dt.datetime(2026, 11, 8, 5, 41, tzinfo=dt.UTC)
FRIDAY = dt.date(2026, 12, 11)
OFFER = Offer(price=221.0, ticket=FareTicket.ONE_TICKET, stops_out=1, stops_back=None, airlines=('KLM', 'KLM'))


def search(airport: str, outcome: FareOutcome = FareOutcome.OFFERS, **fields: object) -> Search:
    offers = (OFFER,) if outcome == FareOutcome.OFFERS else ()
    return Search.model_validate(
        {
            'id': digest(airport),
            'at': AT,
            'origin': 'BGO',
            'airport': airport,
            'depart': FRIDAY,
            'mode': FareMode.ANY,
            'vendor': FareVendor.GOOGLE,
            'outcome': outcome,
            'offers': offers,
        }
        | fields
    )


def columns(s: Search) -> dict[str, object]:
    return typing.cast('dict[str, object]', fare_store.cells(s))


def raw(name: str, rows: list[dict[str, object]], schema: pa.Schema) -> None:
    """A file of the history as another version of the code wrote it: these rows, by this schema."""
    out = io.BytesIO()
    pq.write_table(pa.Table.from_pylist(rows, schema=schema), out, compression='zstd')
    files.write(fare_store.data(fare_store.FOLDER) / name, out.getvalue())


def test_a_run_s_searches_are_read_back_as_they_were() -> None:
    kept = [
        search('LIS'),
        search('ABZ', FareOutcome.LISTED, mode=FareMode.DIRECT),
        search('GLA', FareOutcome.FAILED, note='Google refused the search (HTTP 429)'),
    ]
    fare_store.write(fare_store.run_file(AT), kept)
    assert fare_store.read() == kept
    assert [p.name for p in fare_store.kept()] == ['2026-11-08T054100Z.parquet']
    assert fare_store.refused() == []


def test_a_run_begun_in_the_same_second_as_another_writes_a_file_of_its_own() -> None:
    first = fare_store.run_file(AT)
    fare_store.write(first, [search('LIS')])
    second = fare_store.run_file(AT)
    fare_store.write(second, [search('OSL')])
    assert (first.name, second.name) == ('2026-11-08T054100Z.parquet', '2026-11-08T054100Z-2.parquet')
    assert {s.airport for s in fare_store.read()} == {'LIS', 'OSL'}


def test_the_runs_are_read_as_one_history_in_the_order_searched() -> None:
    later = AT + dt.timedelta(days=1)
    fare_store.write(fare_store.run_file(later), [search('OSL', at=later)])
    fare_store.write(fare_store.run_file(AT), [search('LIS')])
    assert [s.airport for s in fare_store.read()] == ['LIS', 'OSL']


def test_a_column_an_older_file_lacks_reads_as_its_field_s_default() -> None:
    older = pa.schema([f for f in fare_store.SCHEMA if f.name not in {'note', 'backfill', 'offers'}])
    none = search('LIS', FareOutcome.NONE)
    raw('older.parquet', [{k: v for k, v in columns(none).items() if k in older.names}], older)
    assert fare_store.read() == [none]


@pytest.mark.parametrize(
    ('outcome', 'offers', 'note'),
    [
        (FareOutcome.OFFERS, (), None),
        (FareOutcome.NONE, (OFFER,), None),
        (FareOutcome.FAILED, (), None),
    ],
    ids=['offers with none', 'no price with an offer', 'failed with no reason'],
)
def test_a_search_s_offers_are_its_outcome_s(outcome: FareOutcome, offers: tuple[Offer, ...], note: str | None) -> None:
    with pytest.raises(ValidationError):
        _ = search('LIS', outcome, offers=offers, note=note)


def test_the_audit_names_a_search_its_record_refuses() -> None:
    committed(*(r.FILE for r in CsvRow.records()))
    fare_store.write(fare_store.run_file(AT), [search('LIS')])
    raw('bad.parquet', [columns(search('LIS')) | {'outcome': 'cheap'}], fare_store.SCHEMA)
    found = audit.refused(set())
    assert [line.split(': ')[:2] for line in found] == [['pipeline/fare_offers/bad.parquet row 1', 'outcome']]
