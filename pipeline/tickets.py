# /// script
# requires-python = ">=3.11"
# dependencies = ["anthropic==2.3.0", "jsonschema==4.26.0", "patchright==1.55.2", "curl_cffi==0.13.0"]
# ///
"""Prices from festivals' ticket pages, into pipeline/pass_prices.csv: for festivals whose description gives no
price but links to where tickets are sold.

    uv run pipeline/tickets.py todo                      # festivals to check, with their ticket links
    uv run pipeline/tickets.py read ID [--url URL]       # save the ticket page's text (work/pages/ID.json)
    uv run pipeline/tickets.py read ID --visible         # the same, for a page behind a browser check
    uv run pipeline/tickets.py scaffold ID               # an empty answer for an agent to fill (work/answers/ID.json)
    uv run pipeline/tickets.py ask ID                    # or Claude fills it (needs ANTHROPIC_API_KEY)
    uv run pipeline/tickets.py record ID                 # check the answer, then write ID's rows in pass_prices.csv
    uv run pipeline/tickets.py auto                      # read, ask and record every Weezevent festival in todo

A festival needs a check when it is still to come and its description gives no full pass or package price, or when
its ticket-page prices were read more than STALE_DAYS ago or every one of their dates has passed. Its ticket links
come from the event's links and description; a link kizomba-world cut short ("…") has to be found by hand.

The answer has the prices pass's shape (schemas/prices.json) and is read the way a description is (prompt prices-v2),
with the page's text in place of the description. record runs the same checks as the prices pass: the schema, every
quote word for word in the page, every amount in its quote. It is the only thing that writes pass_prices.csv, and it
replaces all the festival's rows. Weezevent pages show their tickets in a widget, so read reads the widget, with its ticket categories opened.

Saved pages and answers stay in pipeline/tickets/work/ (not committed); pass_prices.csv keeps each price's line,
page and date, and who read it.
"""
import argparse, csv, datetime as dt, json, os, re, shutil, sqlite3, sys, threading
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / 'pipeline' / 'extract'))
sys.path.insert(0, str(ROOT / 'pipeline'))
import check_output, prices

WORK = ROOT / 'pipeline' / 'tickets' / 'work'
CSV = ROOT / 'pipeline' / 'pass_prices.csv'
FIELDS = ['event_id', 'event', 'kind', 'label', 'group_size', 'days', 'includes_hotel', 'amount', 'currency', 'alt_amount',
          'alt_currency', 'from', 'until', 'quantity', 'door', 'sold_out', 'current', 'quote', 'source_url', 'checked_on',
          'read_by']
SCHEMA = json.loads((ROOT / 'pipeline' / 'extract' / 'schemas' / 'prices.json').read_text())
PROMPT = 'prices-v2'
STALE_DAYS = 28
# hosts that are never where tickets are sold: social networks, maps, hotels, kizomba-world itself
NOT_TICKETS = ('facebook', 'instagram', 'youtube', 'kizomba-world', 'google', 'wa.me', 'whatsapp', 'tiktok', 'spotify',
               'booking.com', 'maps', 'linktr', 'accor', 'marriott', 'hotel', 'nh-hotels', 'barcelo', 'bastion',
               'synxis', 'mews.com', 'appartcity', 'twb.nz', 'twibbo', 'fb.me', 'forms.gle')

def src_db():
    return sqlite3.connect(sorted((ROOT / 'source').glob('*.sqlite'), key=os.path.getmtime)[-1])

def rows():
    with CSV.open(encoding='utf-8') as f:
        return list(csv.DictReader(f))

def links(db, event_id):
    """The festival's links that may sell tickets, full ones first; a cut-short one ends in …."""
    urls = [u for u, in db.execute('select url from event_links where event_id = ?', (event_id,))]
    urls += re.findall(r'https?://[^\s<>"|)]+', db.execute('select coalesce(description_text, "") from events where id = ?',
                                                           (event_id,)).fetchone()[0])
    keep = {u for u in urls if (h := urlparse(u).netloc.lower()) and not any(n in h for n in NOT_TICKETS)}
    return sorted(keep, key=lambda u: ('…' in u, 'weezevent' not in u, u))

