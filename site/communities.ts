// A community's page (pipeline/communities.csv, community_members.csv, seeded.csv): who is in it, and the festivals
// to come that its members plan or that its manager added someone to, first as a list of who goes where, then as
// cards, under when most of it is away at once and a strip of the days it is away. Only its link reaches it: nothing
// lists communities. Its members and the people its manager added, who have not joined, are named; an added one's
// name says on hover who added them. Members say how they travel (pipeline/trips.csv); the people added never do.
import { type Away, awayDays, busiest, type Day, presence } from './calendar.ts';
import { one, q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { type Festival, withDetails } from './festivals.ts';
import { comingUp, page, personLink, shareButton } from './people.ts';
import { doingTag, type Goer, goersInline, goingRow, namesOf } from './plans.ts';
import { artistHref } from './routes.ts';
import { type Booked, booked, EVENT, num, opt, type RowOf, str } from './rows.ts';
import { strip } from './strip.ts';
import { dayRange, scrolling, weekDay } from './ui.ts';
import { joined, plural } from './wording.ts';

// A community as its page reads it, which is what a server will give one of its members. For now it is read from
// the site database.
interface Member {
  key: string;
  name: string;
}
// someone the manager added: their name, and what they are booked as at the festival (from the line-up, never from
// the manager) with the artist record that booking links to
interface Added {
  name: string;
  booked_as: Booked | null;
  artist: number | null;
}
// how a member travels to a festival: arrive and leave as local times, YYYY-MM-DDTHH:MM
const TRIP = { key: str, arrive: str, arrive_at: opt(str), leave: str, leave_from: opt(str), stay: opt(str) } as const;
type Trip = RowOf<typeof TRIP>;
interface Going {
  members: string[]; // the keys of its members going
  added: Added[]; // the people its manager added who are going, in the order they were added
  trips: Trip[]; // how its members going travel there, those who said
}
interface Community {
  key: string;
  name: string;
  manager: Member;
  members: Member[];
  festivals: ReadonlyMap<number, Going>; // by festival, every one any of them goes to, past ones too
}

// the community at this key, or null when there is none
function communityOf(key: string): Community | null {
  const c = one(
    { id: num, key: str, name: str, manager_key: str, manager_name: str },
    sql`SELECT c.id, c.key, c.name, p.key AS manager_key, p.name AS manager_name
    FROM communities c JOIN people p ON p.id = c.manager_id WHERE c.key = ?`,
    [key],
  );
  if (c === undefined) return null;
  const members = q(
    { key: str, name: str },
    sql`SELECT p.key, p.name FROM community_members m JOIN people p ON p.id = m.person_id
    WHERE m.community_id = ?`,
    [c.id],
  ).toSorted((a, b) => a.name.localeCompare(b.name)); // by name as it is said, Cédric before Christina
  // each plan and each added person is going: going is a plan's one state, as every page of plans reads it
  const festivals = new Map<number, Going>();
  const at = (id: number): Going => {
    const f = festivals.get(id) ?? { members: [], added: [], trips: [] };
    festivals.set(id, f);
    return f;
  };
  for (const r of q(
    { event_id: num, key: str },
    sql`SELECT pl.event_id, p.key FROM community_members m JOIN plans pl ON pl.person_id = m.person_id
    JOIN people p ON p.id = m.person_id WHERE m.community_id = ?`,
    [c.id],
  ))
    at(r.event_id).members.push(r.key);
  for (const r of q(
    { event_id: num, name: str, booked_as: opt(booked), artist_id: opt(num) },
    sql`SELECT event_id, name, booked_as, artist_id FROM seeded_rows WHERE community_id = ? ORDER BY id`,
    [c.id],
  ))
    at(r.event_id).added.push({
      name: r.name,
      booked_as: r.booked_as,
      artist: r.booked_as === null ? null : r.artist_id,
    });
  for (const { event_id, ...trip } of q(
    { event_id: num, ...TRIP },
    sql`SELECT t.event_id, p.key, t.arrive, t.arrive_at, t.leave, t.leave_from, t.stay FROM trips t
    JOIN community_members m ON m.person_id = t.person_id JOIN people p ON p.id = t.person_id WHERE m.community_id = ?`,
    [c.id],
  ))
    at(event_id).trips.push(trip);
  return {
    key: c.key,
    name: c.name,
    manager: { key: c.manager_key, name: c.manager_name },
    members,
    festivals,
  };
}

const SHOWN = 3; // the festivals the list shows before "See more"

// someone of the community away for a festival: a member, with their trip when they said how they travel, or someone
// the manager added
interface Present extends Away {
  e: Festival;
  goer: Goer | null;
  added: Added | null;
  trip: Trip | null;
}

export function communityView(root: HTMLElement, [key]: readonly string[], signal: AbortSignal): void {
  const c = key === undefined ? null : communityOf(key);
  if (c === null) {
    root.replaceChildren(h('p', {}, 'No community at this link.'));
    return;
  }
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT * FROM event_rows WHERE upcoming AND id IN (SELECT value FROM json_each(?)) ORDER BY start_date`,
      [JSON.stringify([...c.festivals.keys()])],
    ),
  ).flatMap((e) => {
    const f = c.festivals.get(e.id);
    return f === undefined ? [] : [{ e, f, who: whoGoes(e, f, c.manager) }];
  });
  const members = plural(c.members.length, 'member');
  // who is away on each day, one count for the sentence and the strip's shades alike
  const days = presence(
    events.flatMap(({ e, f, who }): Present[] => [
      ...who.goers.map((g) => {
        const trip = f.trips.find((t) => t.key === g.key) ?? null;
        return { who: `member ${g.key}`, ...awayDays(e, trip ?? undefined), e, goer: g, added: null, trip };
      }),
      ...f.added.map((a) => ({ who: `added ${a.name}`, ...awayDays(e), e, goer: null, added: a, trip: null })),
    ]),
  );
  const most = busiest(days);
  const today = one({ day: str }, sql`SELECT day FROM today`)?.day ?? '';
  const list = events.length > 0 ? summary(events.map(({ e, who }) => goingRow(e, who.said()))) : null;
  page(
    root,
    [
      c.name,
      h('p', { class: 'lede' }, members, ' · managed by ', personLink(c.manager)),
      most === undefined
        ? null
        : h(
            'p',
            {},
            `Most of the community is away ${dayRange(most.from, most.to)}: `,
            `${plural(most.people, 'person', 'people')}, ${placesOf(most.aways)}.`,
          ),
      h('p', { class: 'muted' }, `Visible to the ${members} of ${c.name}`),
      shareButton('Share this page', c.name),
    ],
    days.size > 0
      ? strip({
          today,
          days,
          label: (d, on) =>
            `${weekDay(d)}: ${on === undefined ? 'no one away' : `${plural(on.people, 'person', 'people')} away, ${placesOf(on.aways)}`}`,
          detail: (d, on) => dayDetail(d, on, c.manager),
          starts: events.map(({ e }) => e.start_date),
          toList: () => list?.scrollIntoView({ behavior: scrolling(), block: 'start' }),
          signal,
        })
      : null,
    list,
    comingUp(
      events.map(({ e, who }) => card(e, who)),
      'No one in this community has said they’re going anywhere yet.',
      'Where the community is going',
    ),
    h('section', {}, h('h2', {}, 'Members'), h('p', {}, joined(c.members.map(personLink)))),
  );
}

// Who of the community goes to a festival: its members, as their couple when both go and teaching when in the
// line-up, then the people its manager added, each name saying on hover who added them: each one teaching linked to
// their artist page, the others named together; said makes the words anew for each place that shows them. people
// counts them all, a couple as its two.
function whoGoes(
  e: Festival,
  f: Going,
  manager: Member,
): { goers: Festival['goers']; people: number; said: () => Kid[] } {
  const members = new Set(f.members),
    goers = e.goers.filter((g) => members.has(g.key));
  const going = f.added.filter((a) => a.artist === null);
  const title = `Added by ${manager.name}`;
  const said = (): Kid[] => {
    const added = [
      ...f.added.flatMap((a) =>
        a.artist === null
          ? []
          : [
              h(
                'span',
                { class: 'goer' },
                h('a', { href: artistHref(a.artist), class: 'artist', title }, a.name),
                ' ',
                doingTag([a]),
              ),
            ],
      ),
      going.length > 0
        ? h('span', {}, joined(going.map((a) => h('span', { title }, a.name))), ' ', doingTag(going))
        : null,
    ].filter((x) => x !== null);
    return [goersInline(goers), goers.length > 0 && added.length > 0 ? ' · ' : null, joined(added)];
  };
  return { goers, people: goers.length + f.added.length, said };
}

// where the festivals of these people are: "in Oslo", "in Oslo and Riga"; a festival with no city by its name
const placesOf = (aways: readonly Present[]): string => {
  const places = [...new Set(aways.map((a) => a.e.city ?? a.e.title))];
  return `in ${places.length > 1 ? `${places.slice(0, -1).join(', ')} and ${places.at(-1)}` : places.join('')}`;
};

// What a day's popover says: the day, its festivals, who flies in and out that day (by time and airport, a couple as
// one when both share the flight), who else is there, and where members stay. The people added are named, each
// saying on hover who added them, and never travel.
function dayDetail(day: string, on: Day<Present> | undefined, manager: Member): Kid[] {
  if (on === undefined)
    return [h('p', { class: 'strip-when' }, weekDay(day)), h('p', { class: 'muted' }, 'No one away')];
  const once = [...new Map(on.aways.map((a) => [a.who, a])).values()];
  const flying = (when: 'arrive' | 'leave', where: 'arrive_at' | 'leave_from'): Kid[] => {
    const by = new Map<string, Goer[]>();
    for (const a of once)
      if (a.trip?.[when].startsWith(day) && a.goer) {
        const at = `${a.trip[when].slice(11)}${a.trip[where] === null ? '' : ` ${a.trip[where]}`}`;
        by.set(at, [...(by.get(at) ?? []), a.goer]);
      }
    return [...by].map(([at, goers]) => `${namesOf(goers).join(' & ')} ${at}`);
  };
  const flyingIn = flying('arrive', 'arrive_at'),
    flyingOut = flying('leave', 'leave_from');
  const moving = (a: Present) => a.trip !== null && (a.trip.arrive.startsWith(day) || a.trip.leave.startsWith(day));
  const there = once.filter((a) => !moving(a));
  const title = `Added by ${manager.name}`;
  const stays = new Map<string, Goer[]>();
  for (const a of once) if (a.trip?.stay && a.goer) stays.set(a.trip.stay, [...(stays.get(a.trip.stay) ?? []), a.goer]);
  const line = (what: string, kids: readonly Kid[]) => (kids.length > 0 ? h('p', {}, `${what}: `, joined(kids)) : null);
  return [
    h('p', { class: 'strip-when' }, weekDay(day)),
    [...new Set(on.aways.map((a) => a.e))].map((e) =>
      h('p', {}, h('b', {}, e.title), e.city === null ? null : ` · ${e.city}`),
    ),
    line('Flying in', flyingIn),
    line('Flying out', flyingOut),
    line('There', [
      ...namesOf(there.flatMap((a) => (a.goer ? [a.goer] : []))),
      ...there.flatMap((a) => (a.added ? [h('span', { title }, a.added.name)] : [])),
    ]),
    [...stays].map(([stay, goers]) => h('p', {}, `Staying: ${stay}: `, joined(namesOf(goers)))),
  ];
}

// a festival's card, its going line saying who of the community is going
const card = (e: Festival, who: ReturnType<typeof whoGoes>): HTMLElement =>
  eventCard({ ...e, goers: who.goers }, { going: h('p', { class: 'going-line' }, h('span', {}, who.said())) });

// the first festivals of the list, and a button that shows the rest in place, or hides them again
function summary(rows: readonly HTMLElement[]): HTMLElement {
  const list = h('ul', { class: 'plan-list' }, rows);
  const rest = rows.slice(SHOWN);
  if (rest.length === 0) return list;
  const show = (open: boolean) => {
    for (const r of rest) r.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'See less' : 'See more';
  };
  const more = button(
    { class: 'more-btn', onclick: () => show(more.getAttribute('aria-expanded') !== 'true') },
    'See more',
  );
  show(false);
  return h('div', {}, list, more);
}
