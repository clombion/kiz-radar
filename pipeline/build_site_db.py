"""Build docs/data/kiz.sqlite, the database the site loads, from the kizomba-world source DB.

Keeps facts (titles, dates, places, genres, features, line-ups) and links back to kizomba-world;
drops descriptions, images and extraction quotes. Adds places, airports, per-event and per-artist
statistics, and a fares table filled from docs/data/fares.csv.

    python3 pipeline/build_site_db.py source/kizomba_events_2026_2027.compact.sqlite
"""
import collections, csv, datetime as dt, difflib, json, math, os, re, sqlite3, sys, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from countries import codes, NAMES
from text import tidy_name, tidy_title, soften_caps
from airports import AIRPORTS, HOME

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'docs', 'data', 'kiz.sqlite')
POPULAR = 10            # bookings that make an artist "popular"
MAX_AIRPORT_KM = 250
KIZ = ('kizomba', 'urbankiz', 'semba', 'tarraxo', 'tarraxinha', 'douceur')
BOOKED_ROLES = ('teacher', 'dj', 'performer')

def km(a, b, c, d):
    a, b, c, d = map(math.radians, (a, b, c, d))
    return 6371 * 2 * math.asin(math.sqrt(math.sin((c - a) / 2) ** 2 + math.cos(a) * math.cos(c) * math.sin((d - b) / 2) ** 2))

def weekend_friday(start):
    """The Friday a Fri→Mon trip would leave on: the event's own Friday, or the next one for a Wed/Thu start."""
    d = dt.date.fromisoformat(start)
    off = (4 - d.weekday()) % 7
    return (d + dt.timedelta(days=off if off <= 3 else off - 7)).isoformat()

if os.path.exists(OUT): os.remove(OUT)
out = sqlite3.connect(OUT)
out.execute(f"attach database 'file:{SRC}?mode=ro' as src")
x = out.execute

# --- copied tables, without descriptions, images or quotes -------------------------------------
# Dates are days (the site plans weekends, not hours); title is tidied for display, listed_title is as listed.
DAY_CHECK = "check (length({0}) = 10 and date({0}) = {0})"
x(f"""create table events (id integer primary key, title text not null, listed_title text not null, url text not null,
     slug text, start_date text not null {DAY_CHECK.format('start_date')}, end_date text not null {DAY_CHECK.format('end_date')},
     timezone text, all_day integer, featured integer, cancelled integer check (cancelled in (0, 1)), venue text, city text not null, country text,
     website text, published_at text, modified_at text, check (end_date >= start_date))""")
out.executemany("insert into events values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    (i, tidy_title(t), t, url, slug, start[:10], end[:10], tz, all_day, feat, canc,
     soften_caps(venue) if venue else venue, city, country, web, pub, mod)
    for i, t, url, slug, start, end, tz, all_day, feat, canc, venue, city, country, web, pub, mod in x(
        """select id, title, url, slug, start_date, end_date, timezone, all_day, featured, cancelled, venue, city, country,
           website, published_at, modified_at from src.events""")])
for t in ('event_categories', 'event_tags', 'artists', 'artist_aliases', 'couple_members', 'event_artists',
          'genre_definitions', 'feature_definitions', 'role_definitions', 'pipeline_steps'):
    x(f"create table {t} as select * from src.{t}")
x("create table event_genres as select event_id, genre, source, other_name, genre_as_written from src.event_genres")
x("create table event_features as select event_id, feature, source from src.event_features")
x("create table event_rooms as select event_id, party_rooms, class_rooms from src.event_rooms")
x("create table event_room_list as select event_id, room_no, name_as_written, kind, genres from src.event_room_list")
x("create table artist_mentions as select id, event_id, role, name_as_written, style, country from src.artist_mentions")

# --- manual artist merges (pipeline/artist_merges.csv) --------------------------------------------
# Each "merge" row folds merge_key's artist into keep_key's. Merging two couples also merges their
# members pairwise, by closest name. Old ids stay reachable through artist_redirects.
def norm_name(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'^(dj|mc|mr|dr|doctor)\s+', '', re.sub(r'[^a-z0-9 ]', '', s)).strip()

key_id = dict(x("select match_key, artist_id from src.artist_keys"))
key_id.update(dict(x("select match_key, id from artists")))
parent = {}
def root(a):
    while parent.get(a, a) != a: a = parent[a]
    return a
