"""Checks and dates for the prices pass, on top of check_output.problems().

Each tier's quote must contain its amount (and its second amount, alt), written in any of the usual ways: 1800,
1.800, 1,800, 1 800, 8.50 or 8,50; a tier whose amount adds a fee must quote the fee and the price before it. Dates come back as YYYY-MM-DD, or MM-DD when the description gives no year;
on_date() gives an MM-DD the year that puts it on or before the festival's first day, since prices are dated
before the festival they are for.

What a festival's card can say of its price (states.Price) is decided here too: the pass a card prices (card_pass)
and, when there is none, why (price_state).
"""
import datetime as dt, re

from pipeline import states
from pipeline.states import PassKind, People, Price, Sales, Style

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


def styles(db, event_id) -> list[str]:
    """The dance styles a festival's genres (event_genres: its description's and its kizomba-world tags) name."""
    return sorted({states.STYLE_OF[g] for g, in db.execute('SELECT genre FROM event_genres WHERE event_id = ?',
                                                          (event_id,))})


def style_problems(passes: list, styles: list, where: str = '') -> list[str]:
    """A pass has a style only at a festival of two styles or more, and it is one of them."""
    return [f"styles: {where}passes[{p}].style {ps['style']!r}: the festival's genres name "
            + (f"the styles {styles}" if len(styles) > 1 else f"one style only ({styles})" if styles else 'no style')
            + '; a pass has a style only at a festival of several, and it is one of them'
            for p, ps in enumerate(passes) if ps['style'] and (len(styles) < 2 or ps['style'] not in styles)]


def problems(output: dict) -> list[str]:
    found = []
    for ev in output.get('events', []):
        for p, ps in enumerate(ev.get('passes', [])):
            for t, tier in enumerate(ps.get('tiers', [])):
                where = f"event {ev['event_id']}: passes[{p}].tiers[{t}]"
                have = numbers_in(tier['quote'])
                if tier['fee'] is not None:
                    have |= {round(float(tier['fee']) + n, 2) for n in have} if float(tier['fee']) in have else set()
                for key, amount in (('amount', tier['amount']), ('alt.amount', (tier['alt'] or {}).get('amount'))):
                    if amount is not None and float(amount) not in have:
                        found.append(f'amounts: {where}.{key} {amount} is not in its quote {tier["quote"]!r}; '
                                     f'quote the line that gives this price')
                for key in ('from', 'until'):
                    if tier.get(key) and day(tier[key]) is None:
                        found.append(f'dates: {where}.{key} {tier[key]!r} is not a real day')
    return found


def people(ps: dict) -> People:
    """How many people one price of the pass is for: a package that doesn't say is priced per room, any other pass
    is for one."""
    n = ps['group_size']
    return ((People.PER_ROOM if ps['kind'] == PassKind.PACKAGE else People.ONE) if n is None else
            People.ONE if n == 1 else People.COUPLE if n == 2 else People.GROUP)


def card_pass(passes: list) -> int | None:
    """The index of the pass a card prices: the full pass for one person without a hotel (the Kizomba one when a
    festival of several styles sells one, then one for all its styles; then the longest, a pass whose length isn't
    stated counting as the whole festival), else the cheapest package with a hotel for one; None when the festival
    sells neither."""
    ones = [(i, ps) for i, ps in enumerate(passes) if people(ps) == People.ONE]
    rank = lambda ps: (0 if ps['style'] == Style.KIZOMBA else 1 if ps['style'] is None else 2, -(ps['days'] or 99))
    full = sorted((rank(ps), i) for i, ps in ones if ps['kind'] == PassKind.FULL and not ps['includes_hotel'])
    package = sorted((min(t['amount'] for t in ps['tiers']), i) for i, ps in ones
                     if ps['kind'] == PassKind.PACKAGE and ps['includes_hotel'])
    return (full or package or [(None, None)])[0][1]


# a festival with no passes, by how it sells (tickets/status.csv): a shop's page is known, so its prices are unread
NO_PASSES = states.total('sales', {Sales.SHOP: Price.PAGE_UNREAD, Sales.NOT_YET: Price.NOT_YET,
                                   Sales.OFFLINE: Price.OFFLINE, Sales.CLOSED: Price.CLOSED,
                                   Sales.NONE_FOUND: Price.NONE_FOUND}, 'prices.NO_PASSES')


def price_state(passes: list, sales: Sales | None, page: str | None) -> Price:
    """What a festival's card can say of its price, from its passes, how it sells (None when no agent recorded it)
    and its known ticket page."""
    if passes:
        return Price.PRICED if card_pass(passes) is not None else Price.OTHER_PASSES_ONLY
    if sales:
        return NO_PASSES[sales]
    return Price.PAGE_UNREAD if page else Price.NOT_LOOKED
