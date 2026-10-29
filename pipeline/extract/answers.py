"""The saved answers of the extraction passes: answers/<pass>/*.json, and answers/log.csv saying who answered
each file, with which model and prompt, and when.

An answer file is one pass's answer for some festivals (records.Batch of the pass's entries). The first answers came
in batches written by Claude Code subagents (<pass>-NNN.json); later ones come one festival at a time from ask.py
(event-<id>.json). A festival's own file replaces its entry in a batch. A file's prompt is the hash of the prompt it
answered (pipeline/prompt.py), archived when the file is saved. An answer to another prompt than the current one may
follow another shape, so only an answer to the current prompt is read as its pass's record (current); of the others,
only which festivals they answer (answered).
"""

from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from pipeline import data, files
from pipeline import prompt as prompts
from pipeline.enums import Model
from pipeline.prompt import Pass, Prompt
from pipeline.records import ANSWERS, Asked, Batch, Entry, Logged, now


class ListedEntry(BaseModel):
    model_config = ConfigDict(strict=True, extra='ignore', frozen=True)

    event_id: int


class Listed(BaseModel):
    """The festivals an answer file is of, whatever else it holds."""

    model_config = ConfigDict(extra='ignore', frozen=True)

    events: tuple[ListedEntry, ...]


@dataclass(frozen=True)
class Answer[E: Entry]:
    """A festival's answer to the current prompt of a pass: its entry, and the file's batch and log row."""

    entry: E
    batch: str
    logged: Logged


def log() -> dict[str, Logged]:
    return {r.file: r for r in Logged.read()}


def unlogged() -> list[Path]:
    """Answer files the log has no row for: saved by a run stopped before it logged them; no answer of anything, so
    asked again, and named by the audit."""
    known = log()
    return [p for p in sorted(data(ANSWERS).glob('*/*.json')) if str(p.relative_to(data(ANSWERS))) not in known]


def answer_files(pass_name: str) -> list[Path]:
    """The pass's answer files, batches first, so a festival's own file is read after the batch that had it."""
    folder = data(ANSWERS) / pass_name
    return sorted(folder.glob('*.json'), key=lambda p: (p.name.startswith('event-'), p.name))


def answered(pass_name: str, event_ids: set[int]) -> dict[int, tuple[Path, Logged]]:
    """The file of the newest answer for each of these festivals, and its log row, in the order they were read."""
    known: dict[str, Logged] = log()
    out: dict[int, tuple[Path, Logged]] = {}
    for path in answer_files(pass_name):
        if (meta := known.get(str(path.relative_to(data(ANSWERS))))) is None:
            continue  # unlogged: no answer yet
        for entry in Listed.model_validate_json(path.read_bytes()).events:
            if entry.event_id in event_ids:
                _ = out.pop(entry.event_id, None)  # a newer answer moves to the end
                out[entry.event_id] = path, meta
    return out


def current[E: Entry, Q: Asked](pass_: Pass[E, Q], event_ids: set[int]) -> dict[int, Answer[E]]:
    """The newest answer for each of these festivals that is to the pass's current prompt, as its record."""
    read: dict[Path, Batch[E]] = {}
    out: dict[int, Answer[E]] = {}
    for i, (path, meta) in answered(pass_.name, event_ids).items():
        if not prompts.is_current(pass_.name, meta.prompt):
            continue
        if path not in read:
            read[path] = prompts.answer(pass_).parse(path.read_bytes())
        batch = read[path]
        out[i] = Answer(next(e for e in batch.events if e.event_id == i), batch.batch, meta)
    return out


def save[E: Entry](pass_name: str, output: Batch[E], model: Model, prompt: Prompt, answered_by: str) -> Path:
    """Save one festival's answer (an answer of its one entry), its prompt archived first, and log who answered it."""
    (entry,) = output.events
    _ = prompt.archive()
    path = data(ANSWERS) / pass_name / f'event-{entry.event_id}.json'
    files.write(path, output.dumped())  # then its log row: an answer saved but not logged is asked again
    rows = log()
    rel = str(path.relative_to(data(ANSWERS)))
    rows[rel] = Logged(
        file=rel,
        answered_at=now(),
        model=model,
        prompt=prompt.hash,
        answered_by=answered_by,
    )
    Logged.write(rows[k] for k in sorted(rows))
    return path
