# Notes for agents working on Kiz Radar

- The README explains the data flow, the Actions and the files; read it before changing the pipeline. Steps run
  as modules from the repository's root, each with its dependency group (README, "Running the steps").
- Prices from a festival's ticket page: never edit `pipeline/pass_prices.csv`, `pipeline/ticket_pages.csv`,
  `pipeline/tickets/pages.csv` or `pipeline/tickets/log/` by hand. Go through `pipeline/tickets.py`, one festival at a time:
  1. `uv run --group tickets -m pipeline.tickets todo` lists what needs doing, and what each festival waits for
     (`pipeline/tickets/status.csv` holds it for every festival). A festival waiting for its page has a link
     kizomba-world cut short (ending in `…`), or links to no ticket shop (its own site, say): find the real ticket
     page (the festival's site, a search) and record it with
     `uv run --group tickets -m pipeline.tickets page ID URL --note "how"`; when it sells none online, record why with
     `page ID --state not_yet|offline|closed --note "the words that say so"` (sales not open yet; by message, e-mail,
     form or bank transfer; closed or suspended), and when a search found no page,
     `page ID --state none_found --note "what was searched"` (it holds until the festival's links change).
  2. `uv run --group tickets -m pipeline.tickets read ID [--url URL]` reads the page by its site's recipe and prints
     its tickets. When it says there is no recipe for the site, write `pipeline/tickets/sites/<site>.json` following
     `pipeline/tickets/schemas/site.json` (look at the page with `uv run --group browser -m pipeline.read_page URL`,
     and at its HTML), and read again. When it says `layout_broken`, the recipe no longer fits the page: fix the
     recipe. When it says `refused`, `uv run --group tickets -m pipeline.tickets retry ID` reads it with a visible
     browser.
  3. `uv run --group tickets -m pipeline.tickets draft ID`, then fill `passes`, `skipped` and `rule_quotes` in
     `pipeline/tickets/drafts/ID.json` following `pipeline/tickets/drafts/ID.prompt.md`, the prompt the models answer
     with the festival and its tickets. Every ticket goes in a tier, by its key, or in `skipped` with its reason, one
     of the skip reasons of `pipeline/states.py`; a ticket that is no pass and no reason fits is a new state: ask
     before adding a row. The same goes for a first read to do again (the description or the page changed, new
     tickets, or `pipeline/tickets/disputed/ID.json` holds two models' disagreeing reads).
  4. `uv run --group tickets -m pipeline.tickets record ID` checks the draft and, once it passes, makes it the first
     read in `pipeline/tickets/reads/ID.json`, with the prompt it followed archived in `pipeline/prompts/asked/`. On a
     failure, fix what it names and record again.
  5. `python3 -m pipeline.extract.load_extract`, `uv run --group artists -m pipeline.extract.resolve_artists` and
     `python3 -m pipeline.build_site_db` on the newest `source/*.sqlite`, then commit `pipeline/tickets/` (with its
     `status.csv`), `pipeline/prompts/asked/`, `pipeline/pass_prices.csv` and `pipeline/ticket_pages.csv` with them.
- Every state a data point can be in is one row of `pipeline/states.py`, with its words on the site: the enums, the
  schemas, the prompts' definitions, the SQL checks and `docs/js/states.js` are built from it, so a new state is one
  new row there and nowhere else. An instance that departs from its state's default is a row of
  `pipeline/exceptions.py`. `uv run --group tickets -m pipeline.audit` names any value in the data that is no state,
  and any override that departs from nothing any more.
- A prompt is known by the hash of its text and schemas (`pipeline/prompt.py`), so editing a template, a state's
  criterion or a schema re-asks everything that prompt answered. After pushing such a change, start the **Refresh
  events** Action at once: answers and first reads to another prompt stay out of the database until asked again. Its
  `festivals` input asks and reads only the festivals named, without the scrape (README, "Line-ups, highlights…").
- To read any other web page a plain request can't, for a one-off check:
  `uv run --group browser -m pipeline.read_page URL [--visible] [--screenshot page.png]`. One page per question;
  never in a scheduled job or a loop.
