from collections.abc import Sequence
from pathlib import Path
from typing import Literal

from pyarrow import Schema, Table

class Dataset:
    def to_table(self) -> Table: ...

def dataset(source: Sequence[Path], *, schema: Schema, format: Literal['parquet']) -> Dataset: ...
