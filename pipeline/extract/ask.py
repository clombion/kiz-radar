"""Ask Claude the extraction passes for the festivals that need them, and save each answer.

    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite             # what the monthly Action runs
    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --dry-run   # list what would be asked
    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --limit 3   # ask about three festivals only

A festival needs a pass when it is in pending_extraction (its description is new or changed) or when the pass
has no answer for it yet. Each question is one festival and one pass, with the pass's prompt and its schema as
the required answer format. check_output.problems() (and prices.problems() for prices) checks the answer; on a
failure Claude gets the checker's lines and answers once more, and a second failure leaves the festival
pending. A checked answer is saved as answers/<pass>/event-<id>.json. A festival leaves pending_extraction once
every pass has a checked answer from this run. Needs ANTHROPIC_API_KEY.
"""
import argparse, json, sqlite3, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import anthropic

from pipeline import db as sqlite_db
from pipeline.extract import answers, check_output, prices

HERE = Path(__file__).parent
MODEL = 'claude-haiku-5-5'
PRICE_PER_MTOK = {'input': 0.10, 'output': 0.50}     # claude-haiku-5-5, USD
WORKERS = 8
BY = 'pipeline/extract/ask.py (Messages API), one festival'

# pass -> prompt version, and whether its prompt was written for an agent reading files (so this run hands it
# the files' contents instead) or for this script
PASSES = {'extract': ('extract-v1', True), 'rooms_genres': ('rooms-genres-v1', True), 'prices': ('prices-v2', False)}
FILES_NOTE = """## This run

There are no files and no tools in this run. The batch input, the schema and the vocabulary are in the
message, and your reply is the output object itself. The checker runs on your reply; if it reports problems
you get its lines and answer again with the whole corrected object."""


def api_schema(node):
    """The schema as structured outputs accept it: no length, range, pattern or if/then constraints (the checker
    keeps them), anyOf for oneOf, and no annotations."""
    if isinstance(node, list):
        return [api_schema(v) for v in node]
    if not isinstance(node, dict):
        return node
    drop = {'$schema', 'title', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'minItems',
            'pattern', 'if', 'then', 'else'}
    return {('anyOf' if k == 'oneOf' else k): api_schema(v) for k, v in node.items() if k not in drop}


def question(pass_name, row):
    version, for_files = PASSES[pass_name]
    schema = json.loads((HERE / 'schemas' / f'{pass_name}.json').read_text())
    event = {'event_id': row['id'], 'title': row['title'], 'description': row['description_text']}
    if pass_name == 'prices':
        event = {'event_id': row['id'], 'title': row['title'], 'start_date': row['start_date'][:10],
                 'end_date': row['end_date'][:10], 'country': row['country'], 'description': row['description_text']}
    batch = {'batch': f"event-{row['id']}", 'events': [event]}
    system = (HERE / 'prompts' / f'{version}.md').read_text()
    parts = []
    if for_files:
        system += '\n\n' + FILES_NOTE
        parts += [f'Schema (schemas/{pass_name}.json):\n{json.dumps(schema, ensure_ascii=False)}',
                  f'Vocabulary (config/vocab.json):\n{(HERE / "vocab.json").read_text()}']
    parts.append(f"Batch input ({batch['batch']}.json):\n{json.dumps(batch, ensure_ascii=False, indent=1)}")
    return system, '\n\n'.join(parts), schema, batch


