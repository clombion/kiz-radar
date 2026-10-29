"""Ask Claude the extraction passes for the festivals that need them, and save each answer.

    mise run ask             # what the monthly Action runs
    mise run ask -- --dry-run   # list what would be asked
    mise run ask -- --limit 3   # ask about three festivals only
    mise run ask -- --only 16909,18806   # these festivals only

A festival needs a pass when its answer is due (answers.state): the pass has no answer for it yet, or its answer
answered another prompt than the pass's current one (pipeline/prompt.py, known by its hash) or another message than
the one the festival would be asked with today (questions.py): its description, title, dates or country changed, or,
for the prices pass, the styles its genres give. The extraction and rooms-genres passes are asked first, then the
prices pass, with the styles the rooms-genres answers now give (WAVES). Each question is one festival and one pass,
with the pass's prompt and its record's schema as the required answer format. check_output.checked() (and
prices.problems() for prices) checks the answer; on a failure Claude gets the checker's lines and answers once more. A
checked answer is saved as answers/<pass>/event-<id>.json with where it comes from, its prompt archived.

A question that gets no answer (pipeline/calls.py: a second checker failure, a reply cut short, a failed call) leaves
its answer due, and the run fails naming each such question. A call that can never succeed as made (structural,
a bad key say) or the month's budget for Claude spent (pipeline/spend.py) stops the run's requests: the questions left
wait for the next run. Needs ANTHROPIC_API_KEY.
"""

import argparse
import sys
import threading
from collections.abc import Callable, Iterable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from contextlib import AbstractContextManager
from dataclasses import dataclass
from typing import Protocol, assert_never

import anthropic
import httpx2
from anthropic.types import Message, MessageParam, OutputConfigParam, TextBlock, Usage
from pydantic import ValidationError

from pipeline import calls, export, records, spend
from pipeline import db as sqlite_db
from pipeline import prompt as prompts
from pipeline.calls import Declined
from pipeline.enums import AnswerState, CallCause, Model, Style
from pipeline.extract import answers, check_output, merge_review, prices, questions
from pipeline.prompt import Pass, Prompt
from pipeline.records import (
    Asked,
    AskedPrices,
    Batch,
    Entry,
    MergeAnswer,
    MergeQuestion,
    Priced,
    Record,
    RoomsGenres,
    errors,
)

MODEL = Model.CLAUDE_HAIKU_5_5
WORKERS = 8
BY = 'pipeline/extract/ask.py (Messages API), one festival'
BY_PAIR = 'pipeline/extract/ask.py (Messages API), one pair'


TOO_MANY, SERVER_ERROR = 429, 500
# what Claude's SDK raises for a call (anthropic 2.3.0), and httpx2's transport errors, which it lets through mid-stream
type SdkError = (
    anthropic.APIConnectionError
    | anthropic.APIStatusError
    | anthropic.APIResponseValidationError
    | httpx2.TransportError
)
SDK_ERRORS = (
    anthropic.APIConnectionError,
    anthropic.APIStatusError,
    anthropic.APIResponseValidationError,
    httpx2.TransportError,
)


def cause(e: SdkError) -> CallCause:
    """Total over what the SDK raises: a lost connection or a timeout, or HTTP 429 or 5xx, is transient; any other
    HTTP status (409 included), or a reply the SDK can't read, is structural."""
    match e:
        case anthropic.APIConnectionError() | httpx2.TransportError():  # a timeout is a connection error
            return CallCause.TRANSIENT
        case anthropic.APIStatusError(status_code=status):
            return CallCause.TRANSIENT if status == TOO_MANY or status >= SERVER_ERROR else CallCause.STRUCTURAL
        case anthropic.APIResponseValidationError():
            return CallCause.STRUCTURAL
        case _:
            assert_never(e)


def sdk_declined(e: SdkError) -> Declined:
    match e:
        case anthropic.APIStatusError():
            return Declined(cause(e), f'API error {e.status_code} ({e.message})')
        case _:
            return Declined(cause(e), f'{type(e).__name__}: {e}')