def join(keep, merge):
    keep, merge = root(keep), root(merge)
    if keep != merge: parent[merge] = keep
merge_rows = [r for r in csv.DictReader(open(os.path.join(ROOT, 'pipeline', 'artist_merges.csv'), encoding='utf-8'))
              if r['decision'].strip().lower() == 'merge']
members_of = collections.defaultdict(list)
for cid, mid, name in x("select cm.couple_id, cm.member_id, a.display_name from couple_members cm join artists a on a.id = cm.member_id"):
    members_of[cid].append((mid, norm_name(name)))
for r in merge_rows:
    keep, merge = key_id.get(r['keep_key']), key_id.get(r['merge_key'])
    if not keep or not merge:
        print(f"artist_merges.csv: unknown key in {r['keep_name']} / {r['merge_name']}; skipped", file=sys.stderr); continue
    join(keep, merge)
    km_, mm = members_of.get(keep, []), members_of.get(merge, [])
    if len(km_) == len(mm) == 2:
        sim = lambda a, b: difflib.SequenceMatcher(None, a, b).ratio()
        straight = sim(km_[0][1], mm[0][1]) + sim(km_[1][1], mm[1][1])
        crossed = sim(km_[0][1], mm[1][1]) + sim(km_[1][1], mm[0][1])
        pairs = zip(km_, mm) if straight >= crossed else zip(km_, reversed(mm))
        for (k_id, _), (m_id, _) in pairs: join(k_id, m_id)
redirects = [(a, root(a)) for a in list(parent) if root(a) != a]
x("create table artist_redirects (old_id integer primary key, new_id integer)")
out.executemany("insert into artist_redirects values (?,?)", redirects)
for old, new in redirects:
    x("update event_artists set artist_id = ? where artist_id = ?", (new, old))
    x("update couple_members set couple_id = ? where couple_id = ?", (new, old))
    x("update couple_members set member_id = ? where member_id = ?", (new, old))
    for alias, n in x("select alias, mentions from artist_aliases where artist_id = ?", (old,)).fetchall():
        if not x("update artist_aliases set mentions = mentions + ? where artist_id = ? and alias = ?", (n, new, alias)).rowcount:
            x("insert into artist_aliases values (?,?,?)", (new, alias, n))
    x("delete from artist_aliases where artist_id = ?", (old,))
    (old_name,) = x("select display_name from artists where id = ?", (old,)).fetchone()
    x("""insert into artist_aliases select ?, ?, 0
         where not exists (select 1 from artist_aliases where artist_id = ? and alias = ?)""", (new, old_name, new, old_name))
    x("delete from artists where id = ?", (old,))
# a merge can leave the same artist twice in one line-up or couple
x("""delete from event_artists where mention_id not in (
       select min(mention_id) from event_artists group by event_id, artist_id, role)""")
x("delete from couple_members where rowid not in (select min(rowid) from couple_members group by couple_id, member_id)")
print(f'{len(merge_rows)} merge rows, {len(redirects)} artists folded into others')

# one casing for names across the site: "AMI & JULIEN" → "Ami & Julien", "Dj Chico" → "DJ Chico"
renamed = [(new, i) for i, n in x("select id, display_name from artists").fetchall() if (new := tidy_name(n)) != n]
out.executemany("update artists set display_name = ? where id = ?", renamed)
print(f'{len(renamed)} artist names recased')

# --- places and airports -------------------------------------------------------------------------
geo = {(r['city'], r['country']): r for r in csv.DictReader(open(os.path.join(ROOT, 'pipeline', 'geocode.csv'), encoding='utf-8'))}
airports = AIRPORTS
x("create table airports (code text primary key, name text not null, city text not null, country_code text, lat real, lon real, tier integer)")
out.executemany("insert into airports values (?,?,?,?,?,?,?)",
                [(a['code'], a['name'], a['city'], a['country_code'], float(a['lat']), float(a['lon']), int(a['tier'])) for a in airports])
for col in ('country_code text', 'lat real', 'lon real', 'airport text', 'airport_km real', 'weekend_friday text'):
    x(f"alter table events add column {col}")