def todo(db):
    today = dt.date.today().isoformat()
    priced = {e for e, in db.execute("""select distinct event_id from event_passes where source = 'description'
                                        and kind in ('full', 'package')""")}
    page = {}
    for r in rows():
        page.setdefault(int(r['event_id']), []).append(r)
    out = []
    for i, title, start in db.execute("""select id, title, start_date from events where end_date >= ? and cancelled is not 1
                                         order by start_date""", (today,)):
        if i in page:
            checked = min(r['checked_on'] for r in page[i])
            ended = all(r['until'] and prices.on_date(r['until'], start) < today for r in page[i])
            reason = ('read ' + checked + ', every price date passed' if ended else
                      'read ' + checked if (dt.date.today() - dt.date.fromisoformat(checked)).days > STALE_DAYS else None)
        else:
            reason = None if i in priced else 'no price in the description'
        if reason:
            out.append(dict(event_id=i, title=title, start=start[:10], reason=reason, links=links(db, i),
                            page=page[i][0]['source_url'] if i in page else None))
    return out

def weezevent_widget(url):
    """A Weezevent mini-site shows its tickets in a widget: the widget's own address."""
    from curl_cffi import requests
    html = requests.get(url, impersonate='chrome', timeout=60).text
    m = re.search(r'https://widget\.weezevent\.com/ticket/[A-Z0-9-]+/', html)
    if not m: sys.exit(f'{url}: no ticket widget on the page')
    return m.group(0) + '?locale=en-GB'

def clean(text):
    """The page's text without the quantity pickers' runs of bare numbers (0, 1, 2, … on their own lines)."""
    out, run = [], []
    for line in text.splitlines():
        if re.fullmatch(r'\s*\d{1,3}\s*', line):
            run.append(line); continue
        if len(run) < 4: out += run
        run = []; out.append(line)
    return '\n'.join(out + (run if len(run) < 4 else []))

def read(event_id, url, visible):
    db = src_db()
    if not url:
        full = [u for u in links(db, event_id) if '…' not in u]
        if not full: sys.exit(f'{event_id}: no full ticket link; find the page and pass --url')
        url = full[0]
    page = weezevent_widget(url) if 'my.weezevent.com' in url else url
    # a Weezevent widget shows its ticket categories collapsed
    click = '.billetterie_tb_titre_categorie.wid-close' if 'widget.weezevent.com' in page else None
    if visible and not os.environ.get('DISPLAY'):
        if not shutil.which('xvfb-run'): sys.exit('--visible needs a display or xvfb-run')
        os.execvp('xvfb-run', ['xvfb-run', '-a', sys.executable, *sys.argv])
    from read_page import page_text
    title, status, text = page_text(page, wait=8, visible=visible, click=click)
    WORK.joinpath('pages').mkdir(parents=True, exist_ok=True)
    out = WORK / 'pages' / f'{event_id}.json'
    out.write_text(json.dumps(dict(event_id=event_id, url=url, read_url=page, title=title, status=status,
                                   read_on=dt.date.today().isoformat(), text=clean(text)), ensure_ascii=False, indent=1))
    print(f'{out.relative_to(ROOT)}: {title} ({status}), {len(text)} characters')
    if status and status >= 400: print('the page refused the read; try --visible', file=sys.stderr)

def saved_page(event_id):
    path = WORK / 'pages' / f'{event_id}.json'
    if not path.exists(): sys.exit(f'{event_id}: no saved page; run: uv run pipeline/tickets.py read {event_id}')
    return json.loads(path.read_text())

def event_row(event_id, page):
    db = src_db(); db.row_factory = sqlite3.Row
    r = dict(db.execute('select id, title, start_date, end_date, country from events where id = ?', (event_id,)).fetchone())
    return r | {'description_text': page['text']}

def scaffold(event_id):
    page = saved_page(event_id)
    path = WORK / 'answers' / f'{event_id}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'batch': f'page-{event_id}', 'prompt_version': PROMPT,
                                'events': [{'event_id': event_id, 'passes': [], 'rule_quotes': []}]}, indent=1) + '\n')
    (path.with_suffix('.by')).write_text('agent\n')
    print(f'Fill {path.relative_to(ROOT)} following pipeline/extract/prompts/{PROMPT}.md, reading the page text in '
          f'{(WORK / "pages" / f"{event_id}.json").relative_to(ROOT)} as the description; then run: '
          f'uv run pipeline/tickets.py record {event_id}')

def ask(event_id):
    import anthropic, ask as asker
    page = saved_page(event_id)
    out = asker.ask(anthropic.Anthropic(), 'prices', event_row(event_id, page), {'input': 0, 'output': 0}, threading.Lock())
    if out is None: sys.exit(f'{event_id}: no answer passed the checks')
    out['batch'] = f'page-{event_id}'
    path = WORK / 'answers' / f'{event_id}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    path.with_suffix('.by').write_text(f'{asker.MODEL}\n')
    print(f'{path.relative_to(ROOT)}: {sum(len(p["tiers"]) for p in out["events"][0]["passes"])} prices')

