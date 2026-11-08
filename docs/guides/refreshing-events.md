# Refreshing the events

The festivals, their answers and their fares are refreshed by Actions on a schedule; this guide says what each does,
when to start one by hand, and how to run the same steps locally. Why an answer is asked again is in
[Prompts and answers](../concepts/prompts.md); the order of the steps in [Data flow](../concepts/data-flow.md).

## The Actions

| Action | When | What it does |
| -- | -- | -- |
| **Refresh events** | the 3rd of each month, or by hand | scrapes kizomba-world, reads the ticket pages, asks Claude what is due, loads the answers, resolves the artists, asks the merge review, commits; then starts **Refresh places and rates** |
| **Refresh places and rates** | after Refresh events, or by hand | checks every state in the data (`mise run audit`), geocodes new cities, refreshes the exchange rates and the merge suggestions, commits; then starts **Publish site** |
| **Refresh fares** | every day | searches the festival weekends due, commits the fares; then starts **Publish site** |
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
month, and the run fails so the stop is seen. A run after a prompt change asks everything again: the one of October 2026
cost $11.17, $8.71 of it the ticket pages' first reads.

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
search per airport and weekend, the cheapest return with its stops (`fli flights`, the cheapest way out and its ways
back). Home is the airport marked `home` in `pipeline/airports.csv`; a festival's airports are every one within 250 km
of its city. Its nearest is searched for any flight, on the intervals below. The others are worth it only by a direct
flight: they are searched for direct flights alone, half as often (`EXTRA_SLOWER`), and only after every nearest
airport's weekend due that day, within the run's 20 searches. One with no direct flight that weekend is marked so
(`fare_jobs.csv` `direct` 0) and not searched again for it, unless it becomes a festival's nearest; and when that
weekend is within 91 days (`SCHEDULED_DAYS`, as far ahead as airlines surely have their flights on sale), the airport is
not searched as an extra for any weekend for 182 days (`NO_DIRECT_DAYS`), unless another of its weekends has one. A
route from home runs most weeks of a season or not at all, and most of the airports within reach of a festival have none
from Bergen. Google lists some direct flights with no price (Widerøe's): those count as a direct flight, with no fare.
`fares.csv` keeps each fare's `stops`, empty for those found before stops were asked.

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

Each weekend has its own weekday, so each day's run checks about a seventh of them; one never searched, or overdue by
twice its interval, doesn't wait for its day. A weekend with no price on Google loses its fare; a search Google refuses
is tried once more after a minute, and refused again stops the run, which keeps what it found.

## Running the steps locally

```bash
mise run scrape -- --dry-run         # what would change, without writing
mise run scrape
mise run geocode                     # new cities only
mise run ask -- --dry-run            # which festivals need asking
mise run ask                         # needs ANTHROPIC_API_KEY
mise run load
mise run resolve
mise run rates
mise run suggest-merges
mise run fares -- plan               # what is due today
mise run fares -- refresh --budget 4
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
