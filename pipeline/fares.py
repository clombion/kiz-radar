"""Fare store and refresh scheduler.

docs/data/fares.csv      one row per (airport, Friday out, Monday back): price in EUR and when it was fetched
docs/data/fare_jobs.csv  one row per (airport, month): when it was last searched and how it went

Each run searches only the most overdue (airport, month) pairs, so a frequent schedule spreads the load
and stays under Google's rate limit. How often a pair is due depends on the airport's tier, on how far
ahead the month is, and on whether a festival near that airport falls in it:

    python3 pipeline/fares.py refresh --budget 6        # what the GitHub Action runs
    python3 pipeline/fares.py plan                      # show the queue without searching
    python3 pipeline/fares.py import <dir-of-fli-json>  # load results of an earlier sweep
"""
import argparse, csv, datetime as dt, glob, json, os, shlex, sqlite3, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'docs', 'data')
FARES, JOBS = os.path.join(DATA, 'fares.csv'), os.path.join(DATA, 'fare_jobs.csv')
HOME = 'BGO'
FLI_SHA = '881aee5ff4321e81ea2157cb44be94ce6a21dc1b'   # punitarani/fli main, 2026-09-20 (same pin as travel-flight-check)
FLI = os.environ.get('FLI_CMD', f'uvx -q --from git+https://github.com/punitarani/fli@{FLI_SHA} fli')
HORIZON_MONTHS = 11      # Google sells about 11 months ahead
NEAR_MONTHS = 3          # months counted as "near"
# days between refreshes: (near months, far months)
INTERVAL = {1: (3, 7), 2: (7, 21), 3: (14, 30)}
FESTIVAL_KM = 150        # a festival this close to an airport promotes its month to tier 1

FARE_FIELDS = ['airport', 'depart', 'return', 'price', 'currency', 'fetched_at']
JOB_FIELDS = ['airport', 'month', 'last_run', 'status', 'priced', 'note']

def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

def read(path, fields):
    if not os.path.exists(path): return []
    return list(csv.DictReader(open(path, encoding='utf-8')))

def write(path, fields, rows, key):
    rows = sorted(rows, key=key)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n'); w.writeheader(); w.writerows(rows)

def airports():
    return {r['code']: r for r in csv.DictReader(open(os.path.join(ROOT, 'pipeline', 'airports.csv'), encoding='utf-8'))}

def months(today):
    y, m = today.year, today.month
    for _ in range(HORIZON_MONTHS + 1):
        yield f'{y:04d}-{m:02d}'
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

def festival_months():
    """(airport, month) pairs with an upcoming festival, from the site DB."""
    db = os.path.join(DATA, 'kiz.sqlite')
    if not os.path.exists(db): return set()
    c = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    return set(c.execute("""select airport, substr(weekend_friday, 1, 7) from events
        where airport is not null and cancelled is not 1 and airport_km <= ? and weekend_friday >= date('now')""",
        (FESTIVAL_KM,)).fetchall())

def queue(today=None):
    """All (airport, month) pairs with their interval and how overdue they are, most overdue first."""
    t = now() if today is None else today
    jobs = {(j['airport'], j['month']): j for j in read(JOBS, JOB_FIELDS)}
    fest = festival_months()
    q = []
    for i, month in enumerate(months(t.date())):
        for code, a in airports().items():
            if code == HOME: continue           # home: no flight
            tier = 1 if (code, month) in fest else int(a['tier'])
            interval = INTERVAL[tier][0 if i < NEAR_MONTHS else 1]
            j = jobs.get((code, month))
            age = (t - dt.datetime.fromisoformat(j['last_run'])).total_seconds() / 86400 if j and j['last_run'] else 9999
            q.append(dict(airport=code, month=month, tier=tier, interval=interval, overdue=age / interval,
                          festival=(code, month) in fest))
    return sorted(q, key=lambda r: (-r['overdue'], r['tier'], r['month']))

def search(airport, month, today):
    """Run fli for every Friday of the month; returns (status, fares, note)."""
    first = max(dt.date.fromisoformat(month + '-01'), today + dt.timedelta(days=1))
    nxt = dt.date.fromisoformat(month + '-01').replace(day=28) + dt.timedelta(days=4)
    last = nxt - dt.timedelta(days=nxt.day)
    if first > last: return 'skipped', [], 'month over'
    cmd = shlex.split(FLI) + ['dates', HOME, airport, '--from', first.isoformat(), '--to', last.isoformat(),
           '-d', '3', '--round', '--friday', '--currency', 'EUR', '--format', 'json']
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return 'error', [], 'timeout'
    out, err = p.stdout, p.stderr
    try:
        d = json.loads(out[out.index('{'):])
    except ValueError:
        return 'error', [], (err.strip().splitlines() or ['no output'])[-1][:200]
    if not d.get('success'):
        e = d.get('error') or {}
        return ('rate_limited' if e.get('http_status') == 429 else 'error'), [], str(e.get('message', ''))[:200]
    failed = err.count('Pricing ')
    rows = [dict(airport=airport, depart=x['departure_date'], **{'return': x['return_date']}, price=f"{x['price']:.0f}",
                 currency=x.get('currency', 'EUR'), fetched_at=now().isoformat())
            for x in d.get('dates', []) if x.get('price')]
    if failed and failed >= 3 and not rows: return 'rate_limited', [], f'{failed} dates failed'
    return ('partial' if failed else 'ok'), rows, f'{failed} dates failed' if failed else ''