def record(event_id):
    page = saved_page(event_id)
    path = WORK / 'answers' / f'{event_id}.json'
    if not path.exists(): sys.exit(f'{event_id}: no answer; run scaffold (an agent fills it) or ask')
    out = json.loads(path.read_text())
    row = event_row(event_id, page)
    batch = {'events': [{'event_id': event_id, 'title': row['title'], 'description': page['text']}]}
    found = check_output.problems(SCHEMA, batch, out) + prices.problems(out)
    if found:
        print('\n'.join(found)); sys.exit(f'{event_id}: fix the answer in {path.relative_to(ROOT)}, then record again')
    by = (path.with_suffix('.by').read_text().strip() if path.with_suffix('.by').exists() else 'agent') + f' ({PROMPT})'
    new = []
    for p in out['events'][0]['passes']:
        for t in p['tiers']:
            flag = lambda v: '1' if v else '0'
            new.append({'event_id': event_id, 'event': row['title'], 'kind': p['kind'], 'label': p['label_quote'] or '',
                        'group_size': p['group_size'] or '', 'days': p['days'] or '', 'includes_hotel': flag(p['includes_hotel']),
                        'amount': f"{t['amount']:g}", 'currency': t['currency'],
                        'alt_amount': '' if t['alt_amount'] is None else f"{t['alt_amount']:g}", 'alt_currency': t['alt_currency'] or '',
                        'from': t['from'] or '', 'until': t['until'] or '', 'quantity': t['quantity'] or '',
                        'door': flag(t['door']), 'sold_out': flag(t['sold_out']), 'current': flag(t['current']),
                        'quote': t['quote'], 'source_url': page['url'], 'checked_on': page['read_on'], 'read_by': by})
    if not new: sys.exit(f'{event_id}: the answer has no prices; nothing recorded')
    kept = [r for r in rows() if int(r['event_id']) != event_id]
    with CSV.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, FIELDS, lineterminator='\n'); w.writeheader(); w.writerows(kept + new)
    print(f'{event_id}: {len(new)} prices recorded in {CSV.relative_to(ROOT)}. Then: python3 -I pipeline/extract/load_extract.py, '
          f'uv run pipeline/extract/resolve_artists.py and python3 pipeline/build_site_db.py on the newest source/*.sqlite')

def auto():
    """Every festival in todo with a full Weezevent link: read, ask, record; one failing doesn't stop the rest."""
    failed = []
    for t in todo(src_db()):
        weez = [u for u in t['links'] if 'weezevent.com' in u and '…' not in u]
        if not weez: continue
        try:
            read(t['event_id'], weez[0], False); ask(t['event_id']); record(t['event_id'])
        except SystemExit as e:
            print(e, file=sys.stderr); failed.append(t['event_id'])
    if failed: sys.exit(f'Weezevent festivals not recorded: {failed}')

def main():
    ap = argparse.ArgumentParser(description="Prices from festivals' ticket pages, into pipeline/pass_prices.csv.")
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('todo', help='festivals to check, with their ticket links')
    r = sub.add_parser('read', help="save a festival's ticket page text"); r.add_argument('id', type=int)
    r.add_argument('--url', help='the ticket page, when the festival has no full link'); r.add_argument('--visible', action='store_true',
                   help='a visible browser on a virtual display, for a page behind a browser check')
    for name, text in (('scaffold', 'an empty answer for an agent to fill'), ('ask', 'Claude fills the answer'),
                       ('record', 'check the answer and write it to pass_prices.csv')):
        sub.add_parser(name, help=text).add_argument('id', type=int)
    sub.add_parser('auto', help='read, ask and record every Weezevent festival in todo')
    a = ap.parse_args()
    if a.cmd == 'todo':
        for t in todo(src_db()):
            print(f"{t['event_id']}  {t['start']}  {t['title'][:50]}  ({t['reason']})")
            for u in ([t['page']] if t['page'] else t['links'])[:3]: print(f'      {u}')
    elif a.cmd == 'read': read(a.id, a.url, a.visible)
    elif a.cmd == 'auto': auto()
    else: globals()[a.cmd](a.id)

if __name__ == '__main__':
    main()
