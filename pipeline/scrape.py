# /// script
# requires-python = ">=3.11"
# dependencies = ["curl_cffi==0.13.0"]
# ///
"""Refresh the events in the source DB from kizomba-world.com, in place.

    uv run pipeline/scrape.py source/<events>.sqlite             # what the monthly Action runs
    uv run pipeline/scrape.py source/<events>.sqlite --dry-run   # report the changes without writing

The event list comes from the site's Events Calendar API. Each event page adds what the API leaves out: venue,
address, city, country, the deal link, the organiser's links, the translations and whether it is cancelled.
Pages are fetched for new and changed events and for every event still to come: a deal link can change
without changing the event's modified date, and a cancellation might too. Events the site no longer lists are deleted with everything that refers
to them. New festivals get their poster; their line-up and features wait for the extraction steps, and the
events whose description is new or changed since then are listed in pending_extraction.

kizomba-world publishes its listings under CC BY-SA 4.0. Requests are spaced a few seconds apart.
"""
import argparse, datetime as dt, json, os, sqlite3, sys, time
from curl_cffi import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kizomba_world import LANGS, TAG_GENRES, TAG_FEATURES, api_fields, page_fields

SITE = 'https://kizomba-world.com'
FIRST_DAY = '2026-01-01'           # the export covers events from here to the end of next year
PAUSE = 3                          # seconds between requests

last = 0.0
def get(url):
    global last
    time.sleep(max(0, last + PAUSE - time.time()))
    for attempt in range(3):
        r = requests.get(url, impersonate='chrome', timeout=60)
        last = time.time()
        if r.status_code == 200: return r
        print(f'{r.status_code} for {url}', file=sys.stderr)
        time.sleep(30 * (attempt + 1))
    sys.exit(f'giving up on {url}: the site refused it three times')

def listed():
    """Every event the API lists from FIRST_DAY to the end of next year."""
    url = (f'{SITE}/wp-json/tribe/events/v1/events?per_page=50&start_date={FIRST_DAY}'
           f'&end_date={dt.date.today().year + 1}-12-31')
    events = []
    while url:
        page = get(url).json()
        events += page['events']
        url = page.get('next_rest_url')
    return events

def prepare(db):
    db.execute("""create table if not exists pending_extraction (
        event_id integer primary key references events(id),
        reason text not null check (reason in ('new', 'description changed')),
        since text not null)""")
    db.execute("""insert or replace into table_docs values ('pending_extraction', 'table',
        'Events whose description is new or changed since the extraction steps last ran, so their line-up, features, rooms and genres from the description are missing or out of date.',
        'pipeline/scrape.py')""")

# tables whose rows belong to one event, cleared when the site drops it
def event_tables(db):
    return [t for t, in db.execute("select name from sqlite_master where type = 'table'")
            if t != 'events' and any(c[1] == 'event_id' for c in db.execute(f'pragma table_info({t})'))]

