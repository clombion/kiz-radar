# Notes for agents working on Kiz Radar

- The README explains the data flow, the Actions and the files; read it before changing the pipeline.
- To read a web page that a plain request can't (a browser check such as Vercel's Security Checkpoint) but a person
  can open in any browser, for a one-off check: `uv run pipeline/read_page.py URL [--screenshot page.png]`. One page
  per question; never in a scheduled job or a loop.
- Prices read from a festival's ticket page go in `pipeline/pass_prices.csv` (see the README, "Prices from ticket
  pages"), then `python3 -I pipeline/extract/load_extract.py`, `uv run pipeline/extract/resolve_artists.py` and
  `python3 pipeline/build_site_db.py` on the newest `source/*.sqlite`.
