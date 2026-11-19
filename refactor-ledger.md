# Phase 1 test ledger

Task 1.9 of [refactor-plan.md](refactor-plan.md) fills this in. The left columns are the browser tests at `c667c877`, as
the baseline run of task 1.1 named them (each `test.for` case on its own line); the right column says where each one
went, or why it cannot be tested through the page. The node tests (142 in 14 files) do not move, except the two of task
1.7, and are not listed.

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
| `views.browser.test.ts` | the community the tests read is the fixture alone, whatever the real rows say or the day it was built |  |
| `views.browser.test.ts` | sql.js’s WebAssembly is asked for as every file is, with a deadline |  |
| `views.browser.test.ts` | what the SQL page runs changes its own copy, never the database the views read |  |
| `views.browser.test.ts` | the artist list finds a name whatever its accents and case, and what is typed is never a pattern |  |
| `views.browser.test.ts` | a community’s head says who it is, when most members travel and where next, and whom it is for |  |
| `views.browser.test.ts` | before Glasgow, it is next, its row open |  |
| `views.browser.test.ts` | while Glasgow is on, from its first arrival to its last departure, its row says Now and is open |  |
| `views.browser.test.ts` | after Glasgow, it leaves the agenda, its stroke stays grey, and it is no longer counted |  |
| `views.browser.test.ts` | the sentence of when most members travel leaves out a trip that has ended |  |
| `views.browser.test.ts` | the agenda has a heading a month and a row a trip, soonest first, naming who of the community goes |  |
| `views.browser.test.ts` | the people a manager added are named on the community’s page only, never on a festival’s card elsewhere |  |
| `views.browser.test.ts` | a trip’s chart is drawn the first time its row opens, not with the agenda |  |
| `views.browser.test.ts` | a festival cancelled or no longer listed stays on the community’s page, said so, never on now |  |
| `views.browser.test.ts` | a page left open past midnight reads where each festival stands by the new day |  |
| `views.browser.test.ts` | a link to no community says so |  |
| `views.browser.test.ts` | the community’s page shares its page for a shared link, copied when the browser has no share sheet |  |
| `views.browser.test.ts` | the Share button says what to do when there is no clipboard or it is refused, then shows its label again |  |
| `views.browser.test.ts` | the months are today’s period, four of them, a festival one stroke across its days, its count once |  |
| `views.browser.test.ts` | a day only travelled has a dot, and a festival’s own days none |  |
| `views.browser.test.ts` | a day no one travels on does nothing: no popover, no tab stop, no pointer |  |
| `views.browser.test.ts` | each page’s day popover has an id of its own, which the day it is open on is described by |  |
| `views.browser.test.ts` | a month is one stop for the keyboard, its arrows passing over the days no one travels on |  |
| `views.browser.test.ts` | a day’s popover says who flies in and out, and when, who is there, and where they stay |  |
| `views.browser.test.ts` | two festivals on at once both have their row and stroke, a day counts everyone at either, their week both |  |
| `views.browser.test.ts` | an opened trip draws who travels when: the days from the first in to the last out, a bar a party |  |
| `views.browser.test.ts` | a festival from a Wednesday to a Tuesday, a week long, fills its every day and its Gantt’s axis |  |
| `views.browser.test.ts` | on a phone the months go two a row and a fortnight’s Gantt fits, with no sideways scroll |  |
| `views.browser.test.ts` | with nothing to come, the community’s page has no sentence of when it travels, nor months |  |
| `views.browser.test.ts` | on a computer a day’s popover opens beside its month, never over it |  |
| `views.browser.test.ts` | on a phone a day opens a panel under its row of months, moving what follows down; a tap on it again closes |  |
| `views.browser.test.ts` | a trip is a row of the agenda, and what it opens a card under it, as a festival’s; only the next one open |  |
| `views.browser.test.ts` | each festival’s stroke is a swipe of its own, the same however often it is drawn |  |
| `views.browser.test.ts` | a trip’s bars are highlighter swipes, each party its own, the same however often drawn |  |
| `views.browser.test.ts` | a festival’s stroke runs across the lower half of its days’ numbers |  |
| `views.browser.test.ts` | a count keeps its word: "5 people" never breaks |  |
| `views.browser.test.ts` | a trip’s bars lie level, on a computer as on a phone: one end no more than 2px above the other |  |
| `views.browser.test.ts` | a trip’s bars are thin, and the chart in words is for a screen reader alone |  |
| `views.browser.test.ts` | on a computer the card of names floats by its text, in the trip’s card, over no part of its own line |  |
| `views.browser.test.ts` | on a computer a card of names with no room to float by its text in the trip’s card goes in the flow |  |
| `views.browser.test.ts` | a roster of more than three, its biggest line of more than three people "Everyone else", names them on demand |  |
| `views.browser.test.ts` | where a line stays is beside its stroke on a computer, under its name on a phone, airports only on a computer |  |
| `views.browser.test.ts` | the roster’s strokes are the calendar’s ink, its second pass the same, and light |  |
| `views.browser.test.ts` | the calendar shows today’s four months between its steps, the agenda their trips |  |
| `views.browser.test.ts` | the steps go through the periods in place to the last trip’s, the agenda with them, the address keeping it |  |
| `views.browser.test.ts` | the period in the address shows, one the calendar does not step to is today’s |  |
| `views.browser.test.ts` | a trip with a day in the period is among its trips, though its festival is in the next |  |
| `views.browser.test.ts` | trips only far off: today’s period shows empty, and the next its trips |  |
| `views.browser.test.ts` | a step that turns itself off leaves the focus on the other |  |
| `views.browser.test.ts` | on a phone a day’s panel opens under its row of months in a later period too |  |
| `views.browser.test.ts` | the steps sit on the line of the period’s name, and its months in two rows on a phone, one on a computer |  |
| `views.browser.test.ts` | two places are written beside the stroke, and counted under the name on a phone, the count opening names |  |
| `views.browser.test.ts` | one person’s way is written with its arrow; three places are counted, wherever, dotted |  |
| `views.browser.test.ts` | a stroke is "there": hard ends at times said, fading where not, over the festival’s days at least |  |
| `views.browser.test.ts` | the axis is the calendar’s: festival days in the accent, a dot under a day only travelled, dates not bold |  |
| `views.browser.test.ts` | a card whose people stay at two places or more can be seen by place, from icon buttons, kept for the visit |  |
| `views.browser.test.ts` | by place, the names a count opens say each one’s own nights when they are not all of the place’s |  |
| `views.browser.test.ts` | the Friends tab lists the festivals of the people near the home city by month, a line for what they do |  |
| `views.browser.test.ts` | a festival on now says so in the Friends tab, as on its card, and in its Now line |  |
| `views.browser.test.ts` | a line names up to four people or couples, then three and how many more, the ticked always named |  |
| `views.browser.test.ts` | the Friends tab keeps the festivals all the friends ticked go to, or any of them, and says when none is |  |
| `views.browser.test.ts` | a name in the Friends tab opens their plans, with their page and their festivals in common with others |  |
| `views.browser.test.ts` | the Friends tab narrows the festivals by a festival’s name or city, and by the time ahead |  |
| `views.browser.test.ts` | the Friends tab lists only the people living within 200 km of the home city, and Everywhere everyone |  |
| `views.browser.test.ts` | who added someone is said to a screen reader too, not on hover alone |  |
| `views.browser.test.ts` | a day gone by is struck through and readable; a travelled one keeps its weight; the view switch shows focus |  |
| `views.browser.test.ts` | a day said without its time is drawn whole: arriving from its start, leaving to its end |  |
| `views.browser.test.ts` | two people added of one first name are two people, each on the calendar and in the day’s box |  |
| `views.browser.test.ts` | a day someone leaves one festival and flies to another says both |  |
| `views.browser.test.ts` | on the community page someone who may go is named with a maybe tag and counted apart |  |
| `views.browser.test.ts` | the calendar and the sentence count those going, not those who may go, whom a day’s popover names |  |
| `views.browser.test.ts` | a festival’s card and the Friends tab say who may go apart from who is going |  |
| `views.browser.test.ts` | a person’s page lists the festivals they said they’re going to |  |
| `views.browser.test.ts` | someone in the line-up teaches there whatever their plan says, and is counted as going |  |
| `views.browser.test.ts` | the sources page names no reseller and no model’s maker |  |
| `views.browser.test.ts` | search lists a city once, with every festival its listings spell two ways |  |
