// A community's page (pipeline/communities.csv, community_members.csv, seeded.csv, trips.csv): who is in it, when most
// of it is away, the months it is away in, and an agenda of its trips, each opening on who travels when. Only its link
// reaches it: nothing lists communities. Its members and the people its manager added, who have not joined, are named;
// an added one's name says on hover who added them. Members say how they travel; the people added never do.
import {
  type Away,
  awayDays,
  busiest,
  type Day,
  daysOf,
  presence,
  relativeDay,
  spanOf,
  WEEKDAYS,
  weekday,
} from './calendar.ts';
import { one, q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { type Festival, withDetails } from './festivals.ts';
import { dayTimeAt, gantt, type Party, partyName } from './gantt.ts';
import { months, popover } from './months.ts';
import { page, personLink, shareButton } from './people.ts';
import { doingTag, type Goer, goersInline, namesOf } from './plans.ts';
import { artistHref, eventOnMapHref } from './routes.ts';
import { type Booked, booked, EVENT, num, opt, type RowOf, str } from './rows.ts';
import { dayMonth, dayParts, dayRange, monthYear, place, weekDay } from './ui.ts';
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

// someone of the community away for a festival: a member, with their trip when they said how they travel, or someone
// the manager added
interface Present extends Away {
  e: Festival;
  goer: Goer | null;
  added: Added | null;
  trip: Trip | null;
}
// a festival the community goes to: who of it goes, and who is away for it from when to when
interface Visit {
  e: Festival;
  who: ReturnType<typeof whoGoes>;
  aways: Present[];
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
  // who of it is away for each festival, and on each day: one count for the sentence and the months alike
  const trips: Visit[] = events.map(({ e, f, who }) => ({
    e,
    who,
    aways: [
      ...who.goers.map((g): Present => {
        const trip = f.trips.find((t) => t.key === g.key) ?? null;
        return { who: `member ${g.key}`, ...awayDays(e, trip ?? undefined), e, goer: g, added: null, trip };
      }),
      ...f.added.map((a): Present => ({ who: `added ${a.name}`, ...awayDays(e), e, goer: null, added: a, trip: null })),
    ],
  }));
  const days = presence(trips.flatMap((t) => t.aways));
  const most = busiest(days);
  const today = one({ day: str }, sql`SELECT day FROM today`)?.day ?? '';
  const members = plural(c.members.length, 'member');
  const [next] = events;
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
            'Most of the community is away ',
            h('b', {}, dayRange(most.from, most.to)),
            `: ${plural(most.people, 'person', 'people')}, ${placesOf(most.aways)}.`,
            next === undefined ? null : ` Next: ${next.e.city ?? next.e.title}, ${whenFrom(today, next.e)}.`,
          ),
      h(
        'div',
        { class: 'share-row' },
        shareButton('Share this page', c.name),
        h('span', { class: 'muted' }, `Visible to its ${members} only`),
      ),
    ],
    days.size > 0
      ? months({
          today,
          days,
          most: most?.people ?? 0,
          label: (d, on) =>
            `${weekDay(d)}: ${on === undefined ? 'no one away' : `${plural(on.people, 'person', 'people')} away, ${placesOf(on.aways)}`}`,
          festival: new Set(events.flatMap(({ e }) => daysOf(e.start_date, e.end_date))),
          pop: popover((d) => dayDetail(d, days.get(d), c.manager), signal),
        })
      : null,
    trips.length > 0
      ? agenda(trips, today, c.manager)
      : h('p', { class: 'muted' }, 'No one in this community has said they’re going anywhere yet.'),
    h(
      'section',
      {},
      h('h2', {}, 'Members'),
      h(
        'p',
        {},
        joined(
          c.members.map((m) => [
            personLink(m),
            m.key === c.manager.key ? h('span', { class: 'muted' }, ' manager') : null,
          ]),
        ),
      ),
    ),
  );
}

// when the next festival is, said from today: "now" when it has begun, "this Friday", or "on 20 Nov"
const whenFrom = (today: string, e: Festival): string =>
  e.start_date <= today ? 'now' : (relativeDay(today, e.start_date) ?? `on ${dayMonth(e.start_date)}`);

// "Fri 20 – Sun 22 Nov", "Thu 26 Nov – Tue 1 Dec": a festival's days, each with its weekday
function daysSaid(e: Festival): string {
  const { d1, m1, d2, m2 } = dayParts(e.start_date, e.end_date);
  const wd = (d: string) => WEEKDAYS[weekday(d)]?.slice(0, 3);
  if (e.start_date === e.end_date) return `${wd(e.start_date)} ${d1} ${m1}`;
  return m1 === m2
    ? `${wd(e.start_date)} ${d1} – ${wd(e.end_date)} ${d2} ${m1}`
    : `${wd(e.start_date)} ${d1} ${m1} – ${wd(e.end_date)} ${d2} ${m2}`;
}

