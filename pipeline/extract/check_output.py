"""Validate an agent's output file against its schema and its batch input.

Checks, in order:
  1. the output matches the JSON schema
  2. it covers exactly the batch's events (none missing, none extra, none duplicated)
  3. every name and quote appears verbatim in that event's description
     (whitespace-collapsed, case-insensitive), so nothing invented gets through

Exits 1 with one actionable line per problem when any check fails.

Usage: uv run --group check -m pipeline.extract.check_output SCHEMA BATCH_INPUT OUTPUT
"""

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

from pipeline import states


def norm(s: str) -> str:
    return ' '.join(s.split()).casefold()


VERBATIM_KEYS = {'quote', 'label_quote', 'rule_quotes', 'source_line', 'name_as_written', 'names'}


def verbatim_fields(node: object, path: str = '') -> list[tuple[str, str]]:
    """(where, text) pairs that must appear in the description: every value under a VERBATIM_KEYS key."""
    out = []
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


def problems(schema: dict, batch: dict, output: dict) -> list[str]:
    """What is wrong with an output for this batch input, one actionable line each; empty when it passes."""
    found = [
        f'schema: {"/".join(map(str, err.path)) or "(root)"}: {err.message}'
        for err in Draft202012Validator(schema).iter_errors(output)
    ]

    descriptions = {e['event_id']: norm(e['description'] + '\n' + e['title']) for e in batch['events']}
    got = [e.get('event_id') for e in output.get('events', [])]
    missing = set(descriptions) - set(got)
    extra = set(got) - set(descriptions)
    dupes = {i for i in got if got.count(i) > 1}
    if missing:
        found.append(
            f'coverage: missing event_id(s) {sorted(missing)}; add an entry for each (empty lists if nothing found)'
        )
    if extra:
        found.append(f'coverage: event_id(s) {sorted(extra)} are not in this batch; remove them')
    if dupes:
        found.append(f'coverage: event_id(s) {sorted(dupes)} appear more than once; merge them into one entry')

    for ev in output.get('events', []):
        desc = descriptions.get(ev.get('event_id'))
        if desc is None:
            continue
        for where, text in verbatim_fields({k: v for k, v in ev.items() if k != 'event_id'}):
            if norm(text) not in desc:
                found.append(
                    f'verbatim: event {ev["event_id"]}: {where} {text!r} is not in the description; copy it exactly or drop it'
                )
    return found


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate an agent's output file against its schema and its batch input.")
    for name, text in (
        ('schema', "the pass's JSON schema"),
        ('batch', 'the batch input file'),
        ('output', 'the output file'),
    ):
        ap.add_argument(name, type=Path, help=text)
    a = ap.parse_args()
    schema_path, batch_path, out_path = a.schema, a.batch, a.output
    schema = states.schema(schema_path)
    batch = json.loads(batch_path.read_text())
    try:
        output = json.loads(out_path.read_text())
    except json.JSONDecodeError as e:
        print(f'{out_path.name}: not valid JSON ({e}); rewrite the file as a single JSON object')
        sys.exit(1)
    found = problems(schema, batch, output)
    for p in found:
        print(f'{out_path.name}: {p}')
    print(
        f'{out_path.name}: {"FAIL" if found else "OK"} ({len(output.get("events", []))} events, {len(found)} problems)'
    )
    sys.exit(1 if found else 0)


if __name__ == '__main__':
    main()
