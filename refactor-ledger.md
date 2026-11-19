# Phase 1 test ledger

Each task of Phase 1 fills in the rows of the tests it moves; task 1.9 checks it is whole. The left columns are the
browser tests at `c667c877`, as the baseline run of task 1.1 named them (each `test.for` case on its own line); the
right column says where each one went, or why it cannot be tested through the page. The node tests (142 in 14 files) do
not move, except the two of task 1.7, and are not listed.

| File | Test | Now |
| -- | -- | -- |
| `flights.browser.test.ts` | a festival can fly to every airport near it, the nearest first, and flies to the best of their fares |  |
| `flights.browser.test.ts` | Flights lists every airport with its distance, fare, stops and last check, the card’s marked, as a dialog |  |
| `flights.browser.test.ts` | an airport not searched yet says so, and with none priced the card flies nowhere |  |
| `flights.browser.test.ts` | an airport with a direct flight Google gives no price for says so, and is not taken for one with none |  |
| `flights.browser.test.ts` | a reseller’s price says so, and that it is likely cheaper from the airlines flying it |  |
| `main.browser.test.ts` | the page names every control it has before a view shows |  |
| `main.browser.test.ts` | #finder takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #friends takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #week takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #map takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #artists takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #countries takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #sources takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #sql takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | #community/frost-lantern-river-maple takes the focus as a new page and names every control |  |
| `main.browser.test.ts` | every view the page shows is tested |  |
| `main.browser.test.ts` | the footer links to the sources page, which says what the festival data covers and when it was built |  |
| `main.browser.test.ts` | the footer switches the currency: kroner shown, euros and dollars a button each |  |
| `main.browser.test.ts` | the search dialog names every control |  |
| `main.browser.test.ts` | a promise left to run on its own, or one nothing catches, is said on the page | same file and name; `done` reached through the page, a promo code's copy refused (1.2) |
| `main.browser.test.ts` | a view that throws while it builds says so in its place, and the page around it stays | `broken.browser.test.ts`, same name (1.1): its bad row planted before start |
| `map.browser.test.ts` | festivals of one city are one bubble, whatever their listings call it, and two cities two |  |
| `map.browser.test.ts` | two cities of one name in one country are two bubbles |  |
| `onnow.browser.test.ts` | a festival is on from its first day to its last, both included, and still to attend while it is |  |
| `onnow.browser.test.ts` | a festival on now has an On now tag before its place on its card, and one to come none |  |
| `onnow.browser.test.ts` | a festival’s flight has left from its weekend’s Friday, whether it is on or not |  |
| `onnow.browser.test.ts` | the cost of a festival on now leaves the flight out: its weekend’s return has begun |  |
| `onnow.browser.test.ts` | the filters keep only the festivals on today, shown as an On now tag and kept in the address |  |
| `onnow.browser.test.ts` | with no festival on today among those the other choices keep, the filter is off and says why |  |
| `page.browser.test.ts` | h() sets attributes, classes, data and listeners, and leaves out what holds nothing |  |
| `page.browser.test.ts` | h() puts text in as text, never as HTML |  |
| `page.browser.test.ts` | a drawing is put in an element as the SVG icons.ts writes |  |
| `page.browser.test.ts` | the oval sits behind the current tab, in the goo layer that reaches past the row |  |
| `page.browser.test.ts` | with no current tab, or the row hidden, there is no oval |  |
| `page.browser.test.ts` | moving to another tab, the slime reaches out an arm and a drop, which are gone once it rests |  |
| `page.browser.test.ts` | with reduced motion asked for, the oval moves at once, with no arm or drop |  |
| `page.browser.test.ts` | a move begun before the last one ends leaves the oval behind the tab it went to |  |
| `page.browser.test.ts` | a slide changes the page at once with no direction, and marks its direction while it runs |  |
| `page.browser.test.ts` | a dialog has a history entry of its own: the back button closes it, and closing it removes the entry |  |
| `page.browser.test.ts` | a class list leaves out what is false, a style object sets each property, toggle sets one class |  |
| `page.browser.test.ts` | a paged list adds the next page to the rows shown, and showing it again starts over |  |
| `page.browser.test.ts` | a select of choices gives back the picked option as the value it was built with |  |
| `page.browser.test.ts` | a card over the page is the only one open, and goes on Escape, on the focus leaving and on a tap outside |  |
| `pages.browser.test.ts` | a community’s address is its page: the site, its own title, and the address kept | stays: the built site in a frame; Phase 3 takes it as its smoke set |
| `pages.browser.test.ts` | its Share button gives its address | stays: the built site in a frame; Phase 3 takes it as its smoke set |
| `pages.browser.test.ts` | an older #community/<key> link moves to the community’s address and shows its page | stays: the built site in a frame; Phase 3 takes it as its smoke set |
| `pages.browser.test.ts` | the tabs and the brand from a community’s page go to the site’s root | stays: the built site in a frame; Phase 3 takes it as its smoke set |
| `pages.browser.test.ts` | the currency asked for stays through a choice, a tab and a community’s page | stays: the built site in a frame; Phase 3 takes it as its smoke set |
| `recipes.browser.test.ts` | a row is each match that holds no other, and a field reads the first of its css inside it | stays: it tests `pipeline/rows.js`, no site module |
| `recipes.browser.test.ts` | a field reads the row itself, an attribute, and the first group of its match, or all of it | stays: it tests `pipeline/rows.js`, no site module |
| `recipes.browser.test.ts` | up reads inside the row’s enclosing element; all joins every match; page reads the whole page | stays: it tests `pipeline/rows.js`, no site module |
| `recipes.browser.test.ts` | a css or a match names the row’s other fields and attributes, filled in and escaped | stays: it tests `pipeline/rows.js`, no site module |
| `recipes.browser.test.ts` | a regex count is no field | stays: it tests `pipeline/rows.js`, no site module |
| `review.browser.test.ts` | without a token the page is read-only: no choice, no note, no write button |  |
| `review.browser.test.ts` | a token GitHub names its owner for unlocks the choices; one it refuses leaves the page read-only |  |
| `review.browser.test.ts` | the expiry its maker entered is shown, and warned of when near |  |
| `review.browser.test.ts` | a home is written at its digest, said on its button, kept as settled, and the next open item follows |  |
| `review.browser.test.ts` | a merge is chosen and written by its keys, and its own note kept |  |
| `review.browser.test.ts` | a token refused on a write makes the page read-only, saying why |  |
| `review.browser.test.ts` | the arrow keys move between items, and the address follows |  |
| `review.browser.test.ts` | a pair is compared side by side, the row whose sides share nothing marked |  |
| `review.browser.test.ts` | two artists found by name are joined by a merge claim of their keys |  |
| `review.browser.test.ts` | the cities with no decision of the admin are listed with their festivals and proposal, and nothing to choose |  |
| `review.browser.test.ts` | a list with nothing in it says so |  |
| `updating.browser.test.ts` | mid-update the page says how long it takes and counts down to loading again |  |
| `updating.browser.test.ts` | past a quarter of an hour it no longer blames the update, nor loads again by itself |  |
| `views.browser.test.ts` | the community the tests read is the fixture alone, whatever the real rows say or the day it was built | `fixture.test.ts` (node), same name: `plantCommunity` on the built database, the same reads (1.3) |
| `views.browser.test.ts` | sql.js’s WebAssembly is asked for as every file is, with a deadline | `sources.browser.test.ts`, same name: the page's own request in `asked`, once, with a signal (1.3) |
| `views.browser.test.ts` | what the SQL page runs changes its own copy, never the database the views read | `sources.browser.test.ts`, same name: typed and run on the SQL page, its count the plant's before and 0 after; This week still shows KUOF (1.3) |
| `views.browser.test.ts` | the artist list finds a name whatever its accents and case, and what is typed is never a pattern | `artists.browser.test.ts`, same name: the list opened at `artistsHref({ q })` (1.3) |
| `views.browser.test.ts` | a community’s head says who it is, when most members travel and where next, and whom it is for | `community.browser.test.ts`, same name: the community's page opened by its older link (`COMM`) on 3, 7 and 10 November (1.3) |
| `views.browser.test.ts` | before Glasgow, it is next, its row open | `community.browser.test.ts`, same name: opened on 4 November (1.3) |
| `views.browser.test.ts` | while Glasgow is on, from its first arrival to its last departure, its row says Now and is open | `community.browser.test.ts`, same name: opened on 5, 6 and 9 November (1.3) |
| `views.browser.test.ts` | after Glasgow, it leaves the agenda, its stroke stays grey, and it is no longer counted | `community.browser.test.ts`, same name: opened on 13 and 10 November, the period read on the 10th (1.3) |
| `views.browser.test.ts` | the sentence of when most members travel leaves out a trip that has ended | `community.browser.test.ts`, same name: a community of its own planted beside the fixture's (its members, manager and added copied) with five more added to Glasgow, opened on 4 and 10 November (1.3) |
| `views.browser.test.ts` | the agenda has a heading a month and a row a trip, soonest first, naming who of the community goes | `community.browser.test.ts`, same name: HOT Ice's line-up card awaited after its name is clicked; the members read at the foot of the view's root in `<main>` (1.3) |
| `views.browser.test.ts` | the people a manager added are named on the community’s page only, never on a festival’s card elsewhere | `festivals.browser.test.ts`, same name: KUOF's card opened on the map, its “Who’s going” 2, Cédric & Christina teaching, and no Tonje, Ragnhild or Maja (the goers `festivals()` returned, read on the card) (1.3) |
| `views.browser.test.ts` | a trip’s chart is drawn the first time its row opens, not with the agenda | `community.browser.test.ts`, same name (1.3) |
| `views.browser.test.ts` | a festival cancelled or no longer listed stays on the community’s page, said so, never on now | `community.browser.test.ts`, as “a festival listed and not cancelled is on now on its days, nothing said of its state”: the listed part (KUOF on now on 21 November, nothing said of it); `community-off.browser.test.ts`, same name: KUOF planted cancelled and HOT Ice no longer listed, both read on 21 November, in place of KUOF's two states one after the other (1.3) |
| `views.browser.test.ts` | a page left open past midnight reads where each festival stands by the new day | `festivals.browser.test.ts`, same name: the Friends tab opened at 23:59 on 21 November (KUOF on now) and at 00:01 on the 23rd (no KUOF row), by `open()`'s instant, not fake timers; `freshDay()` and the `today` table are the page's own and are no longer read (1.3) |
| `views.browser.test.ts` | a link to no community says so | `community.browser.test.ts`, same name: `COMM('no-such-community-here')` opened (1.3) |
| `views.browser.test.ts` | the community’s page shares its page for a shared link, copied when the browser has no share sheet | `community.browser.test.ts`, same name: `navigator.clipboard.writeText` spied and an own `navigator.share` defined empty, both undone at the test's end, in place of a stubbed `navigator`; the link expected is `c/<key>/` spelled from the page's address, not `communityHref` (1.3) |
| `views.browser.test.ts` | the Share button says what to do when there is no clipboard or it is refused, then shows its label again | `community.browser.test.ts`, same name: each case on a page opened again, with own `navigator.share` / `navigator.clipboard` properties or a `writeText` spy, undone after it; fake `setTimeout` installed after the page is open, the words read still there at 2.4 s and the label back by 2.6 s (the page's 2.5 s), `SAID_MS` no longer imported (1.3) |
| `views.browser.test.ts` | the months are today’s period, four of them, a festival one stroke across its days, its count once | `community.browser.test.ts`, same name: opened on 1 and 10 November (1.3) |
| `views.browser.test.ts` | a day only travelled has a dot, and a festival’s own days none | `gantt.browser.test.ts`, same name: Cédric and Christina's KUOF trip (TO_KUOF) planted, the fixture's community opened on 1 November (1.3) |
| `views.browser.test.ts` | a day no one travels on does nothing: no popover, no tab stop, no pointer | `community.browser.test.ts`, same name: the page's own stylesheet, in place of `styled()` (1.3) |
| `views.browser.test.ts` | each page’s day popover has an id of its own, which the day it is open on is described by | `community.browser.test.ts`, same name: two pages opened (1.3) |
| `views.browser.test.ts` | a month is one stop for the keyboard, its arrows passing over the days no one travels on | `community.browser.test.ts`, same name (1.3) |
| `views.browser.test.ts` | a day’s popover says who flies in and out, and when, who is there, and where they stay | `gantt.browser.test.ts`, same name: TO_KUOF planted, each day's popover opened by focusing its day (1.3) |
| `views.browser.test.ts` | two festivals on at once both have their row and stroke, a day counts everyone at either, their week both | `community.browser.test.ts`, same name: a community of its own with Ola added to Paris (and to Albania, in May, which no assertion of November reads), opened on 1 November (1.3) |
| `views.browser.test.ts` | an opened trip draws who travels when: the days from the first in to the last out, a bar a party | `gantt.browser.test.ts`, same name: TO_KUOF planted; the bars' left and width read off the drawn chart (`ganttOf`) (1.3) |
| `views.browser.test.ts` | a festival from a Wednesday to a Tuesday, a week long, fills its every day and its Gantt’s axis | `community.browser.test.ts`, same name: the same community as Paris's, Ola to Albania, opened with `from=2027-03`; the Gantt's axis read as its days' words (`axisOf`) (1.3) |
| `views.browser.test.ts` | on a phone the months go two a row and a fortnight’s Gantt fits, with no sideways scroll | `community-hotice.browser.test.ts`, same name: Cédric's HOT Ice trip planted, the page at 390px by `atWidth`; the crafted 358px wrapper gone: no sideways scroll is the document's scroll width within the window's, and the chart within `<main>`'s content width (1.3) |
| `views.browser.test.ts` | with nothing to come, the community’s page has no sentence of when it travels, nor months | `community.browser.test.ts`, same name: opened on 1 January 2028 (1.3) |
| `views.browser.test.ts` | on a computer a day’s popover opens beside its month, never over it | `community.browser.test.ts`, same name: the viewport set by `atWidth` (put back at the test's end) before the page opens (1.3) |
| `views.browser.test.ts` | on a phone a day opens a panel under its row of months, moving what follows down; a tap on it again closes | `community.browser.test.ts`, same name: the viewport set by `atWidth` before the page opens (1.3) |
| `views.browser.test.ts` | a trip is a row of the agenda, and what it opens a card under it, as a festival’s; only the next one open | `community.browser.test.ts`, same name: the card's look read from a real festival card (Glasgow's line-up, opened from its name) in place of a crafted `article.festival-card` (1.3) |
| `views.browser.test.ts` | each festival’s stroke is a swipe of its own, the same however often it is drawn | `community.browser.test.ts`, same name: two pages opened (1.3) |
| `views.browser.test.ts` | a trip’s bars are highlighter swipes, each party its own, the same however often drawn | `gantt-parties.browser.test.ts`, same name: Cédric's TO_KUOF trip and Christina's own (Friday 08:00 to Sunday 20:00) planted; "drawn again" is the page opened again (1.3) |
| `views.browser.test.ts` | a festival’s stroke runs across the lower half of its days’ numbers | `community.browser.test.ts`, same name (1.3) |
| `views.browser.test.ts` | a count keeps its word: "5 people" never breaks | `community.browser.test.ts`, same name (1.3) |
| `views.browser.test.ts` | a trip’s bars lie level, on a computer as on a phone: one end no more than 2px above the other | `gantt-parties.browser.test.ts`, same name: the same trips, planted for the file in place of `plant`/`uproot`; each width set by `atWidth` before the page opens, the card read three frames after it opens (1.3) |
| `views.browser.test.ts` | a trip’s bars are thin, and the chart in words is for a screen reader alone | `gantt.browser.test.ts`, same name: TO_KUOF planted, the page at 1200px, the card read three frames after it opens (`laidOut`) (1.3) |
| `views.browser.test.ts` | on a computer the card of names floats by its text, in the trip’s card, over no part of its own line | `gantt-apart.browser.test.ts`, same name: the two trips apart planted, Ola and Kari added on a community of its own (the fixture's copied) in place of `withAdded` on the fixture's (1.3) |
| `views.browser.test.ts` | on a computer a card of names with no room to float by its text in the trip’s card goes in the flow | `gantt.browser.test.ts`, same name: TO_KUOF planted, the seven more added to KUOF on a community of its own (the fixture's copied) (1.3) |
| `views.browser.test.ts` | a roster of more than three, its biggest line of more than three people "Everyone else", names them on demand | `gantt.browser.test.ts`, same name: TO_KUOF planted, Ola and Kari added to KUOF on a community of its own; the page opened at each width (1.3) |
| `views.browser.test.ts` | where a line stays is beside its stroke on a computer, under its name on a phone, airports only on a computer | `gantt.browser.test.ts`, same name: TO_KUOF planted, the page opened at each width, the card read three frames after it opens (1.3) |
| `views.browser.test.ts` | the roster’s strokes are the calendar’s ink, its second pass the same, and light | `gantt.browser.test.ts`, same name: TO_KUOF planted; the times' colour compared with `<main>`'s, the view's root (1.3) |
| `views.browser.test.ts` | the calendar shows today’s four months between its steps, the agenda their trips | `community.browser.test.ts`, same name: opened on 4 November (1.3) |
| `views.browser.test.ts` | the steps go through the periods in place to the last trip’s, the agenda with them, the address keeping it | `community.browser.test.ts`, same name: a community of its own with Maja added to Riga, opened on 4 November; the address read as each step leaves it, `c/<its key>/?from=`; the hand-restored history gone (open() puts the address back) (1.3) |
| `views.browser.test.ts` | the period in the address shows, one the calendar does not step to is today’s | `community.browser.test.ts`, same name: the Riga community opened with each `from` (1.3) |
| `views.browser.test.ts` | a trip with a day in the period is among its trips, though its festival is in the next | `community.browser.test.ts`, as “a festival of the next period, with no trip day in this one, is not among its trips”: the case without Cédric's Cloudkiz trip, from 15 October; `gantt-parties.browser.test.ts`, same name: the case with it, planted there (1.3) |
| `views.browser.test.ts` | trips only far off: today’s period shows empty, and the next its trips | `community.browser.test.ts`, same name: a community of its own with Maja added to KizzEssence (18766), its title, days (15–18 July 2027), city and country pinned in the plant by the fixture's festival update (`pinFestival`), opened on 1 March 2027 (1.3) |
| `views.browser.test.ts` | a step that turns itself off leaves the focus on the other | `community.browser.test.ts`, same name: the Riga community (1.3) |
| `views.browser.test.ts` | on a phone a day’s panel opens under its row of months in a later period too | `community.browser.test.ts`, same name: the Riga community at 390px by `atWidth` (1.3) |
| `views.browser.test.ts` | the steps sit on the line of the period’s name, and its months in two rows on a phone, one on a computer | `community.browser.test.ts`, same name: each width set by `atWidth`, the page opened at it (1.3) |
| `views.browser.test.ts` | two places are written beside the stroke, and counted under the name on a phone, the count opening names | `gantt-places.browser.test.ts`, same name: the KUOF flights without a stay (FLOWN) and the stays apart planted; the page opened at 1200 and 390px (1.3) |
| `views.browser.test.ts` | one person’s way is written with its arrow; three places are counted, wherever, dotted | `gantt-way.browser.test.ts`, same name: one page in place of two plants, Cédric's two places (Airbnb, then the Scandic) and the three places on Christina's line (in on the Friday at 09:00, an Airbnb, the Thon and the Scandic a night each, within her nights), read as the second line (1.3) |
| `views.browser.test.ts` | a stroke is "there": hard ends at times said, fading where not, over the festival’s days at least | `gantt-halves.browser.test.ts`, same name: Cédric's flight in alone and Christina's Saturday night planted (1.3) |
| `views.browser.test.ts` | the axis is the calendar’s: festival days in the accent, a dot under a day only travelled, dates not bold | `gantt.browser.test.ts`, same name: TO_KUOF planted (1.3) |
| `views.browser.test.ts` | a card whose people stay at two places or more can be seen by place, from icon buttons, kept for the visit | `gantt.browser.test.ts`, as “a card whose people all stay at one place has no choice of view”: no choice with one place for everyone (TO_KUOF); `gantt-places.browser.test.ts`, same name: the rest on FLOWN and the stays apart, "drawn again" the page opened again, the other community planted for the file (the fixture's copied) in place of rows inserted and deleted mid-test, and the by-place choice put back when the test ends (`onTestFinished`) (1.3) |
| `views.browser.test.ts` | by place, the names a count opens say each one’s own nights when they are not all of the place’s | `gantt-places.browser.test.ts`, same name: in place of `ganttByPlace` on made-up rows, a community of its own of six planted people with KUOF plans and stays (Ann, Bo, Cy and Di at the Scandic from Thursday, Nora from Friday, Ed at the Thon, so that the choice shows), opened by place, the "5 people" count's names read; the choice put back when the test ends (1.3) |
| `views.browser.test.ts` | the Friends tab lists the festivals of the people near the home city by month, a line for what they do | `friends.browser.test.ts`, same name: the tabs under the header read (“Near <home>”, current, and “Everywhere”), the home city read in the plant; `NEAR_KM` = 200 is the friends-far file's (test 63) (1.3) |
| `views.browser.test.ts` | a festival on now says so in the Friends tab, as on its card, and in its Now line | `friends.browser.test.ts`, same name: opened on 6 November, Glasgow's first day (the fixture's), in place of the SQL read of its start (1.3) |
| `views.browser.test.ts` | a line names up to four people or couples, then three and how many more, the ticked always named | `plans.browser.test.ts`, same name: in place of `whoLines` on made-up goers, P1 to P5 planted living in the home city, P1 to P4 going to KUOF (its teaching line, Cédric & Christina, first) and all five to Paris; the Friends rows read, "and N more" checked against the people planted; `NAMED_UP_TO` no longer imported (1.3) |
| `views.browser.test.ts` | the Friends tab keeps the festivals all the friends ticked go to, or any of them, and says when none is | `friends.browser.test.ts`, same name: each choice opened at its `friendsHref`, the “Show those any of them goes to” link clicked on the page (1.3) |
| `views.browser.test.ts` | a name in the Friends tab opens their plans, with their page and their festivals in common with others | `friends.browser.test.ts`, same name: the links compared with `friendsHref({ with })` in place of `togetherHref`; the quick view shut through its × and its history entry awaited (1.3) |
| `views.browser.test.ts` | the Friends tab narrows the festivals by a festival’s name or city, and by the time ahead | `friends.browser.test.ts`, same name; the weekend's list also said not to be empty (1.3) |
| `views.browser.test.ts` | the Friends tab lists only the people living within 200 km of the home city, and Everywhere everyone | `friends-far.browser.test.ts`, same name: one page in place of Siân moved twice: Siân 2.07° north, and seven people 1.62° north (seven, so that more than eight live near and the head says "N people within 200 km of <home>", the home read in the plant), going to Albania; near, nine people and Glasgow without Siân, Prague Kwanza not listed; everywhere, ten and Siân; `togetherHref` replaced by the peeks' links on the everywhere tab, Siân's `friendsHref({ in: 'everywhere', with: 'sian' })` and Cédric's (planted going to Riga alone) `friendsHref({ with: 'cedric' })` with no `in` (1.3) |
| `views.browser.test.ts` | who added someone is said to a screen reader too, not on hover alone | `community.browser.test.ts`, same name (1.3) |
| `views.browser.test.ts` | a day gone by is struck through and readable; a travelled one keeps its weight; the view switch shows focus | `community.browser.test.ts`, as “a day gone by is struck through and readable; a travelled one keeps its weight; a bar’s times stay legible”: the day part, on 10 November, the bar's times read in the next trip's open card; `gantt-places.browser.test.ts`, as “the view switch shows its focus ring inside its rounded border”: on the real By place button, in place of a crafted switch (1.3) |
| `views.browser.test.ts` | a day said without its time is drawn whole: arriving from its start, leaving to its end | `gantt-days.browser.test.ts`, same name: Cédric and Christina's days alone (Friday to Sunday) planted (1.3) |
| `views.browser.test.ts` | two people added of one first name are two people, each on the calendar and in the day’s box | `community.browser.test.ts`, same name: a community of its own with two Annas added to KUOF (no trips needed, so not with `gantt-days`) (1.3) |
| `views.browser.test.ts` | a day someone leaves one festival and flies to another says both | `community-late.browser.test.ts`, same name: Christina's KUOF trip from 9 November, 22:30, planted (1.3) |
| `views.browser.test.ts` | on the community page someone who may go is named with a maybe tag and counted apart | `community.browser.test.ts`, same name: the Prague GOLD and Prague Kwanza parts on the fixture's community, then Maja maybe at KUOF on a community of its own in this file (1.3) |
| `views.browser.test.ts` | the calendar and the sentence count those going, not those who may go, whom a day’s popover names | `community.browser.test.ts`, same name: Prague GOLD's counts and popover, Prague Kwanza's none, KUOF's five, on the fixture's community; then the sentence on a community of its own where everyone added to KUOF only may go (1.3) |
| `views.browser.test.ts` | a festival’s card and the Friends tab say who may go apart from who is going | `festivals.browser.test.ts`, same name: Prague Kwanza's card opened on the map; `festivals()`'s goers read as the card's tag; `friendsIn(...) === null` became “a list holding Prague Kwanza alone shows no friends line” (the Festivals page, CZ, its weekend, any price, on 12 February 2027; any other CZ festival of those days planted unlisted) (1.3) |
| `views.browser.test.ts` | a person’s page lists the festivals they said they’re going to | `friends.browser.test.ts`, same name: `personHref('sian')` and `personHref('nobody')` opened (1.3) |
| `views.browser.test.ts` | someone in the line-up teaches there whatever their plan says, and is counted as going | `festivals.browser.test.ts`, same name: Siân's Glasgow plan planted maybe; Glasgow's card counts her with the going (“Who’s going2”, no maybe) and tags her teaching, in place of `doingTag` and `unsure` on made-up rows (1.3) |
| `views.browser.test.ts` | the sources page names no reseller and no model’s maker | `sources.browser.test.ts`, same name: the resellers read in the plant, the page's `<main>` read (1.3) |
| `views.browser.test.ts` | search lists a city once, with every festival its listings spell two ways | `search.browser.test.ts`, same name: one city row for “Munich”, its count the plant's of those coming up, one of them planted as spelt München; that every city key is listed once over all cities is a property of `cityEntries` the page cannot enumerate, and is not tested (1.3) |
