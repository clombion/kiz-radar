// Artists: a scannable list (who, from where, how often booked, where next) and a page per artist that
// leads with their upcoming festivals.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { For, Show } from 'solid-js';
import { debounced, styled } from './bits.ts';
import { check, choices, chosen, dropdown, leftOut, only, paged, searchField, segments } from './controls.tsx';
import { today } from './days.ts';
import { one, q, Sql, sql } from './db.ts';
import { festivalCards } from './eventcard.tsx';
import { type Festival, withDetails } from './festivals.ts';
import { fold } from './fold.ts';
import { createDerived, disposal, Redrawn, type ViewProps } from './mount.tsx';
import { type Named, nameLines } from './names.ts';
import { alsoGoingTo, peopleOf } from './plans.tsx';
import { alone, roleLabel } from './roles.ts';
import { artistHref, artistsHref, changed, eventOnMapHref, personHref, readState } from './routes.ts';
import { ARTIST_STATS, EVENT, flag as flagCol, num, opt, type RowOf, state, states, str } from './rows.ts';
import { KEY } from './states.ts';
import { countryName, dayMonth, dayYear, flag, place } from './ui.ts';
import { hasForm, joined, type Key, plural, text, where } from './wording.ts';

const PAGE = 60;
const festivals = (n: number) => plural(n, 'festival');

// an artist as the list and their page have them
const ARTIST = { ...ARTIST_STATS, display_name: str, kind: state('artist_kind') } as const;
type Artist = RowOf<typeof ARTIST>;

// the roles a site shows, of a festival's comma-separated ones
const SHOWN = where('role', 'view');
const roleWords = (roles: string) =>
  SHOWN.filter((r) => roles.split(',').includes(r))
    .flatMap((r) => (hasForm('role', r, 'singular') ? [alone(r)] : []))
    .join(', ');

// the roles the list narrows to, and the column of artist_stats that counts each one's bookings
type Role = typeof KEY.role.TEACHER | typeof KEY.role.DJ;
const COUNTS: Readonly<Record<Role, Sql>> = { [KEY.role.TEACHER]: sql`st.teacher`, [KEY.role.DJ]: sql`st.dj` };
const ROLES: readonly (readonly ['' | Role, string])[] = [
  ['', 'Everyone'],
  ...[KEY.role.TEACHER, KEY.role.DJ].map((r) => [r, text('role', r)] as const),
];
type Kind = '' | Key<'artist_kind'>;
const KINDS: readonly (readonly [Kind, string])[] = [
  ['', 'People and couples'],
  ...where('artist_kind', 'view').map((k) => [k, text('artist_kind', k)] as const),
];
// each order's words, and its SQL (the next festival's order is the artists' own, after the SQL's)
const ORDERS = [
  ['bookings', 'Most festivals'],
  ['abroad', 'Most festivals abroad'],
  ['countries', 'Most countries'],
  ['next', 'Next festival soonest'],
  ['name', 'Name'],
] as const;
type Order = (typeof ORDERS)[number][0];
const ORDER_BY: Readonly<Record<Order, Sql>> = {
  bookings: sql`st.bookings DESC`,
  abroad: sql`st.abroad_bookings DESC, st.bookings DESC`,
  countries: sql`st.countries DESC, st.bookings DESC`,
  next: sql`st.bookings DESC`,
  name: sql`a.display_name`,
};
const DEFAULTS: { q: string; role: '' | Role; country: string; sort: Order; popular: number; kind: Kind } = {
  q: '',
  role: '',
  country: '',
  sort: 'bookings',
  popular: 0,
  kind: '',
};

// each artist's names, folded as the search folds what is typed (fold.ts): their own, their aliases, and a couple's
// members'; read once, on the first search
let names: ReadonlyMap<number, readonly string[]> | undefined;
function namesOf(): ReadonlyMap<number, readonly string[]> {
  if (names === undefined) {
    const all = new Map<number, string[]>();
    for (const r of q(
      { id: num, name: str },
      sql`SELECT id, display_name AS name FROM artists
      UNION ALL SELECT artist_id, alias FROM artist_aliases
      UNION ALL SELECT cm.couple_id, m.display_name FROM couple_members cm JOIN artists m ON m.id = cm.member_id`,
    ))
      all.set(r.id, [...(all.get(r.id) ?? []), fold(r.name)]);
    names = all;
  }
  return names;
}

