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

## 1. The census

`pipeline/states.py` holds one typed `Point` per data point (what one instance is, and what produces its states) and one
typed `State` row per state: `point, key, criterion, disposition, wording, owner, made_by, icon, link, under, forms`.
The states are what the code and the records **can** emit (their enums, their return sites, their sentinels), one per
thing a consumer must treat differently.

Every point and state today is in the [States table](../reference/states.md).

**Who decides.**

- **The pipeline** decides every data point except three. `price` is total over the festivals: one with passes is
  `priced` when they include the pass a card prices (`prices.card_pass`, stored beside it as `price_status.card_pass`,
  and a check holds a festival priced exactly when it has one), else `other_passes_only`; one without is said by how it
  sells and whether its ticket page is known. A ticket page is known when it is a first read's, the shop an agent
  recorded, or a festival's first full link to a ticket shop (a site a recipe reads, or one a site claim names); a link
  to anything else is no ticket page, and the festival waits for its `page`.
- **The browser** decides `tier_today`, `next_change` and `card_price`, because they depend on today's date.
  `pricing.ts` takes the day as an argument and touches nothing on the page, so a test reaches each of their states, and
  `priceLine` gives the state whose words a card shows.

**Skip reasons.** They are the prompts' list of what is no pass, made explicit. There is no catch-all: a ticket that no
reason fits can't be skipped, so its read fails the checker and the festival waits for an agent, who adds a reason or
decides.

## 2. Mapping: one owner per meaning

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
tell apart share their wording, but keep their own key and owner. Every state's wording is in the
[States table](../reference/states.md).

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

## 3. Site claims: dispositions as data, keyed by identity

A site claim (`pipeline/claims.py`, `field: site`) says that every festival whose ticket page is on one site departs
from what it would wait for by default: `host, instead_of, then, made_at, note`, the two states of `waits_for`. It is
separate from the mapping: a claim overrides the instances on one site, never a state. Its sites are ticket shops, so a
festival's link to one is a known ticket page. `tickets.waiting` gives what a festival waits for by its own data
(`waits_by_default`), and the claim for its page's site replaces that state when it is the one the claim names. The
admin's site claims are files of the `claims/` submodule; today they are sites behind a check that a visitor is human
(not to be bypassed), sites whose prices change with the visitor's currency or are images, and a site with no ticket ids
on its page, each waiting for `nothing` instead of `recipe`.

A site claim is stale once it departs from nothing: a recipe reads its site now, or no festival the source database
lists has its known ticket page there. Both change only with a commit (a recipe, the export), never with the date.

A `none_found` search records a hash of the festival's links in `pages.csv`. When the links change, the search no longer
holds, and the festival waits for a `page` again.

## 4. Audit rule: what fails the build

A new or unmapped state fails at the first of these that meets it:

1. **When it is written or read:** records and SQL checks are built from the table, so a log, read, answer or database
   row with a value outside the table is refused.
2. **In the type check and Tests:** basedpyright refuses a state name the code's enums don't have, the site's scans find
   one in its code, and the per-state tests of each choosing function fail.
3. **The audit:** `mise run audit` runs in **Tests** and first in **Refresh places and rates**. It catches what bypasses
   the first two, such as a hand edit of `pages.csv`, `status.csv`, the decisions and plans, or a claim. It reads every
   row of the shared CSVs, and the first reads and answers to their current prompts (one to another prompt waits to be
   asked again, and is not loaded), each as its record. It reports *"0 refused, 0 stale"*, and otherwise exits 1, naming
   each instance on stderr:
   - **Refused:** a value its record refuses, such as one that is no state of its point, named by file, line or place in
     it, and what the record allows.
   - **Stale:** a site claim for a site a recipe now reads, or one no festival has its known ticket page on.

**Waits** states don't fail it. They have an owner, `status.csv` lists them, and the site words them, so a dispute, a
broken recipe or a ticket no reason fits never stops the site from updating.
