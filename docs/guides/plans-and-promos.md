# Plans and promo codes

Three things the site shows come from files written by hand: who's going where, the communities, and our promo codes.
The build stops when one names a person, a community, an artist key or a festival the data doesn't have.

## Who's going

- `pipeline/people.csv`: one row per person, with a short `key` (their page is `#friends/<key>`), their `name`, the
  `artist_keys` they are in the line-ups (`match_key` values, separated by `;`), `featured`, and their `home`: the city
  they live in, as `pipeline/geocode.csv` names it (one of its rows, found there: its city alone, or "City, Country"
  when geocode.csv has the city in two countries), or empty when they have not said. Featured people are named on
  festival cards; the others are counted. The build stops on a home geocode.csv has not found, or has in two places with
  no country to choose, naming the file; someone with no home is never "near" anywhere on the Friends tab, which lists
  the people near Bergen.
- `pipeline/plans.csv`: one row per person and festival, with `status` `going`.

A card then says "Cédric & Christina are going · 3 more people too". A name opens a quick view of where they're going;
partners who both go are named as their couple; someone in the festival's line-up shows as teaching (or playing) there
rather than going. Each person has a plans page with a Share button, and an artist's page lists the festivals they go to
without teaching there. The Friends tab lists the festivals the people living near a place go to (The site: the Friends
tab), and the festival list can keep only those featured people go to.

Plans are public: anyone can see them, so add people only with their agreement.

## Communities

A community is a group of dancers whose page says who of them goes where. This one is a fixed prototype of the
communities the spec ("Kiz Radar community: user stories") describes, to get the page right before a server exists:
nobody can create, join or claim one yet, and its rows are written by hand.

- `pipeline/communities.csv`: one row per community, with its `key` (four words, as `frost-lantern-river-maple`; its
  page is `c/<key>/`), its `name`, its `manager` (a `people.csv` key, who must be one of its members) and a `note`.
- `pipeline/community_members.csv`: one row per member, with the `community` and the `person` (a `people.csv` key).
  Members are named on the page and link to their plans page.
