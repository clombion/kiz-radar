// Who said they're going to a festival (pipeline/people.csv and plans.csv). Cards name featured people and count
// the rest; partners who are both going are named as their couple. Someone in a festival's line-up, alone or in a
// couple, is teaching (or playing) there rather than just going.
import { one, q, sql } from './db.ts';
import type { Kid } from './dom.ts';
import { button, h, nodes, own } from './dom.ts';
import { leaving, type Peek, peek } from './modal.ts';
import { roleLabel } from './roles.ts';
import { artistHref, eventOnMapHref, personHref } from './routes.ts';
import {
  BOOKINGS,
  type Booked,
  booked,
  flag as flagCol,
  num,
  opt,
  PLACE_AND_DAYS,
  type RowOf,
  state,
  str,
} from './rows.ts';
import { KEY } from './states.ts';
import { countryName, dayRange, flag, place } from './ui.ts';
import { joined, text } from './wording.ts';

// someone who said they're going to a festival, and what they're booked there as, if they are
const GOER = {
  person_id: num,
  key: str,
  name: str,
  featured: flagCol,
  event_id: num,
  booked_as: opt(booked),
} as const;
export interface Goer {
  person_id: number;
  key: string;
  name: string;
  featured: boolean;
  booked_as: Booked | null;
}
// a couple whose partners are all people here
interface Couple {
  artist: number;
  name: string;
  people: number[];
}
// who to name: a couple when both partners go, otherwise a person
interface Named {
  name: string;
  href: string;
  artist?: number;
  people: Goer[];
}

let loaded: { byEvent: Map<number, Goer[]>; couples: Couple[] } | undefined;
function load(): { byEvent: Map<number, Goer[]>; couples: Couple[] } {
  if (loaded) return loaded;
  const byEvent = new Map<number, Goer[]>();
  for (const r of q(
    GOER,
    sql`SELECT person_id, key, name, featured, event_id, booked_as FROM plan_rows ORDER BY featured DESC, name`,
  ))
    byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r]);
  const couples = q(
    { id: num, display_name: str, people: str, n: num, members: num },
    sql`SELECT a.id, a.display_name, group_concat(pa.person_id) AS people, count(*) AS n, m.members
    FROM couple_members cm JOIN artists a ON a.id = cm.couple_id JOIN person_artists pa ON pa.artist_id = cm.member_id
      JOIN (SELECT couple_id, count(*) AS members FROM couple_members GROUP BY couple_id) m ON m.couple_id = a.id
    GROUP BY a.id, a.display_name, m.members`,
  )
    .filter((c) => c.n === c.members)
    .map((c) => ({ artist: c.id, name: c.display_name, people: c.people.split(',').map(Number) }));
  loaded = { byEvent, couples };
  return loaded;
}

export const goersOf = (eventId: number): Goer[] => load().byEvent.get(eventId) ?? [];
// a festival as these views need it
interface Going {
  goers: Goer[];
  title: string;
  start_date: string;
  end_date: string;
  country_code: string | null;
  city: string | null;
}

// the featured people going to any of these festivals: "Cédric & Christina" and to how many; null when none is
export function friendsIn(
  rows: readonly { goers: Goer[] }[],
): { n: number; many: boolean; faces: HTMLElement; names: HTMLElement } | null {
  const at = rows.filter((e) => e.goers.some((g) => g.featured));
  if (at.length === 0) return null;
  const people = [
    ...new Map(at.flatMap((e) => e.goers.filter((g) => g.featured)).map((g) => [g.person_id, g])).values(),
  ];
  return {
    n: at.length,
    many: people.length > 1,
    faces: faces(people),
    names: h('b', {}, joined(named(people).map(nameButton))),
  };
}
// who's going to one festival, inline: each person or couple linked, with what they're doing there
export const goersInline = (goers: Goer[]): Kid[] =>
  joined(
    named(goers).map((g) =>
      h('span', { class: 'goer' }, h('a', { href: g.href, class: 'artist' }, g.name), ' ', tagOf(doing(g.people))),
    ),
  );

