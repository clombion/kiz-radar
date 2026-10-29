// Artists: a scannable list (who, from where, how often booked, where next) and a page per artist that
// leads with their upcoming festivals.
import { one, q, Sql, sql } from './db.ts';
import { button, dropdown, h, type Kid, moreButton, segments } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { changed, type Festival, readState, withDetails } from './festivals.ts';
import { alsoGoingTo, peopleOf } from './plans.ts';
import { alone, roleLabel } from './roles.ts';
import { artistHref, artistsHref, eventOnMapHref, personHref, type Show, showInAddressBar } from './routes.ts';
import { ARTIST_STATS, EVENT, flag as flagCol, num, opt, type RowOf, state, str } from './rows.ts';
import { KEY } from './states.ts';
import { countryName, dayMonth, dayYear, flag, place } from './ui.ts';
import { hasForm, text, where } from './wording.ts';

const PAGE = 60;
const festivals = (n: number) => `${n} festival${n === 1 ? '' : 's'}`;

// an artist as the list and their page have them
const ARTIST = { ...ARTIST_STATS, display_name: str, kind: state('artist_kind') } as const;
type Artist = RowOf<typeof ARTIST>;

// the roles a site shows, of a festival's comma-separated ones
const SHOWN = where('role', 'view');
const roleWords = (roles: string) =>
  SHOWN.filter((r) => roles.split(',').includes(r))
    .flatMap((r) => (hasForm('role', r, 'singular') ? [alone(r)] : []))
    .join(', ');

const ROLES: [string, string][] = [
  ['', 'Everyone'],
  ...[KEY.role.TEACHER, KEY.role.DJ].map((r): [string, string] => [r, text('role', r)]),
];
const KINDS: [string, string][] = [
  ['', 'People and couples'],
  ...where('artist_kind', 'view').map((k): [string, string] => [k, text('artist_kind', k)]),
];
// each order's words and its SQL
const ORDERS: Readonly<Record<string, readonly [string, Sql]>> = {
  bookings: ['Most festivals', sql`st.bookings DESC`],
  abroad: ['Most festivals abroad', sql`st.abroad_bookings DESC, st.bookings DESC`],
  countries: ['Most countries', sql`st.countries DESC, st.bookings DESC`],
  next: ['Next festival soonest', sql`st.bookings DESC`],
  name: ['Name', sql`a.display_name`],
};
// the column of artist_stats that counts each role's bookings
const COUNTS: Readonly<Record<string, Sql>> = { [KEY.role.TEACHER]: sql`st.teacher`, [KEY.role.DJ]: sql`st.dj` };
// a choice the address names, which readState keeps to those the list offers
function chosen<T>(choices: Readonly<Record<string, T>>, key: string): T {
  const found = choices[key];
  if (found === undefined) throw new Error(`artists: ${key} is no choice of the list`);
  return found;
}
const DEFAULTS: { q: string; role: string; country: string; sort: string; popular: number; kind: string } = {
  q: '',
  role: '',
  country: '',
  sort: 'bookings',
  popular: 0,
  kind: '',
};

