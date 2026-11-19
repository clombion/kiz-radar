# Which pass each ticket on a festival's ticket page is

This replaces the input and answer formats above; the rules for passes, kinds, people, dates and what is no pass
stay as written there.

The input is one festival: `{"event_id", "title", "start_date", "end_date", "country", "styles", "description", "tickets":
[{"key", "name", "price", "sold_out"}]}`, where `tickets` are the rows of its ticket page, each with the site's own
`key`. The page's prices are what a buyer pays, so the amounts come from the tickets, never from the description;
the description adds what the tickets don't say, such as the dates a price applies.

Answer with one object: `{"passes": [...], "skipped": [...], "rule_quotes": [...]}`.

- `passes`: as above, each with its `kind`, `style`, `label_quote`, `group_size`, `days` and `includes_hotel`, except
  each tier names its tickets instead of giving a price:
  - `keys`: the keys of the tickets sold at this price for this pass: leader and follower (or man and woman)
    tickets at one price are one tier with both keys, and so are a couple and a duo ticket at one price. Put first
    the ticket whose name says the most.
  - `from`, `until`, `quantity`: as above, read from the ticket's name or from the description. A page sells online
    what is on sale, so a tier has no `door` and no `current`. The page sold every ticket that isn't sold out on the
    day it was read, so no such ticket's `until` is before that day.
  - `date_quote`: when `from`, `until` or `quantity` is set, the words that say so, copied exactly from the
    description or from the ticket's name; else null.
  - The tiers of a pass are in the order the page lists them.
- `skipped`: each ticket that is no pass, as `{"key", "reason"}`, its reason one of those above. A ticket named a
  bootcamp is skipped only as a `deposit`. Every ticket is in exactly one tier or in `skipped`; a ticket that is
  neither a pass nor one of those reasons can't be read here.
- `rule_quotes`: as above, copied from the description only.
