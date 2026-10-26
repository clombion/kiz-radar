# Notes for agents working on Kiz Radar

- The README explains the data flow, the Actions and the files; read it before changing the pipeline. Steps run
  as modules from the repository's root, each with its dependency group (README, "Running the steps").
- Prices from a festival's ticket page: never edit `pipeline/pass_prices.csv`, `pipeline/ticket_pages.csv` or
  `pipeline/tickets/log/` by hand. Go through `pipeline/tickets.py`, one festival at a time:
  1. `uv run --group tickets -m pipeline.tickets todo` lists what needs doing. A link ending in `…` was cut short by
     kizomba-world; find the real ticket page (the festival's site, a search), or skip the festival.
  2. `uv run --group tickets -m pipeline.tickets read ID [--url URL]` reads the page by its site's recipe and prints
     its tickets. When it says there is no recipe for the site, write `pipeline/tickets/sites/<site>.json` following
     `pipeline/tickets/schemas/site.json` (look at the page with `uv run --group browser -m pipeline.read_page URL`,
     and at its HTML), and read again. When it says `layout_broken`, the recipe no longer fits the page: fix the
     recipe. When it says `refused`, `uv run --group tickets -m pipeline.tickets retry ID` reads it with a visible
     browser.
  3. `uv run --group tickets -m pipeline.tickets draft ID`, then fill `passes`, `skipped` and `rule_quotes` in
     `pipeline/tickets/drafts/ID.json` following `pipeline/extract/prompts/prices-v2.md` and
     `pipeline/tickets/prompts/first-read-v1.md`, from the printed tickets and the draft's description. Every ticket
     goes in a tier, by its key, or in `skipped`. The same goes for a first read to do again (the description or the
     page changed, new tickets, or `pipeline/tickets/disputed/ID.json` holds two models' disagreeing reads).
  4. `uv run --group tickets -m pipeline.tickets record ID` checks the draft and, once it passes, makes it the first
     read in `pipeline/tickets/reads/ID.json`. On a failure, fix what it names and record again.
  5. `python3 -m pipeline.extract.load_extract`, `uv run --group artists -m pipeline.extract.resolve_artists` and
     `python3 -m pipeline.build_site_db` on the newest `source/*.sqlite`, then commit `pipeline/tickets/`,
     `pipeline/pass_prices.csv` and `pipeline/ticket_pages.csv` with them.
- To read any other web page a plain request can't, for a one-off check:
  `uv run --group browser -m pipeline.read_page URL [--visible] [--screenshot page.png]`. One page per question;
  never in a scheduled job or a loop.
