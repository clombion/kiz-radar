"""Opening the pipeline's SQLite databases. Every connection names what it may do with the file: read it (ro), write
it (rw), or create it (rwc); only a step that builds a database may create one, so a wrong path is an error, never a
new empty database. source_arg() is the command-line argument for the kizomba-world export a step works on."""

import argparse
import sqlite3
from pathlib import Path


def connect(path, mode):
    if mode not in ('ro', 'rw', 'rwc'):
        raise ValueError(f'mode {mode!r}: ro, rw or rwc')
    return sqlite3.connect(f'file:{Path(path).resolve()}?mode={mode}', uri=True)


def existing(text):
    if not Path(text).is_file():
        raise argparse.ArgumentTypeError(f'{text}: no such file')
    return Path(text)


def festival_ids(text):
    """Festival ids written "16909,18806", as a set."""
    try:
        return {int(i) for i in text.split(',') if i.strip()}
    except ValueError:
        raise argparse.ArgumentTypeError(f'{text}: festival ids, separated by commas')


def source_arg(ap):
    ap.add_argument('src', type=existing, help='the kizomba-world export (source/<events>.sqlite)')
