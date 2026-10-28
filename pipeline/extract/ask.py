"""Ask Claude the extraction passes for the festivals that need them, and save each answer.

    mise run ask             # what the monthly Action runs
    mise run ask -- --dry-run   # list what would be asked
    mise run ask -- --limit 3   # ask about three festivals only
    mise run ask -- --only 16909,18806   # these festivals only

A festival needs a pass when its answer is due (enums.AnswerState): the pass has no answer for it yet, its answer was
asked with another prompt than the pass's current one (pipeline/prompt.py, known by its hash), or it was asked before
the day the festival's description last changed (pending_extraction's since). Each question is one festival and one
pass, with the pass's prompt and its record's schema as the required answer format. check_output.checked() (and
prices.problems() for prices) checks the answer; on a failure Claude gets the checker's lines and answers once more, and
a second failure leaves the festival pending. A checked answer is saved as answers/<pass>/event-<id>.json, its prompt
archived. A festival leaves pending_extraction once every pass has an answer that is current, from this run or an
earlier one, so a run of some passes leaves it there and the next asks only the rest. Requests stop once the month's
budget for Claude is spent (pipeline/spend.py), and the run then fails. Needs ANTHROPIC_API_KEY.
"""

import argparse
import datetime as dt
import json
import sys
import threading
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

import anthropic
from anthropic.types import Message, MessageParam, OutputConfigParam, TextBlock

from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline import spend
from pipeline.enums import AnswerState, Style
from pipeline.extract import answers, check_output, prices
from pipeline.prompt import Pass, Prompt
from pipeline.records import Asked, AskedPrices, Batch, Date, Entry, On, Priced, Record

if TYPE_CHECKING:
    from pathlib import Path

MODEL = 'claude-haiku-5-5'
WORKERS = 8
BY = 'pipeline/extract/ask.py (Messages API), one festival'


class Stream(Protocol):
    def get_final_message(self) -> Message: ...


class Streams(Protocol):
    def stream(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str,
        messages: list[MessageParam],
        output_config: OutputConfigParam,
    ) -> AbstractContextManager[Stream]: ...


class Client(Protocol):
    """What the pipeline asks of a client of Claude's Messages API (anthropic.Anthropic): a streamed request."""

    @property
    def messages(self) -> Streams: ...


class Festival(Record):
    """A festival with a description, as the source database has it."""

    id: int
    title: str
    description_text: str
    start_date: On
    end_date: On
    country: str | None


class Pending(Record):
    """A festival pending_extraction holds: the day its description last changed."""

    event_id: int
    since: Date


def asked(pass_: Pass[Entry, Asked], f: Festival, styles: Sequence[Style] = ()) -> Asked:
    """The festival as the pass asks about it; styles are the festival's (prices.styles), for the prices pass."""
    if pass_.asked is AskedPrices:
        return AskedPrices(
            event_id=f.id,
            title=f.title,
            description=f.description_text,
            start_date=f.start_date,
            end_date=f.end_date,
            country=f.country,
            styles=tuple(styles),
        )
    return Asked(event_id=f.id, title=f.title, description=f.description_text)


def question(pass_: Pass[Entry, Asked], f: Festival, styles: Sequence[Style] = ()) -> tuple[str, Asked]:
    """(the message asking one festival's pass, the festival as asked)."""
    event, batch = asked(pass_, f, styles), f'event-{f.id}'
    events: list[dict[str, object]] = [event.model_dump(mode='json')]  # as its own record, whichever it is
    text = json.dumps({'batch': batch, 'events': events}, ensure_ascii=False, indent=1)
    return f'Batch input ({batch}.json):\n{text}', event


@dataclass(frozen=True)
class Request:
    """A question to Claude: the model, the prompt, the message, how its lines are labelled, and the step of the
    ledger it is spent under."""

    model: str
    prompt: Prompt
    content: str
    label: str
    step: str


