"""List likely duplicate artists for review: pipeline/artist_merge_suggestions.csv.

Two sources:
  - couples whose two names match another couple's, allowing spelling variants and either order
    ("Lukasz & Karolina" / "Karolina & Łukasz", "Jojo & Jenni" / "Jojo & Jenny");
  - the source pipeline's own merge candidates that it left undecided.
Each pair is scored by name similarity, raised when both artists come from the same country (stated in
line-ups, else where they are booked most) and lowered when line-ups state different countries for them.
A country inferred from bookings never lowers the score: touring artists are booked everywhere.
The calendar adjusts it too: two artists booked at overlapping short events in different cities are different
people; turning up in the same city or with the same organiser counts mildly for a match. Both being named in
one line-up is noted but not scored (festivals list artists per room, so names repeat).
Pairs already decided in pipeline/artist_merges.csv (merge or separate) are left out. To act on a
suggestion, copy its row into artist_merges.csv with decision "merge" or "separate".

    python3 -m pipeline.merge_suggestions source/<events>.sqlite
"""

import argparse
import collections
import csv
import datetime as dt
import difflib
import os
import re
import unicodedata

from pipeline import db as sqlite_db
from pipeline.countries import codes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'pipeline', 'artist_merge_suggestions.csv')
MERGES = os.path.join(ROOT, 'pipeline', 'artist_merges.csv')
FIELDS = [
    'decision',
    'keep_key',
    'merge_key',
    'keep_name',
    'merge_name',
    'keep_bookings',
    'merge_bookings',
    'keep_countries',
    'merge_countries',
    'countries',
    'calendar',
    'calendar_note',
    'similarity',
    'score',
    'reason',
]
COUNTRY_BONUS, COUNTRY_PENALTY = 0.1, 0.25  # score = name similarity, adjusted by country of origin …
CLASH_PENALTY, CIRCUIT_BONUS = 0.5, 0.05  # … and by the calendar (see calendar_signal)
SHORT_EVENT_DAYS = 4  # longer events (week-long all-in-ones) never count as a clash


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'^(dj|mc|mr|dr|doctor)\s+', '', s).strip()


sim = lambda a, b: difflib.SequenceMatcher(None, a, b).ratio()


def decided():
    """Pairs already decided, and a function giving each key's merge group (merges chain: A<-B, A<-C groups B and C)."""
    rows = list(csv.DictReader(open(MERGES, encoding='utf-8'))) if os.path.exists(MERGES) else []
    parent = {}

    def group(k):
        while parent.get(k, k) != k:
            k = parent[k]
        return k

    for r in rows:
        if r['decision'].strip().lower() == 'merge':
            a, b = group(r['keep_key']), group(r['merge_key'])
            if a != b:
                parent[b] = a
    return {frozenset((r['keep_key'], r['merge_key'])) for r in rows}, group