class Stream(Protocol):
    def get_final_message(self) -> Message: ...

    @property
    def current_message_snapshot(self) -> Message: ...


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


@dataclass(frozen=True)
class Request:
    """A question to Claude: the model, the prompt, the message, how its lines are labelled, and the step of the
    ledger it is spent under."""

    model: Model
    prompt: Prompt
    content: str
    label: str
    step: prompts.Name


def billed(stream: Stream) -> Usage | None:
    """The tokens a stream cut short was billed for so far; None when no message had started (nothing billed)."""
    try:
        return stream.current_message_snapshot.usage
    except AssertionError:  # the SDK's: no message_start yet
        return None


def reply_to(client: Client, request: Request, messages: list[MessageParam]) -> Message | Declined:
    """One request's reply, in the ledger under its step whatever became of it; or why there is none."""
    if why := spend.spent():
        return Declined(CallCause.BUDGET, why)
    try:
        with client.messages.stream(
            model=request.model,
            max_tokens=64000,
            system=request.prompt.system,
            messages=messages,
            output_config={'format': {'type': 'json_schema', 'schema': dict(request.prompt.sent_schema)}},
        ) as stream:
            try:
                reply = stream.get_final_message()
            except SDK_ERRORS:
                if usage := billed(stream):
                    _ = spend.record(request.step, request.model, usage.input_tokens, usage.output_tokens)
                raise
    except SDK_ERRORS as e:
        return sdk_declined(e)
    _ = spend.record(request.step, request.model, reply.usage.input_tokens, reply.usage.output_tokens)
    return reply


def structured[R: Record](client: Client, request: Request, check: Callable[[str], R | list[str]]) -> R | Declined:
    """Claude's answer to the prompt and the message, as the prompt's record, once check() finds no problems in it;
    or why there is none (pipeline/calls.py): it failed the checker twice (on a failure Claude gets the checker's lines
    and answers once more), it stopped short, the call failed, or the month's budget is spent, which is checked before
    each request. Every request goes in the ledger under its step."""
    messages: list[MessageParam] = [{'role': 'user', 'content': request.content}]
    found: list[str] = []
    for attempt in (1, 2):
        match reply_to(client, request, messages):
            case Declined() as d:
                return d
            case reply:
                pass
        if reply.stop_reason != 'end_turn':
            return Declined(CallCause.TRUNCATED, f'stopped on {reply.stop_reason} (message {reply.id})')
        if (text := next((b.text for b in reply.content if isinstance(b, TextBlock)), None)) is None:
            return Declined(CallCause.STRUCTURAL, f'a reply with no text (message {reply.id})')
        match check(text):
            case list() as found:
                pass
            case output:
                return output
        print(f'{request.label}: try {attempt} failed the checker: ' + ' | '.join(found), file=sys.stderr)
        again = (
            'The checker found these problems:\n'
            + '\n'.join(found)
            + '\n\nAnswer again with the whole corrected object.'
        )
        messages.append({'role': 'assistant', 'content': text})
        messages.append({'role': 'user', 'content': again})
    return Declined(CallCause.CHECKER, ' | '.join(found))


def own_problems[E: Entry](answer: Batch[E], styles: Sequence[Style]) -> list[str]:
    """What a pass's own checks find in an answer: the prices pass's (prices.problems) on its festivals' prices."""
    return [p for ev in answer.events if isinstance(ev, Priced) for p in prices.problems(ev, styles)]


@dataclass(frozen=True)
class Job:
    """A question to ask: a festival, a pass, the festival as the pass asks about it, and the digest of the message
    asking it (questions.Now.inputs)."""

    pass_: Pass[Entry, Asked]
    asked: Asked
    question: Record
    inputs: str


def job(now: questions.Now, pass_: Pass[Entry, Asked], event_id: int, rooms: RoomsGenres | None = None) -> Job:
    question = now.question(pass_, event_id, rooms)
    message = prompts.current(pass_.name).message(question)
    return Job(pass_, now.asked(pass_, event_id, rooms), question, records.digest(message))


