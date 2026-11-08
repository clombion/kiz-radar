from io import BytesIO
from typing import Literal

from pyarrow import Table

def write_table(table: Table, where: BytesIO, *, compression: Literal['zstd']) -> None: ...
