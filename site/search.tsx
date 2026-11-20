// Search across the site, in a dialog opened from the header (or with / and Ctrl/⌘+K), drawn by Solid. Results come in
// groups that always keep their order: people who share their plans, festivals, artists, places, then dances and
// highlights. The text field keeps the focus and the arrow keys move a highlight through the results (the WAI-ARIA
// combobox with a listbox).
// Picking a result goes where that kind of thing lives: a festival opens on the map, an artist on their page, a city
// on the map, and a country, style or highlight narrows the festival list, keeping its other choices.

import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createEffect, createMemo, createSignal, Errored, flush, For } from 'solid-js';
import { flat, type Kid } from './bits.ts';
import { q, site, sql } from './db.ts';
import { leaving, modal } from './dialog.tsx';
import { type Festival, festivals } from './festivals.ts';
import {
  answer,
  type Base,
  type City,
  type Found,
  FOUND_ARTIST,
  FOUND_EVENT,
  type FoundEvent,
  type Item,
  type TagKey,
} from './find.ts';
import { CHECKED, hasWith, isDance, WITH } from './finder.ts';
import { fold, words } from './fold.ts';
import { type Drawing, icon, NOTE } from './icons.ts';
import { atEnd } from './placed.tsx';
import { person, withPlans } from './plans.ts';
import { done, report } from './report.ts';
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
  routeOf,
} from './routes.ts';
import { flag as flagCol, num, str } from './rows.ts';
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
  const { name, sub, qs } = routeOf(location.href, document.baseURI);
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
            { kind: 'friend', name: r.name, p, upcoming: r.upcoming, past: !r.upcoming, rank: r.upcoming },
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

// the cities festivals are in, each once by its key however its festivals' listings spell it (cities), with how many
// festivals there are coming up and in all
function cityEntries(): City[] {
  // each city as its festivals are counted, built in place (City is read-only)
  const cities = new Map<string, Omit<City, 'upcoming' | 'all'> & { upcoming: number; all: number }>();
  for (const e of q(
    { city: str, city_key: str, country_code: str, upcoming: flagCol },
    sql`SELECT city, city_key, country_code, upcoming FROM event_rows WHERE city_key IS NOT NULL`,
  )) {
    const c = cities.get(e.city_key) ?? { key: e.city_key, city: e.city, cc: e.country_code, upcoming: 0, all: 0 };
    c.all++;
    c.upcoming += e.upcoming ? 1 : 0;
    cities.set(e.city_key, c);
  }
  return [...cities.values()];
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
  return [
    ...countries,
    ...cityEntries().map((c): Indexed => [
      { kind: 'city', name: c.city, city: c, past: !c.upcoming, rank: c.upcoming * 100 + c.all },
      [],
    ]),
  ];
}