// goers as the names to show: a couple when both partners go, otherwise each person
function named(goers: readonly Goer[]): Named[] {
  const left = new Map(goers.map((g) => [g.person_id, g])),
    out: Named[] = [];
  for (const c of load().couples) {
    const partners = c.people.flatMap((p) => left.get(p) ?? []);
    if (partners.length < c.people.length) continue;
    out.push({ name: c.name, href: artistHref(c.artist), artist: c.artist, people: partners });
    for (const p of c.people) left.delete(p);
  }
  for (const g of left.values()) out.push({ name: g.name, href: personHref(g.key), people: [g] });
  return out;
}

// "teaching": what they do there, when every one of them is booked, as the first is; else they are going
const doing = (people: readonly Pick<Goer, 'booked_as'>[]): string => {
  const role = people[0]?.booked_as;
  return role && people.every((p) => p.booked_as) ? text('role', role, {}, 'doing') : 'going';
};
const faces = (people: readonly { name: string }[]) =>
  h(
    'span',
    { class: 'faces', 'aria-hidden': 'true' },
    people.map((p) => h('span', { class: 'face' }, p.name[0])),
  );
const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

// A name in a card or under the sentence opens the quick view of that person or couple; "3 more people" opens the
// list of everyone going. Neither leaves the page.
// a name that opens a quick view, from inside a card or another quick view
const goerName = (words: string, open: (from: Element | null) => void) =>
  button({ class: 'goer-name', onclick: own(open) }, words);
const nameButton = (g: Named) => goerName(g.name, (b) => peekGroup(g, b));
const tagOf = (d: string) => h('span', { class: ['plan-tag', d !== 'going' && 'booked'] }, d);
// someone going, in a list of who's going: their faces, their name opening their plans, and how they're going
const goerRow = (g: Named, open: (from: Element | null) => void) =>
  h('li', {}, faces(g.people), goerName(g.name, open), ' ', tagOf(doing(g.people)));

// "Cédric & Christina are going · 3 more people too", or "3 people said they're going"; null when nobody has said
export function goingLine(e: Going): HTMLElement | null {
  if (e.goers.length === 0) return null;
  const featured = e.goers.filter((g) => g.featured),
    others = e.goers.length - featured.length;
  const groups = named(featured),
    many = featured.length > 1;
  const more = (words: string) => goerName(words, (b) => peekEvent(e, b));
  return h(
    'p',
    { class: 'going-line' },
    faces(featured),
    h(
      'span',
      {},

      groups.length > 0
        ? [h('b', {}, joined(groups.map(nameButton))), ` ${many ? 'are' : 'is'} ${doing(featured)}`]
        : null,
      others
        ? groups.length > 0
          ? [' · ', more(`${others} more ${others === 1 ? 'person' : 'people'}`), ' too']
          : [more(count(others)), ' said they’re going']
        : null,
    ),
  );
}

// the list in an opened card: featured people first, each with what they're doing there
export function whoIsGoing(e: Going): HTMLElement | null {
  if (e.goers.length === 0) return null;
  return h(
    'section',
    { class: ['roster', 'who'] },
    h('h4', {}, 'Who’s going', h('span', { class: 'n' }, e.goers.length)),
    h(
      'ul',
      {},
      everyone(e).map((g) => goerRow(g, (b) => peekGroup(g, b))),
    ),
  );
}
const everyone = (e: Going): Named[] => [
  ...named(e.goers.filter((g) => g.featured)),
  ...named(e.goers.filter((g) => !g.featured)),
];