def ask(client: Client, j: Job) -> Batch[Entry] | Declined:
    """A checked answer for one festival and pass, or why there is none."""
    styles = j.asked.styles if isinstance(j.asked, AskedPrices) else ()
    texts = {j.asked.event_id: check_output.source_text(j.asked)}
    prompt = prompts.current(j.pass_.name)

    def check(text: str) -> Batch[Entry] | list[str]:
        match check_output.checked(prompts.answer(j.pass_), text, texts):
            case list() as found:
                return found
            case answer:
                return own_problems(answer, styles) or answer

    request = Request(MODEL, prompt, prompt.message(j.question), f'{j.asked.event_id} {j.pass_.name}', j.pass_.name)
    return structured(client, request, check)


def due(
    now: questions.Now,
    passes: Sequence[Pass[Entry, Asked]],
    ids: Iterable[int],
    rooms: Mapping[int, RoomsGenres] | None = None,
) -> list[Job]:
    """The questions to ask of these festivals and passes: each whose answer is none or stale (answers.state); the
    prices pass asked with the styles the rooms-genres answers make (rooms, current ones by festival)."""
    out: list[Job] = []
    for pass_ in passes:
        have = answers.answered(pass_.name, set(ids))
        for i in sorted(ids):
            j = job(now, pass_, i, (rooms or {}).get(i))
            if answers.state(pass_.name, have[i][1] if i in have else None, j.inputs) != AnswerState.CURRENT:
                out.append(j)
    return out


def current_rooms(now: questions.Now) -> dict[int, RoomsGenres]:
    """The festivals' current rooms-genres answers, which the prices pass is asked with."""
    return {i: a.entry for i, a in now.current(prompts.ROOMS_GENRES).items()}


class Question[R](Protocol):
    """A question to ask: its label, how to ask it, and how to save its answer."""

    @property
    def label(self) -> str: ...

    def ask(self, client: Client) -> R | Declined: ...

    def save(self, answer: R) -> None: ...


@dataclass(frozen=True)
class PassQuestion:
    """A festival's question of one pass."""

    j: Job

    @property
    def label(self) -> str:
        return f'{self.j.asked.event_id} {self.j.pass_.name}'

    def ask(self, client: Client) -> Batch[Entry] | Declined:
        return ask(client, self.j)

    def save(self, answer: Batch[Entry]) -> None:
        asking = answers.Asking(prompts.current(self.j.pass_.name).archive(), MODEL, BY, self.j.inputs)
        _ = answers.save(self.j.pass_.name, answer, asking)


@dataclass(frozen=True)
class PairQuestion:
    """A pair's question of the merge review."""

    q: MergeQuestion

    @property
    def label(self) -> str:
        return f'{self.q.key_a} / {self.q.key_b} merge_review'

    def ask(self, client: Client) -> MergeAnswer | Declined:
        prompt = prompts.current('merge_review')

        def check(text: str) -> MergeAnswer | list[str]:
            try:
                return MergeAnswer.parse(text)
            except ValidationError as e:
                return errors(e, 'schema')

        return structured(client, Request(MODEL, prompt, prompt.message(self.q), self.label, 'merge_review'), check)

    def save(self, answer: MergeAnswer) -> None:
        asking = answers.Asking(prompts.current('merge_review').archive(), MODEL, BY_PAIR, merge_review.inputs(self.q))
        _ = merge_review.save(self.q, answer, asking)