// the festivals that make an artist well known (artist_stats.popular), as the build counted them
const wellKnown = (): number => {
  const m = one({ value: str }, sql`SELECT value FROM meta WHERE key = 'popular_threshold'`);
  if (m === undefined) throw new Error('the database has no popular_threshold');
  return Number(m.value);
};

// the countries the list can be narrowed to, by name: those its artists were booked in (artist_countries)
export const artistCountries = (): string[] =>
  q({ c: str }, sql`SELECT DISTINCT country_code AS c FROM artist_countries WHERE country_code IS NOT NULL`)
    .map((r) => r.c)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));

// the artists the choices keep, in the order chosen; next has each one's next festival
type Choices = typeof DEFAULTS;
function chosenArtists(st: Readonly<Choices>, next: ReadonlyMap<number, { start_date: string }>): readonly Artist[] {
  const cond = [sql`1=1`],
    args: string[] = [];
  if (st.role) cond.push(sql`${COUNTS[st.role]} > 0`);
  if (st.kind) {
    cond.push(sql`a.kind = ?`);
    args.push(st.kind);
  }
  if (st.popular) cond.push(sql`st.popular = 1`);
  if (st.country) {
    cond.push(sql`a.id IN (SELECT artist_id FROM artist_countries WHERE country_code = ?)`);
    args.push(st.country);
  }
  let rows = q(
    ARTIST,
    sql`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id
    WHERE ${Sql.joined(cond, sql` AND `)} ORDER BY ${ORDER_BY[st.sort]}`,
    args,
  );
  if (st.q) {
    const typed = fold(st.q);
    rows = rows.filter(
      (a) =>
        namesOf()
          .get(a.artist_id)
          ?.some((n) => n.includes(typed)) === true,
    );
  }
  // an order orders and keeps everyone: those with no festival coming after the rest, most booked first
  const soonest = (a: Artist) => next.get(a.artist_id)?.start_date ?? '9999'; // after every date
  // oxlint-disable-next-line house/states -- next is an order the address names (sort=next), not tier_today's state
  if (st.sort === 'next') rows = rows.toSorted((a, b) => soonest(a).localeCompare(soonest(b)));
  return rows;
}

export const artists = ({ sub: [id], qs }: ViewProps): JSX.Element =>
  id !== undefined && id !== '' ? artistPage(Number(id)) : artistList(qs);

