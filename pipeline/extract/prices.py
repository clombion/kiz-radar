"""Checks and dates for the prices pass, on top of check_output.checked().

Each tier's quote must price its amount (and its second amount, alt) in its currency, written in any of the usual ways:
1800, 1.800, 1,800, 1 800, 8.50 or 8,50, with a marker of the currency before or after it (pipeline/currencies.py),
which also prices a range or a list it ends or starts ("150 to 190€", "€75, 80, 85"); a number with no marker, a date
or a count say, prices nothing. A quote that marks no price at all may hold the amount as a bare number. A tier whose
amount adds a fee must quote the fee and the price before it. Dates come back
as YYYY-MM-DD, or MM-DD when the description gives no year; window() gives a tier's dates their years.

What a festival's card can say of its price (enums.Price) is decided here too: the pass a card prices (card_pass)
and, when there is none, why (price_state).
"""

import calendar
import datetime as dt
import re
import unicodedata
from collections.abc import Iterable, Sequence
from typing import NamedTuple

from pipeline import currencies, states
from pipeline.db import Reader
from pipeline.enums import Genre, PassKind, People, Price, Sales, Style
from pipeline.records import PassTerms, Priced, PricedPass, RealDay, yearless

SEVERAL = 2  # dance styles that make a festival of several
COUPLE = 2  # people in a couple; more are a group
NUMBER = re.compile(r'\d+(?:[ .,’\']\d{3})*(?:[.,]\d{1,2})?|\d+')
AMOUNT = r'\d+(?:[ .,’\']\d{3})*(?:[.,]\d{1,2})?'
# amounts one marker prices: "75, 80, 85", "150 to 190"; never across a slash, which sets another currency's beside it
RUN = rf'{AMOUNT}(?:\s*(?:,|-|–|to|or|and)\s*{AMOUNT})*'


def numbers_in(text: str) -> set[float]:
    """Every amount the text could mean: '1.800' is 1800 (a thousands separator) and also 1.8, and 'March 31 155€'
    holds 31, 155 and 31155."""
    out = {float(n) for n in re.split(r'\D+', text) if n}
    for m in NUMBER.finditer(text):
        out |= readings(m.group(0))
    return out


def marked(markers: Iterable[str]) -> str:
    """A pattern for any of these markers, the longest first, a word or a code standing alone."""
    alts = sorted(markers, key=len, reverse=True)
    return '(?:' + '|'.join(re.escape(m) for m in alts) + ')'


EVERY_MARKER = (
    marked([m for m, _ in currencies.MARKERS] + [c for c in currencies.CODES if c not in currencies.WORDS])
    + '|(?-i:'
    + '|'.join(currencies.WORDS)
    + ')'
)


def amounts_in(quote: str, currency: str) -> set[float] | None:
    """Every amount the quote prices in the currency, by numbers_in()'s readings; None when it marks no price in any
    currency. A marker before an amount takes it first, so "under 10 €50" prices 50; a marker of another currency
    prices nothing of this one ("950 SEK (€85)")."""
    q = unicodedata.normalize('NFKC', quote)  # styled letters and digits: 𝟯𝟱𝟬 𝗥𝗢𝗡 is 350 RON
    mine = re.compile(marked(currencies.markers(currency)) + r'\Z', re.IGNORECASE)
    found: list[str] = []
    taken: list[tuple[int, int]] = []
    any_price = False
    before = re.compile(rf'(?<![^\W\d_])({EVERY_MARKER})\s?({RUN})', re.IGNORECASE)
    after = re.compile(rf'({RUN})\s?({EVERY_MARKER})(?![^\W\d_])', re.IGNORECASE)
    for m in before.finditer(q):
        any_price = True
        taken.append(m.span())
        if mine.match(m[1]):
            found.append(m[2])
    for m in after.finditer(q):
        if any(a < m.end() and m.start() < b for a, b in taken):
            continue
        any_price = True
        if mine.match(m[2]):
            found.append(m[1])
    if not any_price:
        return None
    return {n for run in found for m in re.finditer(AMOUNT, run) for n in readings(m[0])}


def readings(amount: str) -> set[float]:
    """What one written amount may be: every separator a thousands one ('1.800' is 1800), or the last a decimal point
    (1.8); and after a space, the last group alone, as a space may part a number from the price ('March 31 155€')."""
    out = {float(re.sub(r'\D', '', amount))}
    if dec := re.fullmatch(r'(.*?)[.,](\d{1,2})', amount):
        out.add(float(re.sub(r'\D', '', dec[1]) + '.' + dec[2]))
    if ' ' in amount:
        out |= readings(amount.rsplit(' ', 1)[1])
    return out


class Window(NamedTuple):
    """A tier's dates as days, from on or before until when it has both."""

    from_: dt.date | None
    until: dt.date | None


def window(from_: RealDay | None, until: RealDay | None, start: dt.date) -> Window:
    """A tier's dates as days. A date without a year gets the latest year that puts it on or before the festival's
    first day, since prices are dated before the festival they are for; but the end of a tier whose start is known gets
    the first year that puts it on or after that start, and a start without a year before an end with one, the latest
    year that puts it on or before that end."""
    if from_ is not None and until is not None:
        if yearless(from_) and not yearless(until):
            end = on_or_before(until, start)
            return Window(on_or_before(from_, end), end)
        begin = on_or_before(from_, start)
        return Window(begin, on_or_after(until, begin))
    return Window(
        None if from_ is None else on_or_before(from_, start), None if until is None else on_or_before(until, start)
    )


