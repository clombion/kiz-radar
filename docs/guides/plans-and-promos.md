# Plans and promo codes

Three things the site shows come from files written by hand: who's going where, the communities, and our promo codes.
The build stops when one names a person, a community, an artist key or a festival the data doesn't have.

## Who's going

- `pipeline/people.csv`: one row per person, with a short `key` (their page is `#friends/<key>`), their `name`, the
  `artist_keys` they are in the line-ups (`match_key` values, separated by `;`), and `featured`. Featured people are
  named on festival cards; the others are counted.
- `pipeline/plans.csv`: one row per person and festival, with `status` `going`.

A card then says "Cédric & Christina are going · 3 more people too". A name opens a quick view of where they're going;
partners who both go are named as their couple; someone in the festival's line-up shows as teaching (or playing) there
rather than going. Each person has a plans page with a Share button, and an artist's page lists the festivals they go to
without teaching there. The Friends tab lists every festival someone goes to, soonest first, and the festival list can
keep only those featured people go to.

Plans are public: anyone can see them, so add people only with their agreement.

## Communities

A community is a group of dancers whose page says who of them goes where. This one is a fixed prototype of the
communities the spec ("Kiz Radar community: user stories") describes, to get the page right before a server exists:
nobody can create, join or claim one yet, and its rows are written by hand.

- `pipeline/communities.csv`: one row per community, with its `key` (four words, as `frost-lantern-river-maple`; its
  page is `#community/<key>`), its `name`, its `manager` (a `people.csv` key, who must be one of its members) and a
  `note`.
- `pipeline/community_members.csv`: one row per member, with the `community` and the `person` (a `people.csv` key).
  Members are named on the page and link to their plans page.
- `pipeline/seeded.csv`: the people the manager added who have not joined, one row per person and festival, with the
  `community`, their first `name`, their `artist_keys` (as in `people.csv`: the `match_key` values of the artist records
  they are, separated by `;`, or empty), the `event_id`, the `status` (a plan's, `going`) and the festival's name for
  people reading the file. A name is only a name: a link, an @handle or an email address is refused.
- `pipeline/trips.csv`: how members travel, one row per member and festival they plan: the `person`, the `event_id`,
  when they `arrive` and `leave` (local times, `YYYY-MM-DDTHH:MM`, arriving first), the airports when they fly
  (`arrive_at`, `leave_from`, IATA codes, or empty) and where they `stay` (a plain name, such as a hotel or "with
  friends", or empty). Only a member registers a trip: the people a manager added never have one. Write no booking code
  or flight number.

The page shows the community's name ("Norwegians in festivals"), its members and its manager, when most of it is away at
once and where it goes next ("Most of the community is away 20–22 Nov: 5 people, in Oslo. Next: Glasgow, this Friday."),
and a Share this page button, which opens the device's share sheet or else copies the link, beside who the page is meant
for ("Visible to its 2 members only").

Under the head, a small grid for today's month and for each month someone is away in (every one of them, however far
off; a line says which months between them go without: "Nothing planned in August"), two months a row on a phone. A row
is a week from Monday, a day a square shaded by how many of the community are away on it: a member with a trip from the
day they arrive to the day they leave, anyone else (a member without one, someone added) on the festival's own days,
whatever weekdays those are; someone at two festivals at once counts once. The festival's own days carry a pale
underline, the days only travelled none; today is outlined and the days before it greyed, and at each week's end is the
most away on any of its days ("·" for none). The three shades divide the most away on any day in thirds, and the legend
says which counts each stands for ("People away: 1 · 2–3 · 4–5"). The sentence reads the same counts: the first day as
many are away as on any, and the days after it with as many. Each month is one stop for the keyboard, whose arrows move
a day (left, right) or a week (up, down); the day in focus, under the pointer or tapped opens a popover of its
festivals, who flies in and out that day (by time and airport, a couple as one when both share the flight: "Flying in:
Cédric & Christina 14:30 PRG"), who else is there, and where members stay. It never covers the day's month: on a
computer it sits beside the month, on a phone it is a panel under the day's row of months, moving what follows down.
Escape, a tap elsewhere or on the day again closes it, and the focus stays on the day.

Then the agenda: a heading a month ("November · 3 trips", with the year in January), and a row a trip, soonest first:
its days ("Fri 20 – Sun 22 Nov"), the festival and where it is, and who of the community goes: its members as on any
card (as their couple when both go, teaching when in the line-up), then the people added: "Christina teaching · Sian
teaching and Carolina going". Hovering an added name says who added them ("Added by Cédric"). Whether someone added
teaches comes from the festival's line-up and their `artist_keys`, as it does for a member; the manager never says it,
and someone teaching links to their artist page. The next trip is open; the others open from their button. An opened
trip draws who travels when: its days across the top, from the first of the community to arrive (or the festival's
start, when that is sooner) to the last to leave (or its end), the festival's days a soft band, and a bar for each party
that shares a flight in and out (a couple as one), from the hour they arrive to the hour they leave, with the times and
airports at its ends; only those who said how they travel have one, so a trip no one has said anything of shows its days
and band alone. A line under it says the same in words, another names once everyone going who has not said ("Not said
yet: Christina, Sian and Carolina", the people the manager added among them), then where members stay, and "Line-up &
prices" opens the festival's card in place.

The site database has the added people's first names (`community_seeded`, one row per person and festival), and the
community's page alone shows them: a festival's card elsewhere, the Friends tab and the search know only plans. The page
reads its community in the shape the server will answer with, so only where it comes from changes then.

Nothing lists communities: a community's page is reached by its link only. Until the server can check who is a member,
the link is the only thing that keeps it to them, as it is for a person's plans page.

## Promo codes

`pipeline/promo_codes.csv` has one row per festival edition: the `event_id` (the SQL page's `event_rows.id`), the
`code`, an optional `offer` such as "10% off", and the festival's name and a note for people reading the file. A
festival with a code gets the "Promo code" highlight, its opened card shows the code with a Copy button, and searching
the code finds it. A code belongs to one edition, so next year's needs a row of its own.
