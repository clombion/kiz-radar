"""Fare store and refresh scheduler.

docs/data/fares.csv      one row per (airport, Friday out, Monday back): price in EUR and when it was fetched
pipeline/fare_jobs.csv   one row per festival weekend (airport, Friday): when it was last searched and how it went

Only festival weekends are searched: the Friday-to-Monday return from home to the airport of each upcoming festival,
once per airport and weekend however many festivals share it. A weekend is due again after an interval that grows
with how far away it is (WEEKS_APART), and it is searched on its own weekday, fixed by the airport and the date, so
each day's run checks about a seventh of the weekends. A weekend that has never been searched, or is overdue by
twice its interval, doesn't wait for its weekday. Weekends further ahead than Google sells (SELLS_DAYS) wait.

Past weekends, and weekends no upcoming festival uses any more, leave both files. A weekend Google returns no price
for is recorded as such and tried again at its next interval. Google sometimes refuses a single search (HTTP 429), so
a refused search is tried once more after a minute; refused again, it stops the run, which then exits with an error
after saving what it found.

    python3 -m pipeline.fares refresh --budget 20      # what the GitHub Action runs
    python3 -m pipeline.fares plan                     # show what is due, without searching
"""
import argparse, csv, datetime as dt, json, os, shlex, subprocess, sys, time, zlib
from pipeline import db as sqlite_db
from pipeline.airports import HOME

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'docs', 'data')
FARES, JOBS = os.path.join(DATA, 'fares.csv'), os.path.join(ROOT, 'pipeline', 'fare_jobs.csv')
FLI_SHA = '881aee5ff4321e81ea2157cb44be94ce6a21dc1b'   # punitarani/fli, the only place the version is pinned
FLI = os.environ.get('FLI_CMD', f'uvx -q --from git+https://github.com/punitarani/fli@{FLI_SHA} fli')
SELLS_DAYS = 330          # Google sells about 11 months ahead
# (days until the Friday, days between searches): weekly when it is close, every six weeks when it is far
WEEKS_APART = [(35, 7), (91, 14), (182, 28), (SELLS_DAYS, 42)]
PAUSE = 10                # seconds between searches; Google refuses after about 20 searches 5 seconds apart
RETRY_AFTER = 60          # seconds to wait before trying a refused search once more

FARE_FIELDS = ['airport', 'depart', 'return', 'price', 'currency', 'fetched_at']
JOB_FIELDS = ['airport', 'depart', 'last_run', 'status', 'note']

def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)

def read(path):
    if not os.path.exists(path): return []
    return list(csv.DictReader(open(path, encoding='utf-8')))

def write(path, fields, rows, key):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n'); w.writeheader(); w.writerows(sorted(rows, key=key))

def weekends(today):
    """(airport, Friday) of every upcoming, not cancelled festival with an airport other than home, from the site DB."""
    c = sqlite_db.connect(os.path.join(DATA, 'kiz.sqlite'), 'ro')
    return set(c.execute("""select airport, weekend_friday from events where airport is not null and airport != ?
        and cancelled is not 1 and weekend_friday > ?""", (HOME, today.isoformat())).fetchall())

def interval(days_away):
    return next((every for until, every in WEEKS_APART if days_away <= until), None)

def weekday_of(airport, friday):
    """The weekday (0 = Monday) a weekend is searched on: fixed, and spread evenly across the week."""
    return zlib.crc32(f'{airport} {friday}'.encode()) % 7

def queue(t=None):
    """Every festival weekend with its interval and whether it is due today, the most overdue first."""
    t = t or now()
    today = t.date()
    jobs = {(j['airport'], j['depart']): j for j in read(JOBS)}
    fetched = {}
    for f in read(FARES):                      # a weekend priced before it had a job counts as searched then
        k = (f['airport'], f['depart'])
        fetched[k] = max(fetched.get(k, ''), f['fetched_at'])
    q = []
    for airport, friday in weekends(today):
        days_away = (dt.date.fromisoformat(friday) - today).days
        every = interval(days_away)
        last = (jobs.get((airport, friday)) or {}).get('last_run') or fetched.get((airport, friday))
        age = (t - dt.datetime.fromisoformat(last)).total_seconds() / 86400 if last else None
        on_day = weekday_of(airport, friday) == today.weekday()
        due = every is not None and (age is None or (age >= every and on_day) or age >= 2 * every)
        q.append(dict(airport=airport, friday=friday, days_away=days_away, every=every, age=age, due=due))
    return sorted(q, key=lambda r: (not r['due'], -(r['age'] / r['every'] if r['age'] is not None and r['every'] else 99), r['friday']))

