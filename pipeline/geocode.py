"""Geocode every (city, country) in the source DB with OpenStreetMap Nominatim, 1 request/s,
keeping already-known places in pipeline/geocode.csv so reruns only ask for new cities."""
import csv, json, os, sqlite3, sys, time, urllib.parse, urllib.request
SRC = sys.argv[1]
CACHE = os.path.join(os.path.dirname(__file__), 'geocode.csv')
UA = 'kizomba-radar/0.1 (https://github.com/clombion/kizomba-radar)'
known = {}
if os.path.exists(CACHE):
    for r in csv.DictReader(open(CACHE, encoding='utf-8')): known[(r['city'], r['country'])] = r
db = sqlite3.connect(f'file:{SRC}?mode=ro', uri=True)
places = db.execute("select distinct coalesce(city,''), coalesce(country,'') from events").fetchall()
for city, country in places:
    if (city, country) in known or not (city or country): continue
    q = {'format': 'json', 'limit': 1, 'accept-language': 'en'}
    q.update({'city': city, 'country': country} if city else {'country': country})
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(q)
    try:
        res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30))
        if not res and city:   # e.g. a district name: retry as free text
            url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'format': 'json', 'limit': 1, 'q': f'{city}, {country}'})
            time.sleep(1.1)
            res = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30))
    except Exception as e:
        print('failed', city, country, e, file=sys.stderr); time.sleep(5); continue
    known[(city, country)] = {'city': city, 'country': country,
        'lat': res[0]['lat'] if res else '', 'lon': res[0]['lon'] if res else '',
        'osm_name': res[0].get('display_name', '') if res else ''}
    time.sleep(1.1)
with open(CACHE, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['city', 'country', 'lat', 'lon', 'osm_name']); w.writeheader()
    w.writerows(sorted(known.values(), key=lambda r: (r['country'], r['city'])))
print(len(known), 'places;', sum(1 for r in known.values() if not r['lat']), 'not found')
