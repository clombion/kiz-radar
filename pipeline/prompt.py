"""What the pipeline asks a model, and how a prompt is known: by the hash of everything fixed in its request.

A Prompt is what is fixed in a request: the system text, and the schema the answer must follow (the message is the
festival's own). Its text sets down the system text, the schema the checker holds the answer to, and the schema as
sent; its hash is the first DIGITS hex digits of that text's SHA-256. So editing a template, a state's criterion
(pipeline/states.py) or a schema, a constraint only the checker enforces included, changes the hash of every prompt
it is in.

The current prompts are current(name): the three extraction passes' (pipeline/extract/prompts/<template>.md with
pipeline/extract/schemas/<pass>.json) and the first read's (the prices prompt, then
pipeline/tickets/prompts/first-read.md, with the part of tickets/schemas/read.json a model writes). An answer or a
first read records the hash it answered, and is current while is_current(name, hash). Whatever writes one archives
its prompt first (archive()), so every hash a file names has its text in pipeline/prompts/asked/<hash>.md.
"""
import hashlib, json, os, tempfile
from dataclasses import dataclass
from functools import cache, cached_property
from pathlib import Path

from pipeline import states

ROOT = Path(__file__).parent.parent
ASKED = ROOT / 'pipeline' / 'prompts' / 'asked'
DIGITS = 16
CHECKED, SENT = '\n\n======== schema as checked ========\n\n', '\n\n======== schema as sent ========\n\n'
EXTRACT, TICKETS = ROOT / 'pipeline' / 'extract', ROOT / 'pipeline' / 'tickets'
PASSES = {'extract': 'extract', 'rooms_genres': 'rooms-genres', 'prices': 'prices'}   # pass -> its template


def inlined(node, defs):
    """The schema with each "$ref": "#/$defs/<name>" replaced by its definition."""
    if isinstance(node, list):
        return [inlined(v, defs) for v in node]
    if not isinstance(node, dict):
        return node
    if '$ref' in node:
        return inlined(defs[node['$ref'].removeprefix('#/$defs/')], defs) | {k: inlined(v, defs) for k, v in node.items()
                                                                          if k != '$ref'}
    return {k: inlined(v, defs) for k, v in node.items() if k != '$defs'}


def api_schema(node):
    """The schema as structured outputs accept it: references inlined, no length, range, pattern or if/then
    constraints (the checker keeps them), anyOf for oneOf, and no annotations."""
    def strip(node):
        if isinstance(node, list):
            return [strip(v) for v in node]
        if not isinstance(node, dict):
            return node
        drop = {'$schema', 'title', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'minItems',
                'pattern', 'if', 'then', 'else'}
        return {('anyOf' if k == 'oneOf' else k): strip(v) for k, v in node.items() if k not in drop}
    return strip(inlined(node, node.get('$defs', {})))


def dumped(schema):
    return json.dumps(schema, ensure_ascii=False, sort_keys=True, indent=1)


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()[:DIGITS]


@dataclass(frozen=True)
class Prompt:
    system: str
    schema: dict          # with its $defs filled (states.schema)

    @cached_property
    def sent_schema(self):
        return api_schema(self.schema)

    @cached_property
    def text(self):
        return self.system + CHECKED + dumped(self.schema) + SENT + dumped(self.sent_schema) + '\n'

    @cached_property
    def hash(self):
        return digest(self.text)

    def archive(self):
        """Save the prompt's text under its hash, unless the file there already holds it: written whole beside it,
        then renamed, so no reader sees part of it."""
        path = ASKED / f'{self.hash}.md'
        if path.exists() and digest(path.read_text(encoding='utf-8')) == self.hash:
            return path
        ASKED.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=ASKED, suffix='.part', delete=False) as f:
            f.write(self.text)
        os.replace(f.name, path)
        return path


def template(path):
    return states.fill(path.read_text(encoding='utf-8'), path.name)


@cache
def current(name):
    """The current prompt of an extraction pass, or of the first read ('first_read')."""
    if name == 'first_read':
        read, keep = states.schema(TICKETS / 'schemas' / 'read.json'), ('passes', 'skipped', 'rule_quotes')
        return Prompt(current('prices').system + '\n\n' + template(TICKETS / 'prompts' / 'first-read.md'),
                      {'type': 'object', 'additionalProperties': False, 'required': list(keep),
                       'properties': {k: read['properties'][k] for k in keep}, '$defs': read['$defs']})
    return Prompt(template(EXTRACT / 'prompts' / f'{PASSES[name]}.md'), states.schema(EXTRACT / 'schemas' / f'{name}.json'))


def is_current(name, hash_):
    """Whether an answer or a first read naming this hash answered the current prompt."""
    return hash_ == current(name).hash


def asked(hash_):
    """The text of an archived prompt."""
    path = ASKED / f'{hash_}.md'
    if not path.exists():
        raise LookupError(f'prompt {hash_}: no {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')
