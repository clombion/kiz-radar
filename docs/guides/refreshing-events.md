# Refreshing the events

The festivals, their answers and their fares are refreshed by Actions on a schedule; this guide says what each does,
when to start one by hand, and how to run the same steps locally. Why an answer is asked again is in
[Prompts and answers](../concepts/prompts.md); the order of the steps in [Data flow](../concepts/data-flow.md).

## The Actions

| Action | When | What it does |
| -- | -- | -- |
| **Refresh events** | the 3rd of each month, or by hand | scrapes kizomba-world, reads the ticket pages, asks Claude what is due, loads the answers, resolves the artists, asks the merge review, commits; then starts **Refresh places and rates** |
| **Refresh places and rates** | after Refresh events, or by hand | checks every state in the data (`mise run audit`), geocodes new cities and adds them to `pipeline/cities.csv`, refreshes the exchange rates and the merge suggestions, commits; then starts **Publish site** |
| **Refresh fares** | every day | searches the festival weekends due, commits the searches (`pipeline/fare_offers/`); then starts **Publish site** |
| **Publish site** | every push to `main`, and after the above | audits the data, builds the site and its database, publishes |
| **Actions up to date** | monthly | fails naming each action pin with a release at least two weeks old it isn't on |
| **Tests** | every push | `mise run check` |

**Refresh events** runs in three jobs, each holding only what it needs: `read` scrapes and reads the ticket pages with
no key and no token that can push; `ask` asks the models with the key and no such token; `commit` loads, resolves and
pushes with the token and no key. Each hands the next its changes as a patch (`.github/actions/handoff`), kept three
days as the run's artifact.

## Start Refresh events by hand when

- **a prompt changed** (a template, a state's criterion, a record): every answer to it, and every first read when it is
  the first read's, stays out of the database until it is asked again. Start it at once after the push.
- **a recipe was fixed, or a prompt is to be tried on a few festivals**: give it festival ids in `festivals`
  ("16909,18806"); it skips the scrape and asks and reads those festivals only.

## What a run costs, and when it stops

Asking Claude has a budget of €100 a month (`pipeline/spend.py`): every request goes in `pipeline/spend.csv` with its
model, tokens and cost. Once the month's spend reaches the budget, the steps stop asking and leave the rest for next
month, and the run fails so the stop is seen. A run after a prompt change asks everything again: one costs about $11,
most of it ($8.71) the ticket pages' first reads.

| Outcome of a run | What is committed | Run marked |
| -- | -- | -- |
| everything answered | everything | passed |
| an answer failed its check twice, or a call gave no answer (cut short, busy, unreachable) | the rest; the question waits for the next run | failed, naming each question |
| a call that can never succeed as made (a bad key) | what was answered before | failed; the run's requests stop |
| the budget is spent | what was answered before | failed |
| kizomba-world's Cloudflare refuses the scraper | nothing new; the site keeps the last export | failed |
| the claims, the load or the resolve fails in the commit job | the answers, the spend, the prompts asked and the ticket reads, not the export; nothing is started | failed |
| the commit job fails otherwise (the patch refused, the push) | nothing; the answers are in the `asked` artifact for three days | failed |

When a step between the patch taken and the push fails (the claims' update, `mise run load`, `mise run resolve`), the
commit job still pushes what was paid for, as the patch gave it: `pipeline/extract/answers/`, `pipeline/prompts/asked/`,
`pipeline/spend.csv` and `pipeline/tickets/`. Load and resolve write only the export, so these are the patch's own; the
export and the claims are put back as the run found them first, so the export on `main` stays one that was loaded and
resolved. Fix what failed; the next run, or `mise run load` and `mise run resolve` by hand, loads what was kept, and its
push starts **Refresh places and rates**.

When the commit job fails otherwise (the handoff refuses the patch, or the push fails), nothing is pushed: download the
run's `asked` artifact, apply its `changes.patch` to the commit the run was on (`git apply --index --binary`), fix what
failed, and run what the commit job runs (`mise run load`, `mise run resolve`) before committing; the push starts
**Refresh places and rates**, which refreshes the merge suggestions from the export pushed.

## Fares

Only festival weekends are searched: the Friday-to-Monday return from home to each upcoming festival's airports, one
search per airport and weekend. A search loads Google Flights' search page in a headless Chromium (Patchright's full
Chromium, which `fares.yml` installs without its headless shell), one browser a run (`pipeline/google_search.py`), and
reads the answer the page's scripts receive (its `GetShoppingResults` call, which Google serves only to a request the
page itself signs) through fli, at the commit `pyproject.toml`'s `fares` group pins: each way out is priced as the
cheapest return that leaves by it ("From N euros round trip total"), with its stops on the way out; the ways back are
not read, so the site says the stops "out". The page a plain request gets lists no flight for most weekends the browser
finds priced, so the browser is the one reader; the history's searches of it are kept as `google_chrome`'s, and its
`google` rows are the outbound page's that a plain request got, read before (with fli's private call that read that page
alone). Every search is kept, with every offer it saw, in the fare history: a Parquet file per run in
`pipeline/fare_offers/`, never written again once the run is over (`mise run fares -- show` lists them, the latest
first). What a festival weekend's searches from home say of its fare is its standing (below), which the queue, the build
and the site read; the card's fare is the cheapest offer on one ticket of the search its standing is of. Home is the
airport marked `home` in `pipeline/airports.csv`; a festival's airports are its city's decided ones, the first its
nearest ([The airports a city flies to](city-airports.md)), else every one within 250 km of its city. Every weekend is
searched for any flight. Its nearest is searched on the intervals below; the others (extras) half as often
(`EXTRA_SLOWER`), and only after every nearest airport's weekend due that day, within the run's searches. Each weekend
Google answered is asked of a reseller too, three seconds later and the same: Kiwi.com's flight search, open to all, no
key. Its search keeps the id of Google's it was asked with (`asked_with`); one kept before it did is paired by time,
with Google's made last before it from and to the same airports for the same Friday and flights. Each of its trips is
kept with its stops each way, the airlines flying it and the tickets it is booked on: a way out or back whose flights
are in more than one of Kiwi's fare components (the part of each flight's id before its last `_`) is a self-transfer, on
separate tickets. The weekend's Flights add its cheapest self-transfer when it is cheaper than the fare, or there is
none ("self-transfer, separate tickets · reseller's price"); it is never the card's. Google lists some direct flights
with no price: Widerøe's, to anyone searching from outside Norway, as GitHub's runners are. For those, and for a page
that lists no flight, the card takes the reseller's cheapest on one ticket, and says it is a reseller's price, likely
cheaper from the airlines. A reseller that fails is kept as failed, and fails no run; a trip of its answer that cannot
be read (an id whose parts cannot be matched to its flights) is left out, and the answer's other trips kept. The fares
kept before the history was (every version of `fares.csv`, `fare_jobs.csv` and the older `docs/data/fares.csv` on main)
are in it too, each search tagged with the file and commit it comes from (`backfill`); their stops are known only when
there were none. A "no price" among them was asked of no reseller (and there also meant a timeout, an answer that could
not be read or a sweep that failed), so, as for any search of Google's listing no flight with no reseller's answer, it
says nothing of its weekend.