export const artistsView: Show = (root, sub, qs, { signal }) => {
  if (sub[0]) {
    artistPage(root, Number(sub[0]));
    return;
  }
  const countries = q(
    { c: str },
    sql`SELECT DISTINCT country_code AS c FROM artist_countries WHERE country_code IS NOT NULL`,
  )
    .map((r) => r.c)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const st = readState(qs, DEFAULTS, {
    role: ROLES.map(([v]) => v),
    kind: KINDS.map(([v]) => v),
    sort: Object.keys(ORDERS),
    popular: [0, 1],
    country: ['', ...countries],
  });
  // each artist's next festival of their own (not only as part of a couple)
  const next = new Map(
    q(
      { artist_id: num, city: opt(str), country_code: opt(str), start_date: str },
      sql`SELECT ae.artist_id, e.city, e.country_code, min(e.start_date) AS start_date
      FROM artist_events ae JOIN event_rows e ON e.id = ae.event_id
      WHERE ae.via = 'direct' AND e.upcoming GROUP BY ae.artist_id`,
    ).map((r) => [r.artist_id, r]),
  );

  const search = h('input', {
    type: 'search',
    class: 'mini-search',
    placeholder: 'Search a name',
    value: st.q,
    'aria-label': 'Search artists',
  });
  const roleBtns = h('div', { class: 'seg', role: 'group', 'aria-label': 'Role' });
  const paintRoles = () =>
    roleBtns.replaceChildren(
      ...segments(ROLES, st.role, (v) => {
        st.role = v;
        render();
      }),
    );
  const sel = (k: 'kind' | 'country' | 'sort', opts: readonly (readonly [string, string])[], label: string) =>
    h(
      'label',
      { class: 'field' },
      h('span', {}, label),
      h(
        'select',
        {
          class: 'plain',
          onchange: (ev: Event) => {
            if (ev.target instanceof HTMLSelectElement) st[k] = ev.target.value;
            render();
          },
        },
        opts.map(([v, t]) => h('option', { value: v, selected: st[k] === v }, t)),
      ),
    );
  const pop = h('input', {
    type: 'checkbox',
    checked: Boolean(st.popular),
    onchange: () => {
      st.popular = pop.checked ? 1 : 0;
      render();
    },
  });
  const moreBtn = moreButton('artist-filters');
  const panel = h(
    'div',
    { class: 'more-panel', id: 'artist-filters', hidden: true },
    sel('kind', KINDS, 'Show'),
    sel(
      'country',
      [['', 'Anywhere'], ...countries.map((c): [string, string] => [c, `${flag(c)} ${countryName(c)}`])],
      'Booked in',
    ),
    sel(
      'sort',
      Object.entries(ORDERS).map(([v, [t]]): [string, string] => [v, t]),
      'Order',
    ),
    h('label', { class: 'check' }, pop, ' Only well-known artists (10+ festivals)'),
  );
  dropdown(moreBtn, panel, [moreBtn, panel], signal);
  const summary = h('p', { class: 'list-summary' });
  const list = h('ul', { class: 'artist-list' });
  const showMore = button({ class: 'more-btn show-more' });
  let shown = PAGE,
    rows: Artist[] = [];

  root.replaceChildren(
    h(
      'section',
      { class: 'artists-page' },
      h('div', { class: 'map-bar' }, search, roleBtns, h('div', { class: 'filters-wrap' }, moreBtn, panel)),
      summary,
      list,
      showMore,
    ),
  );

  function render() {
    showInAddressBar(artistsHref(changed(st, DEFAULTS)));
    paintRoles();
    const extra = [st.kind, st.country, st.sort !== 'bookings', st.popular].filter(Boolean).length;
    moreBtn.textContent = `More${extra ? ` (${extra})` : ''} ▾`;
    const [, order] = chosen(ORDERS, st.sort);
    const cond = [sql`1=1`],
      args: string[] = [];
    if (st.q) {
      cond.push(sql`(a.display_name LIKE ? OR a.id IN (SELECT artist_id FROM artist_aliases WHERE alias LIKE ?)
        OR a.id IN (SELECT cm.couple_id FROM couple_members cm JOIN artists m ON m.id = cm.member_id WHERE m.display_name LIKE ?))`);
      args.push(`%${st.q}%`, `%${st.q}%`, `%${st.q}%`);
    }
    if (st.role) cond.push(sql`${chosen(COUNTS, st.role)} > 0`);
    if (st.kind) {
      cond.push(sql`a.kind = ?`);
      args.push(st.kind);
    }
    if (st.popular) cond.push(sql`st.popular = 1`);
    if (st.country) {
      cond.push(sql`a.id IN (SELECT artist_id FROM artist_countries WHERE country_code = ?)`);
      args.push(st.country);
    }
    rows = q(
      ARTIST,
      sql`SELECT st.*, a.display_name, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id
      WHERE ${Sql.joined(cond, sql` AND `)} ORDER BY ${order}`,
      args,
    );
    const soonest = (a: Artist) => next.get(a.artist_id)?.start_date ?? '';
    if (st.sort === 'next')
      rows = rows.filter((a) => next.has(a.artist_id)).sort((a, b) => soonest(a).localeCompare(soonest(b)));
    shown = PAGE;
    paint();
  }
  function paint() {
    summary.textContent = `${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'artist' : 'artists'}${st.country ? ` booked in ${countryName(st.country)}` : ''}`;
    list.replaceChildren(...rows.slice(0, shown).map((a) => row(a, next.get(a.artist_id))));
    showMore.hidden = shown >= rows.length;
    showMore.textContent = `Show ${Math.min(PAGE, rows.length - shown)} more`;
  }
  showMore.addEventListener('click', () => {
    shown += PAGE;
    paint();
  });
  let pending: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      st.q = search.value.trim();
      render();
    }, 150);
  });
  render();
};

