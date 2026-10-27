"""What the build fails on that writing and Tests can't catch (pipeline/STATES.md §4): a value in the committed data
that is no state of its point, such as a hand edit of a CSV; and an override in pipeline/exceptions.py that no
longer departs from anything.

    uv run --group tickets -m pipeline.audit

Unmapped: every coded column of the files the steps share (tickets/pages.csv, tickets/status.csv, pass_prices.csv,
the hand-kept decisions and plans), and the data the load takes: every answer and first read to its current prompt
(one to another prompt waits to be asked again, and is not loaded), each value of an answer checked against the
states its pass makes. Stale: an override for a site a recipe now reads, or one no festival the source database
lists has its known ticket page on. Each finding goes to stderr; then "N unmapped, M stale", exiting 1 when either
is not 0.
"""
import argparse, csv, datetime as dt, json, sys
from collections import defaultdict
from contextlib import closing

from pipeline import exceptions, prompt as prompts, states, tickets
from pipeline.extract import answers

ROOT = tickets.ROOT

# (file, column, point) for each coded column of a shared CSV; an empty value is no state where the column allows it
COLUMNS = [
    ('pipeline/tickets/pages.csv', 'state', 'sales'),
    ('pipeline/tickets/status.csv', 'waits_for', 'waits_for'),
    ('pipeline/tickets/status.csv', 'first_read', 'first_read'),
    ('pipeline/tickets/status.csv', 'sales', 'sales'),
    ('pipeline/pass_prices.csv', 'kind', 'pass_kind'),
    ('pipeline/pass_prices.csv', 'style', 'style'),
    ('pipeline/extract/merges.csv', 'decision', 'merge_decision'),
    ('pipeline/artist_merges.csv', 'decision', 'merge_decision'),
    ('pipeline/plans.csv', 'status', 'plan'),
]
EMPTY_ALLOWED = {('pipeline/tickets/status.csv', 'sales'), ('pipeline/pass_prices.csv', 'style')}

# pass -> (where its states are in an answer's entry, point)
ANSWERED = {
    'extract': [(lambda ev: [a['role'] for a in ev['artists']], 'role'),
                (lambda ev: [x['feature'] for x in ev['features']], 'feature')],
    'rooms_genres': [(lambda ev: [g['genre'] for g in ev['genres']] + [g for r in ev['rooms'] for g in r['genres']],
                      'genre'),
                     (lambda ev: [r['kind'] for r in ev['rooms']], 'room_kind')],
    'prices': [(lambda ev: [p['kind'] for p in ev['passes']], 'pass_kind'),
               (lambda ev: [p['style'] for p in ev['passes'] if p['style']], 'style')],
}


def unmapped(event_ids):
    """(point, value, where) for each value that is no state of its point; event_ids are the festivals the source DB
    has, whose answers count."""
    out = []
    for file, column, point in COLUMNS:
        with (ROOT / file).open(encoding='utf-8') as f:
            for n, r in enumerate(csv.DictReader(f), 2):
                if r[column] not in states.keys(point) and not (r[column] == '' and (file, column) in EMPTY_ALLOWED):
                    out.append((point, r[column], f'{file} line {n}, {column}'))
    for pass_name, columns in ANSWERED.items():
        for i, a in answers.latest(pass_name, event_ids).items():
            if prompts.is_current(pass_name, a.prompt):
                out += [(point, v, f'pipeline/extract/answers/{a.file}, festival {i}') for values, point in columns
                        for v in values(a.entry) if v not in states.made(point)]
    for path in sorted(tickets.READS.glob('*.json')):
        fr = json.loads(path.read_text(encoding='utf-8'))
        if prompts.is_current('first_read', fr['prompt']):
            said = ([('skip_reason', s['reason']) for s in fr['skipped']] + [('pass_kind', ps['kind']) for ps in fr['passes']]
                    + [('style', ps['style']) for ps in fr['passes'] if ps['style']] + [('style', s) for s in fr['styles']])
            out += [(p, v, str(path.relative_to(ROOT))) for p, v in said if v not in states.keys(p)]
    return out


def stale(fs, known):
    """(override, why) for each override that departs from nothing any more: a recipe reads its site now, or no
    festival has its known ticket page there; fs is every festival (tickets.festivals(every=True)), known
    tickets.sites()."""
    on = defaultdict(list)
    for f in fs:
        if f.page:
            on[tickets.host(f.page)].append(f.id)
    out = []
    for o in exceptions.OVERRIDES:
        if site := tickets.site_for(f'https://{o.host}/', known):
            out.append((o, f"the recipe {site[1]} reads it (festivals {', '.join(map(str, on[o.host])) or 'none'})"))
        elif not on[o.host]:
            out.append((o, 'no festival has its known ticket page there'))
    return out


def main():
    argparse.ArgumentParser(description='Name each value in the data that is no state of pipeline/states.py, and '
                                        'each override of pipeline/exceptions.py that departs from nothing any more.'
                            ).parse_args()
    with closing(tickets.src_db()) as db:
        gone = unmapped({i for i, in db.execute('SELECT id FROM events')})
        old = stale(tickets.festivals(db, dt.date.today().isoformat(), every=True), tickets.sites())
    for point, value, where in gone:
        print(f'unmapped: {point} {value!r} in {where}: add a row for it to pipeline/states.py', file=sys.stderr)
    for o, why in old:
        print(f'stale: pipeline/exceptions.py, {o.host}: {why}', file=sys.stderr)
    print(f'{len(gone)} unmapped, {len(old)} stale')
    if gone or old:
        sys.exit(1)


if __name__ == '__main__':
    main()
