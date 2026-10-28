# States: a closed world

A data point's possible states are a closed type that the pipeline produces; every consumer of those states is a total
mapping from that type, owned in one place, and an unmapped state is a build failure, not a fallback.

The test: *if the pipeline starts emitting a new state tomorrow, the build fails naming the state, its data point and
its producer, and the words go in one new row of `pipeline/states.py`.*

A failure *by construction* means one from the type checker, at import, when a value is written or read, or in Tests:

- every enum the code uses is built from the rows (`pipeline/enums.py`, which Tests and `mise run generate:check` hold
  to them), so basedpyright (`mise run check`) refuses a state name the table doesn't have;
- when `states.py` is imported, a row with a missing or wrong-typed field, a state of no point, two states with one key,
  a note or a filter without words, a waiting state without an owner, or an `under` naming no state fails;
- the records (`pipeline/records.py`) and SQL checks are built from the rows, so a value outside them is refused when it
  is written or read;
- Tests scan the site's code for state words or browser-made keys the table doesn't have;
- every function that chooses between states has a test reaching each of them.

## 1. State table: the census

`pipeline/states.py` holds one typed `Point` per data point (what one instance is, and what produces its states) and one
typed `State` row per state: `point, key, criterion, disposition, wording, owner, made_by, icon, link, under, forms`.
The states are what the code and the records **can** emit (their enums, their return sites, their sentinels), one per
thing a consumer must treat differently.

<!-- generated from pipeline/states.py (states.points_table): mise run generate -->