def structured[R: Record](client: Client, request: Request, check: Callable[[str], R | list[str]]) -> R | None:
    """Claude's answer to the prompt and the message, as the prompt's record, once check() finds no problems in it;
    or None after two tries: on a failure Claude gets the checker's lines and answers once more. Each request is
    checked first against the month's budget (spend.BudgetSpentError once it is spent) and the model's price and goes
    in the ledger under its step."""
    model, prompt, label = request.model, request.prompt, request.label
    messages: list[MessageParam] = [{'role': 'user', 'content': request.content}]
    for attempt in (1, 2):
        spend.check(model)
        try:
            with client.messages.stream(
                model=model,
                max_tokens=64000,
                system=prompt.system,
                messages=messages,
                output_config={'format': {'type': 'json_schema', 'schema': dict(prompt.sent_schema)}},
            ) as stream:
                reply = stream.get_final_message()
        except anthropic.APIStatusError as e:
            print(f'{label}: API error {e.status_code} ({e.message}); left pending', file=sys.stderr)
            return None
        except anthropic.APIConnectionError as e:
            print(f'{label}: connection failed ({e}); left pending', file=sys.stderr)
            return None
        _ = spend.record(request.step, model, reply.usage.input_tokens, reply.usage.output_tokens)
        if reply.stop_reason != 'end_turn':
            print(f'{label}: stopped on {reply.stop_reason} (message {reply.id}); left pending', file=sys.stderr)
            return None
        text = next(b.text for b in reply.content if isinstance(b, TextBlock))
        match check(text):
            case list() as found:
                pass
            case output:
                return output
        print(f'{label}: try {attempt} failed the checker: ' + ' | '.join(found), file=sys.stderr)
        again = (
            'The checker found these problems:\n'
            + '\n'.join(found)
            + '\n\nAnswer again with the whole corrected object.'
        )
        messages.append({'role': 'assistant', 'content': text})
        messages.append({'role': 'user', 'content': again})
    return None


def own_problems[E: Entry](answer: Batch[E], styles: Sequence[Style]) -> list[str]:
    """What a pass's own checks find in an answer: the prices pass's (prices.problems) on its festivals' prices."""
    return [p for ev in answer.events if isinstance(ev, Priced) for p in prices.problems(ev, styles)]


def ask[E: Entry, Q: Asked](
    client: Client, pass_: Pass[E, Q], f: Festival, styles: Sequence[Style] = ()
) -> Batch[E] | None:
    """A checked answer for one festival and pass, or None after two failed tries; styles are the festival's
    (prices.styles), for the prices pass."""
    content, event = question(pass_, f, styles)
    texts = {event.event_id: event.description + '\n' + event.title}

    def check(text: str) -> Batch[E] | list[str]:
        match check_output.checked(prompts.answer(pass_), text, texts):
            case list() as found:
                return found
            case answer:
                return own_problems(answer, styles) or answer

    request = Request(MODEL, prompts.current(pass_.name), content, f'{f.id} {pass_.name}', pass_.name)
    return structured(client, request, check)


type Job = tuple[Festival, Pass[Entry, Asked]]


def due(
    db: sqlite_db.Reader, only: Sequence[prompts.PassName] | None, ids: set[int] | None = None
) -> tuple[list[Job], dict[int, dt.date]]:
    """((festival, pass) pairs to ask: each pass whose answer for a festival is none or stale (answer_state), of the
    festivals ids names when it names some; the festivals pending_extraction holds, with the day their description
    last changed)."""
    query = 'select id, title, description_text, start_date, end_date, country from events'
    rows = {f.id: f for f in db.rows(Festival, query + ' where description_text is not null order by id')}
    if ids:
        if missing := ids - set(rows):
            sys.exit(f'no festival with a description: {sorted(missing)}')
        rows = {i: r for i, r in rows.items() if i in ids}
    pending = {p.event_id: p.since for p in db.rows(Pending, 'select event_id, since from pending_extraction')}
    out: list[Job] = []
    for pass_ in (p for p in prompts.PASSES if not only or p.name in only):
        have = answers.answered(pass_.name, set(rows))
        out += [
            (rows[i], pass_)
            for i in rows
            if answer_state(pass_.name, have[i][1] if i in have else None, since=pending.get(i)) != AnswerState.CURRENT
        ]
    return out, pending


