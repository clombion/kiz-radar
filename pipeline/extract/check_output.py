"""Check a pass's answer against its record and the festivals it was asked about.

Checks, in order:
  1. the answer is the pass's record (pipeline/records.py), every constraint of its fields held
  2. it covers exactly the asked festivals (none missing, none extra, none duplicated)
  3. every name and quote appears verbatim in that festival's description or title
     (whitespace-collapsed, case-insensitive), so nothing invented gets through

Exits 1 with one actionable line per problem when any check fails.

Usage: uv run -m pipeline.extract.check_output PASS QUESTION ANSWER
"""

import argparse
import sys
from collections.abc import Mapping
from pathlib import Path

from pydantic import ValidationError

from pipeline import prompt as prompts
from pipeline.records import Batch, Entry, Json, errors

VERBATIM_KEYS = frozenset({'quote', 'label_quote', 'rule_quotes', 'source_line', 'name_as_written', 'names'})


def norm(s: str) -> str:
    return ' '.join(s.split()).casefold()


def verbatim_fields(node: Json, path: str = '') -> list[tuple[str, str]]:
    """(where, text) pairs that must appear in the description: every value under a VERBATIM_KEYS key."""
    out: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            where = f'{path}.{k}' if path else k
            if k in VERBATIM_KEYS:
                out += [(where, s) for s in (v if isinstance(v, list) else [v]) if isinstance(s, str) and s]
            else:
                out += verbatim_fields(v, where)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out += verbatim_fields(v, f'{path}[{i}]')
    return out


def entry_json(entry: Entry) -> dict[str, Json]:
    dumped: dict[str, Json] = entry.model_dump(mode='json', by_alias=True)
    return dumped


def found_in[E: Entry](answer: Batch[E], texts: Mapping[int, str]) -> list[str]:
    """What an answer gets wrong of the festivals asked ({event_id: title and description}): festivals missing,
    extra or answered twice, and names and quotes that are not in their festival's text."""
    descriptions = {i: norm(t) for i, t in texts.items()}
    got = [e.event_id for e in answer.events]
    found: list[str] = []
    if missing := sorted(set(descriptions) - set(got)):
        found.append(f'coverage: missing event_id(s) {missing}; add an entry for each (empty lists if nothing found)')
    if extra := sorted(set(got) - set(descriptions)):
        found.append(f'coverage: event_id(s) {extra} are not in this batch; remove them')
    if dupes := sorted({i for i in got if got.count(i) > 1}):
        found.append(f'coverage: event_id(s) {dupes} appear more than once; merge them into one entry')
    for ev in answer.events:
        if (desc := descriptions.get(ev.event_id)) is None:
            continue
        found += [
            f'verbatim: event {ev.event_id}: {where} {text!r} is not in the description; copy it exactly or drop it'
            for where, text in verbatim_fields({k: v for k, v in entry_json(ev).items() if k != 'event_id'})
            if norm(text) not in desc
        ]
    return found


def checked[E: Entry](record: type[Batch[E]], text: str, texts: Mapping[int, str]) -> Batch[E] | list[str]:
    """The answer, when it is the record and holds to the festivals asked; else what is wrong with it."""
    try:
        answer = record.parse(text)
    except ValidationError as e:
        return errors(e, 'schema')
    return found_in(answer, texts) or answer


class Args(argparse.Namespace):
    pass_name: prompts.PassName = 'extract'  # noqa: S105 (a pass is an extraction pass, no password)
    question: Path = Path()
    answer: Path = Path()


def main() -> None:
    ap = argparse.ArgumentParser(description="Check a pass's answer against its record and the festivals asked.")
    _ = ap.add_argument('pass_name', metavar='PASS', choices=[p.name for p in prompts.PASSES], help='the pass')
    _ = ap.add_argument('question', type=Path, help='the question: {"batch", "events"} of the festivals asked')
    _ = ap.add_argument('answer', type=Path, help='the answer file')
    a = ap.parse_args(namespace=Args())
    pass_ = next(p for p in prompts.PASSES if p.name == a.pass_name)
    try:
        asked = Batch[pass_.asked].parse(a.question.read_text(encoding='utf-8'))
    except ValidationError as e:
        sys.exit('\n'.join(errors(e, f'{a.question.name}: not a question of the {a.pass_name} pass')))
    texts = {e.event_id: e.description + '\n' + e.title for e in asked.events}
    match checked(prompts.answer(pass_), a.answer.read_text(encoding='utf-8'), texts):
        case list() as found:
            for p in found:
                print(f'{a.answer.name}: {p}')
            sys.exit(f'{a.answer.name}: FAIL ({len(found)} problems)')
        case answer:
            print(f'{a.answer.name}: OK ({len(answer.events)} events, 0 problems)')


if __name__ == '__main__':
    main()
