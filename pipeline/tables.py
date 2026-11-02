"""Reading the pipeline's CSV files: each row as {column: text}, by its header."""

import csv
from pathlib import Path


class ShapeError(ValueError):
    """A CSV file whose header or rows are not as its record writes them."""


def rows(path: Path) -> list[dict[str, str]]:
    """The file's rows, each by its header's columns. Every file is committed with its header, so a missing one is an
    error, not an empty file; ShapeError names a row with more or fewer cells than the header has columns."""
    lines = table(path)
    if not lines:
        return []
    header, *body = lines
    for n, row in enumerate(body, 2):
        if len(row) != len(header):
            raise ShapeError(f'{path.name} line {n}: {len(row)} cells, where its header has {len(header)} columns')
    return [dict(zip(header, row, strict=True)) for row in body]


def header(path: Path) -> list[str]:
    """The file's header: its columns, none for an empty file; only its first line is read."""
    with path.open(encoding='utf-8', newline='') as f:
        return next(csv.reader(f), list[str]())


def table(path: Path) -> list[list[str]]:
    with path.open(encoding='utf-8', newline='') as f:
        return list(csv.reader(f))
