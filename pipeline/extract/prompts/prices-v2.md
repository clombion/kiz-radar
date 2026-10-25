# prices-v2: pass prices from kizomba-world event descriptions

You read a dance-festival event description (kizomba / semba / urbankiz scene; any language, often full of
emoji) and record the passes it sells and their prices, tier by tier. Work literally: copy quotes exactly,
never invent a price, a date or a pass. When the description gives no prices, answer with no passes.

The input is `{"batch", "events": [{"event_id", "title", "start_date", "end_date", "country", "description"}]}`.
Answer with one object: `{"batch": "<batch>", "prompt_version": "prices-v2", "events": [...]}`, one entry
per input event: `{"event_id", "passes": [...], "rule_quotes": [...]}`.

## passes

One entry per pass the festival sells, with its price tiers:

- `kind`, decided by what the pass includes, never by its name ("Dance Pass", "Unique Pass", "Believer Pass"
  mean different things at different festivals):
  - `full`: all the festival's workshops and all its parties, for the whole festival. An early-bird, blind or
    VIP-free "full pass" is still `full`; so is a "full pass" with a few small extras (a welcome drink).
  - `party`: the parties or socials only, for the whole festival, no workshops.
  - `day`: one day or one night only (workshops, parties, or both).
  - `workshop`: workshops only, no parties.
  - `package`: a pass sold together with a hotel room, meals, transfers or excursions, as one price.
  - `other`: anything else that is sold as a pass: VIP or masterclass passes that add classes to the full pass,
    bootcamps, passes that cover two festivals, passes priced by the buyer's country.

  A price that is the festival's only pass ("EARLY BIRD £65", "Tickets: 80€"), with nothing saying it is for the
  parties only or for one day, is `full`.
- `label_quote`: the pass's name or heading exactly as written ("FULL PASS COUPLES", "🎫 TICKET INFO"), when the
  price lines don't name the pass themselves; else null. Prices are often listed under a heading a few lines
  above them: the label is that heading.
- `group_size`: how many people one price buys a pass for: 1 unless the description says the price is for
  more people (a pass is for one person, and so are leader, follower, man and woman passes), 2 for a couple
  pass, 3 for "FULL PASS FRIENDS (3)", and so on. Null only for a package priced per room without saying for
  how many people.
- `days`: the number of days the pass covers when the description says so ("3-Day Full Pass" is 3), else null.
- `includes_hotel`: true when the price includes accommodation.
- `tiers`: the pass's prices in the order the description lists them. Each tier:
  - `amount`: the price as a number (`1.800` written as a thousands separator is 1800; `8,50` is 8.5).
  - `currency`: the ISO 4217 code: EUR for €/euro, GBP for £, CHF, CZK for Kč, PLN for zł, HUF for Ft, RON for
    lei. For "kr" and "$", use the festival's country: NOK in Norway, SEK in Sweden, DKK in Denmark, USD in the
    United States, CAD in Canada, AUD in Australia.
  - `alt_amount`, `alt_currency`: the same price in a second currency when the line gives one
    ("95€ OR 2375CZK"); else null.
  - `from`, `until`: the first and last day the tier's price applies, when the description says so, as
    `YYYY-MM-DD`, or `MM-DD` when the description gives no year (never guess the year). "Until 15 June" is
    `until` 06-15; "from 1 September" is `from` 09-01; "1.10–30.11" gives both; "until end of January" is
    `until` 01-31. Else null. A date that says only when sales open, or a deadline written as a number of
    tickets, is not a `from` or `until`.
  - `quantity`: the number of tickets at this price when limited ("first 50", "10 tickets"), else null.
  - `door`: true for the price at the door or on site.
  - `sold_out`: true when the description marks this tier sold out, gone or closed (or strikes it through).
  - `current`: true when the description calls this the current or actual price, without dates.
  - `quote`: the line that gives this price, copied exactly, as one contiguous span that contains the amount.

Leader and follower (or man and woman) passes at the same price are one pass with `group_size` 1; at
different prices they are separate passes, each with its own `label_quote`. Price lists repeated in two
languages are recorded once. When a pass is sold in several lengths (3-day and 4-day), each length is its
own pass.

Leave out: hotel rooms sold apart from a pass, deposits, instalments, booking or admin fees, name-change fees,
discounts (for groups, students, members or a promo code) that are not a price of their own, competition
entries, shuttles, meals sold on their own, and prices of single workshops or private lessons. A price with no
amount ("€…", "TBA") is left out.

## rule_quotes

The description's own words for price rules the tiers can't hold, each copied exactly as one contiguous span:
"Every month the price will increase by €10", "+ £3 admin fee", "Prices rise after the first 100 tickets".
Usually none, so an empty list. Never your own remarks about the prices or the description.
