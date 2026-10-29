"""docs/reference/: the commands, the files and the states, each written from what the code holds (tasks.toml, the
records of pipeline/records.py, pipeline/states.py), so a page of the reference says what the code does; mise run
generate writes them, and generate:check fails when one differs."""

import inspect
import textwrap
import tomllib
from collections.abc import Iterable

from pydantic import BaseModel, ConfigDict, TypeAdapter

from pipeline import ROOT, claims, records, states, tickets_store
from pipeline import prompt as prompts

DOCS = ROOT / 'docs' / 'reference'
GENERATED = '<!-- written by pipeline/reference.py from {source}: mise run generate -->'


class Task(BaseModel):
    model_config = ConfigDict(extra='ignore', frozen=True)
    description: str


def cell(text: str) -> str:
    """Text as one cell of a Markdown table: on one line, its bars escaped."""
    return ' '.join(text.split()).replace('|', '\\|')


def table(head: Iterable[str], rows: Iterable[Iterable[str]]) -> str:
    """A table as mdformat writes it (compact_tables)."""
    head = list(head)
    lines = ['| ' + ' | '.join(head) + ' |', '| ' + ' | '.join('--' for _ in head) + ' |']
    return '\n'.join([*lines, *('| ' + ' | '.join(cell(c) for c in row) + ' |' for row in rows)])


def page(title: str, source: str, intro: str, *parts: str) -> str:
    wrapped = textwrap.fill(intro, 120, break_long_words=False, break_on_hyphens=False)  # as mdformat wraps it
    return '\n\n'.join([f'# {title}', GENERATED.format(source=source), wrapped, *parts]) + '\n'


def summary(cls: type) -> str:
    """The first paragraph of a record's docstring."""
    return inspect.cleandoc(cls.__doc__ or '').split('\n\n', 1)[0]


def commands() -> str:
    tasks = TypeAdapter(dict[str, Task]).validate_python(tomllib.loads((ROOT / 'tasks.toml').read_text()))
    return page(
        'Commands',
        'tasks.toml',
        'Each is `mise run <task>`. A step takes its own arguments after `--` (`mise run tickets -- todo`); '
        '`--help` lists them.',
        table(['Task', 'What'], ([f'`{name}`', t.description] for name, t in tasks.items())),
    )


# the folders of JSON files the steps keep, each with the record its files are read as
FOLDERS: list[tuple[str, str, tuple[type, ...]]] = [
    (f'{records.ANSWERS}/<pass>/', 'an answer of an extraction pass, with where it comes from', (records.Answered,)),
    (f'{tickets_store.READS}/<id>.json', "a festival's first read", (records.FirstRead,)),
    (
        f'{tickets_store.DRAFTS}/<id>.json',
        'a first read an agent is making, beside the prompt it follows',
        (records.FirstRead,),
    ),
    (f'{tickets_store.DISPUTED}/<id>.json', "the models' reads, no two of which agreed", (records.Dispute,)),
    (
        f'{tickets_store.PARTIAL}/<id>.json',
        "the models' reads already paid for, until they settle",
        (records.ModelReads,),
    ),
    (
        f'{tickets_store.LOG}/<id>.jsonl',
        "each read of a festival's ticket page, or its failure, appended to",
        (records.Read, records.Failed),
    ),
    (f'{tickets_store.SITES}/<site>.json', "a ticket site's recipe", (records.PageRecipe, records.ApiRecipe)),
    (f'{prompts.ASKED}/<hash>.md', 'the text of every prompt an answer or a read followed', ()),
    (
        f'{claims.CLAIMS}/<digest>.json',
        "an admin's claim (the claims submodule)",
        (claims.MergeClaim, claims.HomeClaim, claims.BookingClaim, claims.SiteClaim),
    ),
]


def files() -> str:
    csvs = table(
        ['File', 'Record', 'A row is'],
        ([f'`{r.FILE}`', f'`{r.__name__}`', summary(r)] for r in records.CsvRow.records()),
    )
    folders = table(
        ['Files', 'Record', 'Each is'],
        ([f'`{path}`', ', '.join(f'`{r.__name__}`' for r in rs) or '—', what] for path, what, rs in FOLDERS),
    )
    return page(
        'Files',
        'the records of pipeline/records.py',
        'Each file the steps share is read as its record (`pipeline/records.py`), where it enters; `mise run audit` '
        'reads every one.',
        '## CSV files',
        csvs,
        '## Folders',
        folders,
    )


def states_page() -> str:
    rows = (
        [f'{s.point} · `{s.key}`', s.disposition, s.wording or '—', s.owner or '—', s.criterion]
        for p in states.POINTS
        for s in states.BY_POINT[p.name]
    )
    return page(
        'States',
        'pipeline/states.py',
        'Every data point and every state it can be in; why the world is closed is in [States](../concepts/states.md).',
        '## Data points',
        table(
            ['Data point', 'States', 'Produced by'],
            (
                [f'**{p.name}**, {p.of}', ', '.join(f'`{k}`' for k in states.KEYS[p.name]), p.produced_by]
                for p in states.POINTS
            ),
        ),
        '## States',
        table(['Point · state', 'Disposition', 'Wording', 'Owner', 'Criterion'], rows),
    )


PAGES = {DOCS / 'commands.md': commands, DOCS / 'files.md': files, DOCS / 'states.md': states_page}
