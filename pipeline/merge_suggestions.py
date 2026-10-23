"""List likely duplicate artists for review: pipeline/artist_merge_suggestions.csv.

Two sources:
  - couples whose two names match another couple's, allowing spelling variants and either order
    ("Lukasz & Karolina" / "Karolina & Łukasz", "Jojo & Jenni" / "Jojo & Jenny");
  - the source pipeline's own merge candidates that it left undecided.
Pairs already decided in pipeline/artist_merges.csv (merge or separate) are left out. To act on a
suggestion, copy its row into artist_merges.csv with decision "merge" or "separate".

    python3 pipeline/merge_suggestions.py source/<events>.sqlite
"""
import collections, csv, difflib, os, re, sqlite3, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'pipeline', 'artist_merge_suggestions.csv')
MERGES = os.path.join(ROOT, 'pipeline', 'artist_merges.csv')
FIELDS = ['decision', 'keep_key', 'merge_key', 'keep_name', 'merge_name', 'keep_bookings', 'merge_bookings', 'similarity', 'reason']

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
        while parent.get(k, k) != k: k = parent[k]
        return k
    for r in rows:
        if r['decision'].strip().lower() == 'merge':
            a, b = group(r['keep_key']), group(r['merge_key'])
            if a != b: parent[b] = a
    return {frozenset((r['keep_key'], r['merge_key'])) for r in rows}, group

def main():
    c = sqlite3.connect(f'file:{SRC}?mode=ro', uri=True)
    art = {i: (n, k, kind) for i, n, k, kind in c.execute('select id, display_name, match_key, kind from artists')}
    key_id = dict(c.execute('select match_key, artist_id from artist_keys'))
    booked = collections.Counter(a for (a,) in c.execute('select artist_id from event_artists'))
    members = collections.defaultdict(list)
    for cid, mid in c.execute('select couple_id, member_id from couple_members'):
        members[cid].append(norm(art[mid][0]))
    done, group = decided()
    rows = {}

    def add(a, b, score, reason):
        ka, kb = art[a][1], art[b][1]
        if a == b or frozenset((ka, kb)) in done or group(ka) == group(kb): return
        keep, merge = sorted((a, b), key=lambda i: (-booked[i], i))   # keep the more booked one
        k = (keep, merge)
        if k in rows and rows[k]['similarity'] >= score: return
        rows[k] = dict(decision='', keep_key=art[keep][1], merge_key=art[merge][1], keep_name=art[keep][0],
                       merge_name=art[merge][0], keep_bookings=booked[keep], merge_bookings=booked[merge],
                       similarity=round(score, 2), reason=reason)

    # couples: both names match, in either order
    couples = [i for i, m in members.items() if len(m) == 2]
    by_initial = collections.defaultdict(set)
    for i in couples:
        for n in members[i]: by_initial[n[:1]].add(i)
    for i in couples:
        a1, b1 = members[i]
        for j in by_initial[a1[:1]] | by_initial[b1[:1]]:
            if j <= i: continue
            a2, b2 = members[j]
            s1, s2 = max(((sim(a1, a2), sim(b1, b2)), (sim(a1, b2), sim(b1, a2))), key=min)
            lo, hi = sorted((s1, s2))
            if lo >= 0.72 or (hi == 1 and lo >= 0.6):
                add(i, j, (s1 + s2) / 2, 'couple with matching names')

    # the source pipeline's undecided candidates
    for ka, kb, reason, s in c.execute("select key_a, key_b, reason, similarity from artist_merge_candidates where decision is null"):
        a, b = key_id.get(ka), key_id.get(kb)
        if a and b: add(a, b, s, reason)

    out = sorted(rows.values(), key=lambda r: (-r['similarity'], r['keep_name'].lower()))
    with open(OUT, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n'); w.writeheader(); w.writerows(out)
    print(f'{len(out)} suggestions in {os.path.relpath(OUT, ROOT)}')

if __name__ == '__main__':
    main()
