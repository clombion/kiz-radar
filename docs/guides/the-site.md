# The site

What a visitor sees, and what decides it. The site is `public/`, published to GitHub Pages by **Publish site** whenever
`main` changes; its code is `site/` (TypeScript), compiled into `public/js/`, and the libraries it loads are copied into
`public/vendor/` from the packages `package.json` pins. Neither is committed. The page loads nothing from elsewhere: its
Content-Security-Policy (`public/index.html`) allows only its own files.

## The festival list

The landing page is a sentence you complete: "I want to go to a Kizomba festival in the next six months, flying from
Bergen to anywhere for a cheap price." Each underlined part is a choice; the matching festivals appear below as cards,
30 at a time. Once the sentence scrolls away, a bar under the header keeps the time and price choices in view, with the
rest under Filters. The choices live in the address, so a view can be bookmarked or shared; an address asking for a
choice the page doesn't have (an old link's `reach=150`, say) says so at the top, and the page shows its defaults for
it.

The price is the trip's: the full pass at today's price plus the Friday-to-Monday return flight.

| Price chosen | Shown | Sold-out passes | Unknown pass or flight price |
| -- | -- | -- | -- |
| a cheap price | trips under 3 000 kr (€300, $350) | left out | left out, unless "Include festivals with unknown prices" is ticked |
| a reasonable price | trips under 5 000 kr (€500, $550) | left out | the same |
| any price | every festival | shown, marked | shown (the checkbox isn't offered: they are in already) |

"Cheapest first" orders by the trip, then the flight. When the time and price leave nothing, the list offers to widen
just those.

A card shows the dates, the city, the styles, up to three highlights (taxi dancers, a hotel in the pass), a few names
from the line-up, and the cost: "Cost ~2 810 kr, without accommodation", then "1 500 kr full pass + ~1 310 kr flight to
Oslo, then 37 km" (the airport priced, and the distance on). Opening a card shows the full line-up, the other
highlights, the venue and the organisers. A festival in Bergen needs no flight; its card says so.

Which pass a card prices is the pipeline's choice (the per-person full pass; at a festival of several dance styles its
Kizomba full pass when it sells one; else a package with a hotel for one); its price on the day is the browser's, from
the tiers' dates. A card without a price says why: the festival sells no pass the card prices, its prices are on a
ticket page not read yet, its sales haven't opened, it sells by message or form, its sales are closed, or no price is
published. Tapping the pass opens every pass at today's price and its next change; a price is what a buyer pays, booking
fee included.

Prices show in kroner, or in euros or dollars (`?cur=eur`, `?cur=usd`, switched in the footer); amounts in other
currencies are converted with the European Central Bank's rates and marked "~".

## Exploring

The header's tabs are Festivals, Friends and Explore, whose second row holds the Map, Artists and Countries. On a touch
screen a swipe goes to the next or previous of those five; on the map a swipe counts from near the screen's sides only.

- **Map:** one bubble per city, coloured by the cheapest flight (or by well-known artists), beside the festivals in
  view. A link from Countries narrows it to a country, which Filters shows and can clear.
- **Artists:** each teacher and DJ, how often and where they are booked, and their page leading with what is coming up.
  "Next festival soonest" orders everyone, those with nothing coming last.
- **Countries:** each scene's festivals coming up, the cheapest flight there, and how international its line-ups are.

The search (the header's button, `/` or Ctrl/⌘+K) finds festivals, artists, people, cities, countries, styles and
highlights as you type, grouped by kind, accents and case aside. What has nothing coming up (a past festival, someone
with no plans ahead, a place with no festival ahead) shows only once "Include what has nothing coming up" is ticked; a
note counts what it hides. The footer links to an SQL page, which runs queries on its own copy of the database: what a
query changes there changes nothing elsewhere, until the page is reloaded.

## When something fails

A page that cannot be built says so in its place; anything else that goes wrong says so at the top of the page, with
what it was doing. A request gives up after a minute. A database of another build than the summary the page loaded (a
publish between the two) is refused with "reload the page".

## The share card and the icons

A shared link shows `public/share-card.png`, drawn from `design/share-card.html` with a map of the festivals coming up;
the icons come from `public/mark.svg`. To redraw them, run `NODE_PATH="$(npm root -g)" node design/render.cjs` (it needs
Playwright); it also makes `public/loading.svg`. The fonts, Inter and Caveat, are served from `public/fonts` under the
SIL Open Font License.
