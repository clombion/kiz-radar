// Who said they're going to a festival (pipeline/people.csv and plans.csv). Cards name featured people and count
// the rest; partners who are both going are named as their couple. Someone in a festival's line-up, alone or in a
// couple, is teaching (or playing) there rather than just going. Its renderers and quick views are drawn by Solid,
// called by the views as they draw.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { For } from 'solid-js';
import { own } from './bits.ts';
import { one, q, site, sql } from './db.ts';
import { leaving, type Peek, peek, type Shown } from './dialog.tsx';
import { nowTag } from './marks.tsx';
import { roleLabel } from './roles.ts';
import { artistHref, eventOnMapHref, friendsHref, personHref } from './routes.ts';
import {
  type Booked,
  booked,
  BOOKINGS,
  flag as flagCol,
  num,
  opt,
  PLACE_AND_DAYS,
  type RowOf,
  state,
  str,
  unsure,
} from './rows.ts';
import { KEY } from './states.ts';
import { countryName, dayRange, flag, place } from './ui.ts';
import type { Key } from './wording.ts';
import { joined, plural, text } from './wording.ts';

// someone who said they're going to a festival, or that they may, and what they're booked there as, if they are
const GOER = {
  person_id: num,
  key: str,
  name: str,
  featured: flagCol,
  event_id: num,
  plan: state('plan'),
  booked_as: opt(booked),
} as const;
export interface Goer {
  readonly person_id: number;
  readonly key: string;
  readonly name: string;
  readonly featured: boolean;
  readonly plan: Key<'plan'>;
  readonly booked_as: Booked | null;
}
// what is said of someone going: their plan (going, or maybe), and what they are booked there as, if they are
type Plans = Pick<Goer, 'plan' | 'booked_as'>;
// a couple whose partners are all people here
interface Couple {
  readonly artist: number;
  readonly name: string;
  readonly people: readonly number[];
}
// who to name: a couple when both partners go, otherwise a person
interface Named {
  readonly name: string;
  readonly href: string;
  readonly artist?: number;
  readonly people: readonly Goer[];
}

