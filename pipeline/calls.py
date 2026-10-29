"""What a call to a service gives when it gives no answer: Declined, with its cause (states.py, call_cause), so a step
tells what to retry from what to stop on in one place. A call gives its answer or a Declined, never an exception of
its own: a step that meets a structural or a budget cause stops calling, and its exit code is derived from the causes
it met (failed()).

cause() is total over what Claude's SDK raises for a call (anthropic 2.3.0): a lost connection or a timeout, or HTTP 429
or 5xx, is transient; any other HTTP status (409 included), or a reply the SDK can't read, is structural. A transport
error mid-stream (httpx2's, which the SDK lets through) is transient too.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import assert_never

import anthropic
import httpx2

from pipeline.enums import CallCause

TOO_MANY, SERVER_ERROR = 429, 500
STOPS = frozenset({CallCause.STRUCTURAL, CallCause.BUDGET})  # a cause after which a step makes no further call

type CallError = (
    anthropic.APIConnectionError
    | anthropic.APIStatusError
    | anthropic.APIResponseValidationError
    | httpx2.TransportError
)
CALL_ERRORS = (
    anthropic.APIConnectionError,
    anthropic.APIStatusError,
    anthropic.APIResponseValidationError,
    httpx2.TransportError,
)


@dataclass(frozen=True)
class Declined:
    """A call that gave no answer: why, and what it says."""

    cause: CallCause
    why: str

    @property
    def stops(self) -> bool:
        return self.cause in STOPS


def cause(e: CallError) -> CallCause:
    match e:
        case anthropic.APIConnectionError() | httpx2.TransportError():  # a timeout is a connection error
            return CallCause.TRANSIENT
        case anthropic.APIStatusError(status_code=status):
            return CallCause.TRANSIENT if status == TOO_MANY or status >= SERVER_ERROR else CallCause.STRUCTURAL
        case anthropic.APIResponseValidationError():
            return CallCause.STRUCTURAL
        case _:
            assert_never(e)


def declined(e: CallError) -> Declined:
    match e:
        case anthropic.APIStatusError():
            return Declined(cause(e), f'API error {e.status_code} ({e.message})')
        case _:
            return Declined(cause(e), f'{type(e).__name__}: {e}')


def failed(what: str, declined: Iterable[tuple[object, Declined]]) -> str | None:
    """The message a step exits with when calls gave no answer (None when every one did): how many of what, by
    cause, the first stop's words first."""
    found = list(declined)
    if not found:
        return None
    by: dict[CallCause, list[str]] = {}
    for who, d in found:
        by.setdefault(d.cause, []).append(str(who))
    stop = next((d.why for _, d in found if d.stops), None)
    counts = '; '.join(f'{c}: {len(ws)} ({", ".join(sorted(ws)[:10])})' for c, ws in sorted(by.items()))
    return (f'{stop}: the rest waits. ' if stop else '') + f'{len(found)} {what} gave no answer: {counts}'
