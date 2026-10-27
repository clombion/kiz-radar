"""What the pipeline asks a model, and how a prompt is known: by the hash of everything fixed in its request.

A Prompt is what is fixed in a request: the system text, and the record the answer must be (pipeline/records.py;
the message is the festival's own). Its text sets down the system text, the record's schema, which the checker holds
the answer to, and the schema as sent; its hash is the first records.DIGITS hex digits of that text's SHA-256. So
editing a template, a state's criterion (pipeline/states.py) or a record, a constraint only the checker enforces
included, changes the hash of every prompt it is in.

The current prompts are current(name): the three extraction passes' (pipeline/extract/prompts/<template>.md, answered
as a records.Batch of its entries; PASSES) and the first read's (the prices prompt,
     then pipeline/tickets/prompts/first-read.md,
answered as records.FirstReadAnswer, the part of a first read a model writes). An answer or a first read records the
hash it answered, and is current while is_current(name, hash). Whatever writes one archives its prompt first
(archive()), so every hash a file names has its text in pipeline/prompts/asked/<hash>.md.
"""

import hashlib
import json
import tempfile
from dataclasses import dataclass
from functools import cache, cached_property
from pathlib import Path
from typing import Literal

from pipeline import ROOT, records, states
from pipeline.records import Asked, AskedPrices, Batch, Entry, Extracted, Json, Priced, Record, RoomsGenres

type Schema = dict[str, Json]
type PassName = Literal['extract', 'rooms_genres', 'prices']
type Name = PassName | Literal['first_read']

ASKED = ROOT / 'pipeline' / 'prompts' / 'asked'
CHECKED, SENT = '\n\n======== schema as checked ========\n\n', '\n\n======== schema as sent ========\n\n'
EXTRACT_DIR, TICKETS_DIR = ROOT / 'pipeline' / 'extract', ROOT / 'pipeline' / 'tickets'
# what structured outputs leave to the checker: lengths, ranges and patterns; and the annotations
UNSENT = frozenset(
    {
        'title',
        'default',
        'discriminator',
        'minLength',
        'maxLength',
        'minimum',
        'maximum',
        'exclusiveMinimum',
        'minItems',
    }
    | {'pattern'}
)


def schema_of(record: type[Record]) -> Schema:
    """The record's JSON Schema, without the titles pydantic gives every part, or the docstrings of the state enums
    (the prompts define the states)."""

    def plain(node: Json) -> Json:
        if isinstance(node, list):
            return [plain(v) for v in node]
        if not isinstance(node, dict):
            return node
        return {
            k: plain(v)
            for k, v in node.items()
            if not (k == 'title' and isinstance(v, str)) and not (k == 'description' and 'enum' in node)
        }

    out: Schema = record.model_json_schema()
    return {k: plain(v) for k, v in out.items() if k != 'title'}


def inlined(node: Json, defs: Schema) -> Json:
    """The schema with each "$ref": "#/$defs/<name>" replaced by its definition."""
    if isinstance(node, list):
        return [inlined(v, defs) for v in node]
    if not isinstance(node, dict):
        return node
    out = {k: inlined(v, defs) for k, v in node.items() if k not in {'$ref', '$defs'}}
    if isinstance(ref := node.get('$ref'), str) and isinstance(target := inlined(defs[ref.split('/')[-1]], defs), dict):
        return target | out
    return out


def api_schema(schema: Schema) -> Schema:
    """The schema as structured outputs accept it: references inlined, none of the constraints the checker keeps
    (UNSENT), and anyOf for oneOf."""

    def strip(node: Json) -> Json:
        if isinstance(node, list):
            return [strip(v) for v in node]
        if not isinstance(node, dict):
            return node
        return {('anyOf' if k == 'oneOf' else k): strip(v) for k, v in node.items() if k not in UNSENT}

    defs = schema.get('$defs')
    out = strip(inlined(schema, defs if isinstance(defs, dict) else {}))
    return out if isinstance(out, dict) else {}


def dumped(schema: Json) -> str:
    return json.dumps(schema, ensure_ascii=False, sort_keys=True, indent=1)


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[: records.DIGITS]


@dataclass(frozen=True)
class Prompt:
    system: str
    record: type[Record]  # what the answer is

    @cached_property
    def schema(self) -> Schema:
        return schema_of(self.record)

    @cached_property
    def sent_schema(self) -> Schema:
        return api_schema(self.schema)

    @cached_property
    def text(self) -> str:
        return self.system + CHECKED + dumped(self.schema) + SENT + dumped(self.sent_schema) + '\n'

    @cached_property
    def hash(self) -> str:
        return digest(self.text)

    def archive(self) -> Path:
        """Save the prompt's text under its hash, unless the file there already holds it: written whole beside it,
        then renamed, so no reader sees part of it."""
        path = ASKED / f'{self.hash}.md'
        if path.exists() and digest(path.read_text(encoding='utf-8')) == self.hash:
            return path
        ASKED.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=ASKED, suffix='.part', delete=False) as f:
            _ = f.write(self.text)
        _ = Path(f.name).replace(path)
        return path


class Pass[E: Entry, Q: Asked]:
    """An extraction pass: its name, its template (pipeline/extract/prompts/<template>.md), the record of a
    festival's entry in its answer, and the record of a festival in its question. Read-only, so that a pass of
    particular records is a pass of entries (PASSES)."""

    __slots__ = ('_asked', '_entry', '_name', '_template')
    _name: PassName
    _template: str
    _entry: type[E]
    _asked: type[Q]

    def __init__(self, name: PassName, template: str, entry: type[E], asked: type[Q]) -> None:
        self._name, self._template, self._entry, self._asked = name, template, entry, asked

    @property
    def name(self) -> PassName:
        return self._name

    @property
    def template(self) -> str:
        return self._template

    @property
    def entry(self) -> type[E]:
        return self._entry

    @property
    def asked(self) -> type[Q]:
        return self._asked


def answer[E: Entry, Q: Asked](pass_: Pass[E, Q]) -> type[Batch[E]]:
    """The record of the pass's answer: a batch of its entries."""
    return Batch[pass_.entry]


EXTRACT = Pass('extract', 'extract', Extracted, Asked)
ROOMS_GENRES = Pass('rooms_genres', 'rooms-genres', RoomsGenres, Asked)
PRICES = Pass('prices', 'prices', Priced, AskedPrices)
PASSES: tuple[Pass[Entry, Asked], ...] = (EXTRACT, ROOMS_GENRES, PRICES)


def template(path: Path) -> str:
    return states.fill(path.read_text(encoding='utf-8'), path.name)


@cache
def current(name: Name) -> Prompt:
    """The current prompt of an extraction pass, or of the first read ('first_read')."""
    if name == 'first_read':
        system = current('prices').system + '\n\n' + template(TICKETS_DIR / 'prompts' / 'first-read.md')
        return Prompt(system, records.FirstReadAnswer)
    pass_ = next(p for p in PASSES if p.name == name)
    return Prompt(template(EXTRACT_DIR / 'prompts' / f'{pass_.template}.md'), answer(pass_))


def is_current(name: Name, hash_: str) -> bool:
    """Whether an answer or a first read naming this hash answered the current prompt."""
    return hash_ == current(name).hash


def asked(hash_: str) -> str:
    """The text of an archived prompt."""
    path = ASKED / f'{hash_}.md'
    if not path.exists():
        raise LookupError(f'prompt {hash_}: no {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')