def run(src, dry_run):
    db = sqlite3.connect(f'file:{src}?mode=ro' if dry_run else src, uri=True)
    db.row_factory = sqlite3.Row
    if not dry_run: prepare(db)
    known = {r['id']: dict(r) for r in db.execute('select * from events')}
    today = dt.date.today().isoformat()
    differs = {}                   # field -> events where it changed, to tell site updates from parsing slips

    events = [api_fields(e) for e in listed()]
    print(f'{len(events)} events listed; {len(known)} in the source DB')
    if len(events) < 0.9 * sum(1 for e in known.values() if e['start_date'][:10] >= FIRST_DAY):
        sys.exit('the site lists far fewer events than before; stopping instead of deleting them')

    added, changed, cancelled, posters = [], [], [], 0
    for e in events:
        old = known.get(e['id'])
        due = old is None or old['modified_at'] != e['modified_at'] or (e['end_date'] or e['start_date'])[:10] >= today
        row = {k: v for k, v in e.items() if k not in ('categories', 'tags')}
        if due:
            fields = page_fields(get(e['url']).text)
            links = fields.pop('links')
            row |= fields
        else:
            row |= {k: old[k] for k in ('venue', 'address', 'city', 'country', 'deal_text', 'deal_url', 'cancelled',
                                         *(f'url_{l}' for l in LANGS))}
            links = None
        row['page_fetched'] = 1 if due else old['page_fetched']
        if old is None: added.append(e['title'])
        elif fields_changed := [k for k in row if old[k] != row[k]]:
            changed.append(e['title'])
            for k in fields_changed: differs[k] = differs.get(k, 0) + 1
        if row['cancelled'] and not (old and old['cancelled']): cancelled.append(e['title'])
        if dry_run: continue

        cols = ', '.join(row)
        db.execute(f'insert or replace into events ({cols}) values ({", ".join("?" * len(row))})', list(row.values()))
        db.execute('delete from event_categories where event_id = ?', (e['id'],))
        db.executemany('insert into event_categories values (?, ?)', [(e['id'], c) for c in e['categories']])
        db.execute('delete from event_tags where event_id = ?', (e['id'],))
        db.executemany('insert into event_tags values (?, ?)', [(e['id'], t) for t in e['tags']])
        db.execute("delete from event_genres where event_id = ? and source = 'site_tag'", (e['id'],))
        db.executemany("insert into event_genres (event_id, genre, source) values (?, ?, 'site_tag')",
                       sorted({(e['id'], g) for t in e['tags'] for g in TAG_GENRES.get(t, [])}))
        db.execute("delete from event_features where event_id = ? and source = 'site_tag'", (e['id'],))
        db.executemany("insert into event_features (event_id, feature, source) values (?, ?, 'site_tag')",
                       sorted({(e['id'], TAG_FEATURES[t]) for t in e['tags'] if t in TAG_FEATURES}))
        if links is not None:
            db.execute('delete from event_links where event_id = ?', (e['id'],))
            db.executemany('insert into event_links values (?, ?)', [(e['id'], u) for u in links])
        if old is None or old['description_text'] != row['description_text']:
            db.execute('insert or ignore into pending_extraction values (?, ?, ?)',
                       (e['id'], 'new' if old is None else 'description changed', today))
        has_poster = db.execute('select url from event_images where event_id = ?', (e['id'],)).fetchone()
        if row['image_url'] and (not has_poster or has_poster[0] != row['image_url']):
            img = get(row['image_url'])
            db.execute('insert or replace into event_images values (?, ?, ?, ?, ?)', (e['id'], row['image_url'],
                       img.headers.get('content-type', 'image/jpeg'), len(img.content), img.content))
            posters += 1

    gone = sorted(set(known) - {e['id'] for e in events})
    print(f'{len(added)} new, {len(changed)} changed, {len(gone)} no longer listed, {len(cancelled)} newly cancelled')
    for label, titles in (('new', added), ('newly cancelled', cancelled), ('no longer listed', [known[i]['title'] for i in gone])):
        for t in titles: print(f'  {label}: {t}')
    print('changed fields:', dict(sorted(differs.items(), key=lambda kv: -kv[1])))
    if dry_run: return

    for t in event_tables(db):
        db.executemany(f'delete from {t} where event_id = ?', [(i,) for i in gone])
    db.executemany('delete from events where id = ?', [(i,) for i in gone])
    details = {'events': len(events), 'new': len(added), 'changed': len(changed), 'deleted': len(gone),
               'posters_downloaded': posters, 'pending_extraction': db.execute('select count(*) from pending_extraction').fetchone()[0]}
    db.execute("""update pipeline_steps set performed_at = ?, performed_by = 'pipeline/scrape.py (curl_cffi)',
        inputs = ?, outputs = 'tables events, event_categories, event_tags, event_links, event_images, pending_extraction; event_genres and event_features (source site_tag)',
        details = ? where step = '1_scrape'""",
        (dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
         f'{SITE}/wp-json/tribe/events/v1/events from {FIRST_DAY}; each new, changed or upcoming event page', json.dumps(details)))
    db.commit()
    print(details)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Refresh the events in the source DB from kizomba-world.com.')
    ap.add_argument('src', help='the source DB, updated in place')
    ap.add_argument('--dry-run', action='store_true', help='fetch and report the changes without writing')
    a = ap.parse_args()
    run(a.src, a.dry_run)
