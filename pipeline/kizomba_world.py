"""How kizomba-world's API records and event pages read as rows of the source DB. No network here:
pipeline/scrape.py does the fetching."""
import html, re

LANGS = ('fr', 'es', 'pt')
# site tags that state a genre or a feature (the rest are site sections, such as Deal or Holidays)
TAG_GENRES = {'Bachata': ['bachata'], 'Kizomba': ['kizomba'], 'Kompa': ['kompa'], 'SBK': ['salsa', 'bachata'],
              'Salsa': ['salsa'], 'Semba': ['semba'], 'Tarraxo': ['tarraxo'], 'Urbankiz': ['urbankiz'], 'Zouk': ['zouk']}
TAG_FEATURES = {'All in One': 'all_in_one', 'Beach Party': 'beach_party', 'Boat Party': 'boat_party',
                'Competition': 'competition', 'Cruise': 'cruise', 'Pool Party': 'pool_party'}

def text(fragment):
    """Description HTML as plain text: one line per paragraph or line break, spaces collapsed."""
    t = re.sub(r'(?i)<br\b[^>]*>', '\n', fragment)
    t = re.sub(r'(?i)</?(p|div|h[1-6]|li|ul|ol|tr|table|blockquote)\b[^>]*>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t)).replace('\xa0', ' ')
    return '\n'.join(l for l in (' '.join(l.split()) for l in t.split('\n')) if l)

def page_fields(page):
    """What the event page adds to the API's record."""
    def labelled(label):          # <span>Venue : </span> <span class="etn-location-name">…</span> …
        m = re.search(rf'<span>{label} : </span>((?:\s*<span\s+class="etn-location-name">[^<]*</span>)+)', page)
        return [html.unescape(v).strip() for v in re.findall(r'<span\s+class="etn-location-name">([^<]*)</span>', m[1])] if m else []
    venue, address, place = labelled('Venue'), labelled('Adress'), labelled('Location')
    deal = re.search(r'<a href="([^"]+)"[^>]*data-stat-type="deal"[^>]*>([^<]*)<', page)
    social = re.search(r'<div class="etn-social-links[^"]*">(.*?)</ul>', page, re.S)
    return {
        'venue': venue[0] if venue else None, 'address': address[0] if address else None,
        'city': place[0] if len(place) > 1 else None, 'country': place[-1] if place else None,
        'deal_text': html.unescape(deal[2]).strip() if deal else None, 'deal_url': html.unescape(deal[1]) if deal else None,
        'links': sorted(set(html.unescape(u) for u in re.findall(r'<a href="([^"]+)"', social[1]))) if social else [],
        **{f'url_{l}': (m := re.search(rf'hreflang="{l}" href="([^"]+)"', page)) and m[1] for l in LANGS},
        # the site stamps "Cancelled" over the poster of a cancelled event
        'cancelled': int(bool(re.search(r'\.etn-single-event-media::after\s*\{\s*content:\s*"Cancelled"', page))),
    }

# The API serves emoji as images with the emoji as their alt text; the description keeps the emoji itself.
EMOJI_IMG = re.compile(r'<img [^>]*src="https://static\.xx\.fbcdn\.net/images/emoji[^"]*"[^>]*>')
def emoji_text(fragment):
    return EMOJI_IMG.sub(lambda m: html.unescape(re.search(r'alt="([^"]*)"', m[0])[1]), fragment)

def api_fields(e):
    description = emoji_text(e['description'])
    return {
        'id': int(e['id']), 'title': html.unescape(e['title']), 'url': e['url'], 'slug': e['slug'],
        'start_date': e['start_date'], 'end_date': e['end_date'],
        'start_date_utc': e['utc_start_date'], 'end_date_utc': e['utc_end_date'], 'timezone': e['timezone'],
        'all_day': int(e['all_day']), 'featured': int(e['featured']), 'sticky': int(e['sticky']),
        'website': e['website'] or None, 'image_url': (e['image'] or {}).get('url'),
        'description_html': description, 'description_text': text(description),
        'published_at': e['date'], 'modified_at': e['modified'],
        'categories': sorted({html.unescape(c['name']) for c in e['categories']}),
        'tags': sorted({html.unescape(t['name']) for t in e['tags']}),
    }
