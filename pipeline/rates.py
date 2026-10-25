"""Refresh pipeline/rates.csv, the exchange rates the site converts prices with: the European Central Bank's daily
reference rates, as units of each currency per euro. When the bank can't be reached the file stays as it was.

    python3 pipeline/rates.py
"""
import csv, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'pipeline', 'rates.csv')
ECB = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
# Bulgaria joined the euro on 1 Jan 2026 at a fixed rate, so the bank no longer quotes the lev
FIXED = {'EUR': 1.0, 'BGN': 1.95583}

try:
    xml = urllib.request.urlopen(ECB, timeout=30).read().decode()
except OSError as e:
    sys.exit(f'{ECB}: {e}; {OUT} left as it was')
day = re.search(r"time='(\d{4}-\d{2}-\d{2})'", xml)[1]
rates = {c: float(r) for c, r in re.findall(r"currency='([A-Z]{3})' rate='([\d.]+)'", xml)} | FIXED
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['currency', 'per_eur', 'date'])
    w.writerows((c, rates[c], day) for c in sorted(rates))
print(f'{len(rates)} rates of {day}')
