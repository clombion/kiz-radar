"""The fare history: every fare search and the offers it saw (records.Search), each run's in a Parquet file of its own
under pipeline/fare_offers/, named by when the run began. A run writes its file whole after each search (a run stopped
half way keeps what it found, and its file holds each search with its offers or not at all); once the run is over, its
file is never written again, so the history only grows, and two runs never touch one file.

The files' columns are the record's fields (SCHEMA, from records.Search), compressed with zstd, and they are read as
one dataset with that schema: a column an older file lacks reads as empty, and its field takes its default. The audit
reads each file through the record (refused).
"""

import datetime as dt
import io
import types
import typing
from collections.abc import Iterable, Mapping
from enum import Enum
from pathlib import Path
from typing import Annotated, get_args, get_origin

import pyarrow as pa
import pyarrow.dataset as pds
import pyarrow.parquet as pq
from pydantic import BaseModel, ValidationError
from pydantic.fields import FieldInfo

from pipeline import data, files
from pipeline.records import Search, errors

FOLDER = 'pipeline/fare_offers'
SCALARS: Mapping[type, pa.DataType] = {
    str: pa.string(),
    int: pa.int64(),
    float: pa.float64(),
    bool: pa.bool_(),
    dt.date: pa.date32(),
    dt.datetime: pa.timestamp('s', tz='UTC'),
}


def arrow_type(annotation: object) -> tuple[pa.DataType, bool]:
    """A field's type as a column's, and whether it may be empty: a record a struct of its fields, a tuple a list, an
    enum its key's text."""
    args: tuple[object, ...] = get_args(annotation)
    if get_origin(annotation) is Annotated:
        return arrow_type(args[0])
    if get_origin(annotation) in {types.UnionType, typing.Union}:
        (one,) = [a for a in args if a is not type(None)]
        return arrow_type(one)[0], True
    if get_origin(annotation) is tuple:
        return pa.list_(arrow_type(args[0])[0]), False
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return pa.struct(fields_of(annotation.model_fields)), False
    if isinstance(annotation, type) and issubclass(annotation, Enum):
        return pa.string(), False
    if isinstance(annotation, type) and annotation in SCALARS:
        return SCALARS[annotation], False
    raise TypeError(f'{annotation!r} has no column type in fare_store.SCALARS')


def fields_of(fields: Mapping[str, FieldInfo]) -> list[pa.Field]:
    out: list[pa.Field] = []
    for name, info in fields.items():
        kind, empty = arrow_type(info.annotation)
        out.append(pa.field(name, kind, nullable=empty or not info.is_required()))
    return out


SCHEMA = pa.schema(fields_of(Search.model_fields))  # a file's columns


def cells(value: object) -> object:
    """A record's values as its columns hold them: a record's fields by name, a tuple a list, an enum its key, a day
    and a time as they are (a record's own dump writes them as text)."""
    if isinstance(value, BaseModel):
        return {name: cells(typing.cast('object', getattr(value, name))) for name in type(value).model_fields}
    if isinstance(value, tuple):
        return [cells(v) for v in typing.cast('tuple[object, ...]', value)]
    if isinstance(value, Enum):
        return typing.cast('object', value.value)
    return value


def run_file(at: dt.datetime) -> Path:
    """The file of the run that began at this time."""
    return data(FOLDER) / f'{at:%Y-%m-%dT%H%M%SZ}.parquet'


def write(path: Path, searches: Iterable[Search]) -> None:
    """The run's file with these searches, whole or as it was (pipeline/files.py)."""
    table = pa.Table.from_pylist([typing.cast('dict[str, object]', cells(s)) for s in searches], schema=SCHEMA)
    out = io.BytesIO()
    pq.write_table(table, out, compression='zstd')
    files.write(path, out.getvalue())


def kept() -> list[Path]:
    return sorted(data(FOLDER).glob('*.parquet'))


def rows(paths: list[Path]) -> list[dict[str, object]]:
    """Each search of these files as its columns, by the schema of today."""
    if not paths:
        return []
    return pds.dataset(paths, schema=SCHEMA, format='parquet').to_table().to_pylist()


def parsed(row: Mapping[str, object]) -> Search:
    """A file's row as its record: an empty column of a field with a default (one an older file lacks) takes it."""
    fields = Search.model_fields
    return Search.model_validate(
        {k: v for k, v in row.items() if v is not None or fields[k].is_required()}, strict=False
    )


def read() -> list[Search]:
    """Every search kept, in the order they were made: by time, those of one second as their files hold them."""
    return sorted((parsed(r) for r in rows(kept())), key=lambda s: s.at)


def refused() -> list[str]:
    """Each value of the files the record refuses, by file and row."""
    out: list[str] = []
    for path in kept():
        for n, row in enumerate(rows([path]), 1):
            try:
                _ = parsed(row)
            except ValidationError as e:
                out += errors(e, f'{FOLDER}/{path.name} row {n}')
    return out
