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
shared.

The price is the trip's: the full pass at today's price plus the Friday-to-Monday return flight. "A cheap price" is
under 3 500 kr (€350, $400) and "a reasonable price" under 5 000 kr (€500, $550). With a price chosen, festivals
whose passes are sold out are left out, and so are festivals whose pass or flight price isn't known, unless
"Include festivals with unknown prices" is ticked under Filters. At "any price", everything shows, sold-out passes
marked as such. "Cheapest first" orders by the trip, then the flight.

A card shows what matters before you decide: the dates, the city, the styles, up to three highlights such as
taxi dancers or a hotel in the pass, a few names from the line-up, and the cost. With both prices known it reads
"Cost ~2 810 kr, without accommodation", then "1 500 kr full pass + ~1 310 kr flight to Oslo, then 37 km": the
airport we price and the distance to the festival. Opening a card shows the
full line-up first, then the other highlights, then the venue and organisers.

Beyond the festival list, the site has three ways to explore:

- **Map:** one bubble per city, coloured by the cheapest flight, beside the festivals in view.
- **Artists:** where each teacher and DJ is booked, leading with their upcoming festivals.
- **Countries:** each scene's festivals coming up, the cheapest flight there, and how international its line-ups are.

A search in the header (also `/` or Ctrl/⌘+K) finds festivals, artists, cities, countries, styles and highlights
as you type, grouped by kind. It looks at festivals still to come unless "Include past festivals" is ticked. A festival opens on the map and an artist on their page; a city opens on the map.
A country, a dance or a highlight narrows the festival list and keeps its time and price (a dance reads "Also with
Salsa": every festival here is a Kizomba one, so Kizomba isn't a choice); when those then hide
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
| `pipeline/fare_jobs.csv` | When each festival weekend was last searched, and how it went | the same Action |
| `pipeline/extract/answers/` | Claude's answers for line-ups, highlights, rooms, genres and pass prices | the **Refresh events** Action |
| `pipeline/rates.csv` | The European Central Bank's exchange rates, per euro | the **Rebuild site database** Action |
| `pipeline/tickets/`, `pipeline/pass_prices.csv`, `pipeline/ticket_pages.csv` | Ticket-page recipes, read logs, first reads, and the prices read there | `pipeline/tickets.py`: the **Refresh events** Action, or an agent |

The build also tidies the text. Artist names get one casing ("AMI & JULIEN" becomes "Ami & Julien"). Festival
titles lose dates, years and shouting capitals; `events.listed_title` keeps them as listed. Venues are recased.
The rules live in `pipeline/text.py`.

On the flight side, prices come from Google Flights through [fli](https://github.com/punitarani/fli). They change
often, so check them before booking. Home is the airport marked `home` in `pipeline/airports.csv`; the pipeline and
the site both read it from there. Cities are geocoded with OpenStreetMap Nominatim, and the results are cached in
`pipeline/geocode.csv`.

Prices show in kroner, or in euros or dollars (`?cur=eur`, `?cur=usd`, switched in the footer); amounts in
other currencies are converted with `pipeline/rates.csv` and marked "~". A festival card shows what the weekend costs
without accommodation (the per-person full pass at today's price, plus the flight) and when the pass price next goes
up; tapping the pass opens every pass at today's price and its next change (`docs/js/passes.js`). A price is what a
buyer pays, booking fee included; the passes view says which fee it includes when the description or the ticket
page states one (prompt `prices-v3`; answers from older prompts carry no fee and are asked again while the festival
is to come).

For the SQL page, every table is described in the `table_docs` table. The `event_rows` view is the one to start
from: it joins each event to its statistics and says whether it is still to come.

### How fares stay fresh

Only festival weekends are searched: the Friday-to-Monday return from home to each upcoming festival's airport, one
search per airport and weekend. Once a day the **Refresh fares** Action searches the weekends that are due. How often
a weekend falls due depends on how far away it is:

| Festival weekend | Searched every |
|---|---|
| within 5 weeks | week |
| 5 weeks to 3 months | 2 weeks |
| 3 to 6 months | 4 weeks |
| 6 to 11 months | 6 weeks |
| further ahead | not yet: Google doesn't sell that far ahead |

Each weekend has its own weekday, so each day's run checks about a seventh of them; a weekend never searched, or
overdue by twice its interval, doesn't wait for its day. Past weekends and weekends no festival uses any more leave
`docs/data/fares.csv` and `pipeline/fare_jobs.csv`. A weekend with no price on Google is noted and tried again at
its next interval. If Google refuses a search, the run keeps what it found and is marked failed. A festival's
airport is the nearest one in `pipeline/airports.csv` within 250 km. To see what is due today, run
`python3 -m pipeline.fares plan`.

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

## Who's going

People can say which festivals they're going to. For now the plans are entered by hand in two files:

- `pipeline/people.csv`: one row per person, with a short `key` (used in their page's address, `#people/<key>`),
  their `name`, the `artist_keys` they are in the line-ups (`match_key` values, separated by `;`), and `featured`.
  Featured people are named on festival cards; the others are counted.
- `pipeline/plans.csv`: one row per person and festival, with `status` `going` for now.

A festival card then says, for example, "Cédric & Christina are going · 3 more people too". Tapping a name opens a
quick view over the page with where they're going and a link to their page; "3 more people" lists everyone going.
A card opens from its title and from its foot (the flight and "Line-up & details"), not from the rest of it. Partners who both go are named as their couple. Someone in the festival's line-up, alone or in a
couple, shows as teaching (or playing) rather than going. Each person has a plans page with a Share button, and
an artist's page lists the festivals they're going to without teaching there. The People page, under Map & artists,
lists every festival someone is going to, soonest first. On the Festivals page, a line under the count says when
featured people go to some of the festivals listed ("Cédric & Christina are going to 3 of these"), and "Show only
those" keeps just those; the same filter is a checkbox under Filters. The search finds people by name. The build stops if a person, an
artist key or a festival is unknown.

Plans are public for now: anyone can see them, so add people only with their agreement. Private sharing, friends
and "I'm going" buttons need accounts and a server, which the site doesn't have yet.

## Prices from ticket pages

Some festivals keep their prices off their description, on a ticket page. `pipeline/tickets.py` reads them there:
judgment about a page is made once, by an agent or two models, and checked; every later read is code.

- **A recipe per ticket site** (`pipeline/tickets/sites/<site>.json`, schema `pipeline/tickets/schemas/site.json`)
  says where the site's ticket rows are: each ticket's id on the site (its key), name, price as shown, amount,
  currency, a booking fee when the site shows it apart from the price (Weeztix's "+ €1.00 fee", added to the
  amount), a second price when the site shows one, and its sold-out mark; what its currency symbols stand for;
  whether the tickets sit on another address (a widget: built from a pattern found in the link or in its page, as
  Eventbrite's event page leads to its checkout and Weezevent's mini-site to its widget), which sections to click
  open, and whether the site needs a visible browser. A free ticket, shown as a word ("Free", "Gratuit"), costs 0.
  A field may read the whole page instead of its row, and name the row's other fields as `{field}` and its
  attributes as `{@attr}`: Tikoria's ticket ids sit in its script data next to each ticket's name, and Kizzbee's
  prices in a JSON attribute keyed by each option's value. A recipe names the reseller when the site sells other
  organisers' festivals at its own prices (Kizzbee); it is used only when the festival sells nowhere else, and the
  passes view says so. A site whose page carries no ticket ids but whose API does (go&dance) gets an API recipe:
  the event's id found on its page, the API's address, and each field a path into a ticket's JSON, a pattern on the
  page, or a text built from JSON values; it reads with plain requests, no browser. An agent writes one per site; FairPlay's needs a visible browser (it is behind a browser
  check).
- **A log per festival** (`pipeline/tickets/log/<event_id>.jsonl`, schema `log.json`, checked on every write and
  read) gets one entry per read: `read` with every row, `refused` (no rows and an HTTP error, or the page would not
  load), or `layout_broken` (the recipe's selectors fail, no rows, two rows with one key, or a row missing its key,
  name, price, amount or currency: the recipe needs an agent). Git merges these files line by line
  (`.gitattributes`), so a session and the monthly run never conflict.
- **A first read per festival** (`pipeline/tickets/reads/<event_id>.json`, schema `read.json`) says, from one logged
  read and the festival's description, which pass each ticket is, in the prices pass's terms (prompt
  `pipeline/tickets/prompts/first-read-v2.md` on top of `prices-v3`): every ticket is in a tier, by its key, or
  skipped; dates, ticket limits and price notes are quoted from the description or the ticket's name. Only checked
  first reads are kept there: an agent fills a draft (`pipeline/tickets/drafts/`, not committed), which `record`
  moves there once it passes.
- **`record`** writes the prices: amount, currency, sold out and the quote (the ticket's name and price) from the
  latest read rows of the same page, the rest from the first read. It checks the first read against the rows it was
  made from and the prices against their quotes, then writes `pipeline/pass_prices.csv` (one row per tier) and
  `pipeline/ticket_pages.csv` (one per festival: page, read date, who made the first read and with which prompt,
  recipe version, unread tickets, price notes). It is the only writer of both and writes them from every first read
  and its log, so they hold what the reads and logs say and nothing else: a festival whose first read no longer fits
  its page is left out (and the monthly run fails naming it) until it is read again. Recording twice writes the same
  files, and a read that changed nothing on the page changes only the read date. A ticket the first
  read doesn't know is counted as unread, and the passes quick view says the page has new tickets not read yet; a
  tier whose tickets are all gone from the page is left out.

A festival in `ticket_pages.csv` takes its passes from its page in place of its description
(`event_passes.source` is `ticket_page`), and the quick view says when the page was read.

```bash
uv run --group tickets -m pipeline.tickets todo               # what needs doing
uv run --group tickets -m pipeline.tickets read ID [--url U]  # read the page by its site's recipe and log the rows
uv run --group tickets -m pipeline.tickets draft ID           # a first read to fill, from the latest rows
uv run --group tickets -m pipeline.tickets check ID           # what record would find wrong, writing nothing
uv run --group tickets -m pipeline.tickets record ID          # check the draft or first read, write the prices
uv run --group tickets -m pipeline.tickets retry ID           # read with a visible browser, then record
uv run --group tickets -m pipeline.tickets changes [ID]       # what changed between consecutive reads
uv run --group tickets -m pipeline.tickets page ID URL --note N        # where a festival with no full link sells
uv run --group tickets -m pipeline.tickets page ID --state S --note N  # or not_yet, offline, closed
```

A festival needs a first read when it is still to come and its description gives no dated full pass or package
price, and again when its description or its ticket page changes, or its page shows tickets the first read
doesn't know. It is read
again on the monthly run, unless it is *dated* (every tier on sale has an end date and none is limited to a number
of tickets), when it is read again once its last date has passed. The monthly **Refresh events** Action runs
`tickets.py run`: the re-reads that are due, a retry of every festival whose latest read failed, and a first read
by Opus and Sonnet for each festival that needs one on a site with a recipe. The two read independently, and the
first read is kept only when they agree on every ticket's pass, tier, skip and dates; when they don't, both are kept
in `pipeline/tickets/disputed/<event_id>.json` for an agent and the festival waits. The run fails, after
committing, when a page broke its recipe, a festival's read failed three times in a row, or a festival no longer
fits its first read; `todo` then marks it for
a session, where `retry` reads it with a visible browser. A festival that can't be read yet waits for
something, and the run writes each one to `pipeline/tickets/waiting.csv` with what it waits for: its ticket page
found (kizomba-world cut the link short, or gave none; an agent records in `pipeline/tickets/pages.csv`, through
`tickets.py page`, how the festival sells: in a shop, with its page; not yet, when sales are announced but not
open; offline, by message, e-mail, form or bank transfer; or closed), a recipe for its site, an agent to settle a
dispute, or a session for a page that keeps refusing. A festival's card without a price says which: prices on the
ticket page, tickets not on sale yet, by message or form, sales closed, or no price listed. That is backlog, so it never fails the run.

`pipeline/read_page.py` reads any one page as a browser shows it, for one-off checks; `tickets.py` is the one
scheduled reader that uses it:

```bash
uv run --group browser -m pipeline.read_page URL --screenshot page.png   # the page's text, and a screenshot
uv run --group browser -m pipeline.read_page URL --visible               # a visible browser on a virtual display (xvfb-run)
```

## Promo codes

Promo codes are ours, not kizomba-world's: `pipeline/promo_codes.csv` has one row per festival edition, so one
code can appear on several rows, each with what it gives at that festival. Each row has the `event_id` (the number in the festival's kizomba-world API record; the SQL page shows it as
`event_rows.id`), the `code`, an optional `offer` such as "10% off", and the festival's name and a note for people
reading the file. A festival with a code gets the "Promo code" highlight, its opened card shows the code with a
Copy button, and searching the code finds the festival. A code belongs to one edition, so next year's needs a row
of its own. The build stops if an `event_id` isn't in the data.

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

Line-ups, highlights from descriptions, rooms, genres and pass prices are read from each description by Claude
(claude-haiku-5-5). After the scrape, the same Action runs `pipeline/extract/ask.py`: festivals in the export's
`pending_extraction` table (new, or with a changed description) and festivals a pass has no answer for are asked
about, one festival and one pass at a time, with that pass's prompt (`pipeline/extract/prompts/`) and its schema as
the required answer format. A checker then confirms that the answer has the right shape, and that every name,
quote and price appears in the description. A failing answer goes back to Claude once, with the checker's
lines. A second failure leaves the festival pending, to try again next month. The answers are saved in
`pipeline/extract/answers/` and committed; `answers/log.csv` says who answered each file and when. The first
extraction's answers, from Claude Code subagents, are kept there too; rebuilding from them reproduces the
export's tables exactly.

`load_extract.py` then loads every festival's newest answer into the export, and `resolve_artists.py` groups the
names into artists. Artist ids never change: `artist_ids` remembers every id given, a new artist gets the next
unused one, and a link to an artist that was merged opens the one it was merged into. Pairs of names that might
be one artist go to `pipeline/artist_merge_suggestions.csv` for review; nothing is merged without a decision. The
key is the repository secret `ANTHROPIC_API_KEY`; each run prints the tokens it used and their cost.

To do the same locally:

```bash
uv run --group scrape -m pipeline.scrape source/<events>.sqlite --dry-run    # what would change, without writing
uv run --group scrape -m pipeline.scrape source/<events>.sqlite
python3 -m pipeline.geocode source/<events>.sqlite                           # looks up new cities only
uv run --group ask -m pipeline.extract.ask source/<events>.sqlite --dry-run  # which festivals need asking
uv run --group ask -m pipeline.extract.ask source/<events>.sqlite            # needs ANTHROPIC_API_KEY
python3 -m pipeline.extract.load_extract source/<events>.sqlite
uv run --group artists -m pipeline.extract.resolve_artists source/<events>.sqlite
python3 -m pipeline.rates                                                    # exchange rates for the site's prices
python3 -m pipeline.build_site_db source/<events>.sqlite
python3 -m pipeline.merge_suggestions source/<events>.sqlite
python3 -m pipeline.fares refresh --budget 4                                 # needs uv; searches festival weekends due today
python3 -m http.server -d docs 8000                                          # then open http://localhost:8000
```

## Running the steps

The pipeline is one Python package, `pipeline`, run as modules from the repository's root. `pyproject.toml` pins
every package once, in dependency groups, and each step installs only its group: `uv run --group tickets -m
pipeline.tickets …` gets the browser, Claude's client and the checker; the steps that need Python alone (the loads,
the build, the fares) run as `python3 -m pipeline.<step>`. `uv.lock` fixes the versions. A step opens its databases
through `pipeline/db.py`, saying whether it reads, writes or creates each one, so a wrong path is an error.

## Tests

The **Tests** Action runs on every push. Locally:

```bash
node --test tests/*.test.mjs      # the site's structure: unused code and styles, links, stored hints
uv run --group dev pytest -q      # the pipeline: text, kizomba-world's pages, extraction, ticket pages, commands
uv run --group dev pyflakes pipeline tests   # unused and undefined names
```

The site tests check what JavaScript and CSS cannot enforce themselves. Examples include an export nothing
imports, a CSS rule overridden by a second one for the same selector, and a link written outside `routes.js`.

The database enforces its own rules. Dates are days, required fields are set, and `cancelled` is 1, 0 or
empty. Empty means not known: the source flags it only for events still listed as upcoming, so most past
festivals have none. As a result, an export that breaks these rules fails the build instead of reaching the site.
