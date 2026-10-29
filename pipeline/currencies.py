"""Currencies as prices write them: each marker (a symbol, a word; and every ISO code is its own), the currencies it
can stand for, the first of them the one a ticket site means when it shows the marker alone (SYMBOLS). The one table
for both readers: a ticket page's currency field (tickets_reading.parsed) and a quote's prices (prices.amounts_in)."""

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
SYMBOLS = {m: codes[0] for m, codes in MARKERS}  # what a ticket site means by a marker shown alone
# the codes a quote may mark a price with, in any case (470dkk), save the ones that are words too, written in capitals
# only (TRY, MAD); a word of three letters that is no code, VIP say, marks nothing
CODES = (
    'EUR', 'GBP', 'USD', 'CAD', 'AUD', 'NZD', 'MXN', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK', 'ISK', 'PLN', 'CZK', 'HUF',
    'RON', 'BGN', 'RSD', 'TRY', 'UAH', 'ILS', 'MAD', 'ZAR', 'THB', 'JPY', 'CNY', 'INR', 'SGD', 'HKD',
)  # fmt: skip
WORDS = frozenset({'TRY', 'MAD'})


def code(shown: str) -> str:
    """The currency a ticket site shows, as its code: a code as it is, a marker as SYMBOLS reads it."""
    return SYMBOLS.get(shown, shown)


def markers(currency: str) -> list[str]:
    """Every way a price in the currency may be marked: its code and each marker that can stand for it."""
    return [currency, *(m for m, codes in MARKERS if currency in codes)]
