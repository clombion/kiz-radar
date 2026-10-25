"""Checks and dates for the prices pass, on top of check_output.problems().

Each tier's quote must contain its amount (and its second amount), written in any of the usual ways: 1800,
1.800, 1,800, 1 800, 8.50 or 8,50. Dates come back as YYYY-MM-DD, or MM-DD when the description gives no year;
on_date() gives an MM-DD the year that puts it on or before the festival's first day, since prices are dated
before the festival they are for.
"""
import datetime as dt, re

NUMBER = re.compile(r'\d+(?:[ .,’\']\d{3})*(?:[.,]\d{1,2})?|\d+')


def numbers_in(text: str) -> set[float]:
    """Every amount the text could mean: '1.800' is 1800 (a thousands separator) and also 1.8, and 'March 31 155€'
    holds 31, 155 and 31155."""
    out = {float(n) for n in re.findall(r'\d+', text)}
    for m in NUMBER.finditer(text):
        s = m.group(0)
        out.add(float(re.sub(r'\D', '', s)))                       # all separators are thousands
        if dec := re.fullmatch(r'(.*?)[.,](\d{1,2})', s):           # the last one is a decimal point
            out.add(float(re.sub(r'\D', '', dec[1]) + '.' + dec[2]))
    return out


def day(value: str) -> tuple[int | None, int, int] | None:
    """(year or None, month, day) of a YYYY-MM-DD or MM-DD answer; None when it is no real day."""
    *y, m, d = map(int, value.split('-'))
    try:
        dt.date(y[0] if y else 2024, m, d)                         # a leap year accepts 02-29
    except ValueError:
        return None
    return (y[0] if y else None), m, d


def on_date(value: str | None, start_date: str) -> str | None:
    """An answer's date as YYYY-MM-DD; a date without a year gets the latest year that is not after start_date."""
    if value is None:
        return None
    y, m, d = day(value)
    if y is None:
        start = dt.date.fromisoformat(start_date[:10])
        y = start.year if (m, d) <= (start.month, start.day) else start.year - 1
        if (m, d) == (2, 29) and y % 4:
            d = 28
    return f'{y:04d}-{m:02d}-{d:02d}'


def problems(output: dict) -> list[str]:
    found = []
    for ev in output.get('events', []):
        for p, ps in enumerate(ev.get('passes', [])):
            for t, tier in enumerate(ps.get('tiers', [])):
                where = f"event {ev['event_id']}: passes[{p}].tiers[{t}]"
                have = numbers_in(tier['quote'])
                for key in ('amount', 'alt_amount'):
                    if tier.get(key) is not None and float(tier[key]) not in have:
                        found.append(f'amounts: {where}.{key} {tier[key]} is not in its quote {tier["quote"]!r}; '
                                     f'quote the line that gives this price')
                for key in ('from', 'until'):
                    if tier.get(key) and day(tier[key]) is None:
                        found.append(f'dates: {where}.{key} {tier[key]!r} is not a real day')
                if (tier.get('alt_amount') is None) != (tier.get('alt_currency') is None):
                    found.append(f'amounts: {where}: give alt_amount and alt_currency together, or neither')
    return found
