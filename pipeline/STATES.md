# Ticket and price states: a closed world

A data point's possible states are a closed type that the pipeline produces; every consumer of those states is a
total mapping from that type, owned in one place, and an unmapped state is a build failure, not a fallback.

The test: *if the pipeline starts emitting a new state tomorrow, the build fails naming the state, its data point and
its producer, and the words go in one new row of `pipeline/states.csv`.*

## 1. State table: the census

The states are what the code and the schemas **can** emit, not what today's data holds: the schema enums, the code
paths that return a value, the sentinels (`null`, 0). One state per thing a consumer must treat differently; two
cases that every consumer treats alike are one state. Counts are what occurs on 27 Oct 2026 (174 festivals to come),
for scale only.

| Data point | States | Produced by (the contract) |
|---|---|---|
| **page read**, each logged attempt | `read`, `refused`, `layout_broken` | `tickets.attempt` (its three returns) |
| **sales**, a festival with no readable link | `shop`, `not_yet`, `offline`, `closed`, `none_found` *(new: searched, nothing)* | `tickets.py page --state` |
| **ticket**, each row of a read page | `in_tier`, `skipped`, `unread` | `read.json` keys; `unread_keys` |
| **skip reason** *(new)*, each skipped ticket | `room`, `class`, `competition`, `merchandise`, `food_drink`, `excursion`, `name_change`, `deposit`, `not_public`, `other` | `read.json` `skipped[].reason` (153 skipped today: 61 class, 54 room, 9 name change, 9 merchandise…) |
| **pass kind** | `full`, `party`, `day`, `workshop`, `package`, `other` | `prices.json` / `read.json` enum |
| **pass style** | `none`, `kizomba`, `zouk`, `bachata`, `salsa`, `other` | the same enums, null as `none`; `prices.style_problems` |
| **people** | `one`, `couple`, `group`, `per_room` | `group_size` 1, 2, ≥3, null |
| **fee** | `none`, `included` | tier `fee` null / > 0 |
| **tier today** | `now`, `from`, `next`, `sold_out`, `ended` | `passes.js tierNow` (its five returns) |
| **first read** | `none`, `agreed`, `agent`, `disputed`, `stale`, `redo` | `why_first_read`, `two_model_read` |
| **prices answer** | `none`, `current`, `stale`, `failed` | `ask.due`, `ask.main` |
| **card price**, a festival to come | `full_pass`, `package`, `sold_out`, `none` | `passes.priceNow` |
| **why no price** *(new)* | `page_unread`, `not_yet`, `offline`, `closed`, `none_found`, `not_looked`, `not_in_description` | sales, waiting and the prices answer |

Today 46 festivals to come get the card's fallback `|| 'No price listed'`, which stands for `not_looked`,
`none_found` and `not_in_description` at once, by default rather than by decision.

## 2. Mapping table: one owner per meaning

`pipeline/states.csv` is the one place each state is defined and worded: `data_point, state, criterion, disposition,
wording, owner`.
- **criterion:** what makes an instance this state, in the words the producers use. The prompts' definitions of
  kinds, styles and skip reasons are generated from it, not written in `prices-vN.md`.
- **disposition**, a closed set: **card** (the card shows it), **view** (the passes view only), **note** (the card
  says why there's no price), **kept** (stored, not shown), **waits** (pending; its owner acts), **decide** (each
  instance needs a row in the exception register).
- **wording:** what a reader sees.
- **owner:** who acts when an instance is in that state.

Every surface reads that table and restates none of it:
- the pipeline's enums (`Status`, `Sales`, `Waiting`, `Skip`) and the schemas' enums, so the models' structured
  output can't emit anything else;
- the loader's SQL `CHECK`s;
- the prompts' definitions;
- `waiting.csv`'s labels;
- a `state_words` table in the site database, which replaces the site's own `NO_PRICE`, `KIND` and `STYLE` maps.

**Wording is at the data's precision.** It explains the state, never the pipeline's mechanism. States a reader
needn't tell apart share their wording but stay distinct in the type and in their owner.

