// What the search finds for what is typed (search.ts shows it): the kinds of thing it finds, how well each matches,
// their order, and its answer: the groups found, or that only what has nothing coming up matches, or nothing and the
// name a typo away. Pure: the items are arguments.
import type { Checked, With } from './finder.ts';
import { fold, words } from './fold.ts';
import type { Drawing } from './icons.ts';
import type { Person } from './plans.ts';
import type { Params } from './routes.ts';
import { BOOKINGS, flag as flagCol, num, opt, PLACE_AND_DAYS, type RowOf, state, str } from './rows.ts';

// the groups results come in, always in this order
type Group = 'friend' | 'festival' | 'artist' | 'place' | 'tag';
const GROUPS: readonly (readonly [Group, string])[] = [
  ['friend', 'Friends'],
  ['festival', 'Festivals'],
  ['artist', 'Artists'],
  ['place', 'Places'],
  ['tag', 'Dances & highlights'],
];

// a dance or highlight to search for: one the list narrows to, or one it has a checkbox for
export type TagKey = With | Checked;

// what the search finds: each kind of thing with what its row shows and where picking it goes
export const FOUND_EVENT = {
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
export type FoundEvent = RowOf<typeof FOUND_EVENT>;
export const FOUND_ARTIST = {
  id: num,
  display_name: str,
  kind: state('artist_kind'),
  bookings: num,
  ...BOOKINGS,
  home_country: opt(str),
} as const;
type FoundArtist = RowOf<typeof FOUND_ARTIST>;
export interface Base {
  name: string;
  words: string[];
  nameWords: string[];
  past: boolean; // nothing coming up: a festival over, someone with no plans ahead, a place with no festival ahead
  rank: number; // higher first, among items of its kind only (before)
}
export type Item = Base &
  (
    | { kind: 'festival'; e: FoundEvent }
    | { kind: 'friend'; p: Person; upcoming: number }
    | { kind: 'artist'; a: FoundArtist; shares: boolean }
    | { kind: 'country'; country: { code: string; name: string }; n: number }
    | { kind: 'city'; city: City }
    | { kind: 'tag'; key: TagKey; params: Params; n: number; icon: Drawing | null; style: boolean }
  );
export interface City {
  key: string; // pipeline/cities.csv's
  city: string;
  cc: string;
  upcoming: number;
  all: number;
}
type Kind = Item['kind'];
export type Found<K extends Kind> = Extract<Item, { kind: K }>;
// countries and cities are places, the rest are their own group
const groupOf = (item: Item): Group => (item.kind === 'country' || item.kind === 'city' ? 'place' : item.kind);
// of two items, which comes first: by kind (a country before its cities), then by rank within the kind, so ranks of
// different kinds, each on its own scale, are never compared
const KIND_ORDER: Readonly<Record<Kind, number>> = { friend: 0, festival: 1, artist: 2, country: 3, city: 4, tag: 5 };
export const before = (a: Item, b: Item): number => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.rank - a.rank;

// Every token typed must start a word of the item; an item whose name is the query, or starts with it, comes first.
export function score(item: Item, tokens: readonly string[], query: string): 0 | 1 | 2 | 3 | 4 {
  if (!tokens.every((t) => item.words.some((w) => w.startsWith(t)))) return 0;
  const name = fold(item.name);
  const first = tokens[0] ?? '';
  return name === query ? 4 : name.startsWith(query) ? 3 : item.nameWords.some((w) => w.startsWith(first)) ? 2 : 1;
}

// the closest name to a query with no results, if it is only a typo or two away
export function nearest(items: readonly Item[], query: string): Item | null {
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

// What the search answers to a query: things to tap while nothing is typed; the matches, by group, best first, and how
// many with nothing coming up are left out (withPast includes them); that only those match; or that nothing does,
// with the name a typo or two away, if any.
export type Answer =
  | { kind: 'suggest' }
  | { kind: 'found'; tokens: string[]; groups: (readonly [Group, string, Item[]])[]; count: number; hidden: number }
  | { kind: 'past'; hidden: number }
  | { kind: 'nothing'; near: Item | null };
export function answer(items: readonly Item[], query: string, withPast: boolean): Answer {
  const tokens = words(query),
    folded = tokens.join(' ');
  if (tokens.length === 0) return { kind: 'suggest' };
  const matched = items
    .map((item) => ({ item, s: score(item, tokens, folded) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || before(a.item, b.item))
    .map((r) => r.item);
  const found = matched.filter((item) => withPast || !item.past);
  const hidden = matched.length - found.length;
  const groups = GROUPS.map(
    ([kind, title]) => [kind, title, found.filter((item) => groupOf(item) === kind)] as const,
  ).filter(([, , f]) => f.length > 0);
  if (groups.length > 0) return { kind: 'found', tokens, groups, count: found.length, hidden };
  if (hidden > 0) return { kind: 'past', hidden };
  return {
    kind: 'nothing',
    near: nearest(
      items.filter((item) => withPast || !item.past),
      folded,
    ),
  };
}