def search(airport, friday):
    """One Friday-to-Monday return; (status, fare row or None, note). status: priced, no price or refused."""
    cmd = shlex.split(FLI) + ['dates', HOME, airport, '--from', friday, '--to', friday,
                              '-d', '3', '--round', '--friday', '--currency', 'EUR', '--format', 'json']
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return 'no price', None, 'timeout'
    if 'HTTP 429' in p.stderr or '"http_status": 429' in p.stdout:
        return 'refused', None, 'HTTP 429'
    try:
        d = json.loads(p.stdout[p.stdout.index('{'):])
    except ValueError:
        return 'no price', None, (p.stderr.strip().splitlines() or ['no output'])[-1][:200]
    x = next((x for x in d.get('dates', []) if x.get('price') and x.get('departure_date') == friday), None)
    if not d.get('success') or not x:
        return 'no price', None, str((d.get('error') or {}).get('message', ''))[:200]
    return 'priced', dict(airport=airport, depart=friday, **{'return': x['return_date']}, price=f"{x['price']:.0f}",
                          currency=x.get('currency', 'EUR'), fetched_at=now().isoformat()), ''

def refresh(budget, max_seconds):
    start, today = time.time(), now().date()
    fares = {(r['airport'], r['depart'], r['return']): r for r in read(FARES)}
    jobs = {(j['airport'], j['depart']): j for j in read(JOBS)}
    done, refused = 0, False
    for item in queue():
        if not item['due'] or done >= budget or time.time() - start > max_seconds: break
        status, row, note = search(item['airport'], item['friday'])
        if status == 'refused':
            time.sleep(RETRY_AFTER)
            status, row, note = search(item['airport'], item['friday'])
        print(f"{item['airport']} {item['friday']} ({item['days_away']} days away): {status} {row['price'] + ' EUR' if row else ''} {note}", flush=True)
        if status == 'refused':
            refused = True; break
        if row: fares[(row['airport'], row['depart'], row['return'])] = row
        jobs[(item['airport'], item['friday'])] = dict(airport=item['airport'], depart=item['friday'], last_run=now().isoformat(),
                                                       status=status, note=note)
        done += 1
        time.sleep(PAUSE)
    live = weekends(today)
    fares = {k: v for k, v in fares.items() if (v['airport'], v['depart']) in live}
    jobs = {k: v for k, v in jobs.items() if k in live}
    write(FARES, FARE_FIELDS, fares.values(), key=lambda r: (r['airport'], r['depart'], r['return']))
    write(JOBS, JOB_FIELDS, jobs.values(), key=lambda r: (r['airport'], r['depart']))
    print(f'{done} searches; {len(fares)} fares stored for {len(live)} festival weekends')
    if refused: sys.exit('Google refused a search (HTTP 429); the rest waits for the next run')

def plan():
    q = queue(); due = [x for x in q if x['due']]
    print(f'{len(due)} of {len(q)} festival weekends due today')
    for x in due:
        seen = f"searched {x['age']:.0f} days ago" if x['age'] is not None else 'never searched'
        print(f"{x['airport']} {x['friday']}: {x['days_away']} days away, every {x['every']} days, {seen}")

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Search Friday-to-Monday fares for festival weekends that are due.')
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('refresh', help='search the weekends due today and save the fares')
    r.add_argument('--budget', type=int, default=20, help='most searches in this run')
    r.add_argument('--max-seconds', type=int, default=1200, help='stop starting searches after this long')
    sub.add_parser('plan', help='list the weekends due today, without searching')
    a = ap.parse_args()
    if a.cmd == 'refresh': refresh(a.budget, a.max_seconds)
    else: plan()
