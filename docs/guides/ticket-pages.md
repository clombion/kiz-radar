# Prices from ticket pages

Some festivals keep their prices off their description, on a ticket page. `pipeline/tickets.py` reads them there:
judgment about a page is made once (a first read, by two models or an agent) and checked, and every later read is code
that applies it to the page's rows. This guide is the agent's workflow, one festival at a time.

**Never edit `pipeline/tickets/pages.csv` or `pipeline/tickets/log/` by hand**: they are written by `tickets.py` and
checked on every read (`.claude/settings.json` refuses the edit too).

## What a festival waits for

`mise run tickets -- todo` lists what needs doing; `pipeline/tickets/status.csv` holds, for every festival, what it
waits for (`waits_for`):

| `waits_for` | Who acts | What to do |
| -- | -- | -- |
| `page` | agent | find its ticket page: [step 1](#1-find-the-page) |
| `recipe` | agent | write a recipe for its site: [Writing a recipe](writing-a-recipe.md) |
| `recipe_fix` | agent | the recipe no longer fits the page (`layout_broken`): fix it |
| `session` | agent | its reads keep failing (`refused`, `unreachable` three times in a row): `retry` it with a visible browser |
| `agent` | agent | no two models agreed on its first read (`disputed`): settle it, [step 3](#3-the-first-read) |
| `sales_open` | organiser | its sales are announced but not open (`not_yet`); nothing to do |
| `nothing` | nobody | priced, past, or on a site a site claim says no recipe can read |

## 1. Find the page

A festival waiting for its page has a link kizomba-world cut short (ending in `…`), or links to no ticket shop (its own
site, say). Find the real ticket page (the festival's site, a search) and record it:

```bash
mise run tickets -- page ID URL --note "how it was found"
```

When it sells none online, record why, in the words that say so:

```bash
mise run tickets -- page ID --state not_yet --note "…"   # sales announced, not open
mise run tickets -- page ID --state offline --note "…"   # by message, e-mail, form or bank transfer
mise run tickets -- page ID --state closed --note "…"    # closed or suspended
mise run tickets -- page ID --state none_found --note "what was searched"
```

`none_found` holds until the festival's links change. A festival with no page looked for yet shows `not_looked` as its
price state.

## 2. Read it

```bash
mise run tickets -- read ID [--url URL]
```

It reads the page by its site's recipe and prints its tickets, and logs the read:

| The read says | It means | Then |
| -- | -- | -- |
| the tickets | `read` | step 3 |
| no recipe for the site | the site is new | [write a recipe](writing-a-recipe.md), read again |
| `layout_broken` | the recipe's selectors fail, or a row lacks its key, name, price, amount or currency | fix the recipe |
| `refused` | an HTTP error and no rows | `mise run tickets -- retry ID`, with a visible browser |
| `unreachable` | the page didn't load | check the address; `retry` |

`--url` replaces the page the first read knew, and so asks for a new first read.

## 3. The first read

```bash
mise run tickets -- draft ID
```

Fill `passes`, `skipped` and `rule_quotes` in `pipeline/tickets/drafts/ID.json`, following
`pipeline/tickets/drafts/ID.prompt.md`, the prompt the models answer with the festival and its tickets. Every ticket
goes in a tier, by its key, or in `skipped` with its reason, one of the skip reasons of `pipeline/states.py`. A ticket
that is no pass and fits no reason is a new state: ask the admin before adding a row
([Adding a state](adding-a-state.md)). The same holds for a first read to do again: the description or the page changed,
new tickets, or `pipeline/tickets/disputed/ID.json` holds the models' reads, no two of which agreed.

```bash
mise run tickets -- check ID     # what record would find wrong, writing nothing
mise run tickets -- record ID    # check the draft and make it the first read
```

`record` checks the draft against the rows it was made from and the prices against their quotes; once it passes, the
draft is the first read in `pipeline/tickets/reads/ID.json`, and the prompt it followed is archived in
`pipeline/prompts/asked/`. On a failure, fix what it names and record again.

## 4. Commit

```bash
mise run load
mise run resolve
mise run export     # names the export to commit
```

Commit the export with `pipeline/tickets/` (its `status.csv` included) and `pipeline/prompts/asked/`. The site's
database is built from them and never committed: `mise run build:data` builds it to look at locally.

## How the prices follow the page

A festival whose first read records its prices takes its passes from its page instead of its description, and every
later read applies the first read to the page's rows: amount, currency and sold out from the rows, the rest from the
first read.

| The page, on a later read | The festival |
| -- | -- |
| the same tickets, the same prices | the read date moves; nothing else |
| a price changed | the new price |
| a ticket the first read doesn't know | counted as unread; the passes view says the page has new tickets; a first read is due (`redo_unread`) |
| every ticket of a tier gone | the tier is left out |
| the rows no longer fit the first read | left out until read again; the monthly run fails naming it |
| the first-read prompt changed | left out until read again (`redo_prompt`) |

The monthly run reads again what is due, retries every festival whose latest read failed, and has Opus and Sonnet make a
first read for each festival that needs one; the read is kept when they agree on every ticket. When they don't, Fable
reads too, and a read two of the three agree on is kept; when no two agree, the reads are kept in
`pipeline/tickets/disputed/ID.json` and the festival waits for an agent (`agent`). A dated festival (every tier on sale
has an end date, none limited to a number of tickets) is read again only once its last date has passed.

## Other commands

```bash
mise run tickets -- changes [ID]          # what changed between consecutive reads
mise run read-page -- URL --screenshot page.png   # any page as a browser shows it, for a one-off check
mise run read-page -- URL --visible               # in a visible browser on a virtual display
```

`read-page` is for one page per question, never in a scheduled job or a loop.
