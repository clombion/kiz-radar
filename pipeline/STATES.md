# States: a closed world

A data point's possible states are a closed type that the pipeline produces; every consumer of those states is a
total mapping from that type, owned in one place, and an unmapped state is a build failure, not a fallback.

The test: *if the pipeline starts emitting a new state tomorrow, the build fails naming the state, its data point and
its producer, and the words go in one new row of `pipeline/states.py`.*

There is no type checker in this repository, so a failure *by construction* means one at import, or in Tests:
- when `states.py` is imported, a row with a missing or wrong-typed field, or two states with one key, fails;
- every enum the code uses is built from the rows;
- Tests scan the Python and the site's code for a state name the table doesn't have;
- every function that chooses between states has a test per state.

## 1. State table: the census

`pipeline/states.py` holds one typed row per state: `point, key, criterion, disposition, wording, owner`. The states
are what the code and the schemas **can** emit (their enums, their return sites, their sentinels), one per thing a
consumer must treat differently.

| Data point | States | Produced by |
|---|---|---|
| **page read**, each logged attempt | `read`, `refused`, `layout_broken` | `tickets.attempt` |
| **sales**, a festival with no readable link | `shop`, `not_yet`, `offline`, `closed`, `none_found` | `tickets.py page --state` |
| **ticket**, each row of a read page | `in_tier`, `skipped`, `unread` | the first read; `unread_keys` |
| **skip reason**, each skipped ticket | `room` (also camping), `class`, `competition`, `merchandise`, `food_drink`, `excursion` (also shuttles), `fee` (a name change, a surcharge), `deposit` (also instalments), `discount`, `donation`, `not_public` (guest, staff, helper), `no_amount` | the first read |
| **pass kind** | `full`, `party`, `day`, `workshop`, `package`, `other` | the first read; the prices answer |
| **pass style** | `none` (null in the schemas), `kizomba`, `zouk`, `bachata`, `salsa`, `other` | the same, checked against the festival's genres |
| **people** | `one`, `couple`, `group`, `per_room` | `group_size` 1, 2, 3 or more, null |
| **fee** | `none`, `included` | a tier's `fee` |
| **re-read**, a festival with a first read | `dated`, `monthly` | `tickets.recheck` |
| **first read** | `not_needed`, `none`, `current`, `redo_description`, `redo_prompt`, `redo_page`, `redo_unread`, `disputed` | `why_first_read`, `two_model_read` |
| **prices answer** | `none`, `current`, `stale`, `failed` | `ask.due`, `ask.main` |
| **waits for**, each festival to come | `page`, `recipe`, `recipe_fix`, `session`, `agent`, `sales_open`, `nothing` | `tickets.waiting`, in `tickets/status.csv` |
| **price**, each festival to come | `priced`, `other_passes_only`, `page_unread`, `not_yet`, `offline`, `closed`, `none_found`, `not_looked` | `tickets.price_state`, in `tickets/status.csv` |
| **tier today**, viewed on a day | `now`, `from`, `next`, `sold_out`, `ended` | `passes.js tierNow` |
| **card price**, a `priced` festival viewed on a day | `full_pass`, `package`, `sold_out`, `ended` | `passes.js priceNow` |
| **genre**, **feature**, **role** | the 14 genres, 26 features and 7 roles that were `vocab.json` | the extraction passes |

**Who decides.**
- **The pipeline** decides every data point except two, and `price` is total over the festivals to come: a festival
  with prices is `priced`, and one whose passes include none the card prices is `other_passes_only`.
- **The browser** decides `tier today` and `card price`, because they depend on today's date.

**Skip reasons.** They are the prompts' list of what to leave out, made explicit. There is no catch-all: a ticket that
no reason fits can't be skipped, so its read fails the checker and the festival waits for an agent, who adds a reason
or decides.

## 2. Mapping table: one owner per meaning

The same rows carry the mapping:
- **criterion:** what makes an instance this state, in the producers' words.
- **disposition:** one of **card**, **view**, **note**, **kept** and **waits**.
  - **card:** the card shows it.
  - **view:** the passes view shows it.
  - **note:** the card says why it shows no price.
  - **kept:** stored, not shown.
  - **waits:** pending, and its owner acts.
- **wording:** what a reader sees.
- **owner:** who acts.

**Surfaces.** Every surface reads the rows and restates none:
- **The schemas** name each enum as `$ref: "#/$defs/<point>"`. `states.schema()` fills in the `$defs`, so the files
  stay valid JSON Schema, and an unfilled reference fails validation.
