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

The price is the trip's: the full pass at today's price plus the Friday-to-Monday return flight. A festival on now
(between its first and its last day, both included, on the visitor's day: phase `on`) is still listed, but its weekend's
return has begun, so its trip is the full pass alone, for the price filter and "Cheapest first" as on its card.

| Price chosen | Shown | Sold-out passes | Unknown pass or flight price |
| -- | -- | -- | -- |
| a cheap price | trips under 3 000 kr (€300, $350) | left out | left out, unless "Include festivals with unknown prices" is ticked |
| a reasonable price | trips under 5 000 kr (€500, $550) | left out | the same |
| any price | every festival | shown, marked | shown (the checkbox isn't offered: they are in already) |

"Cheapest first" orders by the trip, then the flight. When the time and price leave nothing, the list offers to widen
just those. Filters has "On now only", which keeps the festivals on today (a tag under the sentence, "On now", takes it
off again; `onnow=1` in the address); when none of the festivals the other choices keep is on today, it is off and
greyed, saying "(none on today)".

A card shows the dates, the city, the styles, up to three highlights (taxi dancers, a hotel in the pass), a few names
from the line-up, and the cost: "Cost ~2 810 kr, without accommodation", then "1 500 kr full pass + ~1 310 kr flight to
Oslo, then 37 km" (the airport priced, and the distance on). Opening a card shows the full line-up, the other
highlights, the venue and the organisers. A festival in Bergen needs no flight; its card says so. A festival on now has
a small "On now" tag before its place, as a community's trip under way has "Now", and its cost leaves the flight out: "1
240 kr full pass · already started, no flight priced".

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

- **Friends:** "Who's going where" ("All the dancers in the community with public plans."), for a visitor, who has no
  account yet: two sections. "Near Bergen" (the home airport's city, the one region for now) lists the festivals to come
  that the people living within `NEAR_KM` (200 km, `site/people.ts`) of it are going to, each naming them, and who they
  are, measured against each person's home (`homes`, from `pipeline/geocode.csv`); someone with no home in `people.csv`
  is near nowhere. An (i) after the heading ("About this list") shows, on hover, on focus or on a tap, a small card:
  "Within 200 km of Bergen." (Escape or a second tap hides it). "Rest of the world" (the people far away or with no
  home) says "Not available yet" for now. A person's page (`#friends/<key>`) is as before. The visitor's own communities
  will come at the top once there are accounts.

A community's page (`#community/<key>`) has no tab and is listed nowhere: its link alone reaches it, and it shows under
Friends ([Communities](plans-and-promos.md#communities)).

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
the icons come from `public/mark.svg`. To redraw them, run `mise run render:design` (it builds the site database first,
and draws with the repository's Playwright); it also makes `public/loading.svg`.

A community's shared link has a page of its own, `public/c/<key>/index.html` (published at `…/kiz-radar/c/<key>/`),
since a static host serves the page at its path, never its hash, and chat apps read a page without its scripts. Its
title and `og:title` are the community's name, its description that name in one template ("Norwegians in festivals ·
festival plans shared on Kiz Radar", `COMMUNITY_SAID` in `pipeline/generate.py`), its image `public/c/<key>/share.png`,
a large one; no search engine lists it, and it sends a visitor at once to `#community/<key>` (a refresh, and
`public/c/redirect.js`, which the page's Content Security Policy lets run, as nothing else). The community page's Share
button gives this link. The image is a variant of the site's share card (its mark, fonts and colours; the site's card
itself is as it was): an eyebrow ("Community", by the people icon), the community's name over a highlighter swipe, a
subtitle the same for every community ("Who's going where, and when they fly in"), and, in place of the map, an example
month as the site draws one (days before today grey, today ringed by hand, a dot under a day only travelled on), its two
trips' swipes the trails of a plane over a long weekend and of a car; it is an example, from no data: nothing of a
community but its name is on its page or its image, so members joining and plans changing leave both as they are.
`mise run generate` makes the page from `pipeline/communities.csv`; `mise run render:design` draws the image and writes
beside it what it was drawn from, `share.json` (the name, and the digest of `design/share-card.html`). Both are
committed, as the site's share card is. The tests compare each `share.json` with the communities and the site's card
(`stale_cards`), so a community renamed, or the card's design changed, without drawing again fails them. The fonts,
Inter and Caveat, are served from `public/fonts` under the SIL Open Font License.