// The agenda: a heading a month ("November · 3 trips", with its year in January and when it is not this year's),
// and a row a trip, the next open.
function agenda(trips: readonly Visit[], today: string, manager: Member): HTMLElement {
  const byMonth = new Map<string, Visit[]>();
  for (const t of trips) {
    const m = t.e.start_date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  return h(
    'section',
    { class: 'agenda' },
    [...byMonth].map(([m, here], i) => {
      const [name = '', year = ''] = monthYear(`${m}-01`).split(' ');
      const yearToo = m.endsWith('-01') || (i === 0 && year !== today.slice(0, 4));
      return [
        h(
          'h2',
          {},
          yearToo ? `${name} ${year}` : name,
          h('span', { class: 'agenda-n' }, ` · ${plural(here.length, 'trip')}`),
        ),
        h(
          'ol',
          { class: 'agenda-list' },
          here.map((t) => tripRow(t, manager, t === trips[0])),
        ),
      ];
    }),
  );
}

// A trip's row: its days, the festival (to it on the map) and where, who of the community goes; opened, a small Gantt
// of who travels when, the same in words, where members stay, and the festival's line-up and prices.
function tripRow({ e, who, aways }: Visit, manager: Member, open: boolean): HTMLElement {
  const id = `trip-${e.id}`;
  const flights = aways.flatMap((a) => (a.trip ? [a.trip] : []));
  const ps = parties(aways, manager);
  const said = h(
    'p',
    { class: 'gantt-said', id: `${id}-said` },
    ps.map((p, i) => [
      i > 0 ? ' · ' : null,
      h('b', {}, partyName(p)),
      p.flight === null
        ? ' not said'
        : ` in ${dayTimeAt(p.flight.arrive, p.flight.arrive_at)}, out ${dayTimeAt(p.flight.leave, p.flight.leave_from)}`,
    ]),
  );
  const stays = new Map<string, Goer[]>();
  for (const a of aways)
    if (a.trip?.stay && a.goer) stays.set(a.trip.stay, [...(stays.get(a.trip.stay) ?? []), a.goer]);
  const lineup = h('div', { class: 'trip-lineup', hidden: true });
  const lineupBtn = button(
    {
      class: 'link',
      'aria-expanded': 'false',
      onclick: () => {
        if (lineup.childElementCount === 0) lineup.append(eventCard({ ...e, goers: who.goers }, { open: true }));
        lineup.hidden = !lineup.hidden;
        lineupBtn.setAttribute('aria-expanded', String(!lineup.hidden));
      },
    },
    'Line-up & prices ▾',
  );
  const body = h(
    'div',
    { class: 'trip-body', id, hidden: !open },
    gantt({
      ...spanOf(e, flights),
      festival: e,
      place: e.city ?? e.title,
      parties: ps,
      describedBy: said.id,
    }),
    said,
    [...stays].map(([stay, goers]) =>
      h('p', {}, h('span', { class: 'trip-label' }, 'Staying'), ` ${stay} · `, joined(namesOf(goers))),
    ),
    h('p', {}, lineupBtn),
    lineup,
  );
  const toggle = button({
    class: 'trip-toggle',
    'aria-expanded': String(open),
    'aria-controls': id,
    'aria-label': `Who travels when, to ${e.title}`,
    onclick: () => {
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
    },
  });
  return h(
    'li',
    { class: 'trip' },
    h(
      'div',
      { class: 'trip-head' },
      h(
        'p',
        {},
        h('span', { class: 'trip-when' }, daysSaid(e)),
        ' ',
        h('a', { href: eventOnMapHref(e.id), class: 'trip-fest' }, e.title),
        h('span', { class: 'muted' }, ' · ', place(e)),
      ),
      h('p', { class: 'trip-who' }, who.said()),
      toggle,
    ),
    body,
  );
}

// The parties of a trip: the members who share a flight in and out (a couple as one), each member who has not said
// (a couple as one), and each person the manager added, who never travels, saying on hover who added them.
function parties(aways: readonly Present[], manager: Member): Party[] {
  const flying = new Map<string, { goers: Goer[]; flight: Trip }>();
  const unsaid: Goer[] = [];
  for (const a of aways) {
    if (a.goer === null) continue;
    if (a.trip === null) unsaid.push(a.goer);
    else {
      const key = [a.trip.arrive, a.trip.arrive_at, a.trip.leave, a.trip.leave_from].join(' ');
      const f = flying.get(key) ?? { goers: [], flight: a.trip };
      f.goers.push(a.goer);
      flying.set(key, f);
    }
  }
  const title = `Added by ${manager.name}`;
  return [
    ...[...flying.values()]
      .toSorted((a, b) => a.flight.arrive.localeCompare(b.flight.arrive))
      .map(({ goers, flight }) => ({ name: and(namesOf(goers)), title: null, flight })),
    ...namesOf(unsaid).map((name) => ({ name, title: null, flight: null })),
    ...aways.flatMap((a) => (a.added ? [{ name: a.added.name, title, flight: null }] : [])),
  ];
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
const placesOf = (aways: readonly Present[]): string =>
  `in ${and([...new Set(aways.map((a) => a.e.city ?? a.e.title))])}`;
// "A", "A and B", "A, B and C", as text
const and = (xs: readonly string[]): string =>
  xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join('');

// What a day's popover says: the day, its festivals, who flies in and out that day (by time and airport, a couple as
// one when both share the flight), who else is there, and where members stay. The people added are named, each
// saying on hover who added them, and never travel.
function dayDetail(day: string, on: Day<Present> | undefined, manager: Member): Kid[] {
  if (on === undefined) return [h('p', { class: 'day-when' }, weekDay(day)), h('p', { class: 'muted' }, 'No one away')];
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
    h('p', { class: 'day-when' }, weekDay(day)),
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
