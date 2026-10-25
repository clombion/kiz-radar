# Kiz Radar

Kiz Radar finds Kizomba, Urban Kiz and Tarraxo festivals worth flying to from Bergen. It lists every festival
on [kizomba-world.com](https://kizomba-world.com/), prices the Friday-to-Monday flight to each, and lets you
explore who teaches where. It runs as a static site on GitHub Pages: the browser loads a SQLite database with
[sql.js](https://sql.js.org/) and runs every query itself.

## What the site does

The landing page is a sentence you complete: "I want to go to a Kizomba festival in the next six months,
flying from Bergen to anywhere for a cheap price." Each underlined part is a choice. Below the sentence, the
matching festivals appear as cards. Once the sentence scrolls away, a sticky bar keeps the time and price
choices in view, with the rest under Filters. The choices live in the URL, so a view can be bookmarked or
shared. Festivals whose next dates aren't listed yet appear as likely next editions, on the same weekend as
last year.

A card shows what matters before you decide: the dates, the city, the styles, up to three highlights such as
taxi dancers or a hotel in the pass, a few names from the line-up, and the flight. The flight line reads like
"~€492 to Brussels, then 104 km", the airport we price and the distance to the festival. Opening a card shows the
full line-up first, then the other highlights, then the venue and organisers.

Beyond the festival list, the site has three ways to explore:

- **Map:** one bubble per city, coloured by the cheapest flight, beside the festivals in view.
- **Artists:** where each teacher and DJ is booked, leading with their upcoming festivals.
- **Countries:** each scene's festivals coming up, the cheapest flight there, and how international its line-ups are.

A search in the header (also `/` or Ctrl/⌘+K) finds festivals, artists, cities, countries, styles and highlights
as you type, grouped by kind. A festival opens on the map and an artist on their page; a city opens on the map.
A country, a style or a highlight narrows the festival list and keeps its time and price; when those then hide
everything, the list offers to widen them.

The footer links to an SQL page for querying the whole database.

A shared link shows a preview card, `docs/share-card.png`, and the site has icons for browser tabs, bookmarks
and phone home screens. The card is drawn from `design/share-card.html`, with a map of the festivals coming up taken from the
site database, and the icons from `docs/mark.svg`. The mark shows two dancers in an embrace, their bodies closing
into a radar ring, and the favicon made from it switches colours on dark browser tabs. To redraw the PNGs after changing either, or to
bring the card's map up to date, run `NODE_PATH="$(npm root -g)" node design/render.cjs` (it needs Playwright). It also
makes `docs/loading.svg`, the animated mark shown while the page loads. The fonts, Inter and Caveat, are served
from `docs/fonts` under the SIL Open Font License (see `docs/fonts/LICENSE.md`), so they arrive with the page.

## Where the data comes from

The festivals come from a kizomba-world export committed to `source/`. A build turns it into the database the
site loads; the site never reads `source/` itself.

Kizomba-world publishes its listings under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The
festival data in this repository adapts them, so it is shared under the same licence: the export in `source/`,
the database and summary in `docs/data/`, and the artist merge files in `pipeline/`. Each festival card links to
its page on kizomba-world. The fares are our own searches.

| File | What it holds | Updated by |
|---|---|---|
| `source/*.sqlite` | The full kizomba-world export, with descriptions and images | the **Refresh events** Action, monthly |
| `docs/data/kiz.sqlite` | What the site queries: events, line-ups, artists, statistics, airports, a fares snapshot | the **Rebuild site database** Action |
| `docs/data/site.json` | What the page shows before the database loads: home airport, destinations, dates covered | the same build |
| `docs/data/fares.csv` | Friday-to-Monday return fares, one row per airport and weekend | the **Refresh fares** Action |
| `pipeline/fare_jobs.csv` | When each airport and month was last searched | the same Action |

The build also tidies the text. Artist names get one casing ("AMI & JULIEN" becomes "Ami & Julien"). Festival
titles lose dates, years and shouting capitals; `events.listed_title` keeps them as listed. Venues are recased.
The rules live in `pipeline/text.py`.

On the flight side, prices come from Google Flights through [fli](https://github.com/punitarani/fli). They change
often, so check them before booking. Home is the one tier-0 airport in `pipeline/airports.csv`; the pipeline and
the site both read it from there. Cities are geocoded with OpenStreetMap Nominatim, and the results are cached in
`pipeline/geocode.csv`.

For the SQL page, every table is described in the `table_docs` table. The `event_rows` view is the one to start
from: it joins each event to its statistics and says whether it is still to come.

### How fares stay fresh

Google limits how often it can be searched, so the **Refresh fares** Action does a little at a time. It runs every
two hours and searches at most eight airport-months, most overdue first. How often an airport-month falls due
depends on the airport's tier and on how far ahead the month is:

| Airport tier | Next 3 months | Later months |
|---|---|---|
| 1 — Oslo, Stockholm, Gothenburg, Copenhagen, Prague, Budapest, Poland, the Baltics | every 3 days | weekly |
| 2 — large scenes and hubs | weekly | every 3 weeks |
| 3 — other festival airports | every 2 weeks | monthly |

A month with an upcoming festival within 150 km of an airport is refreshed as tier 1. The tiers are set in
`pipeline/airports.csv`, the intervals in `pipeline/fares.py`. To see the queue, run
`python3 pipeline/fares.py plan`.

## Duplicate artists

The source sometimes splits one act into several records. Names vary in spelling ("Jojo & Jenni" and "Jojo &
Jenny") or order ("Lukasz & Karolina" and "Karolina & Łukasz"), and some couples appear once per partner (five
"JP" records). The build merges them using `pipeline/artist_merges.csv`:

| Column | Meaning |
|---|---|
| `decision` | `merge` folds `merge_key` into `keep_key`; `separate` records that two artists are different people |
| `keep_key`, `merge_key` | the source's `match_key` values, which stay stable across exports |
| `keep_name`, `merge_name`, `note` | for people reading the file; the build ignores them |

Merging two couples also merges their members, paired by the closest name. Bookings, aliases and line-ups move
to the kept artist, and `artist_redirects` records which old ids went where.

To find the next duplicates, open `pipeline/artist_merge_suggestions.csv`. It lists likely pairs still
undecided, ranked by `score`. The score starts from name similarity. It rises when both artists come from the
same country and falls when line-ups state different countries for them; French overseas territories count as
France. A `~` in `keep_countries` or `merge_countries` marks a country inferred from where the artist is booked,
which never counts against a match.

The `calendar` column checks dates:

- **clash:** booked at overlapping events of four days or less in different cities, so two people. Strong penalty.
- **shared circuit:** booked in the same city or by the same organiser. Small bonus.
- **same line-up:** named in one line-up. Shown for review but not scored, since festivals list artists per room.
- **no clash:** nothing either way.

`calendar_note` names the events behind each verdict. To decide a pair, copy its row into `artist_merges.csv` and
fill in `decision`. Pushing the change rebuilds the site and refreshes the suggestions.

A name listed on its own can stand for different people at different festivals: every solo "Christina" lands in
one record. `pipeline/artist_bookings.csv` moves one festival's booking to the person it belongs to. Each row
gives the `event_id`, the `from_key` it was filed under, the `to_key` of the person (both `match_key` values), and
names and a note for people reading the file. The build stops if a key is unknown or the booking isn't there.

## Artists' home countries

The site shows where an artist is from only when it is known: given in `pipeline/artist_countries.csv`, or
stated next to their name in a line-up. Each row of that file gives the source's `match_key` (as in
`artist_merges.csv`), the country code, and a name and note for people reading the file. Where nothing is known,
the artist's page says where they are booked most instead, without a flag; the statistics on imported artists use
that country too.

## Updating the events

On the 3rd of each month, the **Refresh events** Action updates the newest export in `source/` from
kizomba-world, using `pipeline/scrape.py`. The event list comes from the site's Events Calendar API. The event
pages add what the API leaves out: the venue and city, the deal link, the organiser's links, the translations
and whether the festival is cancelled. Pages are fetched for new and changed festivals and for every festival still
to come, since a deal link can change without the festival's modified date, and a cancellation might too. They
are fetched a few seconds apart, so a run takes about a quarter of an hour. Festivals the site no longer lists are removed. Once the export is committed, the
Action starts **Rebuild site database**, which geocodes new cities, rebuilds the database and commits it. That
workflow also runs on any push to `source/` or `pipeline/`.

The site sits behind Cloudflare, which refuses ordinary scripts, so the scraper sends its requests the way
Chrome does, through [curl_cffi](https://github.com/lexiforest/curl_cffi). If Cloudflare stops letting it
through, the Action fails and the site keeps the last export.

The refresh doesn't cover everything. Line-ups, highlights from descriptions, rooms and genres come from AI
extraction steps that are not in this repository yet. A new festival therefore appears with its dates, place,
site tags and flight, but without names. The `pending_extraction` table in the export lists every festival
whose description is new or has changed since the extraction last ran.

To do the same locally:

```bash
uv run pipeline/scrape.py source/<events>.sqlite --dry-run   # what would change, without writing
uv run pipeline/scrape.py source/<events>.sqlite
python3 pipeline/geocode.py source/<events>.sqlite        # looks up new cities only
python3 pipeline/build_site_db.py source/<events>.sqlite
python3 pipeline/merge_suggestions.py source/<events>.sqlite
python3 pipeline/fares.py refresh --budget 4              # needs uv
python3 -m http.server -d docs 8000                       # then open http://localhost:8000
```

## Tests

The **Tests** Action runs on every push. Locally:

```bash
node --test tests/*.test.mjs      # the site's structure: unused code and styles, links, stored hints
uvx pytest -q tests/              # the pipeline: text tidying and reading kizomba-world's pages
```

The site tests check what JavaScript and CSS cannot enforce themselves. Examples include an export nothing
imports, a CSS rule overridden by a second one for the same selector, and a link written outside `routes.js`.

The database enforces its own rules. Dates are days, required fields are set, and `cancelled` is 1, 0 or
empty. Empty means not known: the source flags it only for events still listed as upcoming, so most past
festivals have none. As a result, an export that breaks these rules fails the build instead of reaching the site.
