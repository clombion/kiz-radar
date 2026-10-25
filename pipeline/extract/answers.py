"""The saved answers of the extraction passes: answers/<pass>/*.json, and answers/log.csv saying who answered
each file, with which model and when.

An answer file is one pass's output for some festivals: {"batch", "prompt_version", "events": [...]}. The first
answers came in batches written by Claude Code subagents (<pass>-NNN.json); later ones come one festival at a
time from ask.py (event-<id>.json). A festival's own file replaces its entry in a batch.
"""
import csv, datetime as dt, json
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).parent
ANSWERS = HERE / 'answers'
LOG = ANSWERS / 'log.csv'
LOG_FIELDS = ['file', 'answered_at', 'model', 'answered_by']

# pass -> its prompt (prompts/<version>.md) and schema (schemas/<pass>.json)
PASSES = {'extract': 'extract-v1', 'rooms_genres': 'rooms-genres-v1'}


@dataclass
class Answer:
    entry: dict           # the festival's entry in the file's "events"
    prompt_version: str
    batch: str
    file: str             # relative to answers/
    model: str
    answered_at: str
    answered_by: str


def log() -> dict[str, dict]:
    with LOG.open(encoding='utf-8') as f:
        return {r['file']: r for r in csv.DictReader(f)}


def files(pass_name: str) -> list[Path]:
    """The pass's answer files, batches first, so a festival's own file is read after the batch that had it."""
    folder = ANSWERS / pass_name
    return sorted(folder.glob('*.json'), key=lambda p: (p.name.startswith('event-'), p.name))


def latest(pass_name: str, event_ids: set[int]) -> dict[int, Answer]:
    """The newest answer for each of these festivals, in the order they were read."""
    known, out = log(), {}
    for path in files(pass_name):
        rel = str(path.relative_to(ANSWERS))
        if rel not in known:
            raise SystemExit(f'{rel} is not in {LOG.relative_to(HERE.parent.parent)}')
        meta = known[rel]
        data = json.loads(path.read_text(encoding='utf-8'))
        for entry in data['events']:
            if entry['event_id'] in event_ids:
                out.pop(entry['event_id'], None)   # a newer answer moves to the end
                out[entry['event_id']] = Answer(entry, data['prompt_version'], data['batch'], rel,
                                                meta['model'], meta['answered_at'], meta['answered_by'])
    return out


def save(pass_name: str, event_id: int, output: dict, model: str, answered_by: str) -> Path:
    path = ANSWERS / pass_name / f'event-{event_id}.json'
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    rows = log()
    rel = str(path.relative_to(ANSWERS))
    rows[rel] = {'file': rel, 'answered_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
                 'model': model, 'answered_by': answered_by}
    with LOG.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, LOG_FIELDS)
        w.writeheader()
        w.writerows(rows[k] for k in sorted(rows))
    return path