function artistList(qs: string): JSX.Element {
  const countries = artistCountries();
  const { state: asked, dropped } = readState(qs, DEFAULTS, {
    role: ROLES.map(([v]) => v),
    kind: KINDS.map(([v]) => v),
    sort: ORDERS.map(([v]) => v),
    popular: [0, 1],
    country: ['', ...countries],
  });
  const [st, set] = chosen<Readonly<Choices>>(asked, (now) => artistsHref(changed(now, DEFAULTS)));
  // each artist's next festival of their own (not only as part of a couple)
  const next = new Map(
    q(
      { artist_id: num, city: opt(str), country_code: opt(str), start_date: str },
      sql`SELECT artist_id, city, country_code, start_date FROM (
        SELECT ae.artist_id, e.city, e.country_code, e.start_date,
          row_number() OVER (PARTITION BY ae.artist_id ORDER BY e.start_date, e.id) AS n
        FROM artist_events ae JOIN event_rows e ON e.id = ae.event_id
        WHERE ae.via = 'direct' AND e.upcoming
      ) WHERE n = 1`,
    ).map((r) => [r.artist_id, r]),
  );
  // the artists the choices keep, drawn anew with them; the summary what it last was, should it throw
  const { drawn, last } = createDerived(() => ({ now: st(), rows: chosenArtists(st(), next) }));
  const sel = <K extends 'kind' | 'country' | 'sort'>(
    k: K,
    opts: readonly (readonly [Choices[K], string])[],
    label: string,
  ): JSX.Element => (
    <label class="field">
      <span>{label}</span>
      {choices(opts, asked[k], (v) => set(only(k, v)), { class: 'plain' })}
    </label>
  );
  // how many artists the list keeps, and where they were booked when it says
  const summary = ({ now, rows }: { readonly now: Readonly<Choices>; readonly rows: readonly Artist[] }) =>
    `${plural(rows.length, 'artist')}${now.country ? ` booked in ${countryName(now.country)}` : ''}`;
  const left = disposal();
  const filters = dropdown();
  const extra = () => {
    const now = st();
    return [now.kind, now.country, now.sort !== 'bookings', now.popular].filter(Boolean).length;
  };

  return (
    <>
      {leftOut(dropped)}
      <section class="artists-page">
        <div class="map-bar">
          {searchField({
            label: 'Search artists',
            hint: 'Search a name',
            first: asked.q,
            heard: debounced((words: string) => {
              if (!left.aborted) set({ q: words.trim() });
            }),
          })}
          {segments(
            'Role',
            ROLES,
            () => st().role,
            (role) => set({ role }),
          )}
          {filters.wrapped(
            'artist-filters',
            <>{`More${extra() ? ` (${extra()})` : ''} ▾`}</>,
            <>
              {sel('kind', KINDS, 'Show')}
              {sel(
                'country',
                [['', 'Anywhere'], ...countries.map((c): [string, string] => [c, `${flag(c)} ${countryName(c)}`])],
                'Booked in',
              )}
              {sel('sort', ORDERS, 'Order')}
              {check(` Only well-known artists (${wellKnown()}+ festivals)`, asked.popular !== 0, (on) =>
                set({ popular: on ? 1 : 0 }),
              )}
            </>,
          )}
        </div>
        <p class="list-summary">{summary(last())}</p>
        <Redrawn>
          <Show when={drawn()} keyed>
            {({ rows }) => {
              const list = paged(rows, PAGE, (a) => row(a, next.get(a.artist_id)));
              return (
                <>
                  <ul class="artist-list">{list.rows}</ul>
                  {list.more}
                </>
              );
            }}
          </Show>
        </Redrawn>
      </section>
    </>
  );
}

function row(
  a: Artist,
  nx: { readonly city: string | null; readonly country_code: string | null; readonly start_date: string } | undefined,
): JSX.Element {
  return (
    <li>
      <a href={artistHref(a.artist_id)} class="artist-row">
        <span class="name">{a.display_name}</span>
        <span class="meta">
          {a.home_country !== null && a.home_country !== ''
            ? [flag(a.home_country), ' ', countryName(a.home_country), ' · ']
            : null}
          {roleLabel(a)}
          {' · '}
          {festivals(a.bookings)}
        </span>
        <span class="next">{nx ? ['Next: ', place(nx), ', ', dayMonth(nx.start_date)] : 'Nothing coming up yet'}</span>
      </a>
    </li>
  );
}

// one artist's page: who they are, where they're booked, and the festivals they teach at or go to
const LINKED = { id: num, display_name: str, bookings: opt(num) } as const;
type Linked = RowOf<typeof LINKED>;
const linked = (p: Pick<Linked, 'id' | 'display_name'>, extra: JSX.Element): JSX.Element => [
  <a href={artistHref(p.id)} class="artist">
    {p.display_name}
  </a>,
  extra,
];

// their roles, where they're from or booked most, and how often
function lede(stats: Artist | null): JSX.Element {
  if (stats === null) return 'Only booked as part of a couple'; // artist_stats has the artists booked on their own
  const from =
    stats.home_country === null
      ? stats.booked_most_in === null
        ? null
        : [', booked mostly in ', countryName(stats.booked_most_in)]
      : [' from ', flag(stats.home_country), ' ', countryName(stats.home_country)];
  return [
    roleLabel(stats),
    from,
    ' · ',
    festivals(stats.bookings),
    (stats.abroad_bookings ?? 0) > 0 ? `, ${stats.abroad_bookings} abroad` : '',
  ];
}

