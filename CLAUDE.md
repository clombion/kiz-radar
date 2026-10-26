# Notes for agents working on Kiz Radar

- The README explains the data flow, the Actions and the files; read it before changing the pipeline.
- Prices from a festival's ticket page: never edit `pipeline/pass_prices.csv` by hand. Go through
  `pipeline/tickets.py`, one festival at a time:
  1. `uv run pipeline/tickets.py todo` lists festivals to check and their ticket links. A link ending in `…` was cut
     short by kizomba-world; find the real ticket page (the festival's site, a search), or skip the festival.
  2. `uv run pipeline/tickets.py read ID [--url URL]`; if the page refuses the read (a browser check), add `--visible`.
  3. `uv run pipeline/tickets.py scaffold ID`, then fill `pipeline/tickets/work/answers/ID.json` following
     `pipeline/extract/prompts/prices-v2.md`, with the saved page text (`pipeline/tickets/work/pages/ID.json`) as the
     description. Quotes are copied from that text exactly; the amount is what a buyer pays.
  4. `uv run pipeline/tickets.py record ID`. On a failure, fix what it names and record again.
  5. `python3 -I pipeline/extract/load_extract.py`, `uv run pipeline/extract/resolve_artists.py` and
     `python3 pipeline/build_site_db.py` on the newest `source/*.sqlite`, then commit `pipeline/pass_prices.csv` with them.
- To read any other web page a plain request can't, for a one-off check: `uv run pipeline/read_page.py URL
  [--visible] [--screenshot page.png]`. One page per question; never in a scheduled job or a loop.