let loaded: { byEvent: Map<number, Goer[]>; couples: Couple[] } | undefined;
function load(): { byEvent: Map<number, Goer[]>; couples: Couple[] } {
  if (loaded) return loaded;
  const byEvent = new Map<number, Goer[]>();
  for (const r of q(
    GOER,
    sql`SELECT person_id, key, name, featured, event_id, status AS plan, booked_as FROM plan_rows
    ORDER BY featured DESC, name`,
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
  readonly goers: readonly Goer[];
  readonly title: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly country_code: string | null;
  readonly city: string | null;
}

// the featured people going to any of these festivals: "Cédric & Christina" and to how many; null when none is
export function friendsIn(
  rows: readonly { readonly goers: readonly Goer[] }[],
): { n: number; many: boolean; faces: () => JSX.Element; names: () => JSX.Element } | null {
  // the friends going: someone who only may go is said so on the festival's card, not here
  const sure = (g: Goer) => g.featured && !unsure(g);
  const at = rows.filter((e) => e.goers.some(sure));
  if (at.length === 0) return null;
  const people = [...new Map(at.flatMap((e) => e.goers.filter(sure)).map((g) => [g.person_id, g])).values()];
  return {
    n: at.length,
    many: people.length > 1,
    faces: () => faces(people),
    names: () => <b>{joined(named(people).map(nameButton))}</b>,
  };
}
// who's going to one festival, inline: each person or couple linked, with what they're doing there
export const goersInline = (goers: readonly Goer[]): JSX.Element =>
  joined(
    named(goers).map((g) => (
      <span class="goer">
        <a href={g.href} class="artist">
          {g.name}
        </a>{' '}
        {doingTag(g.people)}
      </span>
    )),
  );

// the names to say of these goers, a couple's when both partners are among them
export const namesOf = (goers: readonly Goer[]): string[] => named(goers).map((g) => g.name);
// the couple each goer is in, by their person id, when both partners are among these goers
export const couplesAmong = (goers: readonly Goer[]): Map<number, { key: string; name: string }> =>
  new Map(
    named(goers).flatMap((n) =>
      n.people.length > 1 ? n.people.map((g) => [g.person_id, { key: String(n.artist), name: n.name }] as const) : [],
    ),
  );
// goers as the names to show: a couple when both partners go (or both may), otherwise each person
function named(goers: readonly Goer[]): Named[] {
  const left = new Map(goers.map((g) => [g.person_id, g])),
    out: Named[] = [];
  for (const c of load().couples) {
    const partners = c.people.flatMap((p) => left.get(p) ?? []);
    if (partners.length < c.people.length || new Set(partners.map(unsure)).size > 1) continue;
    out.push({ name: c.name, href: artistHref(c.artist), artist: c.artist, people: partners });
    for (const p of c.people) left.delete(p);
  }
  for (const g of left.values()) out.push({ name: g.name, href: personHref(g.key), people: [g] });
  return out;
}

// "teaching": what they do there, when every one of them is booked, as the first is; else "maybe" when every one may
// go, or else "going"
const doing = (people: readonly Plans[]): { readonly words: string; readonly as: 'booked' | Key<'plan'> } => {
  const role = people[0]?.booked_as;
  if (role && people.every((p) => p.booked_as)) return { words: text('role', role, {}, 'doing'), as: 'booked' };
  const plan = people.length > 0 && people.every(unsure) ? KEY.plan.MAYBE : KEY.plan.GOING;
  return { words: text('plan', plan), as: plan };
};
const faces = (people: readonly { readonly name: string }[]) => (
  <span class="faces" aria-hidden="true">
    <For each={people}>{(p) => <span class="face">{p.name[0]}</span>}</For>
  </span>
);
const count = (n: number) => plural(n, 'person', 'people');

// A name in a card or under the sentence opens the quick view of that person or couple; "3 more people" opens the
// list of everyone going. Neither leaves the page.
// a name that opens a quick view, from inside a card or another quick view
const goerName = (words: string, open: (from: Element | null) => void) => (
  <button type="button" class="goer-name" onClick={own(open)}>
    {words}
  </button>
);
const nameButton = (g: Named) => goerName(g.name, (b) => peekGroup(g, b));
const tagOf = ({ words, as }: ReturnType<typeof doing>) => (
  <span class={['plan-tag', as === 'booked' && 'booked', as === KEY.plan.MAYBE && 'unsure']}>{words}</span>
);
// what these people do there, as a tag: teaching when all of them are in the line-up, else maybe or going
export const doingTag = (people: readonly Plans[]): JSX.Element => tagOf(doing(people));
// someone going, in a list of who's going: their faces, their name opening their plans, and how they're going
const goerRow = (g: Named, open: (from: Element | null) => void) => (
  <li>
    {faces(g.people)}
    {goerName(g.name, open)} {tagOf(doing(g.people))}
  </li>
);

// "Cédric & Christina are going · Tonje may go · 3 more people too", or "3 people said they're going"; null when
// nobody has said. The others are counted whether they go or may: their list says which.
export function goingLine(e: Going): JSX.Element {
  if (e.goers.length === 0) return null;
  const featured = e.goers.filter((g) => g.featured),
    others = e.goers.length - featured.length;
  const sure = featured.filter((g) => !unsure(g)),
    may = featured.filter(unsure);
  const more = (words: string) => goerName(words, (b) => peekEvent(e, b));
  const said = [
    sure.length > 0
      ? [<b>{joined(named(sure).map(nameButton))}</b>, ` ${sure.length > 1 ? 'are' : 'is'} ${doing(sure).words}`]
      : null,
    may.length > 0
      ? [<b>{joined(named(may).map(nameButton))}</b>, ` ${text('plan', KEY.plan.MAYBE, {}, 'line')}`]
      : null,
  ].filter((x) => x !== null);
  return (
    <p class="going-line">
      {faces(featured)}
      <span>
        {said.flatMap((x, i) => (i === 0 ? [x] : [' · ', x]))}
        {others
          ? said.length > 0
            ? [' · ', more(plural(others, 'more person', 'more people')), ' too']
            : [more(count(others)), ' said they’re going']
          : null}
      </span>
    </p>
  );
}

// Who goes to a festival as lines, one per thing they do there: teaching (or playing) first, then going, then maybe,
// each labelled by it. A line names up to NAMED_UP_TO people or couples, the ticked first; past that, the first ones
// and "and 5 more", which opens the list of everyone going, the ticked always named.
const NAMED_UP_TO = 4;
const NAMED_PAST = 3; // named on a line past NAMED_UP_TO
export function whoLines(e: Going, ticked: ReadonlySet<string> = new Set()): JSX.Element {
  const isTicked = (g: Named) => g.people.some((p) => ticked.has(p.key));
  const lines = new Map<string, { as: ReturnType<typeof doing>['as']; groups: Named[] }>();
  for (const g of named(e.goers)) {
    const d = doing(g.people);
    const line = lines.get(d.words) ?? { as: d.as, groups: [] };
    line.groups.push(g);
    lines.set(d.words, line);
  }
  const rank = (as: string) => (as === 'booked' ? 0 : as === KEY.plan.GOING ? 1 : 2);
  const sorted = [...lines.entries()].sort(([, a], [, b]) => rank(a.as) - rank(b.as));
  return (
    <div class="who-lines">
      <For each={sorted}>
        {([words, { groups }]) => {
          const ordered = [...groups.filter(isTicked), ...groups.filter((g) => !isTicked(g))];
          const shown =
            ordered.length <= NAMED_UP_TO
              ? ordered
              : ordered.slice(0, Math.max(NAMED_PAST, ordered.filter(isTicked).length));
          const more = ordered.length - shown.length;
          return (
            <p>
              <span class="who-label">{words}</span>
              <span>
                {joined([
                  ...shown.map(nameButton),
                  ...(more > 0 ? [goerName(`${more} more`, (b) => peekEvent(e, b))] : []),
                ])}
              </span>
            </p>
          );
        }}
      </For>
    </div>
  );
}

// the list in an opened card: featured people first, each with what they're doing there
export function whoIsGoing(e: Going): JSX.Element {
  if (e.goers.length === 0) return null;
  return (
    <section class={['roster', 'who']}>
      <h4>
        Who’s going<span class="n">{counted(e.goers)}</span>
      </h4>
      <ul>
        <For each={everyone(e)}>{(g) => goerRow(g, (b) => peekGroup(g, b))}</For>
      </ul>
    </section>
  );
}
// how many go, and how many may: "5", "4 · 1 maybe"
const counted = (people: readonly Plans[]): string => {
  const may = people.filter(unsure).length;
  return may === 0 ? String(people.length) : `${people.length - may} · ${may} ${text('plan', KEY.plan.MAYBE)}`;
};
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
// what is shown drawn in the quick view, opened from where it was asked (an element), or kept open as it is (null: a
// name in the list of everyone going, or the way back to it)
function show(from: Element | null, what: Shown): void {
  const v = peekDialog();
  v.show(what);
  if (from !== null) v.m.open(from);
}
const link = (href: string, words: JSX.Element) => leaving(peekDialog().m, href, words);

// a person's plans to come, by festival
const PLAN = {
  person_id: num,
  name: str,
  plan: state('plan'),
  booked_as: opt(booked),
  id: num,
  title: str,
  phase: state('phase'),
  ...PLACE_AND_DAYS,
} as const;
type Plan = RowOf<typeof PLAN>;
function plansOf(g: Named): Map<number, { e: Plan; people: Plan[] }> {
  const byEvent = new Map<number, { e: Plan; people: Plan[] }>();
  for (const r of q(
    PLAN,
    sql`SELECT pr.person_id, pr.name, pr.status AS plan, pr.booked_as, e.id, e.title, e.phase, e.city, e.country_code, e.start_date, e.end_date
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
function aboutLine(g: Named): JSX.Element {
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

// a festival in a list of who's going: its days, its name (a link to it), On now when it is, its place and what else
// is said of it, and who
type Listed = { readonly id: number; readonly title: string; readonly phase: Key<'phase'> } & RowOf<
  typeof PLACE_AND_DAYS
>;
const planRow = (e: Listed, name: JSX.Element, who: JSX.Element, also = '') => (
  <li>
    <span class="when">{dayRange(e.start_date, e.end_date)}</span>
    <span class="what">
      {nowTag(e)}
      {name}
      <span class="muted">
        {' · '}
        {place(e)}
        {also}
      </span>
    </span>
    {who}
  </li>
);
// one festival they're going to, with which of them when only some are
const planItem = (g: Named, e: Plan, people: readonly Plan[]) =>
  planRow(
    e,
    link(eventOnMapHref(e.id), e.title),
    tagOf(doing(people)),
    people.length < g.people.length ? ` · ${people.map((p) => p.name).join(', ')}` : '',
  );

// Where a person or a couple is going: what they're doing there, and which of them when only one goes; back, the way
// back to the list it was opened from. Its plans are read as the quick view draws them.
function peekGroup(g: Named, from: Element | null, back?: () => JSX.Element) {
  show(from, {
    lead: () => faces(g.people),
    title: g.name,
    sub: () => aboutLine(g),
    body: () => {
      const byEvent = [...plansOf(g).values()];
      return [
        back?.() ?? null,
        <h3>{`Coming up · ${byEvent.length}`}</h3>,
        byEvent.length > 0 ? (
          <ul class="peek-plans">
            <For each={byEvent}>{({ e, people }) => planItem(g, e, people)}</For>
          </ul>
        ) : (
          <p class="muted">No festival plans coming up.</p>
        ),
      ];
    },
    foot: () => [
      link(g.href, 'See their page →'),
      link(togetherHref(g.people.map((p) => p.key)), <span class="muted">Festivals in common with others →</span>),
    ],
  });
}

// Everyone going to one festival; a name opens their own quick view, with a way back to this list.
function peekEvent(e: Going, from: Element | null = null) {
  const backTo = () => (
    <button type="button" class={['link', 'back-link']} onClick={() => peekEvent(e)}>
      ← Everyone going to {e.title}
    </button>
  );
  show(from, {
    title: `Who’s going to ${e.title}`,
    sub: () => [dayRange(e.start_date, e.end_date), ' · ', place(e)],
    body: () => (
      <ul class="peek-people">
        <For each={everyone(e)}>{(g) => goerRow(g, () => peekGroup(g, null, backTo))}</For>
      </ul>
    ),
  });
}
// how far from the site's home city someone lives and is near it, in km
export const NEAR_KM = 200;
interface Spot {
  readonly lat: number;
  readonly lon: number;
}
// the kilometres between two places, on a round Earth
function kmBetween(a: Spot, b: Spot): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h2 =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h2));
}
// the site's home city, where the people near are looked for
const homeCity = () =>
  one({ lat: num, lon: num }, sql`SELECT lat, lon FROM cities WHERE key = ?`, [site().home.city_key]);
// the keys of the people sharing plans who live within NEAR_KM of the home city; those who have not said where they
// live never
export function livingNear(): Set<string> {
  const home = homeCity();
  if (home === undefined) return new Set();
  return new Set(
    q({ key: str, lat: num, lon: num }, sql`SELECT p.key, c.lat, c.lon FROM people p JOIN cities c ON c.key = p.home`)
      .filter((p) => kmBetween(home, p) <= NEAR_KM)
      .map((p) => p.key),
  );
}
// The Friends tab's list with these people ticked, the festivals they all go to: near the home city when they all live
// there, else everywhere, so that none of them is left out of it
export const togetherHref = (keys: readonly string[]): string => {
  const near = livingNear();
  return friendsHref({
    ...(keys.every((k) => near.has(k)) ? {} : { in: 'everywhere' }),
    with: keys.join(','),
  });
};

// A person, and the artist records they are, directly or as half of a couple: those with bookings of their own,
// since a partner's record alone only repeats the couple's.
export interface Person {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly featured: boolean;
  readonly artists: readonly { readonly id: number; readonly display_name: string }[];
}
// everyone with plans, featured first, then by name, and how many of their festivals are still to come
export const withPlans = (): readonly { readonly key: string; readonly name: string; readonly upcoming: number }[] =>
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
