"""The saved answers of the extraction passes: answers/<pass>/*.json, each an answer and where it comes from (who
answered it, with which model, to which prompt, when, and the digest of the message it answered), written together
(records.Answered).

The first answers came in batches written by Claude Code subagents (<pass>-NNN.json, of several festivals, with no
message digest); later ones come one festival at a time from ask.py (event-<id>.json). A festival's own file replaces
its entry in a batch. An answer's state (state()) is current while it answered the pass's current prompt
(pipeline/prompt.py) and the message the festival would be asked with today (questions.Now.inputs), else stale; an
answer to another prompt may follow another shape, so only a current one is read as its pass's record (current); of
the others, only which festivals they answer (answered).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from pipeline import data, files
from pipeline import prompt as prompts
from pipeline.enums import AnswerState, Model
from pipeline.prompt import Archived, Pass
from pipeline.records import ANSWERS, Answered, Asked, Batch, Entry, Provenance, now


class ListedEntry(BaseModel):
    model_config = ConfigDict(strict=True, extra='ignore', frozen=True)

    event_id: int


class Listed(BaseModel):
    """The festivals an answer is of, whatever else it holds."""

    model_config = ConfigDict(extra='ignore', frozen=True)

    events: tuple[ListedEntry, ...]


class Filed(Provenance):
    """An answer file, whatever prompt it answered and whatever shape its answer has then: where it comes from, and
    the festivals it answers."""

    model_config = ConfigDict(extra='ignore')

    answer: Listed


@dataclass(frozen=True)
class Answer[E: Entry]:
    """A festival's current answer of a pass: its entry, where it comes from, and its file."""

    entry: E
    provenance: Provenance
    path: Path


def answer_files(pass_name: str) -> list[Path]:
    """The pass's answer files, batches first, so a festival's own file is read after the batch that had it."""
    folder = data(ANSWERS) / pass_name
    return sorted(folder.glob('*.json'), key=lambda p: (p.name.startswith('event-'), p.name))


def answered(pass_name: str, event_ids: set[int]) -> dict[int, tuple[Path, Provenance]]:
    """The file of the newest answer for each of these festivals, and where it comes from."""
    out: dict[int, tuple[Path, Provenance]] = {}
    for path in answer_files(pass_name):
        filed = Filed.model_validate_json(path.read_bytes())
        for entry in filed.answer.events:
            if entry.event_id in event_ids:
                _ = out.pop(entry.event_id, None)  # a newer answer moves to the end
                out[entry.event_id] = path, filed
    return out


def state(pass_name: prompts.Name, provenance: Provenance | None, inputs: str) -> AnswerState:
    """A festival's answer of a pass: none, current (to the current prompt, of the message it would be asked with
    today, whose digest is inputs), or stale."""
    if provenance is None:
        return AnswerState.NONE
    if prompts.is_current(pass_name, provenance.prompt) and provenance.inputs == inputs:
        return AnswerState.CURRENT
    return AnswerState.STALE


def current[E: Entry, Q: Asked](pass_: Pass[E, Q], inputs: Mapping[int, str]) -> dict[int, Answer[E]]:
    """The current answer of each of these festivals that has one, as its record; inputs are the digests of the
    messages they would be asked with today."""
    read: dict[Path, Answered[E]] = {}
    out: dict[int, Answer[E]] = {}
    for i, (path, provenance) in answered(pass_.name, set(inputs)).items():
        if state(pass_.name, provenance, inputs[i]) != AnswerState.CURRENT:
            continue
        if path not in read:
            read[path] = Answered[pass_.entry].parse(path.read_bytes())
        filed = read[path]
        out[i] = Answer(next(e for e in filed.answer.events if e.event_id == i), filed, path)
    return out


@dataclass(frozen=True)
class Asking:
    """What an answer is saved with: the prompt it answered, archived; the model and who asked; and the digest of
    the message it answered."""

    prompt: Archived
    model: Model
    answered_by: str
    inputs: str


def save[E: Entry](pass_name: str, output: Batch[E], asking: Asking) -> Path:
    """Save one festival's answer (an answer of its one entry) with where it comes from."""
    (entry,) = output.events
    path = data(ANSWERS) / pass_name / f'event-{entry.event_id}.json'
    filed = Answered[type(entry)](
        prompt=asking.prompt.hash,
        model=asking.model,
        answered_at=now(),
        answered_by=asking.answered_by,
        inputs=asking.inputs,
        answer=output,
    )
    files.write(path, filed.dumped())
    return path