for eid, city, country, start in x("select id, city, coalesce(country,''), start_date from events").fetchall():
    cc = (codes(country) or [None])[0]
    g = geo.get((city, country)) or {}
    lat, lon = (float(g['lat']), float(g['lon'])) if g.get('lat') else (None, None)
    ap = dist = None
    if lat is not None:
        dist, ap = min((km(lat, lon, float(a['lat']), float(a['lon'])), a['code']) for a in airports)
        if dist > MAX_AIRPORT_KM: ap = dist = None
    x("update events set country_code=?, lat=?, lon=?, airport=?, airport_km=?, weekend_friday=? where id=?",
      (cc, lat, lon, ap, round(dist) if dist is not None else None, weekend_friday(start), eid))
x("create table countries (code text primary key, name text)")
out.executemany("insert into countries values (?,?)", sorted(NAMES.items()))

# --- fares: snapshot of docs/data/fares.csv (the site reloads the live file) ---------------------
x("""create table fares (airport text, depart text, return text, price real, currency text, fetched_at text,
     primary key (airport, depart, return))""")
fares_csv = os.path.join(ROOT, 'docs', 'data', 'fares.csv')
if os.path.exists(fares_csv):
    out.executemany("insert or replace into fares values (?,?,?,?,?,?)",
        [(r['airport'], r['depart'], r['return'], float(r['price']), r['currency'], r['fetched_at'])
         for r in csv.DictReader(open(fares_csv, encoding='utf-8'))])
x("""create view event_fares as
     select e.id as event_id, e.airport, e.weekend_friday as depart, f.return, f.price, f.fetched_at,
       (select min(price) from fares m where m.airport = e.airport
          and substr(m.depart, 1, 7) = substr(e.weekend_friday, 1, 7)) as month_min
     from events e left join fares f on f.airport = e.airport and f.depart = e.weekend_friday""")

# --- artist statistics -----------------------------------------------------------------------------
# A couple's booking counts for the couple, not for each member: a member's own bookings are their solo
# work. A member listed in the same role as their couple at the same event repeats the couple's booking,
# so it is marked (as_couple) and left out of line-ups and statistics; a different role (the couple
# teaches, one of them DJs) is a solo booking.
x("alter table event_artists add column as_couple integer")
x("""update event_artists set as_couple = (
       select c.artist_id from event_artists c join couple_members cm on cm.couple_id = c.artist_id
       where c.event_id = event_artists.event_id and c.role = event_artists.role
         and cm.member_id = event_artists.artist_id limit 1)""")
x("""create view artist_events as
    select ea.artist_id, ea.event_id, ea.role, 'direct' as via, null as via_artist_id from event_artists ea
    where ea.as_couple is null
    union all
    select cm.member_id, ea.event_id, ea.role, 'member', ea.artist_id
    from event_artists ea join couple_members cm on cm.couple_id = ea.artist_id""")
roles_sql = ','.join(f"'{r}'" for r in BOOKED_ROLES)
ev_cc = dict(x("select id, country_code from events"))
bookings = collections.defaultdict(set)
role_count = collections.defaultdict(collections.Counter)
for a, e, role in x(f"select artist_id, event_id, role from event_artists where as_couple is null and role in ({roles_sql})"):
    if e not in bookings[a]: role_count[a][role] += 1
    bookings[a].add(e)
couple_bookings = collections.defaultdict(set)     # member -> events booked as part of a couple
for m, e in x(f"select artist_id, event_id from artist_events where via = 'member' and role in ({roles_sql})"):
    couple_bookings[m].add(e)
stated = collections.defaultdict(collections.Counter)
for a, text in x("select artist_id, country from event_artists where country is not null and country != ''"):
    for c in codes(text): stated[a][c] += 1

x("create table artist_origin (artist_id integer, country_code text, mentions integer, primary key (artist_id, country_code))")
out.executemany("insert into artist_origin values (?,?,?)", [(a, c, n) for a, cnt in stated.items() for c, n in cnt.items()])

x("""create table artist_stats (artist_id integer primary key, bookings integer, teacher integer, dj integer,
     performer integer, first_date text, last_date text, home_country text, home_basis text check (home_basis in ('given', 'stated')),
     booked_most_in text, countries integer, abroad_bookings integer, popular integer, couple_bookings integer,
     check ((home_country is null) = (home_basis is null)))""")
