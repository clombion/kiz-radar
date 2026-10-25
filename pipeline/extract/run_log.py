"""Record how the events database was produced, as rows of pipeline_steps inside the database itself.

One row per step (the latest run of that step replaces the earlier one): what was done, when, by whom
(a script, a model, or the human reviewer), with which model and prompt version, from which inputs to
which outputs, and the step's key numbers as JSON. Every pipeline script records its own step.
"""

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent

SCHEMA = """
CREATE TABLE IF NOT EXISTS prompts (
    version TEXT PRIMARY KEY,     -- as named in pipeline_steps.prompt_version and in the rows the prompt produced
    file TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    text TEXT NOT NULL
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
    prompt_version TEXT,
    inputs TEXT,
    outputs TEXT,
    details TEXT                  -- JSON: the step's key numbers and settings
);
"""


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def record(con: sqlite3.Connection, step: str, description: str, performed_by: str, *, performed_at: str | None = None,
           model: str | None = None, prompt_version: str | None = None, inputs: str | None = None,
           outputs: str | None = None, details: dict | None = None) -> None:
    con.executescript(SCHEMA)
    con.execute(
        "INSERT OR REPLACE INTO pipeline_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (step, description, performed_at or now(), performed_by, model, prompt_version, inputs, outputs,
         json.dumps(details, ensure_ascii=False) if details is not None else None),
    )
    con.commit()


def record_prompt(con: sqlite3.Connection, version: str, path: Path) -> None:
    """Store a prompt's full text, so the database says exactly what each model was told."""
    con.executescript(SCHEMA)
    text = path.read_text()
    con.execute("INSERT OR REPLACE INTO prompts VALUES (?, ?, ?, ?)",
                (version, str(path.relative_to(ROOT)), hashlib.sha256(text.encode()).hexdigest(), text))
    con.commit()


OWN_DOCS = {
    "pipeline_steps": "How this database was produced: one row per step (scrape, images, extraction passes, rules, merge "
                      "review, artist resolution, human review) with when, by whom, model, prompt version, inputs, "
                      "outputs and key numbers as JSON. Read in step order.",
    "prompts": "The full text of every prompt a model ran with, keyed by the version named in pipeline_steps and in the "
               "rows it produced (prompt_version columns).",
    "table_docs": "This table: what each table and view holds and how they connect.",
}


def document(con: sqlite3.Connection, docs: dict[str, str], written_by: str) -> None:
    """Describe the tables and views a script creates; every script documents its own."""
    con.executescript(SCHEMA)
    kinds = dict(con.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')"))
    for name, description in {**docs, **OWN_DOCS}.items():
        if name not in kinds:
            raise ValueError(f"table_docs: {name} is not a table or view in this database")
        by = written_by if name in docs else "pipeline/extract/run_log.py"
        con.execute("INSERT OR REPLACE INTO table_docs VALUES (?, ?, ?, ?)", (name, kinds[name], description, by))
    con.commit()
