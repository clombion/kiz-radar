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
it. Any price is `reach=any` (an empty value would be left out of the address and read as the default, a cheap price; an
older link's `reach=` still reads as any price).

The price is the trip's: the full pass at today's price plus the Friday-to-Monday return flight. A festival on now
(between its first and its last day, both included, on the visitor's day: phase `on`) is still listed. From its
weekend's Friday, when the return priced leaves (`flightBegun` in `site/fares.ts`; a festival that starts on a Thursday
can still be flown to that day), its trip is the full pass alone, for the price filter and "Cheapest first" as on its
card.

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
Oslo, then 37 km" (the airport priced, and the distance on). A festival can fly to every airport within 250 km of its
city; the card's flight is the best of their fares (`best` in `site/fares.ts`, which the trip, the price filter and the
order by price read too): the cheapest of the airports within 100 km (`FAR_KM`), the nearer at one price, unless one
farther away is cheaper by more than €40 (`WORTH_EUR`, in euros as the fares are, about the train or bus on and the
time); with no fare within 100 km, the cheapest of the others. "Flights · 3" after the flight opens them all over the
page (a dialog: Escape, × or a tap outside closes it, and the focus goes back to the button): each airport, how far it
is from the festival, its fare (or "not checked yet", "no direct flight that weekend", "direct, no price on Google", "no
price found"), its stops out and back together ("direct", "1 stop", "stops not known"), when it was last checked, and a
link to Google Flights; the card's marked "on the card". Opening a card shows the full line-up, the other highlights,
the venue and the organisers. A festival in Bergen needs no flight; its card says so. A festival on now has a small "On
now" tag before its place, as a community's trip under way has "Now"; once its weekend's flight has left, its cost
leaves the flight out: "1 240 kr full pass · already started, no flight priced".

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

A community's page (`c/<key>/` from the site's root) has no tab: its link reaches it. It is public all the same, like
everything the site shows: its members, their plans and travel are in the site's database, which anyone can read (the
SQL page), and in the repository ([Communities](plans-and-promos.md#communities)). What it shows is below
([A community's page](#a-communitys-page)).

The search (the header's button, `/` or Ctrl/⌘+K) finds festivals, artists, people, cities, countries, styles and
highlights as you type, grouped by kind, accents and case aside. What has nothing coming up (a past festival, someone
with no plans ahead, a place with no festival ahead) shows only once "Include what has nothing coming up" is ticked; a
note counts what it hides. The footer links to an SQL page, which runs queries on its own copy of the database: what a
query changes there changes nothing elsewhere, until the page is reloaded.

## A community's page

The page shows the community's name ("Norwegians in festivals"), when most of its people (members and those its manager
added) travel at once ("Most people are travelling 20–22 Nov: 5 people, to Oslo.") and, on a line of its own, where they
go next ("Next: Glasgow, this Friday"), or, while a trip is on, where they are and until when, and the trip after it
("Now: Glasgow, until Mon · Next: Oslo, on 20 Nov"), then a Share this page button, which opens the device's share sheet
or else copies the link ("Link copied", or "Copy the address bar to share" when the browser has no clipboard or refuses
it, its label back after a moment), beside a badge of who sees it: a lock, people and the number of members, which says
the usual sharing words, "Anyone with the link can see this page · 3 members", on hover and to a screen reader. Who
manages it is said with the members, at the foot of the page.

Under the head, the calendar: four months at a time, a period from today's month (November to February, then March to
June, then July to October: three make a year), named between two buttons, on its line, to the periods before and after
it ("Nov 2026 – Feb 2027"; "Previous four months" and "Next four months" to a screen reader), which draw it in place,
from today's period to the one of the last day anyone travels, each off at its end. The address keeps the period shown
(`?from=2027-03`), so a reload or a shared link shows it again; one the calendar does not step to shows today's. A month
is a small grid, two rows of two months on a phone and one row of four on a computer, light, without boxes: a row is a
week from Monday, its days placed in their columns. A festival is one highlighter stroke across the lower half of its
days' numbers, the same colour whatever the number, a swipe of its own (a little tilted, low or thick, its ink fading at
a round end, the same each time it is drawn), round at its first and last day and cut where it goes on in the week
before or after; two at once are two strokes, one under the other. A day someone travels on outside their festival's
days (they arrive the day before, or leave the day after) has a dot under it; today is ringed by hand and the days
before it greyed. At a row's end is how many go to the festivals that begin that week, said once, on the week each
begins: two festivals that begin in one week show their sum, and each its own on hover and to a screen reader. A member
with a trip travels from the day they arrive to the day they leave, anyone else (a member without one, someone added) on
the festival's own days, whatever weekdays those are; someone at two festivals at once counts once. Someone who may go
(a plan `maybe`, and not in the line-up) counts nowhere, neither in the months nor in the sentence: the days and counts
are of those going and teaching; a day's popover names them all the same, "maybe" tagged. The sentence reads the same
counts: the first day as many travel as on any, and the days after it with as many. Only a day someone travels on does
anything: each month is one stop for the keyboard, whose arrows move among those days (left, right) or a week or more
(up, down), and the day in focus, under the pointer or tapped opens a popover of its festivals, who flies in and out
that day (by time and airport, a couple as one when both share the flight: "Flying in: Cédric & Christina 14:30 PRG"),
who else is there, and where members stay. It never covers the day's month: on a computer it sits beside the month, on a
phone it is a panel under the day's row of months, moving what follows down. Escape, a tap elsewhere or on the day again
closes it, and the focus stays on the day.

Then the agenda of the period shown: its trips, those with a day in it, so every day the calendar shows has its trips
there ("Nothing planned in Mar–Jun" when it has none), a heading a month ("November · 3 trips", with the year in January
and on the first when it is not this year's), and a row a trip, soonest first. The sentence and "Next" are of every
trip, whatever period shows. A row has its days ("Fri 20 – Sun 22 Nov"), the festival and where it is (which leads to it
on the map), and who of the community goes: its members as on any card (as their couple when both go, teaching when in
the line-up), then the people added: "Christina teaching and Siân teaching · Caroline going"; someone who may go has a
"maybe" tag there, on their roster line and in its names card, and "(maybe)" in its words ("Cédric & Christina going ·
Tonje maybe"), and is still on the line of how they travel. Hovering an added name says who added them ("Added by
Cédric"). Whether someone added teaches comes from the festival's line-up and their `artist_keys`, as it does for a
member; the manager never says it, and someone teaching links to their artist page. The next trip is open; the others
open from their button, on a card under the row. An opened trip is a roster of who travels when: its days across the
top, from the first of the community to arrive (or the festival's start, when that is sooner) to the last to leave (or
its end), the festival's days marked on them, and a line for each travel (`site/roster.ts`). Someone's signature is how
they arrive (when, and at which airport), how they leave, and where they stay, night by night. A line is everyone who
arrives and leaves alike: a bar is a travel, and where they stay never splits it. A couple is one unit when its
partners' signatures are alike, else each partner is a unit; anyone else is one. A mark means one thing. A stroke of the
calendar's ink is "there": everyone going has one over the festival's days at least. Its end is hard, with its time (and
its airport, on a computer), where the time was said, and fades, with nothing written, where it was not: said nothing at
all, or only where they stay, the festival's days with both ends fading; only a flight in, a hard start and the end
fading at the festival's close (or the morning after their last night); only a day, without its time (the day Christina
flies in), the stroke from that day, its start fading, the axis reaching it. A screen reader hears "arrival not said",
"departure not said" or "arrives Fri 6 Nov, time not said". The axis is the calendar's: the festival's days in the
accent, a dot under a day only travelled on, dates not bold. A dotted underline is names behind a text: a line called by
what it is, or places counted, opens them, by place when they stay apart, while the pointer is over it and from a tap or
a key, until the next or Escape, in a small card (each place a small heading, those who said none last, each name with
its own nights, muted, when not all of its place's: "Nora · Fri–Sun"; two columns when many): on a phone a row of its
own under the line; on a computer floating by its text, below its line or above it, never over it, inside the trip's
card, or in the flow when the trip's card has no room for it; a solid underline is a link leaving the card. Muted text
is a detail or an absence. A line of three people or fewer always names its units, and with three units or fewer every
line does. Otherwise a line of more than three people is "Everyone" when it is the only line, "Everyone else" when it is
more than half of everyone, and else called by its number ("5 people"). The named lines come first, by arrival, then
departure, then first name; then those called by number, by arrival; then "Everyone else"; and those who have not said
at the very bottom. Where a line stays is written when it is one or two places ("Airbnb → Scandic Holberg" for one
person's way; "Scandic Holberg 8 · Comfort Xpress 2 · 1 not said"), beside the stroke on a computer, with no heading
over it; under the name on a phone, which writes one and counts two; and counted when more ("3 places"), the count
opening the names by place; the whole is in its title and to a screen reader. When the people of a trip stay at two
places or more, two icon buttons at the top of its card, a plane ("By travel") and a bed ("By place"), show the same
people by where they stay: a line a place, the most people first and "Not said" last, the place the line's name and its
people under it (three or fewer named, more called by number, which opens them with each one's own nights when not all
of the place's, as in the card above), and one stroke over the nights anyone stays there, from the evening of the first
to the morning after the last, its ends their weekdays; someone who moves is on each place's line for their nights
there. The card keeps the view chosen for the visit. A screen reader hears the names, and the rest in words the page
does not show: each line in and out and where its people stay, and who has not said, a line called by what it is by its
people too; by place, each place, its nights and who stays there. While a card is open its row says only how many go and
who teaches ("5 going · Cédric & Christina teaching", with "· 1 maybe" after the going when someone may go), as the card
names everyone. The festival's name opens its card on the festival's line-up and prices, its own card opened in place,
and folds them away again; the next trip's card opens on who travels, its line-up folded.

A trip is on from its first day (the first member to arrive, or the festival's start when sooner) to its last (the last
to leave, or the festival's end when later): its row has a small "Now" tag before its days and is the one open, and the
head says "Now". From the day after its last, it has ended: it leaves the agenda, the sentence and the counts at the
rows' ends, and its strokes stay in the calendar, grey as the days gone by; the calendar still starts at today's month.
With every trip ended, the page says "No trips coming up." A festival cancelled, or no longer listed, stays on the page
while members still plan it, its card's words after its place ("This festival was cancelled.", "This festival is no
longer listed."): never "Now", and out of the days most people travel; in the calendar it is greyed as an ended one.

## When something fails

A page that cannot be built says so in its place; anything else that goes wrong says so at the top of the page, with
what it was doing. A request gives up after a minute. A database of another build than the summary the page loaded (a
publish between the two) is refused with "reload the page".

## The share card and the icons

A shared link shows `public/share-card.png`, drawn from `design/share-card.html` with a map of the festivals coming up;
the icons come from `public/mark.svg`. To redraw them, run `mise run render:design` (it builds the site and its database
first, and draws with the repository's Playwright); it also makes `public/loading.svg`.

A community has one address, `…/kiz-radar/c/<key>/`, its page: `public/c/<key>/index.html`, which `mise run generate`
makes from `public/index.html` (so the two never drift apart), line for line but for the head tags it has its own of
(`HEAD_TAG` in `pipeline/generate.py`), since a static host serves a page at its path, never its hash, and chat apps
read a page without its scripts. Its `<base href="../../">` (index.html's is `./`) makes every link and file of it the
site root's, under `/kiz-radar/` on GitHub Pages as at the root of the local server, and the page's Content Security
Policy lets a `<base>` of the page's own site (`base-uri 'self'`); `site/main.ts` makes the base a full address as the
page loads. The site shows the community at this address (`routeOf` in `site/routes.ts`), its period in the query
(`?from=2027-03`), and keeps it in the address bar; the tabs and every other link go to the root's views. An older link,
`#community/<key>`, shows the page and moves the address to `c/<key>/`. Its title and `og:title` are the community's
name, its description that name in one template ("Norwegians in festivals · festival plans shared on Kiz Radar",
`COMMUNITY_SAID`), its image `public/c/<key>/share.png`, a large one, its canonical address its own; no search engine
lists it. The community page's Share button gives this address. The image is a variant of the site's share card (its
mark, fonts and colours; the site's card itself is as it was): an eyebrow ("Community", by the people icon), the
community's name over a highlighter swipe, a subtitle the same for every community ("Who's going where, and when they
fly in"), and, in place of the map, an example month as the site draws one (days before today grey, today ringed by
hand, a dot under a day only travelled on), its two trips' swipes the trails of a plane over a long weekend and of a car
(the people icon, the plane and today's ring are the site's own, `site/icons.ts`, which `design/render.cjs` takes from
the built site and gives the card; only the car is the card's); it is an example, from no data: nothing of a community
but its name is on its page or its image, so members joining and plans changing leave both as they are.
`mise run generate` makes the page from `pipeline/communities.csv`; `mise run render:design` draws the image and writes
beside it what it was drawn from, `share.json` (the name, and the digest of what draws it: `design/share-card.html`,
`design/render.cjs`, `public/mark.svg` and `site/icons.ts`, `DRAWN_FROM`). Both are committed, as the site's share card
is. The tests compare each `share.json` with the communities and those files (`stale_cards`), so a community renamed, or
the card's design changed, without drawing again fails them. A folder of `public/c/` that is no community's (one
removed, or renamed to another key) fails `mise run generate --check`, and `mise run generate` removes it. The fonts,
Inter and Caveat, are served from `public/fonts` under the SIL Open Font License.
