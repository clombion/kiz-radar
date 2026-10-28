"""Record how the events database was produced, as rows of pipeline_steps inside the database itself.

One row per step (the latest run of that step replaces the earlier one): what was done, when, by whom
(a script, a model, or the human reviewer), with which model and prompts (their hashes, pipeline/prompt.py), from
which inputs to which outputs, and the step's key numbers as JSON. Every pipeline script records its own step.
These functions only write, into the export's tables (KEPT, which tests/test_steps.py holds the export to), in the
caller's transaction, which commits once its step is whole.
"""

import datetime as dt
import json
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import BaseModel

from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline.db import Transaction
from pipeline.records import now

KEPT = sqlite_db.declared("""
CREATE TABLE prompts (
    prompt TEXT PRIMARY KEY,      -- its hash, as pipeline_steps.prompt and the rows the prompt produced name it
    text TEXT NOT NULL            -- pipeline/prompts/asked/<prompt>.md
);
CREATE TABLE table_docs (
    name TEXT PRIMARY KEY,        -- a table or view in this database
    kind TEXT NOT NULL,
    description TEXT NOT NULL,
    written_by TEXT NOT NULL      -- the script that creates the table and keeps this description
);
CREATE TABLE pipeline_steps (
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
""")


@dataclass(frozen=True)
class Step:
    """A step's row of pipeline_steps (KEPT): what it did, by whom, when (now when not given), with which model and
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


def record(con: Transaction, s: Step) -> None:
    con.upsert(
        'pipeline_steps',
        ['step'],
        {
            'step': s.step,
            'description': s.description,
            'performed_at': s.performed_at or now(),
            'performed_by': s.performed_by,
            'model': s.model,
            'prompt': s.prompt,
            'inputs': s.inputs,
            'outputs': s.outputs,
            'details': json.dumps(s.details, ensure_ascii=False) if s.details is not None else None,
        },
    )


def forget(con: Transaction, step: str) -> None:
    """Remove a step's row: what it produced is no longer in the database."""
    con.execute('DELETE FROM pipeline_steps WHERE step = ?', (step,))


def record_prompt(con: Transaction, hash_: str) -> None:
    """Store a prompt's full text, so the database says exactly what each model was told."""
    con.upsert('prompts', ['prompt'], {'prompt': hash_, 'text': prompts.asked(hash_)})


OWN_DOCS = {
    'pipeline_steps': 'How this database was produced: one row per step (scrape, images, extraction passes, rules, '
    'merge '
    'review, artist resolution, human review) with when, by whom, model, prompts, inputs, '
    'outputs and key numbers as JSON. Read in step order.',
    'prompts': 'The full text of every prompt a model ran with, keyed by its hash, as pipeline_steps and the rows it '
    'produced (prompt columns) name it.',
    'table_docs': 'This table: what each table and view holds and how they connect.',
}


class Made(BaseModel):
    name: str
    type: str


def document(con: Transaction, docs: dict[str, str], written_by: str) -> None:
    """Describe the tables and views a script creates, and only those; every script documents its own."""
    kinds = {
        m.name: m.type for m in con.rows(Made, "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')")
    }
    for name, description in {**docs, **OWN_DOCS}.items():
        if name not in kinds:
            raise ValueError(f'table_docs: {name} is not a table or view in this database')
        by = written_by if name in docs else 'pipeline/extract/run_log.py'
        con.upsert(
            'table_docs', ['name'], {'name': name, 'kind': kinds[name], 'description': description, 'written_by': by}
        )
    # a table the script no longer creates leaves with its description
    con.execute(
        'DELETE FROM table_docs WHERE written_by = ? AND name NOT IN (SELECT value FROM json_each(?))',
        (written_by, json.dumps(list(docs))),
    )