x("create table artist_countries (artist_id integer, country_code text, bookings integer, is_home integer, primary key (artist_id, country_code))")
dates = dict(((r[0]), r[1]) for r in x("select id, start_date from events"))
# home countries known from outside the line-ups (pipeline/artist_countries.csv), by the source's match_key
given = {}
for r in csv.DictReader(open(os.path.join(ROOT, 'pipeline', 'artist_countries.csv'), encoding='utf-8')):
    if r['match_key'] not in key_id: sys.exit(f"artist_countries.csv: unknown match_key {r['match_key']} ({r['name']})")
    if not x("select 1 from countries where code = ?", (r['country'],)).fetchone(): sys.exit(f"artist_countries.csv: unknown country {r['country']} ({r['name']})")
    given[root(key_id[r['match_key']])] = r['country']
# A home country is known when it is given in that file or stated in a line-up they are booked in. Where it isn't,
# the country they are booked in most stands in for it in the statistics (imported artists, bookings abroad), and
# is kept apart as booked_most_in, so the site never shows a guess as where someone is from.
home_of = {}
for a, evs in bookings.items():
    where = collections.Counter(ev_cc[e] for e in evs if ev_cc[e])
    booked_origins = [c for c, _ in stated[a].most_common() if where.get(c)]
    home, basis = ((given[a], 'given') if a in given
                   else (max(booked_origins, key=lambda c: where[c]), 'stated') if booked_origins else (None, None))
    most = where.most_common(1)[0][0] if where else None
    home_of[a] = home or most
    ds = sorted(dates[e] for e in evs)
    abroad = sum(n for c, n in where.items() if c != home_of[a])
    x("insert into artist_stats values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      (a, len(evs), role_count[a]['teacher'], role_count[a]['dj'], role_count[a]['performer'], ds[0], ds[-1],
       home, basis, most, len(where), abroad, int(len(evs) >= POPULAR), len(couple_bookings[a] - evs)))
    out.executemany("insert into artist_countries values (?,?,?,?)", [(a, c, n, int(c == home)) for c, n in where.items()])

# --- event statistics ------------------------------------------------------------------------------
genres = collections.defaultdict(set)
for e, g in x("select event_id, genre from event_genres"): genres[e].add(g)
feats = collections.defaultdict(set)
for e, f in x("select event_id, feature from event_features"): feats[e].add(f)
lineups = collections.defaultdict(set)
for e, a in x("select event_id, artist_id from event_artists where role in ('teacher','dj') and as_couple is null"): lineups[e].add(a)
x("""create table event_stats (event_id integer primary key, lineup integer, popular_artists integer, imported integer,
     kiz integer, kiz_only integer, taxi_dancers integer, all_in_one integer, genres text, features text)""")
for e, cc in ev_cc.items():
    g, f, l = genres[e], feats[e], lineups[e]
    kiz = bool(g & set(KIZ))
    x("insert into event_stats values (?,?,?,?,?,?,?,?,?,?)",
      (e, len(l), sum(len(bookings[a]) >= POPULAR for a in l), sum(home_of.get(a) not in (None, cc) for a in l),
       int(kiz), int(kiz and not g & {'salsa', 'bachata'}), int('taxi_dancers' in f), int('all_in_one' in f),
       ','.join(sorted(g)), ','.join(sorted(f))))

x("""create view country_stats as
    select e.country_code, c.name, count(*) as events, sum(s.kiz_only) as kiz_only, sum(s.taxi_dancers) as taxi_dancers,
      round(avg(s.lineup), 1) as avg_lineup, sum(s.popular_artists) as popular_bookings,
      round(100.0 * sum(s.imported) / nullif(sum(s.lineup), 0)) as imported_pct,
      (select airport from events e2 where e2.country_code = e.country_code and e2.airport is not null
         group by airport order by count(*) desc limit 1) as main_airport
    from events e join event_stats s on s.event_id = e.id left join countries c on c.code = e.country_code
    where e.cancelled is not 1 group by e.country_code""")

# What the site reads for festivals: each event with its statistics, and whether it is still to come (evaluated
# when queried, so "upcoming" means the same thing on every page).
x("""create view event_rows as
    select e.id, e.title, e.url, e.start_date, e.end_date, e.city, e.country_code, e.lat, e.lon, e.airport, e.airport_km,
      a.city as airport_city, e.weekend_friday, e.cancelled, e.venue, s.lineup, s.popular_artists, s.kiz_only,
      s.taxi_dancers, s.all_in_one, s.features, e.end_date >= date('now') and e.cancelled is not 1 as upcoming
    from events e join event_stats s on s.event_id = e.id left join airports a on a.code = e.airport""")

