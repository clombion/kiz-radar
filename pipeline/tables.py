"""Reading the pipeline's CSV files: each row as {column: text}, by its header."""

import csv
from pathlib import Path


def rows(path: Path) -> list[dict[str, str]]:
    """The file's rows, each by its header's columns. Every file is committed with its header, so a missing one is an
    error, not an empty file."""
    with path.open(encoding='utf-8', newline='') as f:
        lines = list(csv.reader(f))
    if not lines:
        return []
    return [dict(zip(lines[0], row, strict=True)) for row in lines[1:]]