def refresh(budget, max_seconds):
    start, today = time.time(), now().date()
    fares = {(r['airport'], r['depart'], r['return']): r for r in read(FARES, FARE_FIELDS)}
    jobs = {(j['airport'], j['month']): j for j in read(JOBS, JOB_FIELDS)}
    done = 0
    for item in queue():
        if done >= budget or time.time() - start > max_seconds or item['overdue'] < 1: break
        status, rows, note = search(item['airport'], item['month'], today)
        print(f"{item['airport']} {item['month']} tier {item['tier']}: {status} {len(rows)} fares {note}", flush=True)
        if status == 'rate_limited':
            print('Google is rate-limiting; stopping this run.'); break
        if status in ('ok', 'partial'):
            # replace this month's fares only where the new search priced a date; keep older prices otherwise
            for r in rows: fares[(r['airport'], r['depart'], r['return'])] = r
        jobs[(item['airport'], item['month'])] = dict(airport=item['airport'], month=item['month'],
            last_run=now().isoformat(), status=status, priced=len(rows), note=note)
        done += 1
        time.sleep(5)
    cutoff = today.isoformat()
    fares = {k: v for k, v in fares.items() if v['depart'] >= cutoff}
    jobs = {k: v for k, v in jobs.items() if v['month'] >= cutoff[:7]}
    write(FARES, FARE_FIELDS, fares.values(), key=lambda r: (r['airport'], r['depart'], r['return']))
    write(JOBS, JOB_FIELDS, jobs.values(), key=lambda r: (r['airport'], r['month']))
    print(f'{done} searches; {len(fares)} fares stored')

def import_dir(path):
    """Load fli `dates` JSON files named AIRPORT_*.json (the earlier sweep)."""
    fares = {(r['airport'], r['depart'], r['return']): r for r in read(FARES, FARE_FIELDS)}
    jobs = {(j['airport'], j['month']): j for j in read(JOBS, JOB_FIELDS)}
    for f in glob.glob(os.path.join(path, '*.json')):
        airport = os.path.basename(f).split('_')[0]
        s = open(f, encoding='utf-8').read()
        if '{' not in s: continue
        try: d = json.loads(s[s.index('{'):])
        except ValueError: continue
        when = dt.datetime.fromtimestamp(os.path.getmtime(f), dt.timezone.utc).replace(microsecond=0).isoformat()
        for x in d.get('dates', []):
            if not x.get('price'): continue
            k = (airport, x['departure_date'], x['return_date'])
            if k not in fares or fares[k]['fetched_at'] < when:
                fares[k] = dict(airport=airport, depart=k[1], **{'return': k[2]}, price=f"{x['price']:.0f}",
                                currency=x.get('currency', 'EUR'), fetched_at=when)
            m = k[1][:7]
            j = jobs.get((airport, m))
            if not j or j['last_run'] < when:
                jobs[(airport, m)] = dict(airport=airport, month=m, last_run=when, status='imported', priced='', note='')
    for (a, m), j in jobs.items():
        j['priced'] = sum(1 for k in fares if k[0] == a and k[1][:7] == m)
    write(FARES, FARE_FIELDS, fares.values(), key=lambda r: (r['airport'], r['depart'], r['return']))
    write(JOBS, JOB_FIELDS, jobs.values(), key=lambda r: (r['airport'], r['month']))
    print(len(fares), 'fares,', len(jobs), 'airport-months')

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('refresh'); r.add_argument('--budget', type=int, default=6); r.add_argument('--max-seconds', type=int, default=900)
    sub.add_parser('plan')
    i = sub.add_parser('import'); i.add_argument('dir')
    a = ap.parse_args()
    if a.cmd == 'refresh': refresh(a.budget, a.max_seconds)
    elif a.cmd == 'import': import_dir(a.dir)
    else:
        q = queue(); due = [x for x in q if x['overdue'] >= 1]
        print(f'{len(due)} of {len(q)} airport-months due')
        for x in due[:25]:
            print(f"{x['airport']} {x['month']} tier {x['tier']}{' (festival)' if x['festival'] else ''} every {x['interval']}d, overdue x{x['overdue']:.1f}")