| Data point | States | Produced by |
| -- | -- | -- |
| **page_read**, each logged attempt to read a ticket page | `read`, `refused`, `layout_broken` | tickets.attempt |
| **sales**, a festival with no full link to its ticket page, as an agent found it (tickets/pages.csv) | `shop`, `not_yet`, `offline`, `closed`, `none_found` | tickets.py page --state |
| **ticket**, each ticket of a read ticket page | `in_tier`, `skipped`, `unread` | the first read; tickets.unread_keys |
| **skip_reason**, each ticket a first read skips | `room`, `class`, `competition`, `merchandise`, `food_drink`, `excursion`, `fee`, `deposit`, `discount`, `donation`, `not_public`, `no_amount` | the first read |
| **pass_kind**, each pass a festival sells | `full`, `party`, `day`, `workshop`, `package`, `other` | the prices pass; the first read |
| **style**, a dance style: of a festival, by its genres, or the one a pass is limited to (null: all the festival's styles) | `kizomba`, `zouk`, `bachata`, `salsa`, `other` | prices.styles; the prices pass; the first read |
| **people**, each pass, by how many people one price is for | `one`, `couple`, `group`, `per_room` | prices.people, from group_size and kind |
| **fee**, each price tier, by its booking fee | `none`, `included` | the prices pass; the first read |
| **re_read**, a festival with a first read, by when its page is read again | `dated`, `monthly` | tickets.recheck |
| **first_read**, a festival, by whether it needs a (new) first read | `not_needed`, `none`, `awaits_answer`, `current`, `redo_prompt`, `redo_description`, `redo_page`, `redo_unread`, `disputed` | tickets.why_first_read |
| **answer**, a festival's answer of one extraction pass | `none`, `current`, `stale` | ask.answer_state |
| **waits_for**, each festival, by what its prices from its ticket page wait for | `page`, `recipe`, `recipe_fix`, `session`, `agent`, `sales_open`, `nothing` | tickets.waiting, in tickets/status.csv |
| **price**, each festival, by what its card can say of its price | `priced`, `other_passes_only`, `page_unread`, `not_yet`, `offline`, `closed`, `none_found`, `not_looked` | prices.price_state, in price_status |
| **tier_today**, a pass's price on the day it is viewed | `now`, `from`, `next`, `sold_out`, `ended` | pricing.ts tierNow |
| **card_price**, a priced festival, by what its card says on the day it is viewed | `full_pass`, `package`, `sold_out`, `ended` | pricing.ts cardPrice |
| **genre**, each dance genre a festival covers | `kizomba`, `semba`, `urbankiz`, `tarraxo`, `tarraxinha`, `douceur`, `kompa`, `zouk`, `bachata`, `salsa`, `afro`, `reggaeton`, `kuduro`, `other` | the rooms-genres pass; the genre rules; the site tags |
| **genre_rule**, a genre the rules add | `sbk`, `title` | load_extract |
| **source**, where a genre or feature row comes from | `description`, `site_tag` | load_extract |
| **pass_source**, where a festival's passes come from | `description`, `ticket_page` | load_extract |
| **room_kind**, each room a description lists | `party`, `class`, `unspecified` | the rooms-genres pass |
| **feature**, each feature of a festival | `promo_code`, `all_levels_beginners`, `taxi_dancers`, `accommodation_included`, `group_deals`, `meals_included`, `transfers_shuttle`, `pool_party`, `beach_party`, `boat_party`, `cruise`, `live_music`, `bootcamp_intensive`, `competition`, `camping`, `masterclass`, `private_classes`, `shows`, `themed_parties`, `pre_party`, `after_party`, `day_socials`, `partner_hotel`, `multiple_rooms`, `adults_only`, `all_in_one`, `workshops`, `dress_code` | the extract pass |
| **role**, each artist named in a description | `teacher`, `dj`, `performer`, `mc`, `organiser`, `media`, `crew` | the extract pass |
| **artist_kind**, each artist | `person`, `couple`, `group`, `organisation` | resolve_artists |
| **home_basis**, an artist's home country, by how it is known | `given`, `stated` | build_site_db |
| **merge_decision**, each artist merge reviewed | `merge`, `separate`, `unsure` | the merge review; pipeline/artist_merges.csv |
| **merge_reason**, each pair of artists that may be one, for the merge review | `same name, different keys`, `first words of the other`, `same partner, shortened name`, `similar spelling`, `single name, several countries`, `couples with matching names` | resolve_artists |
| **pending**, a festival waiting for its extraction passes | `new`, `description changed` | scrape |
| **listing**, each festival, by whether the site it comes from still lists it | `listed`, `gone` | scrape |
| **event_source**, the site a festival's listing comes from (source_ids) | `kizomba-world` | scrape |
| **plan**, each plan someone shares (pipeline/plans.csv) | `going` | pipeline/plans.csv |
| **fare_search**, a festival weekend's latest flight search (pipeline/fare_jobs.csv) | `priced`, `no price`, `refused` | fares.search |
| **next_change**, a pass's next price change on the day it is viewed | `door`, `dated`, `later` | pricing.ts nextChange |
| **hotel**, each pass, by whether its price includes a hotel | `included`, `none` | the prices pass; the first read |
| **model**, each Claude model the pipeline asks, which spend.PRICES prices | `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | ask; tickets; merge review |

<!-- points:end -->

**Who decides.**

- **The pipeline** decides every data point except three. `price` is total over the festivals: one with passes is
  `priced` when they include the pass a card prices (`prices.card_pass`, stored beside it as `price_status.card_pass`,
  and a check holds a festival priced exactly when it has one), else `other_passes_only`; one without is said by how it
  sells and whether its ticket page is known. A ticket page is known when it is a first read's, the shop an agent
  recorded, or a festival's first full link to a ticket shop (a site a recipe reads, or one the register names); a link
  to anything else is no ticket page, and the festival waits for its `page`.
- **The browser** decides `tier_today`, `next_change` and `card_price`, because they depend on today's date.
  `pricing.ts` takes the day as an argument and touches nothing on the page, so a test reaches each of their states, and
  `priceLine` gives the state whose words a card shows.

**Skip reasons.** They are the prompts' list of what is no pass, made explicit. There is no catch-all: a ticket that no
reason fits can't be skipped, so its read fails the checker and the festival waits for an agent, who adds a reason or
decides.

## 2. Mapping table: one owner per meaning

The same rows carry the mapping:

- **criterion:** what makes an instance this state, in the producers' words.
- **disposition:** one of **card**, **view**, **note**, **filter**, **kept** and **waits**.
  - **card:** the card shows it.
  - **view:** an opened card or the passes view shows it.
  - **note:** the card says why it shows no price.
  - **filter:** the site filters festivals by it, and shows it nowhere else.
  - **kept:** stored, not shown.
  - **waits:** pending, and its owner acts.
- **wording:** what a reader sees; `{name}` marks a value the site fills in.
- **owner:** who acts.
- **made_by:** the producer of a state that is not its point's (the build's two features).
- **icon**, **link:** how the site renders it: its icon, or a link to the ticket page or the passes view.
- **under:** the state of its point's `under` point it falls under (a genre's style).
- **forms:** the words other surfaces show for it, by name: a role's singular, the card's cost line, a next change in
  the passes view. A form the table doesn't have fails where it is asked for.

**Surfaces.** Every surface reads the rows and restates none:

- **The records** (`pipeline/records.py`) type each coded field as its enum of `pipeline/enums.py`, written from the
  table (`ENUMS`; a field a model answers holds the states the point's own producer makes), so the schema a model
  answers to, generated from its record, lists them, and a record holding a value that is no state is refused.
- **The prompts** are templates: a line `{{states:<point>}}` becomes each state's key and criterion, and a marker left
  over fails.
- **The SQL checks** are built from the table, in the source database, where every coded column has one; the site's
  database copies those rows and checks the columns of its own tables (`price_status`, `plans`,
  `artist_stats.home_basis`). They are enforced on insert, which skips only a duplicate row (`ON CONFLICT DO NOTHING`),
  never a value outside the table, and a load runs in one transaction, so a refused value leaves the database as it was.
- **The site** reads its words, forms, icons and links from `site/states.ts`, which `pipeline/generate.py` writes from
  the table next to the database, with every state's key by name (`KEY.price.PRICED`) and the links' (`LINK.PAGE`).
  `site/wording.ts` says them. The table types them: a point, a state or a form it doesn't have fails to compile, a key
  from the database is parsed into its point's type where its row is read (`site/rows.ts`), and an icon `icons.ts`
  doesn't draw fails where it is asked for. Tests scan the site's code for a state's words, a fragment of them between
  `{names}`, or a key written in quotes. The site's database has the same rows as its `states` table, for whoever reads
  the data.

**Wording** is at the data's precision: it explains the state, never the pipeline's mechanism. States a reader needn't
tell apart share their wording, but keep their own key and owner. Some rows:

| Point · state | Disposition | Wording | Owner |
| -- | -- | -- | -- |
| price · `none_found`, `not_looked` | note | No price published | agent: once its links change · agent: find the page |
| price · `other_passes_only` | note | No full pass price (a button to the passes) | — |
| price · `page_unread` | note | Prices on the ticket page ↗ (a link to it) | — (waits_for says who acts) |
| price · `not_yet` | note | Tickets not on sale yet | organiser |
| price · `offline` | note | Tickets by message or form, no price online | — |
| price · `closed` | note | Ticket sales closed | — |
| card_price · `ended` | note | Prices no longer listed | organiser |
| card_price · `sold_out` | card | Full pass sold out · Package sold out | — |
| card_price · `full_pass` (form cost) | card | Cost {sum}, without accommodation | — |
| next_change · `dated` (form then) | card | price goes up {day} (then {price} from {day}) | — |
| tier_today · `ended` (form all) | view | No passes on sale any more. | — |
| ticket · `unread` | waits | The ticket page has more tickets than shown here | the next run's first read |
| waits_for · `agent`, `recipe_fix`, `session` | waits | (the last prices stay) | agent |
| skip_reason · each | kept | — | the first read |
| pass_kind · each | view | Full pass · Party pass · Day pass · Workshop pass · Package · *the pass's own name* | — |
| style · each | view | Kizomba · Zouk · Bachata · Salsa · Other style | — |
| feature · `all_in_one` | filter | All-in-one hotel | — |

**Prompt identity.** A prompt the pipeline sends to a model is identified by the hash of everything fixed in its
request: its text sets down the system text, the schema of the record the checker holds the answer to, and that schema
as sent, each dumped with sorted keys (`pipeline/prompt.py`). A prompt lists its states' definitions in key order, so
reordering the table asks nothing again. Each answer (`answers/log.csv`) and first read records that hash, and one is
stale when its hash differs from the current one (`prompt.is_current`). So editing a template, a criterion, a record's
enum or a constraint only the checker enforces re-asks exactly what it reaches. Whatever saves an answer or a first read
saves the prompt's text under its hash in `pipeline/prompts/asked/` first, so every hash a file names has its text. An
agent making a first read follows the same text (`tickets.py draft` writes it beside the draft), so its read carries the
same hash.

The answers and reads made before prompts were known by their hash carry the hash of the files they followed, at the
commit they were made at; `pipeline/prompts/asked/README.md` lists them.

**Agreement.** Two models' reads (Opus and Sonnet, and Fable when those two don't agree) agree on what each consumer
treats differently, which the table decides:

- the same passes, tiers and skipped tickets;
- for every skip reason whose disposition is not `kept`, the same reason. No reason has another disposition today.

## 3. Exception register: dispositions as data, keyed by identity

`pipeline/exceptions.py` holds one typed `Override` per site whose festivals depart from what they would wait for by
default: `host, instead_of, then, why, decided_by, decided_on`, the two states of `waits_for`. The register is separate
from the mapping: a row overrides the instances on one site, never a state. Its sites are ticket shops, so a festival's
link to one is a known ticket page. `tickets.waiting` gives what a festival waits for by its own data
(`waits_by_default`), and an override for its page's site replaces that state when it is the one the row names.

| Identity | Override | Why |
| -- | -- | -- |
| host `www.helloasso.com`, `www.tickettailor.com`, `buytickets.at` | waits for `nothing` instead of `recipe` | a check that a visitor is human, not to be bypassed (user, 26 Oct) |
| host `www.tikello.com` | the same | prices are shown in the visitor's currency, changing between loads |
| host `kizomba.lt` | the same | no ticket ids on the page |
| host `www.sarajevosalsa.com` | the same | prices are images |

A row is stale once it departs from nothing: a recipe reads its site now, or no festival the source database lists has
its known ticket page there. Both change only with a commit (a recipe, the export), never with the date.

A `none_found` search records a hash of the festival's links in `pages.csv`. When the links change, the search no longer
holds, and the festival waits for a `page` again.

## 4. Audit rule: what fails the build

A new or unmapped state fails at the first of these that meets it:

1. **When it is written or read:** records and SQL checks are built from the table, so a log, read, answer or database
   row with a value outside the table is refused.
2. **In the type check and Tests:** basedpyright refuses a state name the code's enums don't have, the site's scans find
   one in its code, and the per-state tests of each choosing function fail.
3. **The audit:** `uv run --group tickets -m pipeline.audit` runs in **Tests** and first in **Refresh places and
   rates**. It catches what bypasses the first two, such as a hand edit of `pages.csv`, `status.csv`, `pass_prices.csv`,
   the decisions and plans, or the register. It reads every row of the shared CSVs, and the first reads and answers to
   their current prompts (one to another prompt waits to be asked again, and is not loaded), each as its record. It
   reports *"0 refused, 0 stale"*, and otherwise exits 1, naming each instance on stderr:
   - **Refused:** a value its record refuses, such as one that is no state of its point, named by file, line or place in
     it, and what the record allows.
   - **Stale:** a register row for a site a recipe now reads, or one no festival has its known ticket page on.

**Waits** states don't fail it. They have an owner, `status.csv` lists them, and the site words them, so a dispute, a
broken recipe or a ticket no reason fits never stops the site from updating.
