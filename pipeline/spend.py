"""What asking Claude costs the pipeline, and the monthly budget it keeps to.

Every request to Claude adds a line to pipeline/spend.csv: when, which step, which model, its tokens in and out
(thinking counts as output) and what that costs in dollars. Before each request a step calls check(): once this
calendar month's spending, in euros at pipeline/rates.csv's dollar rate, has reached BUDGET_EUR, it raises
BudgetSpent; the step stops asking, leaves the rest for next month, and its run fails so the stop is seen. Requests
already under way can take the month a little over.
"""
import csv, datetime as dt, threading
from pathlib import Path

HERE = Path(__file__).parent
LEDGER, RATES = HERE / 'spend.csv', HERE / 'rates.csv'
FIELDS = ['at', 'step', 'model', 'input_tokens', 'output_tokens', 'usd']
BUDGET_EUR = 100
# dollars per million tokens, in and out, by model; Haiku's long prompts (over 100K tokens) cost more
PRICES = {'claude-opus-5-5': (4, 20), 'claude-sonnet-5-5': (2, 10), 'claude-haiku-5-5': (0.10, 0.50)}
LONG = {'claude-haiku-5-5': (100_000, 0.50, 2.50)}
_lock = threading.Lock()


class BudgetSpent(Exception):
    pass


def usd(model, input_tokens, output_tokens):
    rate_in, rate_out = PRICES[model]
    if model in LONG and input_tokens > LONG[model][0]:
        _, rate_in, rate_out = LONG[model]
    return (input_tokens * rate_in + output_tokens * rate_out) / 1e6


def month_usd(month=None):
    """Dollars spent in a calendar month (YYYY-MM, this one by default)."""
    month = month or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m')
    if not LEDGER.exists():
        return 0.0
    with LEDGER.open(encoding='utf-8') as f:
        return sum(float(r['usd']) for r in csv.DictReader(f) if r['at'].startswith(month))


def eur(dollars):
    with RATES.open(encoding='utf-8') as f:
        return dollars / next(float(r['per_eur']) for r in csv.DictReader(f) if r['currency'] == 'USD')


def check():
    if (spent := eur(month_usd())) >= BUDGET_EUR:
        raise BudgetSpent(f'this month has spent €{spent:.2f} of its €{BUDGET_EUR} budget for Claude')


def record(step, model, input_tokens, output_tokens):
    """Add one request to the ledger; its cost in dollars."""
    cost = usd(model, input_tokens, output_tokens)
    with _lock:
        new = not LEDGER.exists()
        with LEDGER.open('a', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, FIELDS, lineterminator='\n')
            if new:
                w.writeheader()
            w.writerow({'at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'step': step, 'model': model,
                        'input_tokens': input_tokens, 'output_tokens': output_tokens, 'usd': f'{cost:.6f}'})
    return cost
