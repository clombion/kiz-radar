# Pass prices from kizomba-world event descriptions

You read a dance-festival event description (kizomba / semba / urbankiz scene; any language, often full of
emoji) and record the passes it sells and their prices, tier by tier. Work literally: copy quotes exactly,
never invent a price, a date or a pass. When the description gives no prices, answer with no passes.

The input is `{"batch", "events": [{"event_id", "title", "start_date", "end_date", "country", "styles",
"description"}]}`, where `styles` are the dance styles the festival's genres name (see `style` below).
Answer with one object: `{"batch": "<batch>", "events": [...]}`, one entry per input event:
`{"event_id", "passes": [...], "rule_quotes": [...]}`.

## passes

One entry per pass the festival sells, with its price tiers:

- `kind`, decided by what the pass includes, never by its name ("Dance Pass", "Unique Pass", "Believer Pass"
  mean different things at different festivals). For a pass of one style (see `style`), "the festival" below
  means that style's part of it: a "Kizomba Full Pass" to all the kizomba workshops and parties is `full`.
  {{states:pass_kind}}

  A single class or workshop is no pass, even when it is called a masterclass. A price that is the festival's
  only pass ("EARLY BIRD £65", "Tickets: 80€"), with nothing saying it is for the parties only or for one day, is
  `full`.
- `style`: at a festival of several dance styles (two or more in `styles`), the one style a pass is limited to, one
  of `styles`:
  {{states:style}}

  Null when the pass covers all the festival's styles, or the festival has one style only (a "Kizomba Full Pass"
  at a kizomba festival is null). Tickets for different styles are different passes, even at one price. At a
  festival of kizomba styles only, a pass for one of them (a "Kizomba Pass" beside urbankiz) has no style, and is
  `other`, not `full`.
- `label_quote`: the pass's name or heading exactly as written ("FULL PASS COUPLES", "🎫 TICKET INFO"), when the
  price lines don't name the pass themselves; else null. Prices are often listed under a heading a few lines
  above them: the label is that heading.
- `group_size`: how many people one price buys a pass for: 1 unless the description says the price is for
  more people (a pass is for one person, and so are leader, follower, man and woman passes), 2 for a couple
  pass, 3 for "FULL PASS FRIENDS (3)", and so on. Null only for a package priced per room without saying for
  how many people. Passes for two people at one price are one pass whoever the two are: a couple pass and a
  "duo" pass for two men or two leaders at the same price are one pass with `group_size` 2.
- `days`: the number of days the pass covers when the description says so ("3-Day Full Pass" is 3; a pass for
  "3 nights", "3 evenings" or "3 serate" is 3 too; a pass whose name lists its days, "Samedi + Dimanche" or
  "Friday to Sunday", covers that many), else null. A day pass is 1. Only the pass's own length counts: neither
  the festival's ("4 DAYS OF TARRAXO") nor a count of the parties a pass includes ("4 Night Parties") is its `days`.
- `includes_hotel`: true when the price includes accommodation.
- `tiers`: the pass's prices in the order the description lists them. Tiers are successive prices of one pass:
  early bird, waves, dates, or after so many tickets. Prices for different people on sale at the same time are
  different passes. Each tier:
  - `amount`: what a buyer pays in total, as a number (`1.800` written as a thousands separator is 1800; `8,50` is
    8.5): the price, plus any booking, admin or ticketing fee the line adds to it ("£85 + £3 admin fee" is 88).
  - `fee`: that fee, when the line gives one (3); else null.
  - `currency`: the ISO 4217 code: EUR for €/euro, GBP for £, CHF, CZK for Kč, PLN for zł, HUF for Ft, RON for
    lei. For "kr" and "$", use the festival's country: NOK in Norway, SEK in Sweden, DKK in Denmark, USD in the
    United States, CAD in Canada, AUD in Australia.
  - `alt`: the same price in a second currency when the line gives one, as `{"amount", "currency"}`
    ("95€ OR 2375CZK" gives `{"amount": 2375, "currency": "CZK"}`); else null.
  - `from`, `until`: the first and last day the tier's price applies, when the description says so, as
    `YYYY-MM-DD`, or `MM-DD` when the description gives no year (never guess the year). "Until 15 June" is
    `until` 06-15; "from 1 September" is `from` 09-01; "1.10–30.11" gives both; "until end of January" is
    `until` 01-31. Else null. A date that says only when sales open, or a deadline written as a number of
    tickets, is not a `from` or `until`.
  - `quantity`: the number of tickets at this price when limited ("first 50", "10 tickets", "25 EARLY BIRD
    WOMAN"), else null.
  - `door`: true for the price at the door or on site.
  - `sold_out`: true when the description marks this tier sold out, gone or closed (or strikes it through).
  - `current`: true when the description calls this the current or actual price, without dates.
  - `quote`: the line that gives this price, copied exactly, as one contiguous span that contains the amount, or
    the price and the fee when the amount adds them.

Leader and follower (or man and woman) passes at the same price are one pass with `group_size` 1; at
different prices (women 130, men 110) they are separate passes, each with its own `label_quote`, never tiers of one
pass. Price lists repeated in two languages are recorded once. When a pass is sold in several lengths (3-day and
4-day), each length is its own pass, and so is each kind of room a package is sold with (a duo room, a twin room):
tiers of a package are successive prices of the same room.

## What is no pass

Leave out what is sold but is no pass, each for one of these reasons:
{{states:skip_reason}}

A bootcamp is a pass (`other`); a deposit or advance payment on one is no pass.

## rule_quotes

The description's own words for price rules the tiers can't hold, each copied exactly as one contiguous span:
"Every month the price will increase by €10", "Prices exclude ticketing fees", "Prices rise after the first 100
tickets". A fee the tiers add to their amounts is no rule.
Usually none, so an empty list. Never your own remarks about the prices or the description.
