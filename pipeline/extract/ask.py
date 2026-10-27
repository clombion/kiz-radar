"""Ask Claude the extraction passes for the festivals that need them, and save each answer.

    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite             # what the monthly Action runs
    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --dry-run   # list what would be asked
    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --limit 3   # ask about three festivals only
    uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --only 16909,18806   # these festivals only

A festival needs a pass when its answer is due (states.AnswerState): it is in pending_extraction (its description is
new or changed), the pass has no answer for it yet, or its answer was asked with another prompt than the pass's
current one (pipeline/prompt.py, known by its hash). Each question is one festival and one pass, with the pass's
prompt and its schema as the required answer format. check_output.problems() (and prices.problems() for prices) checks the answer; on a
failure Claude gets the checker's lines and answers once more, and a second failure leaves the festival
pending. A checked answer is saved as answers/<pass>/event-<id>.json, its prompt archived. A festival leaves
pending_extraction once every pass has a checked answer from this run, so a run of some passes leaves it there. Requests stop once the month's budget for Claude is spent
(pipeline/spend.py), and the run then fails. Needs ANTHROPIC_API_KEY.
"""

import argparse
import collections
import json
import sqlite3
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

import anthropic

from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline import spend
from pipeline.extract import answers, check_output, prices
from pipeline.prompt import Prompt
from pipeline.states import AnswerState

MODEL = 'claude-haiku-5-5'
WORKERS = 8
BY = 'pipeline/extract/ask.py (Messages API), one festival'


def question(pass_name, row, styles=()):
    """(the message, the batch it holds) asking one festival's pass."""
    event = {'event_id': row['id'], 'title': row['title'], 'description': row['description_text']}
    if pass_name == 'prices':
        event = {
            'event_id': row['id'],
            'title': row['title'],
            'start_date': row['start_date'][:10],
            'end_date': row['end_date'][:10],
            'country': row['country'],
            'styles': list(styles),
            'description': row['description_text'],
        }
    batch = {'batch': f'event-{row["id"]}', 'events': [event]}
    return f'Batch input ({batch["batch"]}.json):\n{json.dumps(batch, ensure_ascii=False, indent=1)}', batch


def structured(client, model, prompt: Prompt, content, check, label, step):
    """Claude's answer to the prompt and the message, in its schema's shape, once check() finds no problems in it; or
    None after two tries: on a failure Claude gets the checker's lines and answers once more. Each request is checked
    first against the month's budget (spend.BudgetSpent once it is spent) and the model's price and goes in the
    ledger under step."""
    messages = [{'role': 'user', 'content': content}]
    for attempt in (1, 2):
        spend.check(model)
        try:
            with client.messages.stream(
                model=model,
                max_tokens=64000,
                system=prompt.system,
                messages=messages,
                output_config={'format': {'type': 'json_schema', 'schema': prompt.sent_schema}},
            ) as stream:
                reply = stream.get_final_message()
        except anthropic.APIStatusError as e:
            print(f'{label}: API error {e.status_code} ({e.message}); left pending', file=sys.stderr)
            return None
        except anthropic.APIConnectionError as e:
            print(f'{label}: connection failed ({e}); left pending', file=sys.stderr)
            return None
        spend.record(step, model, reply.usage.input_tokens, reply.usage.output_tokens)
        if reply.stop_reason != 'end_turn':
            print(
                f'{label}: stopped on {reply.stop_reason} (request {reply._request_id}); left pending', file=sys.stderr
            )
            return None
        text = next(b.text for b in reply.content if b.type == 'text')
        try:
            output = json.loads(text)
        except json.JSONDecodeError as e:
            found = [f'not valid JSON ({e})']
        else:
            if not (found := check(output)):
                return output
        print(f'{label}: try {attempt} failed the checker: ' + ' | '.join(found), file=sys.stderr)
        messages += [
            {'role': 'assistant', 'content': reply.content},
            {
                'role': 'user',
                'content': 'The checker found these problems:\n'
                + '\n'.join(found)
                + '\n\nAnswer again with the whole corrected object.',
            },
        ]
    return None