- `pipeline/seeded.csv`: the people the manager added who have not joined, one row per person and festival, with the
  `community`, their first `name`, their `artist_keys` (as in `people.csv`: the `match_key` values of the artist records
  they are, separated by `;`, or empty), the `event_id`, the `status` (a plan's, `going`) and the festival's name for
  people reading the file. A name is only a name, of a name's shape (`plain_name` in `pipeline/records.py`): words of
  letters, accents included, joined by hyphens or apostrophes, a dot only after an initial ("Mary J. Blige", "J.Lo"),
  and four digits at most (a place's, "Hotel 31"); anything else, such as a link, an @handle, an email address, a phone
  number, a domain in any case ("TONJE.NO") or "insta", "at" or "dot" as a word, is refused, since it could reach
  someone. A stay's place is held to the same.
- `pipeline/travel.csv`: how members travel, one row per member and festival they plan, as far as they said: the
  `person`, the `event_id`, when they `arrive` and `leave` (local times, `YYYY-MM-DDTHH:MM`, or the day alone,
  `YYYY-MM-DD`, when the time is not known; arriving first, by the day when either has no time), each empty when not
  known but one of them said, and the airports when they fly (`arrive_at`, `leave_from`, IATA codes, each only with a
  time, or empty). Every day is within `BOUND_DAYS` (7) of the festival's days; a day further off is taken for a typo
  and stops the build. A day without its time is drawn whole: from its start when arriving, to its end when leaving.
  Only a member says how they travel: the people a manager added never do. Write no booking code or flight number.
- `pipeline/stays.csv`: where members stay, a row a place: the `person`, the `event_id`, the `first_night` and
  `last_night` there (each night by its evening's date) and the `place` (a plain name, such as a hotel or "with
  friends"). A member staying at two places has two rows. Their nights never overlap and fall between the day they
  arrive (or the night before, when their flight lands before 06:00) and the day before they leave, when travel.csv says
  them, within `BOUND_DAYS` of the festival's days; the build stops on a row that breaks this, of anyone but a member,
  or to a festival they don't plan.

The site shows travel and stays until a few days after a trip; the repository's history keeps them. Each member's trip
ends on the day they leave (or the morning after their last night), and never before the festival's last day (as the
community page draws it: `tests/trip-ends.json` holds the cases both read); from the fourth day after that (more than
`KEPT_DAYS`, 3, days after), the build no longer publishes that member's rows of `travel.csv` and `stays.csv`, and
prints a warning for each, by what it says, then how many ("warning: travel.csv: christina, arriving 2026-11-06 and
leaving 2026-11-09T19:10, for Glasgow Kizomba Festival 5.0 (event 18964): the trip ended on 2026-11-09, more than 3 days
ago, so the row is no longer published; delete it"). It goes on building: delete the rows it names, and commit.

The page shows the community's name ("Norwegians in festivals"), when most of its people (members and those its manager
added) travel at once ("Most people are travelling 20–22 Nov: 5 people, to Oslo.") and, on a line of its own, where they
go next ("Next: Glasgow, this Friday"), or, while a trip is on, where they are and until when, and the trip after it
("Now: Glasgow, until Mon · Next: Oslo, on 20 Nov"), then a Share this page button, which opens the device's share sheet
or else copies the link, beside a badge of who sees it: a lock, people and the number of members, which says what is
true, "Public · anyone can see this page · 3 members", on hover and to a screen reader. Who manages it is said with the
members, at the foot of the page.

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
the festival's own days, whatever weekdays those are; someone at two festivals at once counts once. The sentence reads
the same counts: the first day as many travel as on any, and the days after it with as many. Only a day someone travels
on does anything: each month is one stop for the keyboard, whose arrows move among those days (left, right) or a week or
more (up, down), and the day in focus, under the pointer or tapped opens a popover of its festivals, who flies in and
out that day (by time and airport, a couple as one when both share the flight: "Flying in: Cédric & Christina 14:30
PRG"), who else is there, and where members stay. It never covers the day's month: on a computer it sits beside the
month, on a phone it is a panel under the day's row of months, moving what follows down. Escape, a tap elsewhere or on
the day again closes it, and the focus stays on the day.

Then the agenda of the period shown: its trips, those with a day in it, so every day the calendar shows has its trips
there ("Nothing planned in Mar–Jun" when it has none), a heading a month ("November · 3 trips", with the year in January
and on the first when it is not this year's), and a row a trip, soonest first. The sentence and "Next" are of every
trip, whatever period shows. A row has its days ("Fri 20 – Sun 22 Nov"), the festival and where it is (which leads to it
on the map), and who of the community goes: its members as on any card (as their couple when both go, teaching when in
the line-up), then the people added: "Christina teaching and Siân teaching · Caroline going". Hovering an added name
says who added them ("Added by Cédric"). Whether someone added teaches comes from the festival's line-up and their
`artist_keys`, as it does for a member; the manager never says it, and someone teaching links to their artist page. The
next trip is open; the others open from their button, on a card under the row. An opened trip is a roster of who travels
when: its days across the top, from the first of the community to arrive (or the festival's start, when that is sooner)
to the last to leave (or its end), the festival's days marked on them, and a line for each travel (`site/roster.ts`).
Someone's signature is how they arrive (when, and at which airport), how they leave, and where they stay, night by
night. A line is everyone who arrives and leaves alike: a bar is a travel, and where they stay never splits it. A couple
is one unit when its partners' signatures are alike, else each partner is a unit; anyone else is one. A mark means one
thing. A stroke of the calendar's ink is "there": everyone going has one over the festival's days at least. Its end is
hard, with its time (and its airport, on a computer), where the time was said, and fades, with nothing written, where it
was not: said nothing at all, or only where they stay, the festival's days with both ends fading; only a flight in, a
hard start and the end fading at the festival's close (or the morning after their last night); only a day, without its
time (the day Christina flies in), the stroke from that day, its start fading, the axis reaching it. A screen reader
hears "arrival not said", "departure not said" or "arrives Fri 6 Nov, time not said". The axis is the calendar's: the
festival's days in the accent, a dot under a day only travelled on, dates not bold. A dotted underline is names behind a
text: a line called by what it is, or places counted, opens them, by place when they stay apart, while the pointer is
over it and from a tap or a key, until the next or Escape, in a small card (each place a small heading, those who said
none last, each name with its own nights, muted, when not all of its place's: "Nora · Fri–Sun"; two columns when many):
on a phone a row of its own under the line; on a computer floating by its text, below its line or above it, never over
it, inside the trip's card, or in the flow when the trip's card has no room for it; a solid underline is a link leaving
the card. Muted text is a detail or an absence. A line of three people or fewer always names its units, and with three
units or fewer every line does. Otherwise a line of more than three people is "Everyone" when it is the only line,
"Everyone else" when it is more than half of everyone, and else called by its number ("5 people"). The named lines come
first, by arrival, then departure, then first name; then those called by number, by arrival; then "Everyone else"; and
those who have not said at the very bottom. Where a line stays is written when it is one or two places ("Airbnb →
Scandic Holberg" for one person's way; "Scandic Holberg 8 · Comfort Xpress 2 · 1 not said"), beside the stroke on a
computer, with no heading over it; under the name on a phone, which writes one and counts two; and counted when more ("3
places"), the count opening the names by place; the whole is in its title and to a screen reader. When the people of a
trip stay at two places or more, two icon buttons at the top of its card, a plane ("By travel") and a bed ("By place"),
show the same people by where they stay: a line a place, the most people first and "Not said" last, the place the line's
name and its people under it (three or fewer named, more called by number, which opens them with each one's own nights
when not all of the place's, as in the card above), and one stroke over the nights anyone stays there, from the evening
of the first to the morning after the last, its ends their weekdays; someone who moves is on each place's line for their
nights there. The card keeps the view chosen for the visit. A screen reader hears the names, and the rest in words the
page does not show: each line in and out and where its people stay, and who has not said, a line called by what it is by
its people too; by place, each place, its nights and who stays there. While a card is open its row says only how many go
and who teaches ("5 going · Cédric & Christina teaching"), as the card names everyone. The festival's name opens its
card on the festival's line-up and prices, its own card opened in place, and folds them away again; the next trip's card
opens on who travels, its line-up folded.

A trip is on from its first day (the first member to arrive, or the festival's start when sooner) to its last (the last
to leave, or the festival's end when later): its row has a small "Now" tag before its days and is the one open, and the
head says "Now". From the day after its last, it has ended: it leaves the agenda, the sentence and the counts at the
rows' ends, and its strokes stay in the calendar, grey as the days gone by; the calendar still starts at today's month.
With every trip ended, the page says "No trips coming up."

The site database has the added people's first names (`community_seeded`, one row per person and festival), and the
community's page alone shows them: a festival's card elsewhere, the Friends tab and the search know only plans. The page
reads its community in the shape the server will answer with, so only where it comes from changes then.

Its Share button gives the community's one address, `…/c/<key>/`, its page, which shows its own card in chat apps (The
site: the share card and the icons); an older `#community/<key>` link moves to it. Of the community that card says its
name alone, so members joining and plans changing leave it as it is; when a community is renamed, draw it again:
`mise run render:design`, then `mise run generate`.

A community is public, as everything the site shows is: no tab links to its page, but its key, its members, the people
its manager added and their plans and travel are in the site's database, which anyone can read (the SQL page), and in
this repository and its history. Everyone listed has agreed to this. Until the server can check who is a member, add
only what its people agree to make public.

## Promo codes

`pipeline/promo_codes.csv` has one row per festival edition: the `event_id` (the SQL page's `event_rows.id`), the
`code`, an optional `offer` such as "10% off", and the festival's name and a note for people reading the file. A
festival with a code gets the "Promo code" highlight, its opened card shows the code with a Copy button, and searching
the code finds it. A code belongs to one edition, so next year's needs a row of its own.
