"""What a call to a service gives when it gives no answer: Declined, with its cause (states.py, call_cause), so a step
tells what to retry from what to stop on in one place. A call gives its answer or a Declined, never an exception of
its own: a step that meets a structural or a budget cause stops calling, and its exit code is derived from the causes
it met (failed()).

Each service's own errors are read as causes where it is called: Claude's in extract/ask.py (sdk_declined), the
browser's and the ticket sites' in tickets_reading.py, fli's in fares.py, plain HTTPS's in web.py.
"""

import collections
from collections.abc import Iterable
from dataclasses import dataclass

from pipeline.enums import CallCause

STOPS = frozenset({CallCause.STRUCTURAL, CallCause.BUDGET})  # a cause after which a step makes no further call


@dataclass(frozen=True)
class Declined:
    """A call that gave no answer: why, and what it says."""

    cause: CallCause
    why: str

    @property
    def stops(self) -> bool:
        return self.cause in STOPS


def failed(what: str, declined: Iterable[tuple[object, Declined]]) -> str | None:
    """The message a step exits with when calls gave no answer (None when every one did): how many of what, by
    cause, the first stop's words first, then each one's (the first ten)."""
    found = sorted(((str(who), d) for who, d in declined), key=lambda f: f[0])
    if not found:
        return None
    by = collections.Counter(d.cause for _, d in found)
    stop = next((d.why for _, d in found if d.stops), None)
    counts = ', '.join(f'{c} {n}' for c, n in sorted(by.items()))
    each = '; '.join(f'{who}: {d.why}' for who, d in found[:10])
    return (f'{stop}: the rest waits. ' if stop else '') + f'{len(found)} {what} gave no answer ({counts}): {each}'