- **The prompts' definitions** are filled in from the criteria.
- **The SQL checks** are built from the table.
- **The site** reads its wording, and each state's render hint (a link to the ticket page, say), from the state table
  of its database. It holds no wording of its own:
  - a pipeline state renders generically from its row;
  - only the keys the browser itself produces (`tier today`, `card price`) are in a generated `docs/js/states.js`;
  - its `total(point, map)` throws when the module loads if a map misses a state.

**Wording** is at the data's precision: it explains the state, never the pipeline's mechanism. States a reader
needn't tell apart share their wording, but keep their own key and owner. Some rows:

| Point · state | Disposition | Wording | Owner |
|---|---|---|---|
| price · `none_found`, `not_looked` | note | No price published | agent: after its links change · agent: find the page |
| price · `other_passes_only` | note | No full pass price ↗ (opens the passes) | — |
| price · `page_unread` | note | Prices on the ticket page ↗ | agent: write the recipe |
| price · `not_yet` | note | Tickets not on sale yet | organiser |
| price · `offline` | note | Tickets by message or form, no price online | nobody |
| price · `closed` | note | Ticket sales closed | nobody |
| card price · `ended` | note | Prices no longer listed | organiser |
| ticket · `unread` | waits | The ticket page has more tickets than shown here | the next run's first read |
| waits for · `agent`, `recipe_fix`, `session` | waits | (the last prices stay) | agent |
| skip reason · each | kept | — | the first read |
| pass kind · each | view | Full pass · Party pass · Day pass · Workshop pass · Package · *the pass's own name* | — |
| pass style · each but `none` | view | Kizomba · Zouk · Bachata · Salsa · Other style | — |

**Prompt identity.** A prompt the pipeline sends to a model is identified by the hash of everything fixed in its
request:
- the system text;
- each fixed part of the message;
- the schema as sent, as `json.dumps(api_schema(schema), sort_keys=True)`.

Each answer and first read records that hash, and an answer is stale when its hash differs from the current one. So
adding a state to the table re-asks exactly what the state reaches. Each request text is saved under its hash in
`pipeline/prompts/asked/` the first time it's used.

The extraction answers made by Claude Code subagents, which followed the prompt files and were never sent through
`ask.structured`, carry the hash of the file they followed; the archive says so.

**Agreement.** Two models' reads agree on what each consumer treats differently, which the table decides:
- the same passes, tiers and skipped tickets;
- for every skip reason whose disposition is not `kept`, the same reason. No reason has another disposition today.

## 3. Exception register: dispositions as data, keyed by identity

`pipeline/exceptions.py` holds one typed row per instance that departs from its state's default: `point, identity,
override, rationale, decided_by, decided_on, fingerprint`. The register is separate from the mapping: a row overrides
one instance, never a state.

| Identity | Override | Rationale | Fingerprint (stale when it no longer holds) |
|---|---|---|---|
| host `www.helloasso.com` | waits for `nothing` instead of `recipe` | a bot check, not bypassed (user, 26 Oct) | no recipe for the host, and a festival to come uses it |
| host `www.tickettailor.com`, host `buytickets.at` | the same | the same | the same |
| host `www.tikello.com` | the same | prices are shown in the visitor's currency, changing between loads | the same |
| host `kizomba.lt` | the same | no ticket ids on the page | the same |
| host `www.sarajevosalsa.com` | the same | prices are images | the same |

A `none_found` search records a hash of the festival's links in `pages.csv`. When the links change, the festival waits
for a `page` again.

## 4. Audit rule: what fails the build

A new or unmapped state fails at the first of these that meets it:
1. **When it is written:** schemas and SQL checks are built from the table, so a log, read, answer or database row with
   a value outside the table is refused.
2. **In Tests:** the scans find a state name in the code that the table doesn't have, and the per-state tests of each
   choosing function fail.
3. **The audit:** `python3 -m pipeline.audit` runs in **Tests** and first in **Rebuild site database**. It catches what
   bypasses the first two, such as a hand edit of `pages.csv`, `status.csv` or the register. It reports *"0 unmapped,
   0 stale"*, and otherwise exits 1, naming each instance:
   - **Unmapped:** a value that is no state of its data point, named as *data point, value, file: add a row to
     pipeline/states.py*.
   - **Stale:** a register row whose identity is gone, whose fingerprint no longer holds, or whose instance now has its
     state's default anyway.

**Waits** states don't fail it. They have an owner, `status.csv` lists them, and the site words them, so a dispute,
a broken recipe or a ticket no reason fits never stops the site from updating.