// the couple's partners, or the couples a person is part of
function head(
  a: Pick<Artist, 'display_name' | 'kind'>,
  stats: Artist | null,
  members: readonly Linked[],
  couples: readonly Linked[],
): JSX.Element {
  return (
    <header class="profile-head">
      <h1>{a.display_name}</h1>
      <p class="lede">{lede(stats)}</p>
      {members.length > 0 ? (
        <p>
          {'Partners: '}
          {joined(
            members.map((m) =>
              linked(
                m,
                m.bookings !== null && m.bookings !== 0 ? (
                  <span class="muted">{` (${festivals(m.bookings)} on their own)`}</span>
                ) : null,
              ),
            ),
          )}
        </p>
      ) : null}
      {couples.length > 0 ? (
        <p>
          {a.kind === KEY.artist_kind.COUPLE ? 'Also part of ' : 'Also books as '}
          {joined(couples.map((c) => linked(c, <span class="muted">{` (${festivals(c.bookings ?? 0)})`}</span>)))}
        </p>
      ) : null}
    </header>
  );
}

const comingUp = (upcoming: readonly Festival[]): JSX.Element => (
  <section>
    <h2>{upcoming.length > 0 ? `Coming up (${upcoming.length})` : 'Coming up'}</h2>
    {upcoming.length > 0 ? festivalCards(upcoming) : <p class="muted">No upcoming festivals listed yet.</p>}
  </section>
);

// the festivals the people they are said they're going to without teaching there
function alsoGoing(people: ReturnType<typeof peopleOf>, shown: readonly Festival[]): JSX.Element {
  const ids = alsoGoingTo(
    people.map((p) => p.id),
    shown.map((e) => e.id),
  );
  if (ids.length === 0) return null;
  const going = withDetails(
    q(EVENT, sql`SELECT * FROM event_rows WHERE id IN (SELECT value FROM json_each(?)) ORDER BY start_date`, [
      JSON.stringify(ids),
    ]),
  );
  return (
    <section>
      <h2>{`Also going to (${going.length})`}</h2>
      <p class="muted">
        {'Where '}
        {joined(people.map((p) => <a href={personHref(p.key)}>{p.name}</a>))}
        {' said they’re going, besides where they teach.'}
      </p>
      {festivalCards(going)}
    </section>
  );
}

