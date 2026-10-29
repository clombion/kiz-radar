# Data flow

How a festival on kizomba-world becomes a card on the site, and why the pipeline is cut into these steps.

```
kizomba-world ──scrape──▶ export (source/*.sqlite) ◀──load── answers (pipeline/extract/answers/)
                                │                    ◀──load── first reads + logs (pipeline/tickets/)
                                │                    ◀──resolve── claims (claims/) + merge review answers
                                ▼
                    build (pipeline/build_site_db.py) ◀── fares, rates, airports, plans, promo codes (pipeline/*.csv)
                                ▼
                    public/data/kiz.sqlite + site.json ──▶ the browser (sql.js)
```

## Why it is shaped this way

**One export, rebuilt by steps that each own their tables.** The export in `source/` is the one committed database: the
scrape writes the festivals, the load the answers' tables, resolve the artists', each in one transaction, so a value a
check refuses leaves the export as it was. `tests/test_steps.py` holds that every table of the export is one step's and
declared as that step writes it. Every step opens the export itself through `pipeline/db.py`, saying whether it reads,
writes or creates it, so a wrong path is an error, not a new empty database.

**What a model or an agent judged is kept as files, and the database is built from them.** Answers, first reads, ticket
logs and claims are files, each with where it comes from; the load reads the current ones into the export, and nothing
else holds them in between. So reverting a commit restores both a judgment and what was built from it, and a judgment
asked again under a new prompt replaces the old one without a migration. What makes an answer current is in
[Prompts and answers](prompts.md).

**The site's database is built, never committed.** `public/data/kiz.sqlite` and `site.json` are built from the export
and the files of `pipeline/` by **Publish site**, by `mise run build:data` locally, and for each step that reads it
(`build_site_db.built()`); `tests/test_structure.py` fails on a built file committed or read from anywhere else. Its
derived tables (artist and event statistics, country statistics) are tested against the same counts recomputed in SQL
(`tests/test_build.py`).

**The browser runs every query.** The site is static: the page loads the database with sql.js and queries it, reading
each row by its shape (`site/rows.ts`), so nothing past that reader meets an unread value. The visitor's own day is set
into the database's `today` when it opens, so "still to come" is their day's on every page.

**The paid steps commit before anything else can fail.** Refresh events asks the models in a job of its own and hands
its answers on as a patch; a later failure leaves the paid work in the run's artifact, never lost.

## Where each piece comes from

| Piece | Source | Licence |
| -- | -- | -- |
| festivals, line-ups, descriptions | kizomba-world's Events Calendar API and event pages, scraped like Chrome (curl_cffi) | CC BY-SA 4.0; the festival data here is shared under it |
| line-ups, highlights, rooms, genres, pass prices | Claude's answers to each description | ours |
| prices on ticket pages | the pages' rows, applied by a first read | ours |
| fares | Google Flights, through fli | ours |
| exchange rates | the European Central Bank | — |
| cities' places | OpenStreetMap Nominatim, cached in `pipeline/geocode.csv` | ODbL |
| artist merges, homes, bookings, site overrides | claims ([Claims](claims.md)) | ours |

A festival the site no longer lists is kept, marked gone since that day, so plans and links to it still hold. Each
festival has an id of ours, given once, beside kizomba-world's. The build tidies the text: artist names get one casing,
festival titles lose dates and shouting capitals (`events.listed_title` keeps them as listed), venues are recased
(`pipeline/text.py`).

## The database enforces its own rules

Dates are days, required fields are set, coded values are states (checks built from `pipeline/states.py`), links are
http(s), and references hold at commit. An export that breaks these fails the build instead of reaching the site. For
the SQL page, every table is described in `table_docs`; `event_rows` is the one to start from.