def main():
    ap = argparse.ArgumentParser(description='List likely duplicate artists for review.')
    sqlite_db.source_arg(ap)
    c = sqlite_db.connect(ap.parse_args().src, 'ro')
    art = {i: (n, k, kind) for i, n, k, kind in c.execute('select id, display_name, match_key, kind from artists')}
    key_id = dict(c.execute('select match_key, artist_id from artist_keys'))
    booked = collections.Counter(a for (a,) in c.execute('select artist_id from event_artists'))
    members = collections.defaultdict(list)
    for cid, mid in c.execute('select couple_id, member_id from couple_members'):
        members[cid].append(norm(art[mid][0]))
    done, group = decided()
    # The built site DB (run build_site_db.py first) knows every merge, including members merged along with their
    # couples, and has the events as days.
    site = sqlite_db.connect(os.path.join(ROOT, 'docs', 'data', 'kiz.sqlite'), 'ro')
    moved = dict(site.execute('select old_id, new_id from artist_redirects'))

    # Country of origin: what line-ups state next to the name (flags or text); members without one take their
    # couple's; failing that, the country where the artist is booked most. Marked '~' when only inferred.
    stated = collections.defaultdict(collections.Counter)
    for a, text in c.execute(
        "select artist_id, country from event_artists where country is not null and country != ''"
    ):
        for cc in codes(text):
            stated[a][cc] += 1
    for cid, mid in c.execute('select couple_id, member_id from couple_members'):
        if not stated[mid] and stated[cid]:
            stated[mid].update(stated[cid])
    booked_in = collections.defaultdict(collections.Counter)
    for a, country in c.execute(
        'select ea.artist_id, e.country from event_artists ea join events e on e.id = ea.event_id'
    ):
        for cc in codes(country)[:1]:
            booked_in[a][cc] += 1

    def origin(a):
        if stated[a]:
            return {cc for cc, _ in stated[a].most_common()}, False
        if booked_in[a]:
            return {booked_in[a].most_common(1)[0][0]}, True
        return set(), True

    # French overseas territories count as France: artists list either.
    FR_TERRITORIES = {'RE', 'GP', 'MQ', 'GF', 'YT', 'MF', 'BL', 'NC', 'PF', 'PM', 'WF'}
    as_fr = lambda cs: {'FR' if cc in FR_TERRITORIES else cc for cc in cs}

    def country_signal(a, b):
        # Only a stated origin speaks for where someone is from: touring artists are booked everywhere, so a
        # country inferred from bookings can confirm a match but never contradict one. Line-ups often show a
        # heritage flag in one listing and a home base in another, so any overlap counts as the same.
        (oa, ia), (ob, ib) = origin(a), origin(b)
        oa, ob = as_fr(oa), as_fr(ob)
        if not oa or not ob:
            return 'unknown', 0
        if oa & ob:
            return 'same', COUNTRY_BONUS if not (ia and ib) else COUNTRY_BONUS / 2
        if not ia and not ib:
            return 'different', -COUNTRY_PENALTY
        return 'unclear', 0

    # Calendar: every event an artist appears at (directly or through a couple), with dates, city and organisers.
    ev = {}
    for eid, start, end, city, country in site.execute('select id, start_date, end_date, city, country from events'):
        a, b = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        ev[eid] = (a, b, (b - a).days <= SHORT_EVENT_DAYS, city.strip().lower(), f'{city}, {country}')
    organisers = collections.defaultdict(set)
    for eid, a in c.execute("select event_id, artist_id from event_artists where role = 'organiser'"):
        organisers[eid].add(a)
    events_of = collections.defaultdict(set)  # any appearance, also through a couple
    direct_roles = collections.defaultdict(set)  # (event, role) where the artist itself is named
    for a, eid, role, via in c.execute('select artist_id, event_id, role, via from artist_events'):
        if role == 'organiser':
            continue
        events_of[a].add(eid)
        if via == 'direct':
            direct_roles[a].add((eid, role))

    def calendar_signal(a, b):
        # Different people can't be in two places at once, and one act isn't booked twice in one line-up.
        # Both named in one line-up proves nothing either way: big festivals list artists per room or section,
        # so one act can appear twice ("ADELAIDE CARVALHO" and "ADELAIDE*" in one Porto line-up). It is shown
        # for the reviewer but does not change the score. Only named in the same role counts, since one
        # person listed as a DJ and again within a couple is the usual way the source splits a person in two.
        ea, eb = events_of[a], events_of[b]
        both = direct_roles[a] & direct_roles[b]
        if both:
            eid, role = min(both)
            return 'same line-up', 0, f'both listed as {role} at the event of {ev[eid][0]} in {ev[eid][4]}'
        for x in ea:
            for y in eb:
                (xa, xb, xs, xc, xn), (ya, yb, ys, yc, yn) = ev[x], ev[y]
                if xs and ys and xa <= yb and ya <= xb and xc != yc:
                    return 'clash', -CLASH_PENALTY, f'{xa}: booked in {xn} and in {yn}'
        cities = {ev[e][3] for e in ea} & {ev[e][3] for e in eb}
        orgs = (
            set().union(*(organisers[e] for e in ea)) & set().union(*(organisers[e] for e in eb))
            if ea and eb
            else set()
        )
        if cities or orgs:
            where = sorted(c_ for c_ in cities if c_)[:3]
            return 'shared circuit', CIRCUIT_BONUS, 'same city: ' + ', '.join(where) if where else 'same organiser'
        return 'no clash', 0, ''

    fmt = lambda a: ('~' if origin(a)[1] and origin(a)[0] else '') + ' '.join(sorted(origin(a)[0]))
    rows = {}

    def add(a, b, score, reason):
        ka, kb = art[a][1], art[b][1]
        if a == b or frozenset((ka, kb)) in done or group(ka) == group(kb) or moved.get(a, a) == moved.get(b, b):
            return
        keep, merge = sorted((a, b), key=lambda i: (-booked[i], i))  # keep the more booked one
        k = (keep, merge)
        if k in rows and rows[k]['similarity'] >= score:
            return
        signal, adj = country_signal(keep, merge)
        cal, cadj, cnote = calendar_signal(keep, merge)
        rows[k] = dict(
            decision='',
            keep_key=art[keep][1],
            merge_key=art[merge][1],
            keep_name=art[keep][0],
            merge_name=art[merge][0],
            keep_bookings=booked[keep],
            merge_bookings=booked[merge],
            keep_countries=fmt(keep),
            merge_countries=fmt(merge),
            countries=signal,
            calendar=cal,
            calendar_note=cnote,
            similarity=round(score, 2),
            score=round(score + adj + cadj, 2),
            reason=reason,
        )

    # couples: both names match, in either order
    couples = [i for i, m in members.items() if len(m) == 2]
    by_initial = collections.defaultdict(set)
    for i in couples:
        for n in members[i]:
            by_initial[n[:1]].add(i)
    for i in couples:
        a1, b1 = members[i]
        for j in by_initial[a1[:1]] | by_initial[b1[:1]]:
            if j <= i:
                continue
            a2, b2 = members[j]
            s1, s2 = max(((sim(a1, a2), sim(b1, b2)), (sim(a1, b2), sim(b1, a2))), key=min)
            lo, hi = sorted((s1, s2))
            if lo >= 0.72 or (hi == 1 and lo >= 0.6):
                add(i, j, (s1 + s2) / 2, 'couple with matching names')

    # the source pipeline's undecided candidates
    for ka, kb, reason, s in c.execute(
        'select key_a, key_b, reason, similarity from artist_merge_candidates where decision is null'
    ):
        a, b = key_id.get(ka), key_id.get(kb)
        if a and b:
            add(a, b, s, reason)

    out = sorted(rows.values(), key=lambda r: (-r['score'], r['keep_name'].lower()))
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(out)
    print(f'{len(out)} suggestions in {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