// the countries they're booked in, as bars
function bookedIn(id: number, ownOnly: boolean): JSX.Element {
  const cs = q(
    { country_code: str, bookings: num, is_home: flagCol },
    sql`SELECT country_code, bookings, is_home FROM artist_countries WHERE artist_id = ? AND country_code IS NOT NULL
    ORDER BY is_home DESC, bookings DESC`,
    [id],
  );
  if (cs.length === 0) return null;
  const max = Math.max(1, ...cs.map((c) => c.bookings));
  return (
    <section>
      <h2>{ownOnly ? 'Where they’re booked on their own' : 'Where they’re booked'}</h2>
      <ul class="bars">
        <For each={cs}>
          {(c) => (
            <li>
              <span>
                {flag(c.country_code)} {countryName(c.country_code)}
                {c.is_home ? <small class="muted"> home</small> : null}
              </span>
              <span class="bar" ref={styled({ '--w': `${((100 * c.bookings) / max).toFixed(1)}%` })} />
              <span class="n">{c.bookings}</span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

// the festivals they were booked at, latest first, with their role there when they weren't teaching
function pastList(id: number, past: readonly Festival[]): JSX.Element {
  if (past.length === 0) return null;
  const roles = new Map(
    q(
      { event_id: num, r: str },
      sql`SELECT event_id, group_concat(DISTINCT role) AS r FROM artist_events WHERE artist_id = ? AND via = 'direct'
      GROUP BY event_id`,
      [id],
    ).map((r) => [r.event_id, r.r]),
  );
  const role = (r: string | undefined) => {
    const words = r === undefined || r === KEY.role.TEACHER ? null : roleWords(r);
    return words !== null && words !== '' ? ` · ${words}` : '';
  };
  return (
    <details class="past">
      <summary>{`Past festivals (${past.length})`}</summary>
      <ul>
        <For each={past}>
          {(e) => (
            <li>
              <span class="when">{dayYear(e.start_date)}</span>
              <a href={eventOnMapHref(e.id)}>{e.title}</a>
              <span class="muted">
                {' · '}
                {place(e)}
                {role(roles.get(e.id))}
              </span>
            </li>
          )}
        </For>
      </ul>
    </details>
  );
}

// a name they were booked under, as the page says it: its years, whether a rename, and the roles that know them by it
const NAMED = {
  name: str,
  first_date: str,
  last_date: str,
  renamed: flagCol,
  as_roles: states('role'),
} as const;
const bookedAs = (id: number): Named[] =>
  q(
    NAMED,
    sql`SELECT name, first_date, last_date, renamed, as_roles FROM artist_names WHERE artist_id = ?
    ORDER BY last_date DESC, name`,
    [id],
  ).map((n) => ({
    name: n.name,
    first: n.first_date,
    last: n.last_date,
    renamed: n.renamed,
    as: n.as_roles.map((r) => (hasForm('role', r, 'singular') ? alone(r) : r)),
  }));

// their names (a rename; the names each role knows them by), the other names they're written as, and how their home
// is known
function notes(a: Pick<Artist, 'display_name'>, id: number, stats: Artist | null): JSX.Element {
  const known = bookedAs(id);
  const said = new Set([a.display_name, ...known.map((n) => n.name)].map((n) => n.toLowerCase()));
  const aliases = q(
    { alias: str },
    sql`SELECT alias FROM artist_aliases WHERE artist_id = ? ORDER BY mentions DESC LIMIT 6`,
    [id],
  )
    .map((r) => r.alias)
    .filter((x) => !said.has(x.toLowerCase()));
  return (
    <div class="profile-notes">
      <For each={nameLines(known, today())}>{(line) => <p>{line}</p>}</For>
      {aliases.length > 0 ? (
        <p>
          {'Also written as '}
          {aliases.join(' · ')}
        </p>
      ) : null}
      <p>{stats?.home_basis == null ? 'No line-up says where they’re from.' : text('home_basis', stats.home_basis)}</p>
    </div>
  );
}

const BARE = { artist_id: num, display_name: str, kind: state('artist_kind') } as const;
function artistPage(id: number): JSX.Element {
  const moved = one({ new_id: num }, sql`SELECT new_id FROM artist_redirects WHERE old_id = ?`, [id]);
  if (moved) {
    location.replace(artistHref(moved.new_id));
    return null;
  }
  // an artist booked only as half of a couple has no stats of their own
  const stats =
    one(
      ARTIST,
      sql`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?`,
      [id],
    ) ?? null;
  const a =
    stats ?? one(BARE, sql`SELECT a.id AS artist_id, a.display_name, a.kind FROM artists a WHERE a.id = ?`, [id]);
  if (!a) return <p>Artist not found.</p>;
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT * FROM event_rows
    WHERE id IN (SELECT event_id FROM artist_events WHERE artist_id = ? AND via = 'direct') ORDER BY start_date`,
      [id],
    ),
  );
  const members = q(
    LINKED,
    sql`SELECT m.id, m.display_name, st.bookings FROM couple_members cm JOIN artists m ON m.id = cm.member_id
    LEFT JOIN artist_stats st ON st.artist_id = m.id WHERE cm.couple_id = ?`,
    [id],
  );
  const couples = q(
    LINKED,
    sql`SELECT c.id, c.display_name, st.bookings FROM couple_members cm JOIN artists c ON c.id = cm.couple_id
    LEFT JOIN artist_stats st ON st.artist_id = c.id WHERE cm.member_id = ? ORDER BY st.bookings DESC`,
    [id],
  );
  return (
    <article class="artist-profile">
      <a href={artistsHref()} class="back-link">
        ← All artists
      </a>
      {head(a, stats, members, couples)}
      {comingUp(events.filter((e) => e.upcoming))}
      {alsoGoing(peopleOf(id), events)}
      {bookedIn(id, couples.length > 0 && a.kind !== KEY.artist_kind.COUPLE)}
      {pastList(id, events.filter((e) => e.phase === KEY.phase.ENDED).reverse())}
      {notes(a, id, stats)}
    </article>
  );
}
