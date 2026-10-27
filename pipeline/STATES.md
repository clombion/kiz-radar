# States: a closed world

A data point's possible states are a closed type that the pipeline produces; every consumer of those states is a
total mapping from that type, owned in one place, and an unmapped state is a build failure, not a fallback.

The test: *if the pipeline starts emitting a new state tomorrow, the build fails naming the state, its data point and
its producer, and the words go in one new row of `pipeline/states.py`.*

## 1. State table: the census

`pipeline/states.py` holds one typed row per state: `point, key, criterion, disposition, wording, owner`. Every step
imports it, so a row missing a field fails on import, and the enums the code uses are built from its rows. The
states are what the code and the schemas **can** emit (their enums, their return sites, their sentinels), one per
thing a consumer must treat differently.

| Data point | States | Produced by |
|---|---|---|
| **page read**, each logged attempt | `read`, `refused`, `layout_broken` | `tickets.attempt` |
| **sales**, a festival with no readable link | `shop`, `not_yet`, `offline`, `closed`, `none_found` (searched, nothing) | `tickets.py page --state` |
| **ticket**, each row of a read page | `in_tier`, `skipped`, `unread` | the first read; `unread_keys` |
| **skip reason**, each skipped ticket | `room`, `class`, `competition`, `merchandise`, `food_drink`, `excursion`, `name_change`, `deposit`, `not_public`, `other` | the first read |
| **pass kind** | `full`, `party`, `day`, `workshop`, `package`, `other` | the first read; the prices answer |
| **pass style** | `none` (null in the schemas), `kizomba`, `zouk`, `bachata`, `salsa`, `other` | the same, checked against the festival's genres |
| **people** | `one`, `couple`, `group`, `per_room` | `group_size` 1, 2, 3 or more, null |
| **fee** | `none`, `included` | a tier's `fee` |
| **first read** | `not_needed` (the description has a dated full pass price), `none`, `current`, `redo_description`, `redo_prompt`, `redo_page`, `redo_unread`, `disputed` | `why_first_read`, `two_model_read` |
| **re-read**, a festival with a first read | `dated`, `monthly` | `tickets.recheck` |
| **prices answer** | `none`, `current`, `stale`, `failed` | `ask.due`, `ask.main` |
| **waits for**, each festival to come | `page`, `recipe`, `recipe_fix`, `session`, `agent`, `sales_open`, `nothing` | `tickets.waiting`, written to `tickets/status.csv` |
| **no price**, why a festival to come has none | `page_unread`, `not_yet`, `offline`, `closed`, `none_found`, `not_looked` | `tickets.no_price`, written to `tickets/status.csv` |
| **tier today**, viewed on a day | `now`, `from`, `next`, `sold_out`, `ended` | `passes.js tierNow` |
| **card price** | `full_pass`, `package`, `sold_out`, `ended`, `no_price` | `passes.js priceNow` |
| **genre**, **feature**, **role** | the 14 genres, 26 features and 7 roles that were `vocab.json` | the extraction passes |

`tier today` and `card price` are decided in the browser, because they depend on today's date. Every other data point
is decided in the pipeline.

## 2. Mapping table: one owner per meaning

The same rows carry the mapping:
- **criterion:** what makes an instance this state, in the producers' words.
- **disposition:** one of **card**, **view**, **note**, **kept**, **waits**, **decide**.
  - **card:** the card shows it.
  - **view:** the passes view shows it.
  - **note:** the card says why there's no price.
  - **kept:** stored, not shown.
  - **waits:** pending, and its owner acts.
  - **decide:** each instance needs a row in the exception register.
- **wording:** what a reader sees.
- **owner:** who acts.

Every surface reads them and restates none:
- **the schemas:** their enums are filled in from the table when they are loaded;
- **the prompts:** their lists of definitions are filled in the same way;
- **the loader's SQL checks;**
- **`docs/js/states.js`:** generated, it holds the site's state keys and wording;
- **the site database's state table,** for the SQL page.

**Wording is at the data's precision:** it explains the state, never the pipeline's mechanism. States a reader
needn't tell apart share their wording but keep their own key and owner. Some rows:

| Point · state | Disposition | Wording | Owner |
|---|---|---|---|
| no price · `none_found`, `not_looked` | note | No price published | agent: after the next scrape · agent: find the page |
| no price · `page_unread` | note | Prices on the ticket page ↗ | agent: write the recipe |
| no price · `not_yet` | note | Tickets not on sale yet | organiser |
| no price · `offline` | note | Tickets by message or form, no price online | nobody |
| no price · `closed` | note | Ticket sales closed | nobody |
| card price · `ended` | note | Prices no longer listed | organiser |
| waits for · `agent`, `recipe_fix`, `session` | waits | (the last prices stay) | agent |
| skip reason · each but `other` | kept | — | the first read |
| skip reason · `other` | decide | — | agent: a register row |
| pass kind · each | view | Full pass · Party pass · Day pass · Workshop pass · Package · *the pass's own name* | — |
| pass style · each but `none` | view | Kizomba · Zouk · Bachata · Salsa · Other style | — |

**A prompt the pipeline sends to a model is identified by its text.** Each answer and first read records the hash of the exact text it was asked
with, and an answer is stale when that hash differs from the current text's. Every text is saved under its hash
in `pipeline/prompts/asked/` the first time it is used, so what each answer was asked stays on record.

## 3. Exception register: dispositions as data, keyed by identity

`pipeline/exceptions.py` holds one typed row per instance that departs from its state's default: `point, identity,
override, rationale, decided_by, decided_on, fingerprint`.

The identity is stable: a festival's id, a festival id with a ticket key, or a page address. The fingerprint is what
the decision rests on:
- for a ticket or a first read, the read's `rows_at`;
- for a page, its address and the absence of a recipe for its host.

The register is separate from the mapping: a row overrides one instance, never a state. Its rows today:

| Identity | Override | Rationale |
|---|---|---|
| page `https://www.tikello.com/event/j977aebx7rp8q2xwhz00tna6qn85f8gx` (19064) | waits for `nothing` instead of `recipe` | prices are shown in the visitor's currency, changing between loads |
| each HelloAsso and Ticket Tailor page, one row per address | the same | a bot check, not bypassed (user, 26 Oct) |
| page `https://kizomba.lt/` (17491) | the same | no ticket ids on the page |
| page `https://www.sarajevosalsa.com/register` (19083) | the same | prices are images |
| each ticket skipped as `other`, by festival and ticket key | reason `other` | what it is (a donation, a helper's ticket, a camping spot) |

## 4. Audit rule: what fails the build

`python3 -m pipeline.audit` runs in **Tests** and first in **Rebuild site database**. It reports *"0 unmapped, 0
undecided, 0 stale"*, and otherwise exits 1, naming each instance:

1. **Unmapped:** a value in a log, a read, an answer, `pages.csv`, `status.csv`, the register or the source database
   that is no state of its data point. It is named as *data point, value, file: add a row to pipeline/states.py*.
2. **Undecided:** an instance in a **decide** state with no register row.
3. **Stale:** a register row whose identity is gone, whose fingerprint no longer matches, or whose instance now has
   its state's default anyway.

**Waits** states don't fail it. They have an owner, `status.csv` lists them, and the site words them, so a dispute or
a broken recipe never stops the site from updating.
