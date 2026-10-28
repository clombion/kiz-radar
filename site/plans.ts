// Who said they're going to a festival (pipeline/people.csv and plans.csv). Cards name featured people and count
// the rest; partners who are both going are named as their couple. Someone in a festival's line-up, alone or in a
// couple, is teaching (or playing) there rather than just going.
import { one, q, sql } from './db.ts';
import type { Kid } from './dom.ts';
import { h, nodes } from './dom.ts';
import { type Modal, modal } from './modal.ts';
import { artistHref, eventOnMapHref, personHref } from './routes.ts';
import { flag as flagCol, num, opt, type RowOf, state, str } from './rows.ts';
import { KEY } from './states.ts';
import { countryName, dayRange, flag, place } from './ui.ts';
import { type Key, text } from './wording.ts';

// someone who said they're going to a festival, and what they're booked there as, if they are
const GOER = {
  person_id: num,
  key: str,
  name: str,
  featured: flagCol,
  event_id: num,
  booked_as: opt(state('role')),
} as const;
export interface Goer {
  person_id: number;
  key: string;
  name: string;
  featured: boolean;
  booked_as: Key<'role'> | null;
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
    sql`SELECT a.id, a.display_name,
      group_concat(pa.person_id) AS people, count(*) AS n, (SELECT count(*) FROM couple_members WHERE couple_id = a.id) AS members
    FROM couple_members cm JOIN artists a ON a.id = cm.couple_id JOIN person_artists pa ON pa.artist_id = cm.member_id GROUP BY a.id`,
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
    names: h('b', {}, and(named(people).map(nameButton))),
  };
}
// who's going to one festival, inline: each person or couple linked, with what they're doing there
export const goersInline = (goers: Goer[]): Kid[] =>
  and(
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

const AS: Partial<Record<Key<'role'>, string>> = {
  teacher: 'teaching',
  dj: 'playing',
  performer: 'performing',
  mc: 'hosting',
};
const doing = (people: readonly Pick<Goer, 'booked_as'>[]): string => {
  const role = people[0]?.booked_as;
  return role && people.every((p) => p.booked_as) ? (AS[role] ?? 'going') : 'going';
};
const faces = (people: readonly { name: string }[]) =>
  h(
    'span',
    { class: 'faces', 'aria-hidden': 'true' },
    people.map((p) => h('span', { class: 'face' }, p.name[0])),
  );
const and = (xs: readonly Kid[]): Kid[] => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', x]);
const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

// A name in a card or under the sentence opens the quick view of that person or couple; "3 more people" opens the
// list of everyone going. Neither leaves the page.
const nameButton = (g: Named) =>
  h(
    'button',
    {
      type: 'button',
      class: 'goer-name',
      onclick: (ev: Event) => {
        ev.stopPropagation();
        peekGroup(g, ev.currentTarget);
      },
    },
    g.name,
  );
const tagOf = (d: string) => h('span', { class: `plan-tag${d === 'going' ? '' : ' booked'}` }, d);

// "Cédric & Christina are going · 3 more people too", or "3 people said they're going"; null when nobody has said
export function goingLine(e: Going): HTMLElement | null {
  if (e.goers.length === 0) return null;
  const featured = e.goers.filter((g) => g.featured),
    others = e.goers.length - featured.length;
  const groups = named(featured),
    many = featured.length > 1;
  const more = (words: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'goer-name',
        onclick: (ev: Event) => {
          ev.stopPropagation();
          peekEvent(e, ev.currentTarget);
        },
      },
      words,
    );
  return h(
    'p',
    { class: 'going-line' },
    faces(featured),
    h(
      'span',
      {},

      groups.length > 0
        ? [h('b', {}, and(groups.map(nameButton))), ` ${many ? 'are' : 'is'} ${doing(featured)}`]
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
    { class: 'roster who' },
    h('h4', {}, 'Who’s going', h('span', { class: 'n' }, e.goers.length)),
    h(
      'ul',
      {},
      everyone(e).map((g) => h('li', {}, faces(g.people), nameButton(g), ' ', tagOf(doing(g.people)))),
    ),
  );
}
const everyone = (e: Going): Named[] => [
  ...named(e.goers.filter((g) => g.featured)),
  ...named(e.goers.filter((g) => !g.featured)),
];

// ----- the quick view: a person or couple's plans, or everyone going to a festival, over the page -----
interface Peek {
  m: Modal;
  title: HTMLElement;
  sub: HTMLElement;
  lead: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
}
let view: Peek | undefined;
function peekDialog(): Peek {
  if (view) return view;
  const title = h('h2', { id: 'peek-title' }),
    sub = h('p', { class: 'sub' }),
    lead = h('span', { class: 'peek-faces' });
  const body = h('div', { class: 'peek-body' }),
    foot = h('div', { class: 'peek-foot' });
  const close = h(
    'button',
    { type: 'button', class: 'peek-close', 'aria-label': 'Close', onclick: () => void view?.m.shut() },
    '×',
  );
  const dlg = h(
    'dialog',
    { class: 'peek', 'aria-labelledby': 'peek-title' },
    h('div', { class: 'peek-head' }, lead, h('div', {}, title, sub), close),
    body,
    foot,
  );
  const made = { m: modal(dlg), title, sub, lead, body, foot };
  view = made;
  return made;
}
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
const link = (href: string, ...kids: Kid[]) =>
  h(
    'a',
    {
      href,
      onclick: (ev: Event) => {
        ev.preventDefault();
        void view?.m.go(href);
      },
    },
    ...kids,
  );

// a person's plans to come, by festival
const PLAN = {
  person_id: num,
  name: str,
  booked_as: opt(state('role')),
  id: num,
  title: str,
  city: opt(str),
  country_code: opt(str),
  start_date: str,
  end_date: str,
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
          { teacher: num, dj: num, home_country: opt(str) },
          sql`SELECT st.teacher, st.dj, st.home_country FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?`,
          [artistId],
        );
  if (a === undefined) return 'Shares their festival plans';
  const booked = [...(a.teacher ? [KEY.role.TEACHER] : []), ...(a.dj ? [KEY.role.DJ] : [])];
  const role = (booked.length > 0 ? booked : [KEY.role.PERFORMER])
    .map((r) => text('role', r, {}, g.people.length > 1 ? undefined : 'singular'))
    .join(' & ');
  return [role, a.home_country === null ? null : [' from ', flag(a.home_country), ' ', countryName(a.home_country)]];
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
    h(
      'button',
      { type: 'button', class: 'link back-link', onclick: () => peekEvent(e) },
      '← Everyone going to ',
      e.title,
    );
  show(from ?? null, {
    title: `Who’s going to ${e.title}`,
    sub: [dayRange(e.start_date, e.end_date), ' · ', place(e)],
    body: [
      h(
        'ul',
        { class: 'peek-people' },
        groups.map((g) =>
          h(
            'li',
            {},
            faces(g.people),
            h('button', { type: 'button', class: 'goer-name', onclick: () => peekGroup(g, null, backTo()) }, g.name),
            ' ',
            tagOf(doing(g.people)),
          ),
        ),
      ),
    ],
  });
}