// ----- the quick view: a person or couple's plans, or everyone going to a festival, over the page -----
let view: Peek | undefined;
const peekDialog = (): Peek => {
  view ??= peek('peek-title');
  return view;
};
function show(
  from: EventTarget | null,
  { faces: f, title, sub, body, foot }: { faces?: HTMLElement; title: string; sub: Kid; body: Kid[]; foot?: Kid },
) {
  const v = peekDialog();
  v.lead.replaceChildren(f ?? '');
  v.title.textContent = title;
  v.sub.replaceChildren(...nodes([sub]));
  v.body.replaceChildren(...nodes(body));
  v.foot.replaceChildren(...nodes([foot]));
  v.body.scrollTop = 0;
  if (from instanceof Element) v.m.open(from);
}
const link = (href: string, ...kids: Kid[]) => leaving(peekDialog().m, href, ...kids);

// a person's plans to come, by festival
const PLAN = {
  person_id: num,
  name: str,
  booked_as: opt(booked),
  id: num,
  title: str,
  ...PLACE_AND_DAYS,
} as const;
type Plan = RowOf<typeof PLAN>;
function plansOf(g: Named): Map<number, { e: Plan; people: Plan[] }> {
  const byEvent = new Map<number, { e: Plan; people: Plan[] }>();
  for (const r of q(
    PLAN,
    sql`SELECT pr.person_id, pr.name, pr.booked_as, e.id, e.title, e.city, e.country_code, e.start_date, e.end_date
    FROM plan_rows pr JOIN event_rows e ON e.id = pr.event_id
    WHERE pr.person_id IN (SELECT value FROM json_each(?)) AND e.upcoming ORDER BY e.start_date`,
    [JSON.stringify(g.people.map((p) => p.person_id))],
  )) {
    const at = byEvent.get(r.id) ?? { e: r, people: [] };
    at.people.push(r);
    byEvent.set(r.id, at);
  }
  return byEvent;
}

// a line about them, from their artist record when they have one
function aboutLine(g: Named): Kid {
  const [first] = g.people;
  const artistId = g.artist ?? (first === undefined ? undefined : person(first.key)?.artists[0]?.id);
  const a =
    artistId === undefined
      ? undefined
      : one(
          { kind: state('artist_kind'), ...BOOKINGS, home_country: opt(str) },
          sql`SELECT a.kind, st.teacher, st.dj, st.performer, st.mc, st.home_country
          FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?`,
          [artistId],
        );
  if (a === undefined) return 'Shares their festival plans';
  // one person, whose most booked artist may be a couple they are in: what they are booked as, said of a person
  const said = g.artist === undefined && a.kind === KEY.artist_kind.COUPLE ? { ...a, kind: KEY.artist_kind.PERSON } : a;
  return [
    roleLabel(said),
    a.home_country === null ? null : [' from ', flag(a.home_country), ' ', countryName(a.home_country)],
  ];
}

// one festival they're going to, with which of them when only some are
const planItem = (g: Named, e: Plan, people: readonly Plan[]) =>
  h(
    'li',
    {},
    h('span', { class: 'when' }, dayRange(e.start_date, e.end_date)),
    h(
      'span',
      { class: 'what' },
      link(eventOnMapHref(e.id), e.title),
      h(
        'span',
        { class: 'muted' },
        ' · ',
        place(e),
        people.length < g.people.length ? ` · ${people.map((p) => p.name).join(', ')}` : '',
      ),
    ),
    tagOf(doing(people)),
  );

// Where a person or a couple is going: what they're doing there, and which of them when only one goes.
function peekGroup(g: Named, from: EventTarget | null, back?: HTMLElement) {
  const byEvent = plansOf(g);
  show(from, {
    faces: faces(g.people),
    title: g.name,
    sub: aboutLine(g),
    body: [
      back ?? null,
      h('h3', {}, `Coming up · ${byEvent.size}`),
      byEvent.size > 0
        ? h(
            'ul',
            { class: 'peek-plans' },
            [...byEvent.values()].map(({ e, people }) => planItem(g, e, people)),
          )
        : h('p', { class: 'muted' }, 'No festival plans coming up.'),
    ].filter(Boolean),
    foot: link(g.href, 'See their page →'),
  });
}

