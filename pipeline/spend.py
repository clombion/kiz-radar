"""What asking Claude costs the pipeline, and the monthly budget it keeps to.

Every request to Claude adds a line to pipeline/spend.csv: when, which step, which model, its tokens in and out
(thinking counts as output) and what that costs in dollars. Before each request a step calls check(): once this
calendar month's spending, in euros at pipeline/rates.csv's dollar rate, has reached BUDGET_EUR, it raises
BudgetSpentError; the step stops asking, leaves the rest for next month, and its run fails so the stop is seen. Requests
already under way can take the month a little over.
"""

import datetime as dt
import threading
from pathlib import Path

from pipeline.records import Rate, Spent

HERE = Path(__file__).parent
LEDGER, RATES = HERE / 'spend.csv', HERE / 'rates.csv'
BUDGET_EUR = 100
# dollars per million tokens, in and out, by model; Haiku's long prompts (over 100K tokens) cost more
PRICES = {
    'claude-fable-5-1': (10, 50),
    'claude-opus-5-5': (4, 20),
    'claude-sonnet-5-5': (2, 10),
    'claude-haiku-5-5': (0.10, 0.50),
}
LONG = {'claude-haiku-5-5': (100_000, 0.50, 2.50)}
_lock = threading.Lock()


class BudgetSpentError(Exception):
    pass


def usd(model: str, input_tokens: int, output_tokens: int) -> float:
    rate_in, rate_out = PRICES[model]
    if model in LONG and input_tokens > LONG[model][0]:
        _, rate_in, rate_out = LONG[model]
    return (input_tokens * rate_in + output_tokens * rate_out) / 1e6


def month_usd(month: str | None = None) -> float:
    """Dollars spent in a calendar month (YYYY-MM, this one by default)."""
    month = month or dt.datetime.now(dt.UTC).strftime('%Y-%m')
    return sum(r.usd for r in Spent.read(LEDGER) if r.at.startswith(month))


def eur(dollars: float) -> float:
    return dollars / next(r.per_eur for r in Rate.read(RATES) if r.currency == 'USD')


def check(model: str) -> None:
    """Before a request to model: KeyError when PRICES can't cost it (it could not be recorded), BudgetSpentError once
    the month's budget is spent."""
    if model not in PRICES:
        raise KeyError(f'{model}: no price in spend.PRICES')
    if (spent := eur(month_usd())) >= BUDGET_EUR:
        raise BudgetSpentError(f'this month has spent €{spent:.2f} of its €{BUDGET_EUR} budget for Claude')


def record(step: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Add one request to the ledger; its cost in dollars."""
    cost = usd(model, input_tokens, output_tokens)
    row = Spent(
        at=dt.datetime.now(dt.UTC).isoformat(timespec='seconds'),
        step=step,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usd=round(cost, 6),
    )
    with _lock:
        row.append(LEDGER)
    return cost
