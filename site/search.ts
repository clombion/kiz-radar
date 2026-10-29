// Search across the site, in a dialog opened from the header (or with / and Ctrl/⌘+K). Results come in groups that
// always keep their order: people who share their plans, festivals, artists, places, then dances and highlights. The
// text field keeps the focus and the arrow keys move a highlight through the results (the WAI-ARIA combobox with a
// listbox).
// Picking a result goes where that kind of thing lives: a festival opens on the map, an artist on their page, a city
// on the map, and a country, style or highlight narrows the festival list, keeping its other choices.

import { today } from './days.ts';
import { q, site, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { CHECKED, type Checked, type Festival, festivals, hasWith, isDance, WITH, type With } from './festivals.ts';
import { fold, words } from './fold.ts';
import { icon } from './icons.ts';
import { leaving, modal } from './modal.ts';
import { person } from './plans.ts';
import { roleLabel } from './roles.ts';
import {
  artistHref,
  artistsHref,
  cityOnMapHref,
  eventOnMapHref,
  festivalsHref,
  mapHref,
  type Params,
  personHref,
} from './routes.ts';
import { BOOKINGS, flag as flagCol, num, opt, PLACE_AND_DAYS, type RowOf, state, str } from './rows.ts';
import { KEY } from './states.ts';
import { away, dayMonth, flag, place } from './ui.ts';
import { text } from './wording.ts';

const SHOWN = 5; // results per group until "Show all"
type Group = 'person' | 'festival' | 'artist' | 'place' | 'tag';
const GROUPS: readonly (readonly [Group, string])[] = [
  ['person', 'Friends'],
  ['festival', 'Festivals'],
  ['artist', 'Artists'],
  ['place', 'Places'],
  ['tag', 'Dances & highlights'],
];
// a dance or highlight to search for: one the list narrows to, or one it has a checkbox for
type TagKey = With | Checked;
// before anything is typed: what can be searched, as things to tap (tags by their key)
const SUGGEST_STYLES: readonly TagKey[] = [KEY.genre.SALSA, KEY.genre.ZOUK, KEY.genre.BACHATA, KEY.genre.KOMPA];
const SUGGEST_HIGHLIGHTS: readonly TagKey[] = [KEY.feature.PROMO_CODE, 'taxi', KEY.feature.POOL_PARTY, 'allin'];
const SUGGEST_COUNTRIES = 4;

// what the search finds: each kind of thing with what its row shows and where picking it goes
const FOUND_EVENT = {
  id: num,
  title: str,
  listed_title: str,
  venue: opt(str),
  ...PLACE_AND_DAYS,
  upcoming: flagCol,
  cancelled: opt(flagCol),
  listing: state('listing'),
  lat: opt(num),
  url: str,
  code: opt(str),
} as const;
type FoundEvent = RowOf<typeof FOUND_EVENT>;
const FOUND_ARTIST = {
  id: num,
  display_name: str,
  kind: state('artist_kind'),
  bookings: num,
  ...BOOKINGS,
  home_country: opt(str),
} as const;
type FoundArtist = RowOf<typeof FOUND_ARTIST>;
interface Base {
  name: string;
  words: string[];
  nameWords: string[];
  past: boolean; // nothing coming up: a festival over, someone with no plans ahead, a place with no festival ahead
  rank: number; // higher first, among items of its kind only (before)
}
type Item = Base &
  (
    | { kind: 'festival'; e: FoundEvent }
    | { kind: 'person'; p: NonNullable<ReturnType<typeof person>>; upcoming: number }
    | { kind: 'artist'; a: FoundArtist; shares: boolean }
    | { kind: 'country'; country: { code: string; name: string }; n: number }
    | { kind: 'city'; city: City }
    | { kind: 'tag'; key: TagKey; params: Params; n: number; icon: string | null; style: boolean }
  );
interface City {
  city: string;
  cc: string | null;
  upcoming: number;
  all: number;
}
type Kind = Item['kind'];
type Found<K extends Kind> = Extract<Item, { kind: K }>;
// countries and cities are places, the rest are their own group
const groupOf = (item: Item): Group => (item.kind === 'country' || item.kind === 'city' ? 'place' : item.kind);
// of two items, which comes first: by kind (a country before its cities), then by rank within the kind, so ranks of
// different kinds, each on its own scale, are never compared
const KIND_ORDER: Readonly<Record<Kind, number>> = { person: 0, festival: 1, artist: 2, country: 3, city: 4, tag: 5 };
const before = (a: Item, b: Item): number => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.rank - a.rank;

// Every token typed must start a word of the item; an item whose name is the query, or starts with it, comes first.
function score(item: Item, tokens: readonly string[], query: string): 0 | 1 | 2 | 3 | 4 {
  if (!tokens.every((t) => item.words.some((w) => w.startsWith(t)))) return 0;
  const name = fold(item.name);
  const first = tokens[0] ?? '';
  return name === query ? 4 : name.startsWith(query) ? 3 : item.nameWords.some((w) => w.startsWith(first)) ? 2 : 1;
}

// Where the festival list is now, so a country or style picked here keeps the time and price already chosen.
function finderParams(): Record<string, string> {
  const [path, qs = ''] = location.hash.slice(1).split('?');
  return (path || 'finder') === 'finder' ? Object.fromEntries(new URLSearchParams(qs)) : {};
}

// an item as found, before its words are folded for matching, with the other words it is found by; it is current and
// unranked unless it says otherwise
type Entry = Item extends infer I
  ? I extends Item
    ? Omit<I, 'words' | 'nameWords' | 'past' | 'rank'> & Partial<Pick<Base, 'past' | 'rank'>>
    : never
  : never;
type Indexed = readonly [Entry, readonly string[]];

// festivals, coming ones first and soonest first, then past ones, latest first
const festivalEntries = (): Indexed[] =>
  q(
    FOUND_EVENT,
    sql`SELECT r.id, r.title, x.listed_title, r.venue, r.city, r.country_code, r.start_date, r.end_date, r.upcoming,
      r.cancelled, r.listing, r.lat, x.url, p.code FROM event_rows r JOIN events x ON x.id = r.id
      LEFT JOIN event_promos p ON p.event_id = r.id`,
  ).map((e) => [
    {
      kind: 'festival',
      name: e.title,
      e,
      past: !e.upcoming,
      rank: e.upcoming ? 2e9 - Date.parse(e.start_date) / 864e5 : Date.parse(e.start_date) / 864e5,
    },
    [e.listed_title, e.venue ?? '', e.city ?? '', e.code ?? ''],
  ]);

// people who share their plans, by name and by the artists they are
const personEntries = (): Indexed[] =>
  q(
    { key: str, name: str, upcoming: num },
    sql`SELECT pe.key, pe.name, sum(e.upcoming) AS upcoming FROM people pe JOIN plans p ON p.person_id = pe.id
      JOIN event_rows e ON e.id = p.event_id GROUP BY pe.id`,
  ).flatMap((r): Indexed[] => {
    const p = person(r.key);
    return p
      ? [
          [
            { kind: 'person', name: r.name, p, upcoming: r.upcoming, past: !r.upcoming, rank: r.upcoming },
            p.artists.map((a) => a.display_name),
          ],
        ]
      : [];
  });

// artists, by their names and aliases, and whether someone sharing plans is one of them
function artistEntries(): Indexed[] {
  const sharing = new Set(
    q(
      { artist_id: num },
      sql`SELECT artist_id FROM person_artists UNION SELECT couple_id FROM couple_members
    WHERE member_id IN (SELECT artist_id FROM person_artists)`,
    ).map((r) => r.artist_id),
  );
  const aliases = new Map<number, string[]>();
  for (const a of q({ artist_id: num, alias: str }, sql`SELECT artist_id, alias FROM artist_aliases`))
    aliases.set(a.artist_id, [...(aliases.get(a.artist_id) ?? []), a.alias]);
  return q(
    FOUND_ARTIST,
    sql`SELECT a.id, a.display_name, a.kind, s.bookings, s.teacher, s.dj, s.performer, s.mc, s.home_country FROM artist_stats s
      JOIN artists a ON a.id = s.artist_id`,
  ).map((a) => [
    { kind: 'artist', name: a.display_name, a, shares: sharing.has(a.id), rank: a.bookings },
    aliases.get(a.id) ?? [],
  ]);
}

// countries, by how many festivals are coming up in them, then cities on the map
function placeEntries(pool: readonly Festival[]): Indexed[] {
  const inCountry = new Map<string, number>();
  for (const e of pool)
    if (e.country_code !== null) inCountry.set(e.country_code, (inCountry.get(e.country_code) ?? 0) + 1);
  const countries = site().destinations.map((c): Indexed => {
    const n = inCountry.get(c.code) ?? 0;
    return [{ kind: 'country', name: c.name, country: c, n, past: !n, rank: n }, [c.code]];
  });
  const cities = new Map<string, City>();
  for (const e of q(
    { city: str, country_code: opt(str), upcoming: flagCol },
    sql`SELECT city, country_code, upcoming FROM event_rows WHERE lat IS NOT NULL`,
  )) {
    const k = `${e.city}|${e.country_code}`;
    const c = cities.get(k) ?? { city: e.city, cc: e.country_code, upcoming: 0, all: 0 };
    c.all++;
    c.upcoming += e.upcoming ? 1 : 0;
    cities.set(k, c);
  }
  return [
    ...countries,
    ...[...cities.values()].map(
      (c): Indexed => [{ kind: 'city', name: c.city, city: c, past: !c.upcoming, rank: c.upcoming * 100 + c.all }, []],
    ),
  ];
}

// styles and highlights narrow the festival list; taxi dancers and the all-in-one hotel use its own checkboxes. A tag
// no festival coming up has is left out.
const UNDERSCORES = /_/gu;
interface Tag {
  key: TagKey;
  name: string;
  params: Params;
  test: (e: Festival) => boolean;
  icon: string | null;
}
function tagEntries(pool: readonly Festival[]): Indexed[] {
  const tags: Tag[] = [
    ...[...WITH].map(([key, name]) => ({
      key,
      name,
      params: { with: key },
      test: (e: Festival) => hasWith(e, key),
      icon: isDance(key) ? null : icon(key),
    })),
    ...CHECKED.map(([key, feature, has]) => ({
      key,
      name: text('feature', feature),
      params: { [key]: 1 },
      test: has,
      icon: icon(feature),
    })),
  ];
  return tags.flatMap(({ key, name, params, test, icon: svg }): Indexed[] => {
    const n = pool.filter(test).length;
    return n
      ? [
          [
            { kind: 'tag', name, key, params, n, icon: svg, style: isDance(key), rank: n },
            [key.replace(UNDERSCORES, ' ')],
          ],
        ]
      : [];
  });
}

function buildIndex(): Item[] {
  const pool = festivals(); // what the festival list can show: everything still to come
  return [...festivalEntries(), ...personEntries(), ...artistEntries(), ...placeEntries(pool), ...tagEntries(pool)].map(
    ([entry, extra]) => ({
      past: false,
      rank: 0,
      ...entry,
      words: words([entry.name, ...extra].join(' ')),
      nameWords: words(entry.name),
    }),
  );
}

// the closest name to a query with no results, if it is only a typo or two away
function nearest(items: readonly Item[], query: string): Item | null {
  if (query.length < 4) return null;
  const dist = (a: string, b: string): number => {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++)
        cur[j] = Math.min(
          (prev[j] ?? 0) + 1,
          (cur[j - 1] ?? 0) + 1,
          (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      prev = cur;
    }
    return prev[b.length] ?? Number.POSITIVE_INFINITY;
  };
  const limit = query.length < 7 ? 1 : 2;
  let best: Item | null = null,
    bestD = limit + 1;
  for (const it of items) {
    const name = fold(it.name);
    if (Math.abs(name.length - query.length) > limit) continue;
    const d = dist(query, name);
    if (d < bestD || (best && d === bestD && before(it, best) < 0)) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

const WORDS_AND_GAPS = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// a note's icon when its tag has none of its own
const NOTE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

// what a result's row shows: its lead (a date, an initial, a flag or an icon) and the line under its name
type Parts = readonly [HTMLElement, Kid[]];
function festivalParts(e: FoundEvent): Parts {
  const yr = e.start_date.slice(0, 4) === today().slice(0, 4) ? '' : ` ${e.start_date.slice(0, 4)}`;
  return [
    h('span', { class: 'lead date' }, dayMonth(e.start_date).replace(' ', '\u00a0')),
    [
      place(e),
      yr,
      e.cancelled === true
        ? ' · cancelled'
        : e.listing === KEY.listing.GONE
          ? ` ${text('listing', e.listing, {}, 'search')}`
          : e.upcoming
            ? ''
            : ' · has taken place',
      e.lat === null ? [' · on kizomba-world', away()] : '',
    ],
  ];
}
const initial = (name: string) => h('span', { class: 'lead mono' }, name.trim()[0] ?? '?');
const comingUp = (n: number, none: string) => (n ? `${plural(n, 'festival')} coming up` : none);
const personParts = (item: Found<'person'>): Parts => [
  initial(item.name),
  [
    item.upcoming ? `${plural(item.upcoming, 'festival')} planned` : 'no plans coming up',
    item.p.artists.length > 0 ? ` · also ${item.p.artists.map((a) => a.display_name).join(', ')}` : '',
  ],
];
const artistParts = ({ a, shares }: Found<'artist'>): Parts => [
  initial(a.display_name),
  [
    a.home_country === null ? '' : `${flag(a.home_country)} `,
    roleLabel(a),
    ' · ',
    plural(a.bookings, 'festival'),
    shares ? ' · shares plans' : '',
  ],
];
function tagParts(item: Found<'tag'>): Parts {
  const lead = h('span', { class: 'lead icon' });
  lead.innerHTML = item.icon ?? NOTE;
  return [lead, [item.style ? 'Dance' : 'Highlight', ' · ', comingUp(item.n, '')]];
}
function parts(item: Item): Parts {
  switch (item.kind) {
    case 'festival':
      return festivalParts(item.e);
    case 'person':
      return personParts(item);
    case 'artist':
      return artistParts(item);
    case 'country':
      return [
        h('span', { class: 'lead flag' }, flag(item.country.code)),
        ['Country · ', comingUp(item.n, 'none coming up')],
      ];
    case 'city':
      return [
        h('span', { class: 'lead flag' }, flag(item.city.cc)),
        ['City · ', comingUp(item.city.upcoming, 'past festivals only')],
      ];
    case 'tag':
      return tagParts(item);
  }
}

export function initSearch(trigger: HTMLElement, data: Promise<unknown>): void {
  let items: Item[] | null = null,
    query = '',
    expanded = new Set<string>(),
    active = -1,
    withPast = false;
  const input = h('input', {
    type: 'text',
    class: 'search-input',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'search-list',
    'aria-autocomplete': 'list',
    placeholder: 'Festivals, artists, places, styles…',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
  });
  const list = h('div', { class: 'search-list', id: 'search-list', role: 'listbox', 'aria-label': 'Results' });
  const status = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const glass = h('span', { class: 'search-glass', 'aria-hidden': 'true' });
  glass.innerHTML = trigger.querySelector('svg')?.outerHTML ?? '';
  const cancel = button({ class: 'search-cancel', onclick: () => void shut() }, 'Cancel');
  // past festivals, and places with nothing coming up, only when asked for: what people share is what's ahead
  const pastBox = h('input', {
    type: 'checkbox',
    onchange: () => {
      withPast = pastBox.checked;
      expanded = new Set();
      render();
    },
  });
  const includePast = () => {
    withPast = true;
    pastBox.checked = true;
    render();
    input.focus();
  };
  const dlg = h(
    'dialog',
    { class: 'search', 'aria-label': 'Search' },
    h('div', { class: 'search-top' }, glass, input, cancel),
    h('label', { class: 'search-past' }, pastBox, ' Include what has nothing coming up'),
    status,
    list,
  );
  const searchModal = modal(dlg);
  const { open: show, shut, go } = searchModal;

  const options = () => [...list.querySelectorAll<HTMLElement>('[role=option]')];
  function highlight(i: number): void {
    // -1 for none; past either end it wraps
    const opts = options();
    active = i < 0 || opts.length === 0 ? -1 : i % opts.length;
    for (const [k, o] of opts.entries()) o.setAttribute('aria-selected', String(k === active));
    const on = opts[active];
    if (!on) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    input.setAttribute('aria-activedescendant', on.id);
    on.scrollIntoView({ block: 'nearest' });
  }

  function pick(item: Item): void {
    switch (item.kind) {
      case 'festival':
        if (item.e.lat === null) {
          // nowhere on the map
          window.open(item.e.url, '_blank', 'noopener');
          void shut();
          return;
        }
        void go(eventOnMapHref(item.e.id));
        return;
      case 'person':
        void go(personHref(item.p.key));
        return;
      case 'artist':
        void go(artistHref(item.a.id));
        return;
      case 'city':
        void go(cityOnMapHref(item.city));
        return;
      case 'country':
        void go(festivalsHref({ ...finderParams(), country: item.country.code }));
        return;
      case 'tag':
        void go(festivalsHref({ ...finderParams(), ...item.params }));
    }
  }

  const marked = (name: string, tokens: readonly string[]): Kid => {
    // the typed beginnings of words in bold
    if (tokens.length === 0) return name;
    const out: Kid[] = [];
    for (const [w] of name.matchAll(WORDS_AND_GAPS)) {
      const token = tokens.find((t) => fold(w).startsWith(t));
      if (token === undefined) {
        out.push(w);
        continue;
      }
      let cut = 0;
      while (cut < w.length && fold(w.slice(0, cut + 1)).length <= token.length) cut++;
      out.push(h('mark', {}, w.slice(0, cut)), w.slice(cut));
    }
    return out;
  };
  let nextId = 0;
  function row(item: Item, tokens: readonly string[]): HTMLElement {
    const [lead, sub] = parts(item);
    return h(
      'div',
      {
        class: `search-row${item.kind === 'festival' && !item.e.upcoming ? ' past' : ''}`,
        role: 'option',
        id: `search-o${++nextId}`,
        'aria-selected': 'false',
        onclick: () => pick(item),
      },
      lead,
      h(
        'span',
        { class: 'what' },
        h(
          'span',
          { class: 'name' },
          item.kind === 'tag' && item.style ? 'Also with ' : null,
          marked(item.name, tokens),
        ),
        h('span', { class: 'sub' }, sub),
      ),
    );
  }
  function group(kind: string, title: string, found: readonly Item[], tokens: readonly string[]): HTMLElement {
    const all = expanded.has(kind),
      id = `search-g-${kind}`;
    const more =
      !all && found.length > SHOWN
        ? h(
            'div',
            {
              class: 'search-row search-more',
              role: 'option',
              id: `search-o${++nextId}`,
              'aria-selected': 'false',
              onclick: () => {
                expanded.add(kind);
                render();
              },
            },
            h('span', { class: 'what' }, `Show all ${found.length} ${title.toLowerCase()}`),
          )
        : null;
    return h(
      'div',
      { class: 'search-group', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'search-group-title', id, role: 'presentation' }, title),
      found.slice(0, all ? found.length : SHOWN).map((it) => row(it, tokens)),
      more,
    );
  }

  // before anything is typed: things to tap
  function suggest(all: readonly Item[]): void {
    const by = (keys: readonly TagKey[]) =>
      keys.flatMap((k) => all.find((item) => item.kind === 'tag' && item.key === k) ?? []);
    const countries = all
      .filter((item): item is Found<'country'> => item.kind === 'country')
      .sort((a, b) => b.n - a.n)
      .slice(0, SUGGEST_COUNTRIES);
    list.replaceChildren(
      h(
        'p',
        { class: 'search-note' },
        'Search festivals, people, artists, cities, countries, dances and highlights. Or try:',
      ),
      group('styles', 'Also with', by(SUGGEST_STYLES), []),
      group('highlights', 'Highlights', by(SUGGEST_HIGHLIGHTS), []),
      group('countries', 'Countries', countries, []),
    );
    status.textContent = '';
    highlight(-1);
  }

  // nothing found: perhaps a name a typo away, and the lists that hold everything
  function nothing(all: readonly Item[], folded: string): void {
    const near = nearest(
      all.filter((item) => withPast || !item.past),
      folded,
    );
    const goes = (href: string, words_: string) => leaving(searchModal, href, words_);
    list.replaceChildren(
      h(
        'div',
        { class: 'search-none' },
        h('p', {}, 'Nothing matches “', query.trim(), '”.'),
        near
          ? h(
              'p',
              {},
              'Did you mean ',
              button(
                {
                  class: 'link',
                  onclick: () => {
                    query = near.name;
                    input.value = query;
                    render();
                    input.focus();
                  },
                },
                near.name,
              ),
              '?',
            )
          : null,
        h(
          'p',
          {},
          'You can also ',
          goes(artistsHref({ q: query.trim() }), 'browse all artists'),
          ' or ',
          goes(mapHref(), 'explore the map'),
          '.',
        ),
      ),
    );
    status.textContent = 'No results';
    highlight(-1);
  }

  // the matches with nothing coming up, of every kind, left out until asked for
  const pastMatches = (n: number) =>
    h(
      'p',
      { class: 'search-note' },
      `${n} ${n === 1 ? 'match has' : 'matches have'} nothing coming up. `,
      button({ class: 'link', onclick: includePast }, n === 1 ? 'Include it' : 'Include them'),
    );
  function render(): void {
    nextId = 0;
    if (!items) {
      list.replaceChildren(h('p', { class: 'search-note' }, 'Loading festivals…'));
      return;
    }
    const tokens = words(query),
      folded = tokens.join(' ');
    if (tokens.length === 0) {
      suggest(items);
      return;
    }
    const matched = items
      .map((item) => ({ item, s: score(item, tokens, folded) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || before(a.item, b.item))
      .map((r) => r.item);
    const found = matched.filter((item) => withPast || !item.past);
    const hiddenPast = withPast ? 0 : matched.length - found.length;
    const pastNote = hiddenPast > 0 ? pastMatches(hiddenPast) : null;
    const groups = GROUPS.map(
      ([kind, title]) => [kind, title, found.filter((item) => groupOf(item) === kind)] as const,
    ).filter(([, , f]) => f.length > 0);
    if (groups.length === 0 && pastNote) {
      list.replaceChildren(
        h('div', { class: 'search-none' }, h('p', {}, 'Nothing coming up matches “', query.trim(), '”.'), pastNote),
      );
      status.textContent = 'No upcoming results';
      highlight(-1);
      return;
    }
    if (groups.length === 0) {
      nothing(items, folded);
      return;
    }
    list.replaceChildren(
      ...groups.map(([kind, title, f]) => group(kind, title, f, tokens)),
      ...(pastNote ? [pastNote] : []),
    );
    status.textContent = plural(found.length, 'result');
    highlight(0); // Enter opens the best match
  }

  input.addEventListener('input', () => {
    query = input.value;
    expanded = new Set();
    render();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      highlight(active + 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      highlight((active <= 0 ? options().length : active) - 1);
    } else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      options()[active]?.click();
    }
  });
  // Escape clears the text first, then closes
  dlg.addEventListener('cancel', (ev) => {
    if (input.value !== '') {
      ev.preventDefault();
      query = '';
      input.value = query;
      render();
    }
  });

  function open() {
    if (!show(trigger)) return;
    input.select(); // the last query stays, ready to refine or type over
    render();
    if (!items)
      void data.then(() => {
        items = buildIndex();
        if (dlg.open) render();
      });
  }
  trigger.addEventListener('click', open);
  addEventListener('keydown', (ev) => {
    const typing = ev.target instanceof Element && ev.target.closest('input, textarea, select, [contenteditable]');
    if (
      (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey) ||
      ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')
    ) {
      ev.preventDefault();
      open();
    }
  });
}