def ask(client, pass_name, row, styles=()):
    """A checked answer for one festival and pass, or None after two failed tries; styles are the festival's
    (prices.styles), for the prices pass."""
    content, batch = question(pass_name, row, styles)
    prompt = prompts.current(pass_name)
    check = lambda out: (
        check_output.problems(prompt.schema, batch, out)
        or (
            prices.problems(out)
            + [p for ev in out['events'] for p in prices.style_problems(ev['passes'], list(styles))]
            if pass_name == 'prices'
            else []
        )
    )
    return structured(client, MODEL, prompt, content, check, f'{row["id"]} {pass_name}', pass_name)


def due(db, only, ids=None):
    """(event row, pass) pairs to ask: each pass whose answer for a festival is none or stale (answer_state), of the
    festivals ids names when it names some."""
    rows = {r['id']: r for r in db.execute('select * from events where description_text is not null order by id')}
    if ids:
        if missing := ids - set(rows):
            sys.exit(f'no festival with a description: {sorted(missing)}')
        rows = {i: r for i, r in rows.items() if i in ids}
    pending = {i for (i,) in db.execute('select event_id from pending_extraction')}
    out = []
    for pass_name in only or prompts.PASSES:
        have = answers.latest(pass_name, set(rows))
        out += [
            (rows[i], pass_name)
            for i in rows
            if answer_state(pass_name, have.get(i), i in pending) != AnswerState.CURRENT
        ]
    return out, pending


def answer_state(pass_name, answer, pending):
    """A festival's answer of a pass: none, stale (to another prompt, or its description changed since), or current."""
    return (
        AnswerState.NONE
        if answer is None
        else AnswerState.STALE
        if pending or not prompts.is_current(pass_name, answer.prompt)
        else AnswerState.CURRENT
    )


def settled(answered, pending):
    """The pending festivals this run answered every pass of (answered: {festival: its passes answered}): they leave
    pending_extraction. One asked only some passes (--pass) stays, so its other passes are asked again."""
    return sorted(i for i in pending if answered.get(i, set()) >= set(prompts.PASSES))


def main():
    ap = argparse.ArgumentParser(description='Ask Claude the extraction passes for the festivals that need them.')
    ap.add_argument(
        'src', type=sqlite_db.existing, help='the source DB; festivals leave its pending_extraction once answered'
    )
    ap.add_argument('--dry-run', action='store_true', help='list what would be asked, without asking')
    ap.add_argument('--limit', type=int, help='ask about at most this many festivals')
    ap.add_argument(
        '--pass', dest='passes', action='append', choices=prompts.PASSES, help='only this pass (repeatable)'
    )
    ap.add_argument('--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"')
    a = ap.parse_args()

    db = sqlite_db.connect(a.src, 'rw')
    db.row_factory = sqlite3.Row
    todo, pending = due(db, a.passes, a.only)
    if a.limit:
        keep = sorted({r['id'] for r, _ in todo})[: a.limit]
        todo = [(r, p) for r, p in todo if r['id'] in keep]
    counts = {p: sum(1 for _, q in todo if q == p) for p in prompts.PASSES}
    print(f'{len({r["id"] for r, _ in todo})} festivals to ask about: {counts}; {len(pending)} pending')
    if a.dry_run or not todo:
        return

    # read here, since the workers don't share the connection; genres a new festival's answers add load after this run
    styles = {r['id']: prices.styles(db, r['id']) for r, p in todo if p == 'prices'}
    client = anthropic.Anthropic()
    lock, failed, answered, before, stopped = (
        threading.Lock(),
        set(),
        collections.defaultdict(set),
        spend.month_usd(),
        [],
    )

    def one(job):
        row, pass_name = job
        try:
            output = ask(client, pass_name, row, styles.get(row['id'], ()))
        except spend.BudgetSpent as e:
            output = None
            stopped[:1] = [str(e)]
        with lock:
            if output is None:
                failed.add(row['id'])
            else:
                answers.save(pass_name, row['id'], output, MODEL, prompts.current(pass_name), BY)
                answered[row['id']].add(pass_name)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(one, todo))

    done = {r['id'] for r, _ in todo} - failed
    db.executemany('delete from pending_extraction where event_id = ?', [(i,) for i in settled(answered, pending)])
    db.commit()
    print(
        f'{len(done)} festivals answered, {len(failed)} failed {sorted(failed)}; '
        f'${spend.month_usd() - before:.2f} this run, €{spend.eur(spend.month_usd()):.2f} of €{spend.BUDGET_EUR} this month'
    )
    if stopped:
        sys.exit(f'{stopped[0]}: the rest waits for next month')


if __name__ == '__main__':
    main()
