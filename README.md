# Kizomba Radar

A static site (GitHub Pages, [sql.js](https://sql.js.org/)) for finding the next Kizomba / Urban Kiz festival worth
flying to from Bergen, and for exploring the scene's events and artists.

- **Next festival** — upcoming festivals whose Friday→Monday return fare fits your criteria (default: within 6 months,
  ≤ €150, kiz-only), including likely next editions of festivals whose new dates are not listed yet.
  The criteria live in the URL, so a filtered view can be bookmarked or shared.
- **Explore**
  - **Map** — one bubble per city (size = events, colour = cheapest fare, kiz-only share or popular artists). The list
    beside it follows the map: pan or zoom to change it, click a city to narrow it, click an event for its card.
    Every event has its own link (`#map/event/<id>`).
  - **Artists** — cards with bookings, roles, home country, countries they are booked in abroad; a page per artist
    with bookings by country and every event. A couple's bookings count for the couple; its members get a card only
    for their solo bookings (e.g. one of them DJing where the couple teaches), and their page links to the couple.
  - **Countries** — events, kiz-only events, taxi dancers, line-up size, popular-artist bookings, share of imported
    artists, and the median fare to the cheapest airport serving the country.
  - **SQL** — query the whole database in the browser.

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

## Updating events

Commit a new export to `source/` (the newest `.sqlite` there is used) and push: the **Rebuild site database**
Action geocodes new cities, rebuilds `docs/data/kiz.sqlite` and commits it. To do the same locally:

```bash
python3 pipeline/geocode.py source/<events>.sqlite          # only new cities are looked up
python3 pipeline/build_site_db.py source/<events>.sqlite
python3 pipeline/fares.py refresh --budget 4                # needs uv; or set FLI_CMD=fli
python3 -m http.server -d docs 8000                         # then open http://localhost:8000
```