def structured(client, model, system, content, schema, check, label, usage=None, lock=None):
    """Claude's answer in the schema's shape once check() finds no problems in it, or None after two tries: on a
    failure Claude gets the checker's lines and answers once more. usage, when given, adds up the tokens."""
    messages = [{'role': 'user', 'content': content}]
    for attempt in (1, 2):
        try:
            with client.messages.stream(model=model, max_tokens=64000, system=system, messages=messages,
                                        output_config={'format': {'type': 'json_schema',
                                                                  'schema': api_schema(schema)}}) as stream:
                reply = stream.get_final_message()
        except anthropic.APIStatusError as e:
            print(f"{label}: API error {e.status_code} ({e.message}); left pending", file=sys.stderr)
            return None
        except anthropic.APIConnectionError as e:
            print(f"{label}: connection failed ({e}); left pending", file=sys.stderr)
            return None
        if usage is not None:
            with lock:
                usage['input'] += reply.usage.input_tokens
                usage['output'] += reply.usage.output_tokens
        if reply.stop_reason != 'end_turn':
            print(f"{label}: stopped on {reply.stop_reason} (request {reply._request_id}); left pending", file=sys.stderr)
            return None
        text = next(b.text for b in reply.content if b.type == 'text')
        try:
            output = json.loads(text)
        except json.JSONDecodeError as e:
            found = [f'not valid JSON ({e})']
        else:
            if not (found := check(output)):
                return output
        print(f"{label}: try {attempt} failed the checker: " + ' | '.join(found), file=sys.stderr)
        messages += [{'role': 'assistant', 'content': reply.content},
                     {'role': 'user', 'content': 'The checker found these problems:\n' + '\n'.join(found) +
                      '\n\nAnswer again with the whole corrected object.'}]
    return None


def ask(client, pass_name, row, usage, lock):
    """A checked answer for one festival and pass, or None after two failed tries."""
    system, content, schema, batch = question(pass_name, row)
    check = lambda out: check_output.problems(schema, batch, out) or (prices.problems(out) if pass_name == 'prices' else [])
    return structured(client, MODEL, system, content, schema, check, f"{row['id']} {pass_name}", usage, lock)


def due(db, only):
    """(event row, pass) pairs to ask: every pass of a pending festival, and passes a festival has no answer for."""
    rows = {r['id']: r for r in db.execute('select * from events where description_text is not null order by id')}
    pending = {i for i, in db.execute('select event_id from pending_extraction')}
    out = []
    for pass_name in only or PASSES:
        have = answers.latest(pass_name, set(rows))
        out += [(rows[i], pass_name) for i in rows if i in pending or i not in have]
    return out, pending


def main():
    ap = argparse.ArgumentParser(description='Ask Claude the extraction passes for the festivals that need them.')
    ap.add_argument('src', type=sqlite_db.existing, help='the source DB; festivals leave its pending_extraction once answered')
    ap.add_argument('--dry-run', action='store_true', help='list what would be asked, without asking')
    ap.add_argument('--limit', type=int, help='ask about at most this many festivals')
    ap.add_argument('--pass', dest='passes', action='append', choices=PASSES, help='only this pass (repeatable)')
    a = ap.parse_args()

    db = sqlite_db.connect(a.src, 'rw')
    db.row_factory = sqlite3.Row
    todo, pending = due(db, a.passes)
    if a.limit:
        keep = sorted({r['id'] for r, _ in todo})[:a.limit]
        todo = [(r, p) for r, p in todo if r['id'] in keep]
    counts = {p: sum(1 for _, q in todo if q == p) for p in PASSES}
    print(f'{len({r["id"] for r, _ in todo})} festivals to ask about: {counts}; {len(pending)} pending')
    if a.dry_run or not todo:
        return

    client = anthropic.Anthropic()
    usage, lock, failed = {'input': 0, 'output': 0}, threading.Lock(), set()

    def one(job):
        row, pass_name = job
        output = ask(client, pass_name, row, usage, lock)
        with lock:
            if output is None:
                failed.add(row['id'])
            else:
                answers.save(pass_name, row['id'], output, MODEL, BY)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(one, todo))

    done = {r['id'] for r, _ in todo} - failed
    db.executemany('delete from pending_extraction where event_id = ?', [(i,) for i in sorted(done & pending)])
    db.commit()
    cost = sum(usage[k] * PRICE_PER_MTOK[k] for k in usage) / 1e6
    print(f'{len(done)} festivals answered, {len(failed)} failed {sorted(failed)}; '
          f'{usage["input"]} input and {usage["output"]} output tokens, about ${cost:.2f}')


if __name__ == '__main__':
    main()