function row(
  a: Artist,
  nx: { city: string | null; country_code: string | null; start_date: string } | undefined,
): HTMLElement {
  return h(
    'li',
    {},
    h(
      'a',
      { href: artistHref(a.artist_id), class: 'artist-row' },
      h('span', { class: 'name' }, a.display_name),
      h(
        'span',
        { class: 'meta' },
        a.home_country ? [flag(a.home_country), ' ', countryName(a.home_country), ' · '] : null,
        roleLabel(a),
        ' · ',
        festivals(a.bookings),
      ),
      h('span', { class: 'next' }, nx ? ['Next: ', place(nx), ', ', dayMonth(nx.start_date)] : 'Nothing coming up yet'),
    ),
  );
}

// one artist's page: who they are, where they're booked, and the festivals they teach at or go to
const LINKED = { id: num, display_name: str, bookings: opt(num) } as const;
type Linked = RowOf<typeof LINKED>;
// "A, B and C"
const listed = <T>(xs: readonly T[], f: (x: T) => Kid[]): Kid[] =>
  xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', ...f(x)]);
const linked = (p: Pick<Linked, 'id' | 'display_name'>, extra: Kid): Kid[] => [
  h('a', { href: artistHref(p.id), class: 'artist' }, p.display_name),
  extra,
];

// their roles, where they're from or booked most, and how often
function lede(stats: Artist | null): Kid {
  if (stats === null || stats.bookings === 0) return 'Only booked as part of a couple';
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
    stats.abroad_bookings ? `, ${stats.abroad_bookings} abroad` : '',
  ];
}

// the couple's partners, or the couples a person is part of
function head(a: Pick<Artist, 'display_name' | 'kind'>, stats: Artist | null, members: Linked[], couples: Linked[]) {
  const partners =
    members.length > 0
      ? h(
          'p',
          {},
          'Partners: ',
          listed(members, (m) =>
            linked(m, m.bookings ? h('span', { class: 'muted' }, ` (${festivals(m.bookings)} on their own)`) : null),
          ),
        )
      : null;
  const inCouples =
    couples.length > 0
      ? h(
          'p',
          {},
          a.kind === KEY.artist_kind.COUPLE ? 'Also part of ' : 'Also books as ',
          listed(couples, (c) => linked(c, h('span', { class: 'muted' }, ` (${festivals(c.bookings ?? 0)})`))),
        )
      : null;
  return h(
    'header',
    { class: 'profile-head' },
    h('h1', {}, a.display_name),
    h('p', { class: 'lede' }, lede(stats)),
    partners,
    inCouples,
  );
}

const comingUp = (upcoming: readonly Festival[]) =>
  h(
    'section',
    {},
    h('h2', {}, upcoming.length > 0 ? `Coming up (${upcoming.length})` : 'Coming up'),
    upcoming.length > 0
      ? h(
          'div',
          { class: 'festival-cards' },
          upcoming.map((e) => eventCard(e)),
        )
      : h('p', { class: 'muted' }, 'No upcoming festivals listed yet.'),
  );

