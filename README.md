# Kiz Radar

A static site (GitHub Pages, [sql.js](https://sql.js.org/)) for finding the next Kizomba / Urban Kiz festival worth
flying to from Bergen, and for exploring the scene's events and artists.

- **Festivals** — the landing page is a sentence with blanks ("I'd like to dance … in the next three months, flying
  from Bergen to … for a cheap price"). Below it are festival cards. A sticky bar keeps the time and price choices in
  view and puts the rest under Filters. Likely next editions of festivals whose new dates aren't listed yet are
  included. The choices live in the URL, so a view can be bookmarked or shared.
  A card shows the date, place, a tidied title, styles, up to three highlights and a few names. It also shows the
  Friday→Monday return from Bergen and where it lands. It opens in place to the full line-up, the other
  highlights, the venue and organisers.
- **Map & artists**
  - **Map** — one bubble per city (size = festivals, colour = cheapest flight; the legend is on the map). The list
    beside it follows the map: move it to change the list, or pick a city. On a phone the list is a sheet that peeks over the map.
    Every festival has its own link (`#map/event/<id>`).
  - **Artists** — a list with home country, role, number of festivals and the next one. A page per artist leads with
    their upcoming festivals, then where they're booked, with past festivals folded. A couple's bookings count for
    the couple; its members' pages only list their solo bookings and link to the couple.
  - **Countries** — per country: festivals coming up, the cheapest flight to them, and whether line-ups are mostly
    local or visiting artists.
- **SQL** (linked from the footer) — query the whole database in the browser.

Artist names are recased at build time (`pipeline/names.py`). Festival titles are tidied for cards in the browser
(`docs/js/titles.js`), and the original title stays on kizomba-world.

## Data

| File | What | Updated by |
|---|---|---|
| `source/*.sqlite` | The full kizomba-world export (with descriptions and images) | you, when you re-export |
| `docs/data/kiz.sqlite` | What the page loads: events, genres, features, line-ups, artist and country statistics, airports, a fares snapshot | the **Rebuild site database** Action, on every push to `source/` |
| `docs/data/fares.csv` | Fri→Mon return fares from BGO, one row per airport and weekend | the **Refresh fares** Action |
| `docs/data/fare_jobs.csv` | When each airport and month was last searched | the same Action |

The page never reads `source/`: it loads `kiz.sqlite`, replaces its fares table with the latest `fares.csv`, and runs every query locally.
Table descriptions are in the `table_docs` table (see the SQL tab).

Events come from [kizomba-world.com](https://kizomba-world.com/). The site shows facts and links back to each event
page; the full export, descriptions and images included, is in `source/`. Cities are geocoded with OpenStreetMap Nominatim
(`pipeline/geocode.csv`, cached). Fares are Google Flights prices fetched with [fli](https://github.com/punitarani/fli);
they move, so check them before booking.

### Fare refresh schedule

The Action runs every 2 hours and does at most 8 searches, each covering one airport and one month. That stays under
Google's rate limit. The most overdue airport-months go first:

| Airport tier | Next 3 months | Later months |
|---|---|---|
| 1 — cheap targets (Oslo, Poland, Sweden, Copenhagen, Prague, Budapest, Baltics) | every 3 days | weekly |
| 2 — large scenes and hubs | weekly | every 3 weeks |
| 3 — other festival airports | every 2 weeks | monthly |

A month with an upcoming festival within 150 km of an airport is refreshed as tier 1. Change the tiers in
`pipeline/airports.csv` and the intervals in `pipeline/fares.py`; `python3 pipeline/fares.py plan` shows the queue.

## Duplicate artists

The source sometimes splits one act into several records: spelling variants ("Jojo & Jenni" / "Jojo & Jenny"),
name order ("Lukasz & Karolina" / "Karolina & Łukasz"), or one person per partner (five "JP" records).
`pipeline/artist_merges.csv` fixes that at build time:

| Column | |
|---|---|
| `decision` | `merge` folds `merge_key` into `keep_key`; `separate` records that two artists are different people |
| `keep_key`, `merge_key` | the source's `match_key` values (stable across exports) |
| `keep_name`, `merge_name`, `note` | for people reading the file; not used by the build |

Merging two couples also merges their members, pairing them by closest name. Bookings, aliases and line-ups move
to the kept artist, and old artist links redirect to it.

`pipeline/artist_merge_suggestions.csv` lists likely duplicates still undecided: couples whose names match in
either order, and candidates the source pipeline left open. Rows are ranked by `score`: name similarity, raised
when both come from the same country and lowered when line-ups state different countries for them (`countries`
column; French overseas territories count as France). `keep_countries` / `merge_countries` show what was used,
with `~` when the country is only inferred from where they are booked, which never counts against a match.
The `calendar` column adds dates: `clash` (booked at overlapping events of four days or less in different
cities, so different people; strong penalty), `shared circuit` (same city or organiser; small bonus),
`same line-up` (both named in one line-up; shown for review, not scored, since festivals list artists per room)
and `no clash`. `calendar_note` says which events. To decide one, copy its row into `artist_merges.csv`
and fill in `decision`. Pushing the change rebuilds the site and refreshes the suggestions; locally run
`python3 pipeline/merge_suggestions.py source/<events>.sqlite`.

## Updating events

Commit a new export to `source/` (the newest `.sqlite` there is used) and push: the **Rebuild site database**
Action geocodes new cities, rebuilds `docs/data/kiz.sqlite` and commits it. To do the same locally:

```bash
python3 pipeline/geocode.py source/<events>.sqlite          # only new cities are looked up
python3 pipeline/build_site_db.py source/<events>.sqlite
python3 pipeline/fares.py refresh --budget 4                # needs uv; or set FLI_CMD=fli
python3 -m http.server -d docs 8000                         # then open http://localhost:8000
```
