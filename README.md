# Kiz Radar

Kiz Radar finds Kizomba, Urban Kiz and Tarraxo festivals worth flying to from Bergen. It lists every festival on
[kizomba-world.com](https://kizomba-world.com/), prices the Friday-to-Monday flight to each, and lets you explore who
teaches where. It runs as a static site on GitHub Pages: the browser loads a SQLite database with
[sql.js](https://sql.js.org/) and runs every query itself. The site's code is TypeScript (`site/`), compiled module by
module into `docs/js/` by the **Publish site** Action whenever `main` changes; `docs/js/` is not committed.

## What the site does

The landing page is a sentence you complete: "I want to go to a Kizomba festival in the next six months, flying from
Bergen to anywhere for a cheap price." Each underlined part is a choice. Below the sentence, the matching festivals
appear as cards. Once the sentence scrolls away, a sticky bar keeps the time and price choices in view, with the rest
under Filters. The choices live in the URL, so a view can be bookmarked or shared.

The header's tabs are Festivals, Friends and Explore, whose second row holds the Map, Artists and Countries. On a touch
screen, a swipe left or right goes to the next or previous of those five, in that order (`SECTIONS` in
`site/routes.ts`); on the map, a swipe counts from near the screen's sides, and one from the very edge is left to the
phone's back gesture. Going to another section, by a swipe or a tab, the page slides in from that side, and the oval
behind the current tab moves like a slime: drawn through a gooey SVG filter, so shapes that touch flow into one, it
pushes an arm with a drop at its tip out to the next tab, swells there and wobbles to rest on a spring (`site/tabs.ts`);
with reduced motion, both change at once. On a phone the header shows only the logo, so the site's name stands above the
sentence.

The price is the trip's: the full pass at today's price plus the Friday-to-Monday return flight. "A cheap price" is
under 3 000 kr (€300, $350) and "a reasonable price" under 5 000 kr (€500, $550). With a price chosen, festivals whose
passes are sold out are left out, and so are festivals whose pass or flight price isn't known, unless "Include festivals
with unknown prices" is ticked under Filters. At "any price", everything shows, sold-out passes marked as such.
"Cheapest first" orders by the trip, then the flight.

A card shows what matters before you decide: the dates, the city, the styles, up to three highlights such as taxi
dancers or a hotel in the pass, a few names from the line-up, and the cost. With both prices known it reads "Cost ~2 810
kr, without accommodation", then "1 500 kr full pass + ~1 310 kr flight to Oslo, then 37 km": the airport we price and
the distance to the festival. Opening a card shows the full line-up first, then the other highlights, then the venue and
organisers.

Beyond the festival list, the site has three ways to explore:

- **Map:** one bubble per city, coloured by the cheapest flight, beside the festivals in view.
- **Artists:** where each teacher and DJ is booked, leading with their upcoming festivals.
- **Countries:** each scene's festivals coming up, the cheapest flight there, and how international its line-ups are.

A search in the header (also `/` or Ctrl/⌘+K) finds festivals, artists, cities, countries, styles and highlights as you
type, grouped by kind. It looks at festivals still to come unless "Include past festivals" is ticked. A festival opens
on the map and an artist on their page; a city opens on the map. A country, a dance or a highlight narrows the festival
list and keeps its time and price (a dance reads "Also with Salsa": every festival here is a Kizomba one, so Kizomba
isn't a choice); when those then hide everything, the list offers to widen them.

The footer links to an SQL page for querying the whole database.

A shared link shows a preview card, `docs/share-card.png`, and the site has icons for browser tabs, bookmarks and phone
home screens. The card is drawn from `design/share-card.html`, with a map of the festivals coming up taken from the site
database, and the icons from `docs/mark.svg`. The mark shows two dancers in an embrace, their bodies closing into a
radar ring, and the favicon made from it switches colours on dark browser tabs. To redraw the PNGs after changing
either, or to bring the card's map up to date, run `NODE_PATH="$(npm root -g)" node design/render.cjs` (it needs
Playwright). It also makes `docs/loading.svg`, the animated mark shown while the page loads. The fonts, Inter and
Caveat, are served from `docs/fonts` under the SIL Open Font License (see `docs/fonts/LICENSE.md`), so they arrive with
the page.

## Where the data comes from

The festivals come from a kizomba-world export committed to `source/`. A build turns it into the database the site
loads; the site never reads `source/` itself.

Kizomba-world publishes its listings under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The festival
data in this repository adapts them, so it is shared under the same licence: the export in `source/`, the database and
summary the site serves from `docs/data/`, and the artist merge files in `pipeline/`. Each festival card links to its
page on kizomba-world. The fares are our own searches.

| File | What it holds | Updated by |
| -- | -- | -- |
| `source/*.sqlite` | The full kizomba-world export, with descriptions and images | the **Refresh events** Action, monthly |
| `docs/data/kiz.sqlite` | What the site queries: events, line-ups, artists, statistics, airports, a fares snapshot | built from the export and the files of `pipeline/`, never committed: by **Publish site** for the site, `mise run build:data` locally, and for each step that reads it |
| `docs/data/site.json` | What the page shows before the database loads: home airport, destinations, dates covered | the same build |
| `docs/data/fares.csv` | Friday-to-Monday return fares, one row per airport and weekend | the **Refresh fares** Action |
| `pipeline/fare_jobs.csv` | When each festival weekend was last searched, and how it went | the same Action |
| `pipeline/extract/answers/` | Claude's answers for line-ups, highlights, rooms, genres and pass prices | the **Refresh events** Action |
| `pipeline/rates.csv` | The European Central Bank's exchange rates, per euro | the **Refresh places and rates** Action |
| `pipeline/tickets/`, `pipeline/pass_prices.csv`, `pipeline/ticket_pages.csv` | Ticket-page recipes, read logs, first reads, the prices read there, and what each festival waits for (`tickets/status.csv`) | `pipeline/tickets.py`: the **Refresh events** Action, or an agent |
| `pipeline/states.py` | Every state a data point can be in, what it means and the site's words for it | by hand (see "States") |
| `claims/` | The admin's claims (see "Claims") | the claims repository; its pin by the **Refresh events** Action |
| `pipeline/prompts/asked/` | Every prompt asked, by its hash | whatever saves an answer or a first read, before it names the hash |
| `site/*.ts` | The site's code, which the **Publish site** Action compiles into `docs/js/` and publishes with `docs/` | by hand; `site/states.ts` by `mise run generate` |

The build also tidies the text. Artist names get one casing ("AMI & JULIEN" becomes "Ami & Julien"). Festival titles
lose dates, years and shouting capitals; `events.listed_title` keeps them as listed. Venues are recased. The rules live
in `pipeline/text.py`.

On the flight side, prices come from Google Flights through [fli](https://github.com/punitarani/fli). They change often,
so check them before booking. Home is the airport marked `home` in `pipeline/airports.csv`; the pipeline and the site
both read it from there. Cities are geocoded with OpenStreetMap Nominatim, and the results are cached in
`pipeline/geocode.csv`. A festival whose listing names no city is not on the map (a country alone is no place on it).

Prices show in kroner, or in euros or dollars (`?cur=eur`, `?cur=usd`, switched in the footer); amounts in other
currencies are converted with `pipeline/rates.csv` and marked "~". A festival card shows what the weekend costs without
accommodation (the per-person full pass at today's price, plus the flight; at a festival of several dance styles, its
Kizomba full pass when it sells one; else a package with a hotel for one) and when the pass price next goes up; tapping
the pass opens every pass at today's price and its next change (`site/passes.ts`). Which pass a card prices is the
pipeline's choice (`prices.card_pass`, `price_status.card_pass`); its price on the day is the browser's
(`site/pricing.ts`). A card without a price says why (`price_status`): the festival sells no pass the card prices, its
prices are on a ticket page not read yet, its sales haven't opened, it sells by message or form, its sales are closed,
or no price is published. A price is what a buyer pays, booking fee included; the passes view says which fee it includes
when the description or the ticket page states one (an answer to another prompt is asked again, past festival or not,
and stays out of the database until then).

For the SQL page, every table is described in the `table_docs` table. The `event_rows` view is the one to start from: it
joins each event to its statistics and says whether it is still to come.

### How fares stay fresh

Only festival weekends are searched: the Friday-to-Monday return from home to each upcoming festival's airport, one
search per airport and weekend. Once a day the **Refresh fares** Action searches the weekends that are due. How often a
weekend falls due depends on how far away it is:

| Festival weekend | Searched every |
| -- | -- |
| within 5 weeks | week |
| 5 weeks to 3 months | 2 weeks |
| 3 to 6 months | 4 weeks |
| 6 to 11 months | 6 weeks |
| further ahead | not yet: Google doesn't sell that far ahead |

Each weekend has its own weekday, so each day's run checks about a seventh of them; a weekend never searched, or overdue
by twice its interval, doesn't wait for its day. Past weekends and weekends no festival uses any more leave
`docs/data/fares.csv` and `pipeline/fare_jobs.csv`. A weekend with no price on Google is noted and tried again at its
next interval. If Google refuses a search, the run keeps what it found and is marked failed. A festival's airport is the
nearest one in `pipeline/airports.csv` within 250 km. To see what is due today, run `mise run fares -- plan`.

## Duplicate artists

The source sometimes splits one act into several records. Names vary in spelling ("Jojo & Jenni" and "Jojo & Jenny") or
order ("Lukasz & Karolina" and "Karolina & Łukasz"), and some couples appear once per partner (five "JP" records).
`pipeline/extract/resolve_artists.py` keys every mention, flags the pairs that may be one artist, and merges a pair only
when a merge claim says so (see "Claims"). Merging two couples also merges their members, paired by the closest name; an
artist keeps its id, and an id no artist has any more redirects to the artist that absorbed it.

To find the next duplicates, open `pipeline/artist_merge_suggestions.csv` (`mise run suggest-merges`). It lists likely
pairs still undecided, ranked by `score`. The score starts from name similarity. It rises when line-ups state a country
for both artists that they share, and falls when they state countries for both that they don't (`countries`: `same`,
`different`, `unknown`); French overseas territories count as France, and where an artist is booked says nothing of
where they are from. Bookings are the site's: festivals as teacher, DJ, performer or MC, a couple's counted once.

The `calendar` column checks dates:

- **clash:** booked at overlapping events of four days or less in different cities, so two people. Strong penalty.
- **shared circuit:** booked in the same city or by the same organiser. Small bonus.
- **same line-up:** named in one line-up. Shown for review but not scored, since festivals list artists per room.
- **no clash:** nothing either way.

`calendar_note` names the events behind each verdict. To decide a pair, write a merge claim naming its `keep_key` and
`merge_key` with `merge` or `separate`.

A name listed on its own can stand for different people at different festivals: every solo "Christina" lands in one
record. A booking claim moves one festival's booking from the key it was filed under to the person it belongs to.

## Claims

A claim decides a fact no step can derive: that two artists are one (`merge`, with `merge` or `separate`), where an
artist is from (`home`), which artist one festival's line-up means (`booking`), or what the festivals on a ticket site
wait for instead of their default (`site`, for a site a recipe can't read). `pipeline/claims.py` holds their records.
Each claim names its subject by keys mentions produce, has a time and a note, and comes by one of three channels, which
give it its priority: the admin's, then an organiser's (to come), then the pipeline's own (the merge review's decisions
in `pipeline/extract/merges.csv`). Per subject the highest channel decides, then the latest claim, then the claim with
the greater digest, so the outcome doesn't depend on the order claims are read in.

The admin's claims live in [kiz-radar-claims](https://github.com/clombion/kiz-radar-claims), checked out here as the
`claims/` submodule (`mise run hooks` checks it out). Each claim is one JSON file named by the digest of its text, so
writing it again changes nothing. **Refresh events** resolves the artists under the latest claims and commits their pin
with the export they made, so reverting a commit restores both. The export's `claims` table holds every claim and
whether it decides its subject (`applied`), another comes first (`overridden`), or it names a key no mention produces
any more (`orphaned`, decided by nothing until it is re-pointed). `mise run audit` names a claim file its record refuses
or that is misnamed.

## Who's going

People can say which festivals they're going to. For now the plans are entered by hand in two files:

- `pipeline/people.csv`: one row per person, with a short `key` (used in their page's address, `#friends/<key>`; an
  address from before, `#people/<key>`, still opens it), their `name`, the `artist_keys` they are in the line-ups
  (`match_key` values, separated by `;`), and `featured`. Featured people are named on festival cards; the others are
  counted.
- `pipeline/plans.csv`: one row per person and festival, with `status` `going` for now.

A festival card then says, for example, "Cédric & Christina are going · 3 more people too". Tapping a name opens a quick
view over the page with where they're going and a link to their page; "3 more people" lists everyone going. A card opens
from its title and from its foot (the flight and "Line-up & details"), not from the rest of it. Partners who both go are
named as their couple. Someone in the festival's line-up, alone or in a couple, shows as teaching (or playing) rather
than going. Each person has a plans page with a Share button, and an artist's page lists the festivals they're going to
without teaching there. The Friends page, a tab of its own, lists every festival someone is going to, soonest first. On
the Festivals page, a line under the count says when featured people go to some of the festivals listed ("Cédric &
Christina are going to 3 of these"), and "Show only those" keeps just those; the same filter is a checkbox under
Filters. The search finds people by name. The build stops if a person, an artist key or a festival is unknown.

Plans are public for now: anyone can see them, so add people only with their agreement. Private sharing, friends and
"I'm going" buttons need accounts and a server, which the site doesn't have yet.

## Prices from ticket pages

Some festivals keep their prices off their description, on a ticket page. `pipeline/tickets.py` reads them there:
judgment about a page is made once, by an agent or two models, and checked; every later read is code.

- **A recipe per ticket site** (`pipeline/tickets/sites/<site>.json`, a `Recipe` of `pipeline/records.py`) says where
  the site's ticket rows are: each ticket's id on the site (its key), name, price as shown, amount, currency, a booking
  fee when the site shows it apart from the price (Weeztix's "+ €1.00 fee", added to the amount), a second price when
  the site shows one, and its sold-out mark; what its currency symbols stand for; whether the tickets sit on another
  address (a widget: built from a pattern found in the link or in its page, as Eventbrite's event page leads to its
  checkout and Weezevent's mini-site to its widget), which sections to click open, and whether the site needs a visible
  browser. A free ticket, shown as a word ("Free", "Gratuit"), costs 0. A field may read the whole page instead of its
  row, and name the row's other fields as `{field}` and its attributes as `{@attr}`: Tikoria's ticket ids sit in its
  script data next to each ticket's name, and Kizzbee's prices in a JSON attribute keyed by each option's value. A
  recipe names the reseller when the site sells other organisers' festivals at its own prices (Kizzbee); it is used only
  when the festival sells nowhere else, and the passes view says so. A site whose page carries no ticket ids but whose
  API does (go&dance) gets an API recipe: the event's id found on its page, the API's address, and each field a path
  into a ticket's JSON, a pattern on the page, or a text built from JSON values; it reads with plain requests, no
  browser. An agent writes one per site; FairPlay's needs a visible browser (it is behind a browser check).
- **A log per festival** (`pipeline/tickets/log/<event_id>.jsonl`, a `LogEntry` a line, checked on every write and read)
  gets one entry per read: `read` with every row, `refused` (no rows and an HTTP error), `unreachable` (the page could
  not be reached or would not load), or `layout_broken` (the recipe's selectors fail, no rows, two rows with one key, or
  a row missing its key, name, price, amount or currency: the recipe needs an agent). Git merges these files line by
  line (`.gitattributes`), so a session and the monthly run never conflict.
- **A first read per festival** (`pipeline/tickets/reads/<event_id>.json`, a `FirstRead`) says, from one logged read and
  the festival's description, which pass each ticket is, in the prices pass's terms (the template
  `pipeline/tickets/prompts/first-read.md` on top of the prices pass's `prices.md`): every ticket is in a tier, by its
  key, or skipped with its reason, one of the skip reasons of `pipeline/states.py` (a ticket no reason fits can't be
  skipped, so its read fails and the festival waits for an agent; a bootcamp is skipped only as a deposit); dates,
  ticket limits and price notes are quoted from the description or the ticket's name; a pass has a style only at a
  festival whose genres name two dance styles or more, and it is one of them. Only checked first reads are kept there:
  an agent fills a draft (`pipeline/tickets/drafts/`, not committed), following the prompt the models answer
  (`drafts/<event_id>.prompt.md`, written with the draft), which `record` moves there once it passes.
- **`record`** writes the prices: amount, currency, sold out and the quote (the ticket's name and price) from the latest
  read rows of the same page, the rest from the first read. It checks the first read against the rows it was made from
  and the prices against their quotes, then writes `pipeline/pass_prices.csv` (one row per tier) and
  `pipeline/ticket_pages.csv` (one per festival: page, read date, who made the first read and with which prompt, recipe
  version, unread tickets, price notes). It is the only writer of both and writes them from every first read and its
  log, so they hold what the reads and logs say and nothing else: a festival whose first read no longer fits its page is
  left out (and the monthly run fails naming it) until it is read again. Recording twice writes the same files, and a
  read that changed nothing on the page changes only the read date. A ticket the first read doesn't know is counted as
  unread, and the passes quick view says the page has new tickets not read yet; a tier whose tickets are all gone from
  the page is left out.

A festival in `ticket_pages.csv` takes its passes from its page in place of its description (`event_passes.source` is
`ticket_page`), and the quick view says when the page was read.

```bash
mise run tickets -- todo               # what needs doing
mise run tickets -- read ID [--url U]  # read the page by its site's recipe and log the rows
mise run tickets -- draft ID           # a first read to fill, from the latest rows
mise run tickets -- check ID           # what record would find wrong, writing nothing
mise run tickets -- record ID          # check the draft or first read, write the prices
mise run tickets -- retry ID           # read with a visible browser, then record
mise run tickets -- changes [ID]       # what changed between consecutive reads
mise run tickets -- page ID URL --note N        # where a festival with no full link sells
mise run tickets -- page ID --state S --note N  # or not_yet, offline, closed, none_found
```

A festival needs a first read when it is still to come and its description's prices answer gives the pass a card prices
no dated price (until that answer is asked with the current prompt, it waits for it), and again when its description or
its ticket page changes, its page shows tickets the first read doesn't know, or the first read follows another prompt; a
festival now past then gets it from its latest logged rows, without its page. It is read again on the monthly run,
unless it is *dated* (every tier on sale has an end date and none is limited to a number of tickets), when it is read
again once its last date has passed. The monthly **Refresh events** Action runs `tickets.py run`: the re-reads that are
due, a retry of every festival whose latest read failed, and a first read by Opus and Sonnet for each festival that
needs one on a site with a recipe (no first read yet, or one made with a changed description, for another page, or to
another prompt). The two read independently, and the first read is kept when they agree on every ticket's pass, style,
tier, skip and dates (and on why a ticket is skipped, for a skip reason the site tells apart). When they don't, Fable
reads it too, and a read two of the three agree on is kept; when no two agree, all are kept in
`pipeline/tickets/disputed/<event_id>.json` for an agent and the festival waits, until the first-read prompt changes. A
dispute is of reads made: when a call fails and fewer than two models made a read, the festival is read again next run,
with the reads made kept in `pipeline/tickets/partial/` so that none is paid for twice. Each read is checked before it
counts, and one that misreads what its tickets' names say (a package for 3 nights covers 3 days; tickets naming
different weekdays or dance styles are different passes; a pass sold with a meal is a package; a bootcamp is a pass)
goes back to its model once with the checker's lines. The run fails, after committing, when a page broke its recipe, a
festival's page was refused or unreachable three times in a row, a festival no longer fits its first read, or the models
made no first read for a festival that needed one (a call failed, the month's budget is spent); `todo` then marks it for
a session, where `retry` reads it with a visible browser. A festival's ticket page is known when it is its first read's,
the shop an agent recorded, or its first full link to a ticket shop (a site a recipe reads, or one a site claim names);
a link to anything else, the festival's own site say, is no ticket page. Every festival to come waits for something or
for nothing, and `pipeline/tickets/status.csv` (written by `page`, `read`, `retry`, `record` and `run`, for every
festival the export lists, a past one waiting for nothing) says which, with its first-read state, how it sells and its
known page: its ticket page found (kizomba-world cut the link short, gave none, or gave no link to a ticket shop; an
agent records in `pipeline/tickets/pages.csv`, through `tickets.py page`, how the festival sells: in a shop, with its
page; not yet, when sales are announced but not open; offline, by message, e-mail, form or bank transfer; closed; or
none found, when a search of its links and the web found no ticket page, which holds until its links change), a recipe
for its site, its recipe fixed, its sales to open, an agent to settle a dispute, or a session for a page that keeps
refusing. A site a recipe can't read (behind a check that a visitor is human, say) has a site claim, and its festivals
wait for nothing. That is backlog, so it never fails the run.

`pipeline/read_page.py` reads any one page as a browser shows it, for one-off checks; `tickets.py` is the one scheduled
reader that uses it:

```bash
mise run read-page -- URL --screenshot page.png   # the page's text, and a screenshot
mise run read-page -- URL --visible               # a visible browser on a virtual display (xvfb-run)
```

## States

Every coded value is one of the states of its data point, and `pipeline/states.py` holds each one as a typed row: what
makes a value that state, what the site does with it (shows it on the card or in a view, says it as the card's reason
for having no price, filters by it, keeps it, or waits for someone), its words on the site, and who acts on it
(`pipeline/STATES.md`). Everything else is built from those rows: the code's enums (`pipeline/enums.py`, which
`mise run generate` writes, with `site/states.ts` for the site), and through them the records of `pipeline/records.py`
and the schemas the models answer to, generated from those records; the definitions in the prompts; and the SQL checks.
So a new state is one new row, words included, and a value that is no state fails: when it is written or read (a record,
a check), in the tests (a name in the code the table doesn't have), or in `pipeline/audit.py`, which runs first in
**Refresh places and rates** and in **Tests** and names each value its record refuses in the shared files and in the
answers and first reads the load takes (those to the current prompt) and in the admin's claims, and each site claim that
departs from nothing any more: a recipe reads its site now, or no festival has its known ticket page there.

```bash
mise run audit          # "0 refused, 0 stale", or what to add or remove
```

## Promo codes

Promo codes are ours, not kizomba-world's: `pipeline/promo_codes.csv` has one row per festival edition, so one code can
appear on several rows, each with what it gives at that festival. Each row has the `event_id` (the number in the
festival's kizomba-world API record; the SQL page shows it as `event_rows.id`), the `code`, an optional `offer` such as
"10% off", and the festival's name and a note for people reading the file. A festival with a code gets the "Promo code"
highlight, its opened card shows the code with a Copy button, and searching the code finds the festival. A code belongs
to one edition, so next year's needs a row of its own. The build stops if an `event_id` isn't in the data.

## Artists' home countries

The site shows where an artist is from only when a source says so: a home claim, else the one country line-ups state
most often next to their name, each festival once. When line-ups state several countries equally often, the home is
contested and none is shown. Where nothing is known, no country stands in for it: the statistics count the artist as of
unknown country, and their page says only where they are booked most, without a flag.

## Updating the events

On the 3rd of each month, the **Refresh events** Action updates the export in `source/` from kizomba-world, using
`pipeline/scrape.py`. The event list comes from the site's Events Calendar API. The event pages add what the API leaves
out: the venue and city, the deal link, the organiser's links, the translations and whether the festival is cancelled.
Pages are fetched for new and changed festivals and for every festival still to come, since a deal link can change
without the festival's modified date, and a cancellation might too. They are fetched a few seconds apart, so a run takes
about a quarter of an hour. Each festival has an id of ours, given once, beside kizomba-world's (`source_ids`); the two
are the same for every festival listed before ids were ours. A festival the site no longer lists is kept, marked gone
since that day, so plans and links to it still hold; its card says it is no longer listed, and the listings leave it
out. Once the export is committed, the Action starts **Refresh places and rates** on the same branch, which checks every
state in the data (`pipeline/audit.py`), geocodes new cities, refreshes the exchange rates and the merge suggestions,
and commits them; **Publish site** then builds the database from it all and publishes it. That workflow also runs on any
push to `source/` or `pipeline/` on `main`.

The site sits behind Cloudflare, which refuses ordinary scripts, so the scraper sends its requests the way Chrome does,
through [curl_cffi](https://github.com/lexiforest/curl_cffi). If Cloudflare stops letting it through, the Action fails
and the site keeps the last export.

Line-ups, highlights from descriptions, rooms, genres and pass prices are read from each description by Claude
(claude-haiku-5-5). After the scrape, the same Action runs `pipeline/extract/ask.py`: festivals in the export's
`pending_extraction` table (new, or with a changed description, a pass for each answer older than the change) and
festivals a pass has no answer for are asked about, one festival and one pass at a time, with that pass's prompt (its
template in `pipeline/extract/prompts/`, the definitions of its states filled in from `pipeline/states.py`) and its
record's schema as the required answer format. A checker then confirms that the answer is its record
(`pipeline/records.py`), and that every name, quote and price appears in the description, and that a pass has a style
only at a festival whose genres name two dance styles or more (`prices.styles`). A failing answer goes back to Claude
once, with the checker's lines. A second failure leaves the festival pending, to try again next month, as does any call
that gives no answer (`pipeline/calls.py`: a reply cut short, the service busy or unreachable), and the run fails naming
each question left unanswered; a call that can never succeed as made (a bad key, say) stops the run's requests. A
festival leaves pending once every pass has an answer since its change, from that run or an earlier one. A prompt is
known by the hash of everything fixed in its request: its text, its record's schema as the checker holds the answer to
it, and that schema as sent (`pipeline/prompt.py`); each answer and first read records the hash it answered, and saving
one first saves the text in `pipeline/prompts/asked/<hash>.md`. Editing a template, a state's criterion or a record
changes the hash of every prompt it is in, which makes every answer to that prompt, and every first read when it is the
first read's, wait to be asked again, out of the database until then; so start **Refresh events** by hand once it is
pushed, before anything reloads the database. Started with festival ids in `festivals` ("16909,18806"), it skips the
scrape, and asks and reads those festivals only (`ask.py --only`, `tickets.py run --only`): after a fixed recipe, say,
or to try a prompt on a few festivals first. The answers are saved in `pipeline/extract/answers/` and committed;
`answers/log.csv` says who answered each file, with which model and prompt, and when. The first extraction's answers,
from Claude Code subagents, are kept there too; rebuilding from them reproduces the export's tables exactly.

`load_extract.py` then loads every festival's newest answer to each pass's current prompt, and the prices read on ticket
pages to the current first-read prompt, into the export, in one transaction: a value a check refuses leaves the export
as it was. `resolve_artists.py` groups the names into artists, in one transaction too. Artist ids never change:
`artist_ids` remembers every id given, a new artist gets the next unused one, and a link to an artist that was merged
opens the one it was merged into. Pairs of names that might be one artist go to `pipeline/artist_merge_suggestions.csv`
for review; nothing is merged without a decision. The key is the repository secret `ANTHROPIC_API_KEY`. Asking Claude
has a budget of €100 a month (`pipeline/spend.py`): every request, from the extraction passes and from the ticket pages'
first reads, goes in `pipeline/spend.csv` with its model, tokens and cost, and once the month's spending reaches the
budget the steps stop asking, leave the rest for next month, and the run fails so the stop is seen; the tokens of a
reply cut off mid-stream are billed, so they go in too. Each run prints what it spent and the month's total.

To do the same locally:

```bash
mise run scrape -- --dry-run         # what would change, without writing
mise run scrape
mise run geocode                     # looks up new cities only
mise run ask -- --dry-run            # which festivals need asking
mise run ask                         # needs ANTHROPIC_API_KEY
mise run load
mise run resolve
mise run rates                       # exchange rates for the site's prices
mise run suggest-merges              # on a site database built for it
mise run fares -- refresh --budget 4 # searches festival weekends due today
mise run build:data                  # docs/data/kiz.sqlite and site.json, never committed
mise run serve                       # builds the site and its data, then open http://localhost:8000
```

## Running the steps

The pipeline is one Python package, `pipeline`, and each step is a task of `tasks.toml` (`mise run <step>`, its own
arguments after `--`), which runs its module with the dependency group it needs. `pyproject.toml` pins every package
once: pydantic, which every step reads its records with, as the project's dependency, and the rest in dependency groups:
`mise run tickets` gets the browser, Claude's client and the checker, and the steps that need nothing more (the loads,
the build, the fares) none. `uv.lock` fixes the versions. Every step opens the export itself (`mise run export` prints
its path). A step opens its databases through `pipeline/db.py`, saying whether it reads, writes or creates each one, so
a wrong path is an error.

## Tests

Every check runs through [mise](https://mise.jdx.dev) (`tasks.toml`, with the tools `mise.toml` pins: node, pnpm and
uv), and the **Tests** Action runs the same command on every push:

```bash
mise run check        # everything
mise run check:fast   # the quick part: lint, format, types, the site's tests, the generated files
mise tasks            # each check on its own: lock:py, lint:py, format:py, format:md, types:py, test:py, lint:site,
                      # types:site, knip, dup, test:site, generate:check, hooks:check, audit
mise install          # the tools, and the git hooks of prek.toml with them (mise run hooks installs them alone;
                      # an agent's session does on start, .claude/settings.json)
```

The hooks (prek, pinned in `uv.lock`) run the quick checks before a commit, on what is staged (`check:commit`), and
every check before a push, on the commit pushed (`check:push`), each in a worktree of its own: neither a change left
unstaged, a file not added, nor the branch checked out stands in for what is committed or pushed.

The Python code is held to every ruff rule but the few `pyproject.toml` ignores, each with its reason, and to
basedpyright's strict mode with `Any` an error: what comes from outside (an answer, a page, a CSV) is parsed into a
record of `pipeline/records.py` where it enters. A check is suppressed only on its line, naming its rule and why, and
`tests/test_suppressions.py` lists each suppression, so a new one is a change to that list. Every CSV file has its row
record in `pipeline/audit.py` (`FILES`), and `tests/test_records.py` holds each file to the text its record writes, so a
file and the code that writes it can't drift apart. The Markdown is as mdformat writes it (`.mdformat.toml`), except the
prompt templates and the prompts asked: their text is what Claude is asked and its hash names it, so only an edit to a
prompt changes it.

The site is TypeScript under tsc's strict mode and the further flags `tsconfig.json` sets, and every Biome rule but the
few `biome.jsonc` turns off, each with its reason; Biome formats the code, its tests and the stylesheet too. A value
from outside enters through one reader: a database row is read by its shape (`site/rows.ts`), which names each column
and fails on a value of another type, so nothing past it meets an unread value. A query is an `Sql` (`site/db.ts`),
which only the `sql` tag makes, from the code's own text and other `Sql`: a value is bound to a `?`, never written into
the query. A type assertion is a suppressed `noUnsafeTypeAssertion`, and `tests/test_suppressions.py` lists those as it
lists Python's. Biome's plugins in `lint/` keep what belongs to one module there: links in `routes.ts`, the stored hints
in `hints.ts`, dates and flight links in `ui.ts`, and the home city in the data. knip fails on a module, export or
package nothing uses.

The site tests run in vitest (`vitest.config.ts`): in Node, the prices and wording, the shapes against the database the
site ships, the stylesheet against the page, and the state words and keys the code may not write itself; in Chromium,
what the page does (the tab's oval, the slide, a dialog's history entry). The pipeline tests cover the states, text,
kizomba-world's pages, extraction, ticket pages and the commands, and run the steps whole on the committed export: the
site database builds alike twice, and loading the answers or resolving the artists again changes nothing. The steps that
fetch from outside (the rates, the geocoder, the scrape, the fares, Claude) are tested against fakes of what they fetch.
pytest runs strict (an unknown option or marker, a repeated case id or a warning fails), on every core, in a new order
each run, with no network socket and a time limit per test; `mise run test:py` also fails below the branch coverage
`pyproject.toml` sets. A database connection is opened only by `pipeline/db.py`, closed when its block ends, the tests'
too. A day is a date and a time a UTC datetime, read from one clock (`records.now()`, `today()`; ruff bans the others).
`tests/test_structure.py` fails on a function written twice, on the repository's folder found anywhere but
`pipeline.ROOT`, on an Action that sets up a tool mise doesn't give it, on a look for the export but `export.path()`'s,
on the export opened but at its schema's version, on a task in `mise.toml`, and on a built file (the site's code,
database or summary) committed or read anywhere but from its build. jscpd fails on a block of 20 tokens written twice
anywhere in the code, the tests, the stylesheet or the Actions (`.jscpd.json`), and `lock:py` on a `uv.lock` that is not
what `pyproject.toml` resolves to. The audit checks that every state in the data is one of `pipeline/states.py`.

The database enforces its own rules. Dates are days, required fields are set, and `cancelled` is 1, 0 or empty. Empty
means not known: the source flags it only for events still listed as upcoming, so most past festivals have none. As a
result, an export that breaks these rules fails the build instead of reaching the site.