// A person, and the artist records they are, directly or as half of a couple: those with bookings of their own,
// since a partner's record alone only repeats the couple's.
export function person(key: string): {
  id: number;
  key: string;
  name: string;
  featured: boolean;
  artists: { id: number; display_name: string }[];
} | null {
  const p = one({ id: num, key: str, name: str, featured: flagCol }, sql`SELECT * FROM people WHERE key = ?`, [key]);
  if (!p) return null;
  return {
    ...p,
    artists: q(
      { id: num, display_name: str },
      sql`SELECT a.id, a.display_name FROM artists a JOIN artist_stats st ON st.artist_id = a.id WHERE a.id IN (
      SELECT artist_id FROM person_artists WHERE person_id = ?
      UNION SELECT cm.couple_id FROM person_artists pa JOIN couple_members cm ON cm.member_id = pa.artist_id WHERE pa.person_id = ?)
    ORDER BY st.bookings DESC`,
      [p.id, p.id],
    ),
  };
}
// The festivals still to come that some of these people said they're going to, where they aren't in the line-up.
export const alsoGoingTo = (personIds: readonly number[]): number[] =>
  personIds.length > 0
    ? q(
        { event_id: num },
        sql`SELECT DISTINCT event_id FROM plan_rows JOIN event_rows e ON e.id = event_id
  WHERE person_id IN (SELECT value FROM json_each(?)) AND booked_as IS NULL AND e.upcoming`,
        [JSON.stringify(personIds)],
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