// Everyone going to one festival; a name opens their own quick view, with a way back to this list.
function peekEvent(e: Going, from?: EventTarget | null) {
  const groups = everyone(e);
  const backTo = () =>
    button({ class: ['link', 'back-link'], onclick: () => peekEvent(e) }, '← Everyone going to ', e.title);
  show(from ?? null, {
    title: `Who’s going to ${e.title}`,
    sub: [dayRange(e.start_date, e.end_date), ' · ', place(e)],
    body: [
      h(
        'ul',
        { class: 'peek-people' },
        groups.map((g) => goerRow(g, () => peekGroup(g, null, backTo()))),
      ),
    ],
  });
}

// A person, and the artist records they are, directly or as half of a couple: those with bookings of their own,
// since a partner's record alone only repeats the couple's.
export interface Person {
  id: number;
  key: string;
  name: string;
  featured: boolean;
  artists: { id: number; display_name: string }[];
}
// everyone with plans, featured first, then by name, and how many of their festivals are still to come
export const withPlans = (): { key: string; name: string; upcoming: number }[] =>
  q(
    { key: str, name: str, upcoming: num },
    sql`SELECT pe.key, pe.name, sum(e.upcoming) AS upcoming FROM people pe JOIN plans p ON p.person_id = pe.id
    JOIN event_rows e ON e.id = p.event_id GROUP BY pe.id ORDER BY pe.featured DESC, pe.name`,
  );
// everyone sharing plans, by key, each with the artists they are, a couple they are in among them, most booked first;
// read once
let sharing: ReadonlyMap<string, Person> | undefined;
export function person(key: string): Person | null {
  if (sharing === undefined) {
    const artists = new Map<number, Person['artists']>();
    for (const r of q(
      { person_id: num, id: num, display_name: str },
      sql`SELECT pa.person_id, a.id, a.display_name FROM (
        SELECT person_id, artist_id FROM person_artists
        UNION SELECT pa.person_id, cm.couple_id FROM person_artists pa JOIN couple_members cm ON cm.member_id = pa.artist_id
      ) pa JOIN artists a ON a.id = pa.artist_id JOIN artist_stats st ON st.artist_id = a.id
      ORDER BY st.bookings DESC, a.id`,
    ))
      artists.set(r.person_id, [...(artists.get(r.person_id) ?? []), { id: r.id, display_name: r.display_name }]);
    sharing = new Map(
      q({ id: num, key: str, name: str, featured: flagCol }, sql`SELECT id, key, name, featured FROM people`).map(
        (p) => [p.key, { ...p, artists: artists.get(p.id) ?? [] }],
      ),
    );
  }
  return sharing.get(key) ?? null;
}
// The festivals still to come that some of these people said they're going to, where they aren't in the line-up,
// leaving out the ones the page lists already (an artist's page lists every festival the artist is named at).
export const alsoGoingTo = (personIds: readonly number[], listed: readonly number[]): number[] =>
  personIds.length > 0
    ? q(
        { event_id: num },
        sql`SELECT DISTINCT event_id FROM plan_rows JOIN event_rows e ON e.id = event_id
  WHERE person_id IN (SELECT value FROM json_each(?)) AND booked_as IS NULL AND e.upcoming
    AND event_id NOT IN (SELECT value FROM json_each(?))`,
        [JSON.stringify(personIds), JSON.stringify(listed)],
      ).map((r) => r.event_id)
    : [];
// The people who are this artist, or a partner in this couple.
export const peopleOf = (artistId: number) =>
  q(
    { id: num, key: str, name: str },
    sql`SELECT DISTINCT pe.id, pe.key, pe.name FROM person_artists pa JOIN people pe ON pe.id = pa.person_id
  WHERE pa.artist_id = ? OR pa.artist_id IN (SELECT member_id FROM couple_members WHERE couple_id = ?) ORDER BY pe.name`,
    [artistId, artistId],
  );
