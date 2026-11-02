// Search across the site, in a dialog opened from the header (or with / and Ctrl/⌘+K). Results come in groups that
// always keep their order: people who share their plans, festivals, artists, places, then dances and highlights. The
// text field keeps the focus and the arrow keys move a highlight through the results (the WAI-ARIA combobox with a
// listbox).
// Picking a result goes where that kind of thing lives: a festival opens on the map, an artist on their page, a city
// on the map, and a country, style or highlight narrows the festival list, keeping its other choices.

import { q, site, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { type Festival, festivals } from './festivals.ts';
import {
  answer,
  type Base,
  type City,
  FOUND_ARTIST,
  FOUND_EVENT,
  type Found,
  type FoundEvent,
  type Item,
  type TagKey,
} from './find.ts';
import { CHECKED, hasWith, isDance, WITH } from './finder.ts';
import { fold, words } from './fold.ts';
import { icon } from './icons.ts';
import { leaving, modal } from './modal.ts';
import { person, withPlans } from './plans.ts';
import { done } from './report.ts';
import { roleLabel } from './roles.ts';
import {
  artistHref,
  artistsHref,
  cityOnMapHref,
  eventOnMapHref,
  festivalsHref,
  mapHref,
  type Params,
  parseRoute,
  personHref,
} from './routes.ts';
import { flag as flagCol, num, opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { away, dayMonth, flag, otherYear, place } from './ui.ts';
import { plural, text } from './wording.ts';

const SHOWN = 5; // results per group until "Show all"
// before anything is typed: what can be searched, as things to tap (tags by their key)
const SUGGEST_STYLES: readonly TagKey[] = [KEY.genre.SALSA, KEY.genre.ZOUK, KEY.genre.BACHATA, KEY.genre.KOMPA];
const SUGGEST_HIGHLIGHTS: readonly TagKey[] = [KEY.feature.PROMO_CODE, 'taxi', KEY.feature.POOL_PARTY, 'allin'];
const SUGGEST_COUNTRIES = 4;

// Where the festival list is now, so a country or style picked here keeps the time and price already chosen.
function finderParams(): Record<string, string> {
  const { name, sub, qs } = parseRoute(location.hash);
  return name === 'finder' && sub.length === 0 ? Object.fromEntries(new URLSearchParams(qs)) : {};
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
  withPlans().flatMap((r): Indexed[] => {
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

const WORDS_AND_GAPS = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
// a note's icon when its tag has none of its own
const NOTE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

// what a result's row shows: its lead (a date, an initial, a flag or an icon) and the line under its name
type Parts = readonly [HTMLElement, Kid[]];
function festivalParts(e: FoundEvent): Parts {
  const yr = otherYear(e.start_date);
  return [
    h('span', { class: ['lead', 'date'] }, dayMonth(e.start_date).replace(' ', '\u00a0')),
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
const initial = (name: string) => h('span', { class: ['lead', 'mono'] }, name.trim()[0] ?? '?');
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
  const lead = h('span', { class: 'lead' });
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
        h('span', { class: ['lead', 'flag'] }, flag(item.country.code)),
        ['Country · ', comingUp(item.n, 'none coming up')],
      ];
    case 'city':
      return [
        h('span', { class: ['lead', 'flag'] }, flag(item.city.cc)),
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
    'aria-expanded': 'false', // true while the list has results (render)
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
  const cancel = button({ class: 'search-cancel', onclick: () => done(shut(), 'search') }, 'Cancel');
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
          done(shut(), 'search');
          return;
        }
        done(go(eventOnMapHref(item.e.id)), 'search');
        return;
      case 'person':
        done(go(personHref(item.p.key)), 'search');
        return;
      case 'artist':
        done(go(artistHref(item.a.id)), 'search');
        return;
      case 'city':
        done(go(cityOnMapHref(item.city)), 'search');
        return;
      case 'country':
        done(go(festivalsHref({ ...finderParams(), country: item.country.code })), 'search');
        return;
      case 'tag':
        done(go(festivalsHref({ ...finderParams(), ...item.params })), 'search');
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
        class: ['search-row', item.kind === 'festival' && !item.e.upcoming && 'past'],
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
              class: ['search-row', 'search-more'],
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
      { role: 'group', 'aria-labelledby': id },
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
  function nothing(near: Item | null): void {
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
      `${plural(n, 'match has', 'matches have')} nothing coming up. `,
      button({ class: 'link', onclick: includePast }, n === 1 ? 'Include it' : 'Include them'),
    );
  // the list, and whether the box's list is open: while it has options to pick
  function render(): void {
    fill();
    input.setAttribute('aria-expanded', String(list.querySelector('[role="option"]') !== null));
  }
  function fill(): void {
    nextId = 0;
    if (!items) {
      list.replaceChildren(h('p', { class: 'search-note' }, 'Loading festivals…'));
      return;
    }
    const found = answer(items, query, withPast);
    switch (found.kind) {
      case 'suggest':
        suggest(items);
        return;
      case 'none':
        nothing(found.near);
        return;
      case 'past':
        list.replaceChildren(
          h(
            'div',
            { class: 'search-none' },
            h('p', {}, 'Nothing coming up matches “', query.trim(), '”.'),
            pastMatches(found.hidden),
          ),
        );
        status.textContent = 'No upcoming results';
        highlight(-1);
        return;
      case 'found': {
        const { tokens, groups, count, hidden } = found;
        list.replaceChildren(
          ...groups.map(([kind, title, f]) => group(kind, title, f, tokens)),
          ...(hidden > 0 ? [pastMatches(hidden)] : []),
        );
        status.textContent = plural(count, 'result');
        highlight(0); // Enter opens the best match
      }
    }
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
      done(
        data.then(() => {
          items = buildIndex();
          if (dlg.open) render();
        }),
        'search',
      );
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