A weekend's standing (`fare_weekends.standing`, the `fare_standing` states of the
[States table](../reference/states.md)) is that of its latest search from home that says one of these, with the
reseller's search asked with it:

- `priced`: Google priced a way out, or, where it priced none, the reseller found a trip on one ticket;
- `listed`: Google listed flights with no price, or listed none and the reseller found self-transfers alone;
- `no_flight`: Google's page listed no flight, and the reseller found none, for a weekend within 91 days of the search
  (`SCHEDULED_DAYS`): airlines have their flights on sale that far ahead, and a weekend further on may lack a flight
  that will fly.

A search that says none of them teaches nothing: it failed, or Google's page listed no flight and the reseller failed,
was not asked, or found none for a weekend further ahead than that. The history keeps searches for direct flights alone,
made when an extra was searched so: one teaches `priced` or `listed` as any search does, and no flight never, as a
flight with stops may fly that weekend. A weekend searched whose searches all taught nothing is `unanswered`; one never
searched, `not_asked`. The site says "no flight price yet" for both, and "no flight that weekend" for `no_flight`; when
"checked" a weekend was is the search its standing is of, and none when no search taught one.

To add the airports festivals to come can fly to, download OurAirports' `airports.csv` (ourairports.com/data, public
domain) and run `mise run airports -- <its path>`: it adds every large or medium airport with scheduled service and an
IATA code within 250 km of a festival to come that `airports.csv` has not, from OurAirports' own name, city, country and
place, and names each; then `mise run build:data`.

| Festival weekend | Searched every |
| -- | -- |
| within 5 weeks | week |
| 5 weeks to 3 months | 2 weeks |
| 3 to 6 months | 4 weeks |
| 6 to 11 months | 6 weeks |
| further ahead | not yet: Google doesn't sell that far ahead |

Each run searches Google 20 times (`FARE_BUDGET`, below), and keeps a quarter of them (`PAIR_SHARE`) for pairs: weekends
it searched from home are searched from another city too, Oslo the most and Stavanger or Trondheim on a few
(`PAIR_ORIGINS`), the same day, Google alone: of those Google priced from home, as a pair is of two fares. They are for
measuring how well Bergen's price predicts those cities', and the site shows none of them: its fares are home's. Each
run then writes `pipeline/fare_accuracy.md` (`mise run fares -- accuracy`): for each city and family (whether Bergen's
fare flies direct out), the pairs, the offset to Bergen's price (the median of the city's price less Bergen's), and how
far that offset, fitted on earlier weeks' pairs alone, misses each later week's, with how many were scored. A city and
family is fit to be shown on the site, once visitors can pick their city, when at least 20 pairs are scored and 80% of
them are within €40.