| Data point · state | Disposition | Wording | Owner |
|---|---|---|---|
| why no price · `not_looked`, `none_found`, `not_in_description` | note | No price published | agent (find the page) · agent (after the next scrape) · organiser |
| why no price · `page_unread` | note | Prices on the ticket page ↗ | agent: write the recipe |
| why no price · `not_yet` | note | Tickets not on sale yet | organiser; re-checked monthly |
| why no price · `offline` | note | Tickets by message or form, no price online | nobody |
| why no price · `closed` | note | Ticket sales closed | nobody |
| page read · `layout_broken`, `refused` | waits | (the last prices stay) | agent: fix the recipe · `retry` |
| ticket · `unread` | waits | The ticket page has more tickets than shown here | the next run's first read |
| first read · `disputed` | waits | (the last agreed prices stay, else the description's) | agent: settle it |
| first read · `stale`, prices answer · `stale` | kept, out of the database | — | the next run |
| skip reason · each but `other` | kept | — | first read |
| skip reason · `other` | **decide** | — | agent: a register row |
| pass kind · each | view | Full pass · Party pass · Day pass · Workshop pass · Package · *the pass's own name* | — |
| pass style · each but `none` | view | Kizomba · Zouk · Bachata · Salsa · Other style | — |
| tier today · `sold_out` / `ended` | view / kept | sold out / — | — |
| card price · `full_pass` / `package` / `sold_out` | card | 1 670 kr full pass · 1 670 kr package with hotel · Full passes sold out | — |

The file holds every state of §1. The table above shows each kind of row once.

**Exhaustive by construction.** `states.csv` is the source of the enums, not a copy of them:
- a state exists only as a row, and the row's schema requires its criterion, disposition, wording and owner, so a
  state can't exist unworded;
- the generated artefacts (enums, schema enums, `CHECK`s, prompt definitions, `state_words`) are committed, and a
  test regenerates them and fails on any difference;
- the site's lookup has no fallback: a state without words throws, and the site test loads every state in the
  database through it.

## 3. Exception register: dispositions as data, keyed by identity

`pipeline/exceptions.csv`: `data_point, identity, override, rationale, decided_by, decided_on, fingerprint`. Each
row is keyed by a stable identity:
- a festival's id;
- a ticket's id and the site's ticket key;
- a page's address.

The fingerprint is what the decision was made on: the read's `rows_at`, a hash of the description, or the page. It
is separate from the per-state mapping: a row overrides one instance, never a state. Rows from decisions already made:

| Identity | Override | Rationale | Decided |
|---|---|---|---|
| sales · 19064 (tikello.com) | `page_unread`, no recipe | the page shows prices in the visitor's currency, changing between loads | agent, 27 Oct |
| sales · the 12 HelloAsso and Ticket Tailor pages | `page_unread`, no recipe | a bot check, not bypassed | user, 26 Oct |
| sales · 17491 (kizomba.lt) | `page_unread`, no recipe | no ticket ids on the page | agent, 26 Oct |
| sales · 19083 (sarajevosalsa.com) | `page_unread`, no recipe | prices are images | agent, 27 Oct |
| first read · 17476, early-bird pass | style `none` | its name names no style; sold out | agent, 27 Oct |
| first read · 17493, Kizomba Pass | style `kizomba` | its genres include kompa: two styles | agent, 27 Oct |
| skip reason `other` · Donation, Helping Hand, a camping spot, an energy surcharge | `other` | a cost that is no pass and none of the named reasons | agent, 27 Oct |
| ticket · 18362, "Guest Dancer" and "Business Pass" at 9.999 € | skip `not_public` | placeholders, not for sale | agent, 27 Oct |

## 4. Audit rule: what fails the build

`python3 -m pipeline.audit` runs first in **Rebuild site database** and in **Tests**. It ends with a report such as
*"0 unmapped, 0 undecided, 0 stale"*, and exits 1 naming each instance when one of these isn't 0:

1. **Unmapped:** a value in a log, a read, an answer, `pages.csv` or the source database that isn't a state of its
   data point in `states.csv`. It is named as *data point, state, produced by: add a row to pipeline/states.csv*.
   With the enums generated from the table, this catches what bypasses them: old files, and hand edits.
2. **Undecided:** an instance in a **decide** state with no row in `exceptions.csv`.
3. **Stale:** a register row whose identity no longer exists, whose fingerprint no longer matches, or whose instance
   now has the default anyway; or a state no producer can emit any more.

**Waits** states don't fail it. They have an owner, `waiting.csv` lists them, and the site words them, so a dispute
or a broken recipe never stops the site from updating.

## Decisions you can override

- **One file for both tables,** so a new state is one row; the cost is a wide CSV.
- **The prompts' definitions are generated from the criterion column,** so the next prompt version is a table edit
  plus a version bump.
- **Skip reasons get typed,** which is a schema and prompt change (first-read-v5) and so a full re-read, about $5.
- **`none_found` becomes a sales state:** the 20 festivals searched without result are recorded, not left untouched.
- **Three no-price states share "No price published":** a reader can't act on the difference; their owners can.
