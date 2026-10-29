# Notes for agents working on Kiz Radar

- The README explains the data flow, the Actions and the files; read it before changing the pipeline. Each step is a
  task of `tasks.toml`, run as `mise run <step> -- <its arguments>` (README, "Running the steps").
- Prices from a festival's ticket page: never edit `pipeline/tickets/pages.csv` or `pipeline/tickets/log/` by hand. Go
  through `pipeline/tickets.py`, one festival at a time:
  1. `mise run tickets -- todo` lists what needs doing, and what each festival waits for (`pipeline/tickets/status.csv`
     holds it for every festival). A festival waiting for its page has a link kizomba-world cut short (ending in `…`),
     or links to no ticket shop (its own site, say): find the real ticket page (the festival's site, a search) and
     record it with `mise run tickets -- page ID URL --note "how"`; when it sells none online, record why with
     `page ID --state not_yet|offline|closed --note "the words that say so"` (sales not open yet; by message, e-mail,
     form or bank transfer; closed or suspended), and when a search found no page,
     `page ID --state none_found --note "what was searched"` (it holds until the festival's links change).
  2. `mise run tickets -- read ID [--url URL]` reads the page by its site's recipe and prints its tickets. When it says
     there is no recipe for the site, write `pipeline/tickets/sites/<site>.json` following its record (`PageRecipe` or
     `ApiRecipe` in `pipeline/records.py`; look at the page with `mise run read-page -- URL`, and at its HTML), and read
     again. When it says `layout_broken`, the recipe no longer fits the page: fix the recipe. When it says `refused`,
     `mise run tickets -- retry ID` reads it with a visible browser.
  3. `mise run tickets -- draft ID`, then fill `passes`, `skipped` and `rule_quotes` in
     `pipeline/tickets/drafts/ID.json` following `pipeline/tickets/drafts/ID.prompt.md`, the prompt the models answer
     with the festival and its tickets. Every ticket goes in a tier, by its key, or in `skipped` with its reason, one of
     the skip reasons of `pipeline/states.py`; a ticket that is no pass and no reason fits is a new state: ask before
     adding a row. The same goes for a first read to do again (the description or the page changed, new tickets, or
     `pipeline/tickets/disputed/ID.json` holds the models' reads, no two of which agreed).
  4. `mise run tickets -- record ID` checks the draft and, once it passes, makes it the first read in
     `pipeline/tickets/reads/ID.json`, with the prompt it followed archived in `pipeline/prompts/asked/`. On a failure,
     fix what it names and record again.
  5. `mise run load` and `mise run resolve`, then commit the export (`mise run export` names it) with
     `pipeline/tickets/` (with its `status.csv`) and `pipeline/prompts/asked/`. The site's database is built from them,
     never committed: `mise run build:data` builds it to look at locally, and Publish for the site.
- Every state a data point can be in is one row of `pipeline/states.py`, with its words on the site: the enums (and
  through them the records and their schemas), the prompts' definitions, the SQL checks and `site/states.ts` are built
  from it, so a new state is one new row there and nowhere else (then `mise run generate`). `mise run audit` names any
  value in the data its record refuses (one that is no state, say), and any site claim that departs from nothing any
  more.
- A fact no step derives (two artists are one, an artist's home country, the artist a line-up means, what a ticket
  site's festivals wait for) is a claim (`pipeline/claims.py`, README "Claims"). The admin's are the files of the
  `claims/` submodule, each named by its digest: never edit one; write a new one (`claims.write`), which comes first by
  being later, and commit it in the claims repository.
- A prompt is known by the hash of its text and its record's schema (`pipeline/prompt.py`), so editing a template, a
  state's criterion or a record re-asks everything that prompt answered. After pushing such a change, start the
  **Refresh events** Action at once: answers and first reads to another prompt stay out of the database until asked
  again. Its `festivals` input asks and reads only the festivals named, without the scrape (README, "Line-ups,
  highlights…").
- To read any other web page a plain request can't, for a one-off check:
  `mise run read-page -- URL [--visible] [--screenshot page.png]`. One page per question; never in a scheduled job or a
  loop.
