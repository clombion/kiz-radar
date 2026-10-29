"""What asking Claude costs the pipeline, and the monthly budget it keeps to.

Every request to Claude adds a line to pipeline/spend.csv: when, which step, which model, its tokens in and out
(thinking counts as output) and what that costs in dollars. Before each request a step asks spent(): once this
calendar month's spending, in euros at pipeline/rates.csv's dollar rate, has reached BUDGET_EUR, it says so, and the
request is declined for the budget (pipeline/calls.py); the step stops asking, leaves the rest for next month, and its
run fails so the stop is seen. Requests already under way can take the month a little over.
"""

import threading
from pathlib import Path

from pipeline import states
from pipeline.enums import Model
from pipeline.prompt import Name
from pipeline.records import Rate, Spent, now

BUDGET_EUR = 100
# dollars per million tokens, in and out, of every model; Haiku's long prompts (over 100K tokens) cost more
PRICES = states.total(
    'model',
    {
        Model.CLAUDE_FABLE_5_1: (10, 50),
        Model.CLAUDE_OPUS_5_5: (4, 20),
        Model.CLAUDE_SONNET_5_5: (2, 10),
        Model.CLAUDE_HAIKU_5_5: (0.10, 0.50),
    },
    'spend.PRICES',
)
LONG = {Model.CLAUDE_HAIKU_5_5: (100_000, 0.50, 2.50)}
_lock = threading.Lock()  # the ledger's appends, and the month's total, are one thread's at a time
_months: dict[tuple[Path, int, int], float] = {}  # each ledger's dollars by month: read once, then added to


def usd(model: Model, input_tokens: int, output_tokens: int) -> float:
    rate_in, rate_out = PRICES[model]
    if model in LONG and input_tokens > LONG[model][0]:
        _, rate_in, rate_out = LONG[model]
    return (input_tokens * rate_in + output_tokens * rate_out) / 1e6


def month_usd() -> float:
    """Dollars spent this calendar month (in UTC): the ledger's, read at the month's first question in this process,
    and this process's requests since."""
    t = now()
    key = (Spent.path(), t.year, t.month)
    with _lock:
        if key not in _months:
            _months[key] = sum(r.usd for r in Spent.read() if (r.at.year, r.at.month) == (t.year, t.month))
        return _months[key]


def eur(dollars: float) -> float:
    return dollars / next(r.per_eur for r in Rate.read() if r.currency == 'USD')


def spent() -> str | None:
    """Before a request: what says the month's budget is spent, once it is; else None."""
    if (total := eur(month_usd())) >= BUDGET_EUR:
        return f'this month has spent €{total:.2f} of its €{BUDGET_EUR} budget for Claude'
    return None


def record(step: Name, model: Model, input_tokens: int, output_tokens: int) -> float:
    """Add one request to the ledger; its cost in dollars."""
    cost = usd(model, input_tokens, output_tokens)
    row = Spent(
        at=now(),
        step=step,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usd=round(cost, 6),
    )
    with _lock:
        row.append()
        if (key := (Spent.path(), row.at.year, row.at.month)) in _months:
            _months[key] += row.usd
    return cost
