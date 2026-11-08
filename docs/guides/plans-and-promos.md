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
- `pipeline/plans.csv`: one row per person and festival, with `status` `going`, or `maybe` when they may go but have not
  said they are going, and the festival's name in `event`.

The `event` column of `plans.csv`, `seeded.csv` and `promo_codes.csv` is for people reading the file, and says which
festival a row meant once its id is no more ("no event 19033 (KUOF 2026 – …)"). Write it as the SQL page's
`events.listed_title` has it (or its `title`): the build warns of each festival a file names otherwise, with the name to
write, then how many, and goes on, so a festival renamed where it is listed never stops it.

A card then says "Cédric & Christina are going · 3 more people too". A name opens a quick view of where they're going;
partners who both go are named as their couple; someone in the festival's line-up shows as teaching (or playing) there
rather than going, whatever their plan says. Someone who may go is named with a "maybe" tag, the card's sentence saying
so apart ("Cédric is going · Christina may go · 3 more people too"), its list counting them apart ("Who's going 4 · 1
maybe"); a couple is named as one only when both partners go, or both may. The hero's friends going leave them out; the
festival list's filter of festivals featured people go to keeps them. Each person has a plans page with a Share button,
and an artist's page lists the festivals they go to without teaching there. The Friends tab lists the festivals the
people living near a place go to (The site: the Friends tab), and the festival list can keep only those featured people
go to.

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
  they are, separated by `;`, or empty), the `event_id`, the `status` (a plan's: `going`, or `maybe`, as the manager
  says; the spec's A3 and D5) and the festival's name for people reading the file. A name is only a name, of a name's
  shape (`plain_name` in `pipeline/records.py`): words of letters, accents included, joined by hyphens or apostrophes, a
  dot only after an initial ("Mary J. Blige", "J.Lo"), and four digits at most (a place's, "Hotel 31"); anything else,
  such as a link, an @handle, an email address, a phone number, a domain in any case ("TONJE.NO") or "insta", "at" or
  "dot" as a word, is refused, since it could reach someone. A stay's place is held to the same.
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

### Adding a community

1. Ask each member whether their plans, and the travel and stays they give, may be public: the page and the site's
   database show them to anyone (above). Add only those who agree.
2. Give each member a row of `pipeline/people.csv` (their `key` a slug, as `ana-maria`) and their festivals rows of
   `pipeline/plans.csv`, as for anyone who shares their plans.
3. Add the community to `pipeline/communities.csv`: a `key` of four words no other community has (its address), its
   `name`, and its `manager`, one of its members.
4. Add a row of `pipeline/community_members.csv` for each member, the manager included; then, when they have them, the
   people the manager adds (`pipeline/seeded.csv`) and the members' travel and stays (`pipeline/travel.csv`,
   `pipeline/stays.csv`).
5. Run `mise run render:design`, which draws the community's card (`public/c/<key>/share.png`, and `share.json` beside
   it), then `mise run generate`, which writes its page (`public/c/<key>/index.html`).
6. Commit the files and the `public/c/<key>/` folder (the commit's checks build the site and the database on them, and
   refuse a bad row by its file). Its address is `https://clombion.github.io/kiz-radar/c/<key>/`: send it to the
   members; nothing on the site links to it.

To rename a community, change its `name` and run steps 5 and 6 again. To remove one, delete its rows from
`communities.csv`, `community_members.csv` and `seeded.csv` and run `mise run generate`, which removes its folder of
`public/c/`; a new key is a new address, so changing a key is removing the community and adding another.

What the page shows, and how, is in [The site: a community's page](the-site.md#a-communitys-page).

## Promo codes

`pipeline/promo_codes.csv` has one row per festival edition: the `event_id` (the SQL page's `event_rows.id`), the
`code`, an optional `offer` such as "10% off", and the festival's name and a note for people reading the file. A
festival with a code gets the "Promo code" highlight, its opened card shows the code with a Copy button, and searching
the code finds it. A code belongs to one edition, so next year's needs a row of its own.
