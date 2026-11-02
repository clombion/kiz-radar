"""Currencies as prices write them: each marker (a symbol, a word; and every ISO code is its own) and the currencies it
can stand for. The one table for both readers: a ticket page's currency field (tickets_reading.parsed), where a marker
of several currencies means the one its site's recipe settles (records.Symbol), and a quote's prices
(prices.amounts_in)."""

from collections.abc import Mapping

MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ('€', ('EUR',)),
    ('euro', ('EUR',)),
    ('euros', ('EUR',)),
    ('e', ('EUR',)),  # 60e
    ('£', ('GBP',)),
    ('pound', ('GBP',)),
    ('pounds', ('GBP',)),
    ('$', ('USD', 'CAD', 'AUD', 'NZD', 'MXN')),
    ('US$', ('USD',)),
    ('dollar', ('USD', 'CAD', 'AUD', 'NZD')),
    ('dollars', ('USD', 'CAD', 'AUD', 'NZD')),
    ('CA$', ('CAD',)),
    ('C$', ('CAD',)),
    ('A$', ('AUD',)),
    ('AU$', ('AUD',)),
    ('AUD$', ('AUD',)),
    ('NZ$', ('NZD',)),
    ('R$', ('BRL',)),
    ('Fr.', ('CHF',)),
    ('kr', ('SEK', 'NOK', 'DKK', 'ISK')),
    ('kr.', ('SEK', 'NOK', 'DKK', 'ISK')),
    ('kronor', ('SEK',)),
    ('kroner', ('NOK', 'DKK')),
    ('zł', ('PLN',)),
    ('Kč', ('CZK',)),
    ('฿', ('THB',)),
    ('baht', ('THB',)),
    ('¥', ('JPY', 'CNY')),
    ('yen', ('JPY',)),
    ('lei', ('RON',)),
    ('Ft', ('HUF',)),
)
# the codes a quote may mark a price with, in any case (470dkk), save the ones that are words too, written in capitals
# only (TRY, MAD); a word of three letters that is no code, VIP say, marks nothing
CODES = (
    'EUR', 'GBP', 'USD', 'CAD', 'AUD', 'NZD', 'MXN', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK', 'ISK', 'PLN', 'CZK', 'HUF',
    'RON', 'BGN', 'RSD', 'TRY', 'UAH', 'ILS', 'MAD', 'ZAR', 'THB', 'JPY', 'CNY', 'INR', 'SGD', 'HKD',
)  # fmt: skip
WORDS = frozenset({'TRY', 'MAD'})


def meanings(shown: str) -> tuple[str, ...]:
    """The currencies a marker can stand for; none for a marker that is none."""
    return next((codes for m, codes in MARKERS if m == shown), ())


def code(shown: str, settled: Mapping[str, str]) -> str | None:
    """The currency a ticket site shows, as its code: a code as it is, a marker of one currency as that one, a marker
    of several as settled says the site means it ({marker: code}); None for a marker of several it doesn't settle."""
    match meanings(shown):
        case (one,):
            return one
        case ():
            return shown
        case _:
            return settled.get(shown)


def markers(currency: str) -> list[str]:
    """Every way a price in the currency may be marked: its code and each marker that can stand for it."""
    return [currency, *(m for m, codes in MARKERS if currency in codes)]