// styles and highlights narrow the festival list; taxi dancers and the all-in-one hotel use its own checkboxes. A tag
// no festival coming up has is left out.
const UNDERSCORES = /_/gu;
interface Tag {
  readonly key: TagKey;
  readonly name: string;
  readonly params: Params;
  readonly test: (e: Festival) => boolean;
  readonly icon: Drawing | null;
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

// what a result's row shows: its lead (a date, an initial, a flag or an icon) and the line under its name
type Parts = readonly [JSX.Element, Kid[]];
function festivalParts(e: FoundEvent): Parts {
  const yr = otherYear(e.start_date);
  const day = dayMonth(e.start_date).replace(' ', '\u00a0');
  return [
    <span class={['lead', 'date']}>{day}</span>,
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
function initial(name: string): JSX.Element {
  const letter = name.trim()[0] ?? '?';
  return <span class={['lead', 'mono']}>{letter}</span>;
}
function flagged(cc: string): JSX.Element {
  const shown = flag(cc);
  return <span class={['lead', 'flag']}>{shown}</span>;
}
const comingUp = (n: number, none: string) => (n ? `${plural(n, 'festival')} coming up` : none);
const personParts = (item: Found<'friend'>): Parts => [
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
  const drawing = item.icon ?? NOTE;
  return [
    <span
      class="lead"
      ref={(el) => {
        drawing.into(el);
      }}
    />,
    [item.style ? 'Dance' : 'Highlight', ' · ', comingUp(item.n, '')],
  ];
}
function parts(item: Item): Parts {
  switch (item.kind) {
    case 'festival':
      return festivalParts(item.e);
    case 'friend':
      return personParts(item);
    case 'artist':
      return artistParts(item);
    case 'country':
      return [flagged(item.country.code), ['Country · ', comingUp(item.n, 'none coming up')]];
    case 'city':
      return [flagged(item.city.cc), ['City · ', comingUp(item.city.upcoming, 'past festivals only')]];
    case 'tag':
      break;
  }
  return tagParts(item);
}

// the typed beginnings of words in bold
function marked(name: string, tokens: readonly string[]): JSX.Element {
  if (tokens.length === 0) return name;
  const out: JSX.Element[] = [];
  for (const [w] of name.matchAll(WORDS_AND_GAPS)) {
    const token = tokens.find((t) => fold(w).startsWith(t));
    if (token === undefined) {
      out.push(w);
      continue;
    }
    let cut = 0;
    while (cut < w.length && fold(w.slice(0, cut + 1)).length <= token.length) cut++;
    const bold = w.slice(0, cut);
    out.push(<mark>{bold}</mark>, w.slice(cut));
  }
  return out;
}

// What one render of the list shows. A group: its kind, its title, its rows, each an option with its id, and its "Show
// all" when it has more than it shows. The ids are numbered from search-o1 as the list always numbered them, a group's
// "Show all" before its rows. Each render: what the list holds, the words typed, its options in the order they are
// drawn, and what it says to a screen reader once drawn (null: nothing, before the first render or while the index is
// built).
interface Option {
  readonly id: string;
  readonly picked: () => void;
}
interface Group {
  readonly kind: string;
  readonly title: string;
  readonly tokens: readonly string[];
  readonly rows: readonly (Option & { readonly item: Item })[];
  readonly more: (Option & { readonly count: number }) | null;
}
type Listed =
  | { readonly kind: 'blank' | 'loading' }
  | { readonly kind: 'suggest' | 'found'; readonly groups: readonly Group[]; readonly hidden: number }
  | { readonly kind: 'nothing'; readonly near: Item | null }
  | { readonly kind: 'past'; readonly hidden: number };
type Shown = Listed & {
  readonly typed: string;
  readonly options: readonly Option[];
  readonly status: string | null;
};

export function initSearch(trigger: HTMLElement, data: Promise<unknown>): void {
  atEnd('the search', () => searchDialog(trigger, data));
}

// The search's dialog, opened from trigger, the header's button (or with / and Ctrl/⌘+K), its index built once data is
// in, after the dialog first opens. Its state is signals, as the visitor left it: what is typed, the groups shown whole,
// whether past ones are included, and the index once built; the list is rendered anew from them, and on each opening.
function searchDialog(trigger: HTMLElement, data: Promise<unknown>): JSX.Element {
  const [items, setItems] = createSignal<readonly Item[] | null>(null);
  const [query, setQuery] = createSignal('');
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const [withPast, setWithPast] = createSignal(false);
  const [openings, setOpenings] = createSignal(0); // how many times it was opened: nothing is listed before the first
  let indexing: Promise<void> | undefined; // the index being built, once asked for
  let input: HTMLInputElement | undefined, status: HTMLParagraphElement | undefined;
  const searchModal = modal();
  const { open: show, shut, go } = searchModal;
  // the highlighted option's place among the options shown (-1 for none); each option's element, by its id, as drawn
  const [active, setActive] = createSignal(-1);
  const drawn = new Map<string, HTMLElement>();
  const selected = (id: string) => (shown().options[active()]?.id === id ? 'true' : 'false');
  // the magnifying glass of the button that opens it
  const glass = trigger.querySelector('svg')?.cloneNode(true);

  // the option at i highlighted, in view: -1 for none, past either end it wraps
  function highlight(options: readonly Option[], i: number): void {
    const at = i < 0 || options.length === 0 ? -1 : i % options.length;
    setActive(at);
    const on = options[at];
    if (on) drawn.get(on.id)?.scrollIntoView({ block: 'nearest' });
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
      case 'friend':
        done(go(personHref(item.p.key)), 'search');
        return;
      case 'artist':
        done(go(artistHref(item.a.id)), 'search');
        return;
      case 'city':
        done(go(cityOnMapHref(item.city.key)), 'search');
        return;
      case 'country':
        done(go(festivalsHref({ ...finderParams(), country: item.country.code })), 'search');
        return;
      case 'tag':
        done(go(festivalsHref({ ...finderParams(), ...item.params })), 'search');
    }
  }

  // before anything is typed: things to tap
  const suggestions = (all: readonly Item[]): (readonly [string, string, readonly Item[]])[] => {
    const by = (keys: readonly TagKey[]) =>
      keys.flatMap((k) => all.find((item) => item.kind === 'tag' && item.key === k) ?? []);
    const countries = all
      .filter((item): item is Found<'country'> => item.kind === 'country')
      .sort((a, b) => b.n - a.n)
      .slice(0, SUGGEST_COUNTRIES);
    return [
      ['styles', 'Also with', by(SUGGEST_STYLES)],
      ['highlights', 'Highlights', by(SUGGEST_HIGHLIGHTS)],
      ['countries', 'Countries', countries],
    ];
  };
  // the list for what is typed now, a new one each render, and each opening
  const shown = createMemo((): Shown => {
    if (openings() === 0) return { kind: 'blank', typed: '', options: [], status: null };
    const index = items();
    const typed = query();
    const whole = expanded();
    let nextId = 0;
    const id = () => `search-o${++nextId}`;
    const group = ([kind, title, found]: readonly [string, string, readonly Item[]], tokens: readonly string[]) => {
      const all = whole.has(kind);
      const more = !all && found.length > SHOWN ? { id: id(), count: found.length, picked: () => showAll(kind) } : null;
      const rows = found
        .slice(0, all ? found.length : SHOWN)
        .map((item) => ({ id: id(), item, picked: () => pick(item) }));
      return { kind, title, tokens, rows, more };
    };
    const listed = ((): Listed & { readonly status: string | null } => {
      if (!index) return { kind: 'loading', status: null };
      const found = answer(index, typed, withPast());
      switch (found.kind) {
        case 'suggest':
          return { kind: 'suggest', groups: suggestions(index).map((g) => group(g, [])), hidden: 0, status: '' };
        case 'nothing':
          return { kind: 'nothing', near: found.near, status: 'No results' };
        case 'past':
          return { kind: 'past', hidden: found.hidden, status: 'No upcoming results' };
        case 'found':
          break;
      }
      return {
        kind: 'found',
        groups: found.groups.map(([kind, title, f]) => group([kind, title, f], found.tokens)),
        hidden: found.hidden,
        status: plural(found.count, 'result'),
      };
    })();
    const options =
      'groups' in listed ? listed.groups.flatMap((g): Option[] => [...g.rows, ...(g.more ? [g.more] : [])]) : [];
    return { ...listed, typed: typed.trim(), options };
  });
  // once each render is drawn: what it says to a screen reader, written anew, and the highlight on the best match,
  // which Enter opens, or on none
  createEffect(shown, (s) => {
    if (s.status === null || status === undefined) return;
    status.textContent = s.status;
    highlight(s.options, s.kind === 'found' ? 0 : -1);
  });
  const showAll = (kind: string) => {
    setExpanded((was) => new Set([...was, kind]));
  };
  // past festivals, and places with nothing coming up, only when asked for: what people share is what's ahead
  const includePast = () => {
    setWithPast(true);
    input?.focus();
  };

  // a result's row
  const rowOf = (row: Option & { readonly item: Item }, tokens: readonly string[]) => {
    const { item } = row;
    const [lead, sub] = parts(item);
    const under = flat(sub);
    return (
      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- an option of the combobox's listbox: the focus stays in the text field, which moves the highlight with the arrow keys and picks it with Enter (aria-activedescendant)
      <div
        ref={(el) => {
          drawn.set(row.id, el);
        }}
        class={['search-row', item.kind === 'festival' && !item.e.upcoming && 'past']}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a row of a lead and two lines, which an <option> cannot hold
        role="option"
        id={row.id}
        aria-selected={selected(row.id)}
        onClick={row.picked}
      >
        {lead}
        <span class="what">
          <span class="name">
            {item.kind === 'tag' && item.style ? 'Also with ' : null}
            {marked(item.name, tokens)}
          </span>
          <span class="sub">{under}</span>
        </span>
      </div>
    );
  };
  const groupOf = (g: Group) => (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of the listbox's options, which no element of HTML is
    <div role="group" aria-labelledby={`search-g-${g.kind}`}>
      <div class="search-group-title" id={`search-g-${g.kind}`} role="presentation">
        {g.title}
      </div>
      <For each={g.rows}>{(row) => rowOf(row, g.tokens)}</For>
      {g.more && (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- an option of the combobox's listbox, reached from the text field as a row is
        <div
          ref={(el) => {
            if (g.more) drawn.set(g.more.id, el);
          }}
          class={['search-row', 'search-more']}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option among the rows, which an <option> cannot be
          role="option"
          id={g.more.id}
          aria-selected={selected(g.more.id)}
          onClick={g.more.picked}
        >
          <span class="what">{`Show all ${g.more.count} ${g.title.toLowerCase()}`}</span>
        </div>
      )}
    </div>
  );
  // the matches with nothing coming up, of every kind, left out until asked for
  const pastMatches = (n: number) => (
    <p class="search-note">
      {`${plural(n, 'match has', 'matches have')} nothing coming up. `}
      <button type="button" class="link" onClick={includePast}>
        {n === 1 ? 'Include it' : 'Include them'}
      </button>
    </p>
  );
  // nothing found: perhaps a name a typo away, and the lists that hold everything
  const nothing = (typed: string, near: Item | null) => (
    <div class="search-none">
      <p>Nothing matches “{typed}”.</p>
      {near && (
        <p>
          Did you mean{' '}
          <button
            type="button"
            class="link"
            onClick={() => {
              retyped(near.name);
              input?.focus();
            }}
          >
            {near.name}
          </button>
          ?
        </p>
      )}
      <p>
        You can also {leaving(searchModal, artistsHref({ q: typed }), 'browse all artists')} or{' '}
        {leaving(searchModal, mapHref(), 'explore the map')}.
      </p>
    </div>
  );
  // what a row that throws as it is drawn leaves in the list: nothing, what went wrong said once
  const reported = (e: unknown): null => {
    report(e, "the search's results");
    return null;
  };
  const listOf = (s: Shown): JSX.Element => {
    switch (s.kind) {
      case 'blank':
        return null;
      case 'loading':
        return <p class="search-note">Loading festivals…</p>;
      case 'suggest':
        return (
          <>
            <p class="search-note">
              Search festivals, people, artists, cities, countries, dances and highlights. Or try:
            </p>
            <For each={s.groups}>{groupOf}</For>
          </>
        );
      case 'nothing':
        return nothing(s.typed, s.near);
      case 'past':
        return (
          <div class="search-none">
            <p>Nothing coming up matches “{s.typed}”.</p>
            {pastMatches(s.hidden)}
          </div>
        );
      case 'found':
        break;
    }
    return (
      <>
        <For each={s.groups}>{groupOf}</For>
        {s.hidden > 0 && pastMatches(s.hidden)}
      </>
    );
  };

  // the text field, its typing heard on itself, as an input event that does not bubble (a script's) is heard too
  const field = (el: HTMLInputElement) => {
    input = el;
    el.addEventListener('input', () => {
      setQuery(el.value);
      setExpanded(new Set<string>());
    });
  };
  // the field filled for the visitor (Did you mean, Escape), it and the list for it drawn before the call returns
  const retyped = (to: string) => {
    setQuery(to);
    flush();
  };
  function moved(ev: KeyboardEvent): void {
    const { options } = shown();
    const at = active();
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      highlight(options, at + 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      highlight(options, (at <= 0 ? options.length : at) - 1);
    } else if (ev.key === 'Enter' && at >= 0) {
      ev.preventDefault();
      options[at]?.picked();
    }
  }
  // Escape clears the text first, then closes
  const cancelled = (ev: Event) => {
    if (input !== undefined && input.value !== '') {
      ev.preventDefault();
      retyped('');
    }
  };

  // the index, built once, however many times the search opens while it is built; again on its next opening if building
  // it failed (reported)
  const indexed = async (): Promise<void> => {
    try {
      await data;
      setItems(buildIndex());
    } catch (e) {
      indexing = undefined;
      throw e;
    }
  };
  function open(): void {
    if (!show(trigger)) return;
    input?.select(); // the last query stays, ready to refine or type over
    setOpenings((n) => n + 1);
    if (indexing === undefined) {
      indexing = indexed();
      done(indexing, 'search');
    }
  }
  trigger.addEventListener('click', open);
  addEventListener('keydown', (ev) => {
    const typing =
      ev.target instanceof Element && ev.target.closest('input, textarea, select, [contenteditable]') !== null;
    if (
      (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey) ||
      ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k')
    ) {
      ev.preventDefault();
      open();
    }
  });

  return (
    <searchModal.Dialog class="search" label="Search" onCancel={cancelled}>
      <div class="search-top">
        <span class="search-glass" aria-hidden="true">
          {glass}
        </span>
        <input
          ref={field}
          type="text"
          class="search-input"
          value={query()}
          onKeyDown={moved}
          role="combobox"
          aria-expanded={shown().options.length > 0 ? 'true' : 'false'}
          aria-controls="search-list"
          aria-autocomplete="list"
          aria-activedescendant={shown().options[active()]?.id}
          placeholder="Festivals, artists, places, styles…"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="go"
        />
        <button type="button" class="search-cancel" onClick={() => done(shut(), 'search')}>
          Cancel
        </button>
      </div>
      <label class="search-past">
        <input
          type="checkbox"
          checked={withPast()}
          onChange={(ev) => {
            setWithPast(ev.currentTarget.checked);
            setExpanded(new Set<string>());
          }}
        />
        {' Include what has nothing coming up'}
      </label>
      <p ref={status} class="visually-hidden" aria-live="polite" />
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the combobox's list, whose options are rows of markup that a <select> or <datalist> cannot hold */}
      <div class="search-list" id="search-list" role="listbox" aria-label="Results">
        {/* a row that throws as it is drawn is reported, and the list left empty: the dialog, its entry and the next
        render stay */}
        <Errored fallback={(e) => <>{reported(e())}</>}>{listOf(shown())}</Errored>
      </div>
    </searchModal.Dialog>
  );
}
