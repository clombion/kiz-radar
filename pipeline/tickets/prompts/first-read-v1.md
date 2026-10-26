# first-read-v1: which pass each ticket on a festival's ticket page is

This replaces the input and answer formats above; the rules for passes, kinds, people, dates and what to leave
out stay as written there.

The input is one festival: `{"event_id", "title", "start_date", "end_date", "country", "description", "tickets":
[{"key", "name", "price", "sold_out"}]}`, where `tickets` are the rows of its ticket page, each with the site's own
`key`. The page's prices are what a buyer pays, so the amounts come from the tickets, never from the description;
the description adds what the tickets don't say, such as the dates a price applies.

Answer with one object: `{"passes": [...], "skipped": [...], "rule_quotes": [...]}`.

- `passes`: as above, except each tier names its tickets instead of giving a price:
  - `keys`: the keys of the tickets sold at this price for this pass: leader and follower (or man and woman)
    tickets at one price are one tier with both keys. Put first the ticket whose name says the most.
  - `from`, `until`, `quantity`, `door`: as above, read from the ticket's name or from the description. A page
    shows what is on sale, so there is no `current`.
  - `date_quote`: when `from`, `until` or `quantity` is set, the words that say so, copied exactly from the
    description or from the ticket's name; else null.
  - The tiers of a pass are in the order the page lists them.
- `skipped`: the keys of the tickets that are no pass under the rules above (bootcamps, single workshops, shuttles,
  meals, hotel rooms sold apart). Every ticket is in exactly one tier or in `skipped`.
- `rule_quotes`: as above, copied from the description only.