x("create table meta (key text primary key, value text)")
out.executemany("insert into meta values (?,?)", [
    ('home_airport', HOME), ('popular_threshold', str(POPULAR)), ('max_airport_km', str(MAX_AIRPORT_KM)),
    ('built_at', dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')),
    ('events_source', 'https://kizomba-world.com/'),
    ('events_licence', 'CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/: the festival data is kizomba-world.com’s, adapted here and shared under the same licence'),
    ('events_range', ' – '.join(x("select min(start_date), max(start_date) from events").fetchone())),
])

DOCS = {
 'events': 'One row per kizomba-world event: title (tidied: dates, years and shouting capitals removed; listed_title is as listed), dates (days), venue and city, link (url), cancelled (1 or 0; null when not known, since the source flags it only for events still listed as upcoming). Added: country_code, lat/lon (OpenStreetMap geocode of the city), airport (nearest in airports, within max_airport_km), airport_km, weekend_friday (the Friday of a Fri→Mon trip to it).',
 'airports': 'Airports the fare sweep covers, with the city they serve. tier sets how often fares refresh (1 = every few days); tier 0 is home, where no flight is needed.',
 'fares': f'Round-trip economy fares from {HOME}, one adult, Friday out and Monday back, from Google Flights via fli. Reloaded from data/fares.csv when the page opens.',
 'event_fares': 'Each event joined to the fare for its weekend (null when Google had no price), plus the cheapest fare that month to the same airport.',
 'artist_stats': f'Per artist with bookings of their own: bookings (teacher, DJ or performer at distinct events; a couple’s bookings count for the couple, not its members), home_country when it is known (home_basis: given in pipeline/artist_countries.csv, or stated next to their name in a line-up they are booked in; null otherwise), booked_most_in (the country with most of their bookings), countries booked in, bookings abroad (outside the home country, or outside booked_most_in when that is unknown), popular = at least {POPULAR} bookings, couple_bookings = further events where they appear only as part of a couple. People booked only as part of a couple have no row.',
 'event_artists': 'Each artist named in a line-up, resolved to an artist, with role, style and stated country. as_couple is set when a member is listed in the same role as their couple at the same event: that row repeats the couple’s booking and is left out of line-ups and statistics.',
 'artist_redirects': 'Artists merged into another by pipeline/artist_merges.csv: old_id now reads as new_id.',
 'artist_events': 'Every appearance of an artist: direct (their own booking) or member (via a booked couple, via_artist_id).',
 'artist_countries': 'Bookings per artist and country; is_home marks the known home country in artist_stats.',
 'artist_origin': 'Countries stated next to an artist’s name in line-ups (flags or text), with how often.',
 'event_stats': 'Per event: line-up size (teachers and DJs), popular artists booked, imported artists (home country differs from the event’s), kizomba-family genres, kiz-only (no salsa or bachata), taxi dancers, all-in-one hotel.',
 'event_rows': 'What the site reads: each event with its event_stats, and upcoming (not over yet and not cancelled, as of the moment of the query).',
 'country_stats': 'Per country: events, kiz-only events, taxi dancers, average line-up, bookings of popular artists, share of imported artists, most common airport.',
 'countries': 'ISO 3166 codes and names.',
 'meta': 'Build settings and provenance.',
}
# What the page shows before the database has loaded: the home airport and the destinations for the sentence.
home_city = x("select city from airports where code = ?", (HOME,)).fetchone()[0]
site = {
    'home': {'code': HOME, 'city': home_city},
    'destinations': sorted(({'code': c, 'name': n} for c, n in x("""select distinct e.country_code, c.name from events e
        join countries c on c.code = e.country_code where e.cancelled is not 1""")),
        key=lambda d: unicodedata.normalize('NFKD', d['name']).encode('ascii', 'ignore').lower()),
    'events_range': list(x("select min(start_date), max(start_date) from events").fetchone()),
    'built_at': dict(x("select key, value from meta"))['built_at'],
}
json.dump(site, open(os.path.join(ROOT, 'docs', 'data', 'site.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

x("create table table_docs (name text primary key, description text)")
out.executemany("insert or replace into table_docs values (?,?)", DOCS.items())
for name, desc in x("select name, description from src.table_docs").fetchall():
    if x("select 1 from sqlite_master where name=?", (name,)).fetchone() and name not in DOCS:
        x("insert or ignore into table_docs values (?,?)", (name, desc))
out.commit()
x("detach database src")
x("vacuum")
out.close()
print(OUT, os.path.getsize(OUT) // 1024, 'KB')
