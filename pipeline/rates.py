"""Refresh pipeline/rates.csv, the exchange rates the site converts prices with: the European Central Bank's daily
reference rates, as units of each currency per euro. When the bank can't be reached the file stays as it was.

    uv run -m pipeline.rates
"""

import argparse
import re
import sys
from pathlib import Path

from pipeline import web
from pipeline.records import Rate

OUT = Path(__file__).parent / 'rates.csv'
ECB = web.Https('www.ecb.europa.eu', '/stats/eurofxref/eurofxref-daily.xml')
# Bulgaria joined the euro on 1 Jan 2026 at a fixed rate, so the bank no longer quotes the lev
FIXED = {'EUR': 1.0, 'BGN': 1.95583}


def rates(xml: str) -> tuple[str, dict[str, float]]:
    """(the day of the bank's rates, the units of each currency per euro) from its daily file."""
    if not (day := re.search(r"time='(\d{4}-\d{2}-\d{2})'", xml)):
        raise ValueError(f'{ECB.url()}: no day in its file')
    found = {m[1]: float(m[2]) for m in re.finditer(r"currency='([A-Z]{3})' rate='([\d.]+)'", xml)}
    return day[1], found | FIXED


def main() -> None:
    _ = argparse.ArgumentParser(
        description="Refresh pipeline/rates.csv from the European Central Bank's reference rates."
    ).parse_args()
    try:
        day, per_eur = rates(web.get(ECB).decode())
    except (OSError, ValueError) as e:
        sys.exit(f'{ECB.url()}: {e}; {OUT} left as it was')
    Rate.write(OUT, [Rate(currency=c, per_eur=per_eur[c], date=day) for c in sorted(per_eur)])
    print(f'{len(per_eur)} rates of {day}')


if __name__ == '__main__':
    main()