def answer_all[R](
    client: Client, todo: Sequence[Question[R]], stop: Declined | None = None, workers: int = WORKERS
) -> dict[str, Declined]:
    """Ask every question, saving each answer; the ones that got none, by label, and why. After a call that stops the
    run (pipeline/calls.py), or when stop is already one, no further question is asked: each is declined for the same
    reason."""
    lock = threading.Lock()
    declined: dict[str, Declined] = {}

    def one(q: Question[R]) -> None:
        with lock:
            stopped = stop or next((d for d in declined.values() if d.stops), None)
        output = stopped or q.ask(client)
        with lock:
            match output:
                case Declined():
                    declined[q.label] = output
                    if output is not stopped:
                        print(f'{q.label}: {output.cause}: {output.why}', file=sys.stderr)
                case _:
                    q.save(output)

    with ThreadPoolExecutor(workers) as pool:
        _ = list(pool.map(one, todo))
    return declined


# the passes in the order they are asked: the prices pass after the rooms-genres one, whose answers give its styles
WAVES: tuple[tuple[Pass[Entry, Asked], ...], ...] = ((prompts.EXTRACT, prompts.ROOMS_GENRES), (prompts.PRICES,))


class Args(argparse.Namespace):
    dry_run: bool = False
    limit: int | None = None
    passes: list[prompts.Name] | None = None
    only: set[int] | None = None


def main() -> None:
    ap = argparse.ArgumentParser(description='Ask Claude the extraction passes for the festivals that need them.')
    _ = ap.add_argument('--dry-run', action='store_true', help='list what would be asked, without asking')
    _ = ap.add_argument('--limit', type=sqlite_db.at_least_one, help='ask about at most this many festivals')
    _ = ap.add_argument(
        '--pass',
        dest='passes',
        action='append',
        choices=[*(p.name for p in prompts.PASSES), 'merge_review'],
        help='only this pass (repeatable)',
    )
    _ = ap.add_argument('--only', type=sqlite_db.festival_ids, help='only these festivals, by id: "16909,18806"')
    a = ap.parse_args(namespace=Args())

    with export.opened('ro') as db:
        now = questions.now(db)
        # the merge review, unless only some festivals or other passes are asked
        merging = not a.only and (not a.passes or 'merge_review' in a.passes)
        reviews = merge_review.due(db) if merging else []
    ids = set(now.festivals)
    if a.only:
        if missing := a.only - ids:
            sys.exit(f'no festival with a description: {sorted(missing)}')
        ids = a.only
    waves = [[p for p in wave if not a.passes or p.name in a.passes] for wave in WAVES]
    # what is due now; the prices questions as the rooms-genres answers stand before this run
    planned = [due(now, wave, ids, current_rooms(now)) for wave in waves]
    if a.limit is not None:
        ids = set(sorted({j.asked.event_id for wave in planned for j in wave})[: a.limit])
        planned = [[j for j in wave if j.asked.event_id in ids] for wave in planned]
    if a.limit is not None:
        reviews = reviews[: a.limit]
    counts = {p.name: sum(1 for wave in planned for j in wave if j.pass_ is p) for p in prompts.PASSES}
    print(
        f'{len({j.asked.event_id for wave in planned for j in wave})} festivals to ask about: {counts}; '
        f'{len(reviews)} pairs to review'
    )
    if a.dry_run or not (any(planned) or reviews):
        return

    client, before = anthropic.Anthropic(), spend.month_usd()
    declined: dict[str, Declined] = {}
    for n, wave in enumerate(waves):
        # a later wave is asked as the answers of the earlier ones now stand
        todo = planned[0] if n == 0 else due(now, wave, ids, current_rooms(now))
        declined |= answer_all(client, [PassQuestion(j) for j in todo], stopped(declined))
    if reviews:
        declined |= answer_all(client, [PairQuestion(q) for q in reviews], stopped(declined))
    print(
        f'{len(declined)} questions got no answer; ${spend.month_usd() - before:.2f} this run, '
        f'€{spend.eur(spend.month_usd()):.2f} of €{spend.BUDGET_EUR} this month'
    )
    if why := calls.failed('questions', declined.items()):
        sys.exit(why)


def stopped(declined: Mapping[str, Declined]) -> Declined | None:
    """What stops the questions still to ask: a call that stopped the run."""
    return next((d for d in declined.values() if d.stops), None)


if __name__ == '__main__':
    main()