// the festivals the people they are said they're going to without teaching there
function alsoGoing(people: ReturnType<typeof peopleOf>, shown: readonly Festival[]): HTMLElement | null {
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
  return h(
    'section',
    {},
    h('h2', {}, `Also going to (${going.length})`),
    h(
      'p',
      { class: 'muted' },
      'Where ',
      listed(people, (p) => [h('a', { href: personHref(p.key) }, p.name)]),
      ' said they’re going, besides where they teach.',
    ),
    h(
      'div',
      { class: 'festival-cards' },
      going.map((e) => eventCard(e)),
    ),
  );
}

// the countries they're booked in, as bars
function bookedIn(id: number, ownOnly: boolean): HTMLElement | null {
  const cs = q(
    { country_code: str, bookings: num, is_home: flagCol },
    sql`SELECT country_code, bookings, is_home FROM artist_countries WHERE artist_id = ? AND country_code IS NOT NULL
    ORDER BY is_home DESC, bookings DESC`,
    [id],
  );
  if (cs.length === 0) return null;
  const max = Math.max(1, ...cs.map((c) => c.bookings));
  return h(
    'section',
    {},
    h('h2', {}, ownOnly ? 'Where they’re booked on their own' : 'Where they’re booked'),
    h(
      'ul',
      { class: 'bars' },
      cs.map((c) =>
        h(
          'li',
          {},
          h(
            'span',
            { class: 'label' },
            flag(c.country_code),
            ' ',
            countryName(c.country_code),
            c.is_home ? h('small', { class: 'muted' }, ' home') : null,
          ),
          h('span', { class: 'bar', style: `--w:${((100 * c.bookings) / max).toFixed(1)}%` }),
          h('span', { class: 'n' }, c.bookings),
        ),
      ),
    ),
  );
}

// the festivals they were booked at, latest first, with their role there when they weren't teaching
function pastList(id: number, past: readonly Festival[]): HTMLElement | null {
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
    return words ? ` · ${words}` : '';
  };
  return h(
    'details',
    { class: 'past' },
    h('summary', {}, `Past festivals (${past.length})`),
    h(
      'ul',
      {},
      past.map((e) =>
        h(
          'li',
          {},
          h('span', { class: 'when' }, dayYear(e.start_date)),
          h('a', { href: eventOnMapHref(e.id) }, e.title),
          h('span', { class: 'muted' }, ' · ', place(e), role(roles.get(e.id))),
        ),
      ),
    ),
  );
}

// the other names they're written as, and how their home is known
function notes(a: Pick<Artist, 'display_name'>, id: number, stats: Artist | null): HTMLElement {
  const aliases = q(
    { alias: str },
    sql`SELECT alias FROM artist_aliases WHERE artist_id = ? ORDER BY mentions DESC LIMIT 6`,
    [id],
  )
    .map((r) => r.alias)
    .filter((x) => x.toLowerCase() !== a.display_name.toLowerCase());
  return h(
    'div',
    { class: 'profile-notes' },
    aliases.length > 0 ? h('p', {}, 'Also written as ', aliases.join(' · ')) : null,
    h(
      'p',
      {},
      stats?.home_basis == null ? 'No line-up says where they’re from.' : text('home_basis', stats.home_basis),
    ),
  );
}

const BARE = { artist_id: num, display_name: str, kind: state('artist_kind') } as const;
function artistPage(root: HTMLElement, id: number): void {
  const moved = one({ new_id: num }, sql`SELECT new_id FROM artist_redirects WHERE old_id = ?`, [id]);
  if (moved) {
    location.replace(artistHref(moved.new_id));
    return;
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
  if (!a) {
    root.replaceChildren(h('p', {}, 'Artist not found.'));
    return;
  }
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
  root.replaceChildren(
    h(
      'article',
      { class: 'artist-profile' },
      h('a', { href: artistsHref(), class: 'back-link' }, '← All artists'),
      head(a, stats, members, couples),
      comingUp(events.filter((e) => e.upcoming)),
      alsoGoing(peopleOf(id), events),
      bookedIn(id, couples.length > 0 && a.kind !== KEY.artist_kind.COUPLE),
      pastList(
        id,
        events.filter((e) => !(e.upcoming || e.cancelled === true || e.listing === KEY.listing.GONE)).reverse(),
      ),
      notes(a, id, stats),
    ),
  );
}
