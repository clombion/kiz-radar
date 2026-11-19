"""Kiz Radar's pipeline, from the kizomba-world export to the site's database (docs/concepts/data-flow.md). ROOT is
the repository's folder, where the code is; DATA is the folder the steps read their data from and write it to, the
repository's own unless a test points it elsewhere, so every data path goes through data() at the time it is used."""

from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT


def data(path: str) -> Path:
    """A data file or folder, by its path from the data folder."""
    return DATA / path