def on_or_before(value: RealDay, limit: dt.date) -> dt.date:
    """The day, in its own year when it has one, else in the latest year that puts it on or before limit."""
    *year, m, d = map(int, value.split('-'))
    return day(year[0] if year else limit.year - ((m, d) > (limit.month, limit.day)), m, d)


def on_or_after(value: RealDay, floor: dt.date) -> dt.date:
    """The day, in its own year when it has one, else in the first year that puts it on or after floor."""
    *year, m, d = map(int, value.split('-'))
    return day(year[0] if year else floor.year + ((m, d) < (floor.month, floor.day)), m, d)


def day(y: int, m: int, d: int) -> dt.date:
    """The day; 29 February in a year that has none is the 28th."""
    return dt.date(y, m, 28 if (m, d) == (2, 29) and not calendar.isleap(y) else d)


def styles(db: Reader, event_id: int) -> list[Style]:
    """The dance styles a festival's genres (event_genres: its description's and its kizomba-world tags) name."""
    genres = db.column(Genre, 'SELECT genre FROM event_genres WHERE event_id = ?', (event_id,))
    return sorted({Style(states.STYLE_OF[g]) for g in genres})


def style_problems(passes: Sequence[PassTerms], styles: Sequence[Style], where: str = '') -> list[str]:
    """A pass has a style only at a festival of two styles or more, and it is one of them."""
    return [
        f"styles: {where}passes[{p}].style {str(ps.style)!r}: the festival's genres name "
        + (f'the styles {named}' if len(styles) > 1 else f'one style only ({named})' if styles else 'no style')
        + '; a pass has a style only at a festival of several, and it is one of them'
        for named in [[str(s) for s in styles]]
        for p, ps in enumerate(passes)
        if ps.style and (len(styles) < SEVERAL or ps.style not in styles)
    ]


def problems(ev: Priced, styles: Sequence[Style]) -> list[str]:
    """A festival's tiers whose amounts are not in their quote, or whose dates are no real day; and its passes whose
    style is none of the festival's (style_problems)."""
    found: list[str] = []
    for p, ps in enumerate(ev.passes):
        for t, tier in enumerate(ps.tiers):
            where = f'event {ev.event_id}: passes[{p}].tiers[{t}]'
            priced = [('amount', tier.amount, tier.currency)]
            if tier.alt:
                priced.append(('alt.amount', tier.alt.amount, tier.alt.currency))
            for key, amount, currency in priced:
                have = amounts_in(tier.quote, currency)
                have = numbers_in(tier.quote) if have is None else have
                if tier.fee is not None and key == 'amount' and tier.fee in numbers_in(tier.quote):
                    have |= {round(tier.fee + n, 2) for n in have}  # the price before the fee, and the fee
                if amount not in have:
                    found.append(
                        f'amounts: {where}.{key} {amount:g} {currency} is not a price its quote {tier.quote!r} gives '
                        f'in {currency}; quote the line that gives this price'
                    )
    return found + style_problems(ev.passes, styles)


def people(ps: PassTerms) -> People:
    """How many people one price of the pass is for: a package that doesn't say is priced per room, any other pass
    is for one."""
    n = ps.group_size
    return (
        (People.PER_ROOM if ps.kind == PassKind.PACKAGE else People.ONE)
        if n is None
        else People.ONE
        if n == 1
        else People.COUPLE
        if n == COUPLE
        else People.GROUP
    )


def card_pass(passes: Sequence[PricedPass]) -> int | None:
    """The index of the pass a card prices: the full pass for one person without a hotel (the Kizomba one when a
    festival of several styles sells one, then one for all its styles; then the longest, a pass whose length isn't
    stated counting as the whole festival), else the cheapest package with a hotel for one; None when the festival
    sells neither."""
    ones = [(i, ps) for i, ps in enumerate(passes) if people(ps) == People.ONE]
    full = sorted(
        ((0 if ps.style == Style.KIZOMBA else 1 if ps.style is None else 2, -(ps.days or 99)), i)
        for i, ps in ones
        if ps.kind == PassKind.FULL and not ps.includes_hotel
    )
    package = sorted(
        (min(t.amount for t in ps.tiers), i) for i, ps in ones if ps.kind == PassKind.PACKAGE and ps.includes_hotel
    )
    return full[0][1] if full else package[0][1] if package else None


# a festival with no passes, by how it sells (tickets/status.csv): a shop's page is known, so its prices are unread
NO_PASSES = states.total(
    'sales',
    {
        Sales.SHOP: Price.PAGE_UNREAD,
        Sales.NOT_YET: Price.NOT_YET,
        Sales.OFFLINE: Price.OFFLINE,
        Sales.CLOSED: Price.CLOSED,
        Sales.NONE_FOUND: Price.NONE_FOUND,
    },
    'prices.NO_PASSES',
)


def price_state(passes: Sequence[PricedPass], sales: Sales | None, page: str | None, *, empty: bool) -> Price:
    """What a festival's card can say of its price, from its passes, how it sells (None when no agent recorded it),
    its known ticket page, and whether its latest read of that page found it lists no tickets (empty)."""
    if passes:
        return Price.PRICED if card_pass(passes) is not None else Price.OTHER_PASSES_ONLY
    if page and empty:
        return Price.PAGE_EMPTY
    if sales:
        return NO_PASSES[sales]
    return Price.PAGE_UNREAD if page else Price.NOT_LOOKED
