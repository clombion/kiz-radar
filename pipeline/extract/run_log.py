"""Record how the events database was produced, as rows of pipeline_steps inside the database itself.

One row per step (the latest run of that step replaces the earlier one): what was done, when, by whom
(a script, a model, or the human reviewer), with which model and prompts (their hashes, pipeline/prompt.py), from
which inputs to which outputs, and the step's key numbers as JSON. Every pipeline script records its own step.
These functions only write: the caller owns the transaction, and commits once its step is whole.
"""

import datetime as dt
import json
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from pipeline import prompt as prompts
from pipeline.records import now

HERE = Path(__file__).parent
ROOT = HERE.parent.parent

SCHEMA = """
CREATE TABLE IF NOT EXISTS prompts (
    prompt TEXT PRIMARY KEY,      -- its hash, as pipeline_steps.prompt and the rows the prompt produced name it
    text TEXT NOT NULL            -- pipeline/prompts/asked/<prompt>.md
);
CREATE TABLE IF NOT EXISTS table_docs (
    name TEXT PRIMARY KEY,        -- a table or view in this database
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    written_by TEXT NOT NULL      -- the script that creates the table and keeps this description
);
CREATE TABLE IF NOT EXISTS pipeline_steps (
    step TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    performed_at TEXT NOT NULL,   -- ISO 8601, UTC; for a step spread over time, when it finished
    performed_by TEXT NOT NULL,   -- the script, the model, or 'human reviewer'
    model TEXT,
    prompt TEXT,                  -- the prompts' hashes, separated by commas
    inputs TEXT,
    outputs TEXT,
    details TEXT                  -- JSON: the step's key numbers and settings
);
"""


def ensure(con: sqlite3.Connection) -> None:
    """Create the log's tables when they are missing, inside the caller's transaction (one statement at a time, since
    a script would commit it)."""
    part = ''
    for piece in SCHEMA.split(';'):
        part += piece + ';'
        if sqlite3.complete_statement(part):  # a ; in a comment ends no statement
            if part.strip(' \n;'):
                con.execute(part)
            part = ''


@dataclass(frozen=True)
class Step:
    """A step's row of pipeline_steps (SCHEMA): what it did, by whom, when (now when not given), with which model and
    prompts, from which inputs to which outputs, and its key numbers."""

    step: str
    description: str
    performed_by: str
    performed_at: dt.datetime | None = None
    model: str | None = None
    prompt: str | None = None
    inputs: str | None = None
    outputs: str | None = None
    details: Mapping[str, object] | None = None


def record(con: sqlite3.Connection, s: Step) -> None:
    ensure(con)
    _ = con.execute(
        'INSERT OR REPLACE INTO pipeline_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (
            s.step,
            s.description,
            s.performed_at or now(),
            s.performed_by,
            s.model,
            s.prompt,
            s.inputs,
            s.outputs,
            json.dumps(s.details, ensure_ascii=False) if s.details is not None else None,
        ),
    )


def forget(con: sqlite3.Connection, step: str) -> None:
    """Remove a step's row: what it produced is no longer in the database."""
    ensure(con)
    con.execute('DELETE FROM pipeline_steps WHERE step = ?', (step,))


def record_prompt(con: sqlite3.Connection, hash_: str) -> None:
    """Store a prompt's full text, so the database says exactly what each model was told."""
    ensure(con)
    con.execute('INSERT OR REPLACE INTO prompts VALUES (?, ?)', (hash_, prompts.asked(hash_)))


OWN_DOCS = {
    'pipeline_steps': 'How this database was produced: one row per step (scrape, images, extraction passes, rules, '
    'merge '
    'review, artist resolution, human review) with when, by whom, model, prompts, inputs, '
    'outputs and key numbers as JSON. Read in step order.',
    'prompts': 'The full text of every prompt a model ran with, keyed by its hash, as pipeline_steps and the rows it '
    'produced (prompt columns) name it.',
    'table_docs': 'This table: what each table and view holds and how they connect.',
}


def document(con: sqlite3.Connection, docs: dict[str, str], written_by: str) -> None:
    """Describe the tables and views a script creates, and only those; every script documents its own."""
    ensure(con)
    kinds = dict(con.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')"))
    for name, description in {**docs, **OWN_DOCS}.items():
        if name not in kinds:
            raise ValueError(f'table_docs: {name} is not a table or view in this database')
        by = written_by if name in docs else 'pipeline/extract/run_log.py'
        con.execute('INSERT OR REPLACE INTO table_docs VALUES (?, ?, ?, ?)', (name, kinds[name], description, by))
    # a table the script no longer creates leaves with its description
    con.execute(
        'DELETE FROM table_docs WHERE written_by = ? AND name NOT IN (SELECT value FROM json_each(?))',
        (written_by, json.dumps(list(docs))),
    )