def answer_state(pass_name: prompts.PassName, answer: answers.Logged | None, *, since: dt.date | None) -> AnswerState:
    """A festival's answer of a pass (its file's log row, None when it has none): none, stale (to another prompt, or
    asked before since, the day its description last changed, when it is pending), or current. An answer asked on that
    day counts as asked after it: the refresh that finds a change runs before the questions."""
    if answer is None:
        return AnswerState.NONE
    if not prompts.is_current(pass_name, answer.prompt) or (since is not None and answer.answered_at.date() < since):
        return AnswerState.STALE
    return AnswerState.CURRENT


def settled(pending: Mapping[int, dt.date]) -> list[int]:
    """The pending festivals whose every pass now has a current answer: they leave pending_extraction. One whose
    passes were asked only in part (--pass) stays, and the next run asks the rest."""
    have: list[tuple[prompts.PassName, dict[int, tuple[Path, answers.Logged]]]] = [
        (p.name, answers.answered(p.name, set(pending))) for p in prompts.PASSES
    ]
    return sorted(
        i
        for i, since in pending.items()
        if all(
            i in found and answer_state(name, found[i][1], since=since) == AnswerState.CURRENT for name, found in have
        )
    )


class Args(argparse.Namespace):
    dry_run: bool = False
    limit: int | None = None
    passes: list[prompts.PassName] | None = None
    only: set[int] | None = None


def main() -> None:
    ap = argparse.ArgumentParser(description='Ask Claude the extraction passes for the festivals that need them.')
    _ = ap.add_argument('--dry-run', action='store_true', help='list what would be asked, without asking')
    _ = ap.add_argument('--limit', type=int, help='ask about at most this many festivals')
    _ = ap.add_argument(
        '--pass',
        dest='passes',
        action='append',
        choices=[p.name for p in prompts.PASSES],
        help='only this pass (repeatable)',
    )
    _ = ap.add_argument('--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"')
    a = ap.parse_args(namespace=Args())

    with sqlite_db.opened(sqlite_db.export(), 'rw') as db:  # festivals leave its pending_extraction once answered
        todo, pending = due(db, a.passes, a.only)
        if a.limit:
            keep = sorted({f.id for f, _ in todo})[: a.limit]
            todo = [(f, p) for f, p in todo if f.id in keep]
        counts = {p.name: sum(1 for _, q in todo if q is p) for p in prompts.PASSES}
        print(f'{len({f.id for f, _ in todo})} festivals to ask about: {counts}; {len(pending)} pending')
        if a.dry_run or not todo:
            return

        # read here, since the workers don't share the connection; genres a new festival's answers add load after this
        # run
        styles = {f.id: prices.styles(db, f.id) for f, p in todo if p is prompts.PRICES}
        client: Client = anthropic.Anthropic()
        lock, before = threading.Lock(), spend.month_usd()
        failed: set[int] = set()
        stopped: list[str] = []

        def one(job: Job) -> None:
            f, pass_ = job
            try:
                output = ask(client, pass_, f, styles.get(f.id, ()))
            except spend.BudgetSpentError as e:
                output = None
                stopped[:1] = [str(e)]
            with lock:
                if output is None:
                    failed.add(f.id)
                else:
                    _ = answers.save(pass_.name, output, MODEL, prompts.current(pass_.name), BY)

        with ThreadPoolExecutor(WORKERS) as pool:
            _ = list(pool.map(one, todo))

        done = {f.id for f, _ in todo} - failed
        with db.transaction() as tx:
            tx.executemany('delete from pending_extraction where event_id = ?', [(i,) for i in settled(pending)])
        print(
            f'{len(done)} festivals answered, {len(failed)} failed {sorted(failed)}; '
            f'${spend.month_usd() - before:.2f} this run, '
            f'€{spend.eur(spend.month_usd()):.2f} of €{spend.BUDGET_EUR} this month'
        )
        if stopped:
            sys.exit(f'{stopped[0]}: the rest waits for next month')


if __name__ == '__main__':
    main()