Searches are 20 seconds apart (`PAUSE`): Google refused none of the browser's searches made that far apart, and refused
a plain request after 22 made 10 seconds apart. A search answered at its first try takes about 50 seconds on GitHub's
runner (`SEARCH_SECONDS`: the pause, Google's answer, the browser's context and the reseller's search), so a run's
budget is bound by its time: 20 searches fit in the 1200 seconds the run may take (`--max-seconds`, `MAX_SECONDS`). A
slower run ends on its time instead: it starts no search after it, and the last it started ends within `WORST_SECONDS`
(271 seconds: three tries waiting 45 seconds each, the waits between them, the reseller's search and the pause after
it), so the run's step and the job's other steps end within its 30 minutes, which a test holds. A budget that does not
fit searches nothing, and the run says so. The admin sets the budget with the repository variable `FARE_BUDGET`
(Settings → Secrets and variables → Actions → Variables); one above 24 needs `--max-seconds` and the job's
`timeout-minutes` in `fares.yml` raised with it. A run started by hand takes its own (`budget`).

Each weekend has its own weekday, so each day's run checks about a seventh of them; one never searched, or overdue by
twice its interval, doesn't wait for its day. A weekend whose latest searches taught nothing (each failed, or said none
of the three) waits instead a day after the first of them, then two, four, doubling with each, never longer than its
interval, counted in days of the calendar from its latest search and on no weekday. A no price kept before the history
was is such a search, so a weekend with nothing else waits a day, not its interval. The nearest airports' weekends due
on their interval go first, then theirs due after a wait, then the extras' the same: a failed search comes back the next
run, and one that keeps teaching nothing costs a search an interval at most. Its fare, if any, stays that of its latest
search that taught one. A search Google refuses (HTTP 429, or its sorry page) is tried once more after a minute, however
its earlier try ended, and refused again stops the run, which keeps what it found. Google's error 13 (INTERNAL) comes
and goes whatever the search, on about a fifth of the searches measured, so a search it answers so is tried once more
after the pause. Three searches in a row Google gives no answer to, each after its second try where it has one, stop the
run (`MOST_DECLINED`: Google is blocking the run, or its search page has changed), and so does a browser that does not
start. A search its error 13 ended is not one of them, and ends no streak: Google's server answered, so the run's access
and the page work, and the run goes on, within its time. A search that failed (refused, error 13 twice, its consent
page, no whole answer within 45 seconds, an answer of a shape not known, a price whose currency cannot be read, or the
browser failing) is kept as failed, with why in its note, never as no price, and teaches its weekend nothing; the run
names it at its end. The run fails (the workflow marked failed after the searches are pushed) only when it was stopped
so, or Google answered none of its searches: a search with no answer now and then fails no run. Its first line names the
browser's version, and its summary line says how many answers Google gave, how many of them listed no flight, and how
many festival weekends stand at each standing.

An answer is kept as it lists: offers, flights with no price (`listed`), or none (`none`), and `none` is only ever an
answer that lists no way out and says so itself (the tokens of the airports it suggests nearby name it `noresults`); an
answer with no way out that does not say so is of a shape not known, and `failed`, as are an error, a refusal or no
answer. A refusal or its consent page is known from the page's own document, so the search waits for no answer then.
Google's none, of either reader, teaches nothing alone: the reseller's answer to the same search is what tells no
flight, for a weekend airlines have on sale. The outbound page's searches kept from before also hold how many nearby
dates an empty page priced (`nearby`), a fact read that decided nothing; no search of the browser's has it. Every answer
is one of Google's server: it counts in the run's searches, and is not one of the searches in a row Google gives no
answer to, so a run whose every answer lists no flight fails nothing.

## Running the steps locally

```bash
mise run scrape -- --dry-run         # what would change, without writing
mise run scrape
mise run geocode                     # new cities only
mise run cities                      # a city for each one no city has yet
mise run ask -- --dry-run            # which festivals need asking
mise run ask                         # needs ANTHROPIC_API_KEY
mise run load
mise run resolve
mise run rates
mise run suggest-merges
mise run fares -- plan               # what is due today
mise run fares -- refresh --budget 4
mise run fares -- show --airport LIS # the searches kept, the latest first
mise run build:data                  # public/data/: kiz.sqlite, site.json, review.json; never committed
mise run serve                       # the site at http://localhost:8000
```

## Troubleshooting

**The site shows fewer festivals priced after a push.** A prompt changed and the run that asks again hasn't happened:
start **Refresh events**.

**The run failed but the site still updated.** The commit job committed what was answered; the failure names what waits.
Nothing to do unless it repeats.

**A festival's prices disappeared.** Its ticket page changed so its first read no longer fits, or the first-read prompt
changed: see [Prices from ticket pages](ticket-pages.md).
