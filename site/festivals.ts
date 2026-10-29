// The festivals the site works with, in the shape every card expects, and the small helpers the festival
// views share.
import { q, sql } from './db.ts';
import type { Kid } from './dom.ts';
import { MORE_TRAITS, TRAITS } from './icons.ts';
import { convert, rounded } from './money.ts';
import { priceToday } from './passes.ts';
import { type Goer, goersOf } from './plans.ts';
import type { PriceLine } from './pricing.ts';
import { EVENT, type EventRow, num, opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { home } from './ui.ts';
import { type Key, text, where } from './wording.ts';

// Each row with the fare for its weekend, the best-known names on its line-up, its genres (event_stats: its
// description's and its kizomba-world tags), what its card says of its price today (passes.ts) and the trip: the
// card's pass plus the flight in the visitor's currency, null when either is unknown or the pass has no price today.
// a festival as every card has it
export type Festival = Omit<EventRow, 'features'> & {
  depart: string | null;
  features: Set<Key<'feature'>>;
  promo: { code: string; offer: string | null } | null;
  goers: Goer[];
  headliners: { id: number; name: string }[];
  styles: Set<Key<'genre'>>;
  fare: { price: number; home?: true } | null;
  price: PriceLine;
  trip: number | null;
};

let cache:
  | {
      heads: Map<number, { id: number; name: string }[]>;
      fares: Map<string, number>;
      promos: Map<number, { code: string; offer: string | null }>;
    }
  | undefined;
function details() {
  if (!cache) {
    const heads = new Map<number, { id: number; name: string }[]>();
    // the best-known teachers and DJs (couples count as one act)
    // one row per person: someone listed as both teacher and DJ is still one name
    for (const r of q(
      { event_id: num, id: num, display_name: str },
      sql`SELECT ea.event_id, a.id, a.display_name FROM event_artists ea
        JOIN artists a ON a.id = ea.artist_id JOIN artist_stats st ON st.artist_id = a.id WHERE ea.role IN (?, ?) AND ea.as_couple IS NULL
        GROUP BY ea.event_id, a.id ORDER BY ea.event_id, st.bookings DESC`,
      [KEY.role.TEACHER, KEY.role.DJ],
    )) {
      const at = heads.get(r.event_id) ?? [];
      if (at.length < 3) heads.set(r.event_id, [...at, { id: r.id, name: r.display_name }]);
    }
    const fares = new Map(
      q({ k: str, price: num }, sql`SELECT airport || depart AS k, price FROM fares`).map((f) => [f.k, f.price]),
    );
    const promos = new Map(
      q({ event_id: num, code: str, offer: opt(str) }, sql`SELECT event_id, code, offer FROM event_promos`).map((p) => [
        p.event_id,
        { code: p.code, offer: p.offer },
      ]),
    );
    cache = { heads, fares, promos };
  }
  return cache;
}
// the flight to a festival: none from home, else the fare found for its weekend from its airport
function fareOf(e: EventRow, fares: ReadonlyMap<string, number>): Festival['fare'] {
  if (e.airport === home().code) return { price: 0, home: true };
  const flown = e.airport === null || e.weekend_friday === null ? undefined : fares.get(e.airport + e.weekend_friday);
  return flown === undefined ? null : { price: flown };
}
// the pass and the flight together, in the visitor's currency and rounded as the card shows it (so that a price limit
// keeps what the card says is within it), when both have a price
function tripOf(price: Festival['price'], fare: Festival['fare']): number | null {
  const pass = 'now' in price ? convert(price.now.tier.amount, price.now.tier.currency) : null,
    flight = fare ? convert(fare.price) : null;
  return pass === null || flight === null ? null : rounded(pass + flight);
}
export function withDetails(rows: readonly EventRow[]): Festival[] {
  const { heads, fares, promos } = details();
  return rows.map((e) => {
    const fare = fareOf(e, fares),
      price = priceToday(e);
    return {
      ...e,
      depart: e.weekend_friday,
      features: new Set(e.features),
      promo: promos.get(e.id) ?? null,
      goers: goersOf(e.id),
      headliners: heads.get(e.id) ?? [],
      styles: new Set(e.genres),
      fare,
      price,
      trip: tripOf(price, fare),
    };
  });
}

// Everything still to come.
export const festivals = (): Festival[] => withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE upcoming`));

// the genres a card names, in the order pipeline/states.py lists them
const DANCES = where('genre', 'card');
const DANCE_KEYS: ReadonlySet<string> = new Set(DANCES);
export const isDance = (k: string): k is Key<'genre'> => DANCE_KEYS.has(k);
export const styleLine = (e: Pick<Festival, 'styles'>): string =>
  DANCES.filter((g) => e.styles.has(g))
    .slice(0, 4)
    .map((g) => text('genre', g))
    .join(' · ');

// What "with" in the Festivals URL can name: a dance or a highlight, by key. Kizomba is on nearly every festival here,
// so it narrows nothing; taxi dancers and the all-in-one hotel have checkboxes of their own.
export type With = Key<'genre'> | Key<'feature'>;
export const WITH = new Map<With, string>([
  ...DANCES.filter((k) => k !== KEY.genre.KIZOMBA).map((k): [With, string] => [k, text('genre', k)]),
  ...[...TRAITS, ...MORE_TRAITS]
    .filter(([k]) => k !== KEY.feature.TAXI_DANCERS)
    .map(([k, words]): [With, string] => [k, words]),
]);
const WITH_KEYS: ReadonlySet<string> = new Set(WITH.keys());
export const isWith = (k: string): k is With => WITH_KEYS.has(k);
// how a with filter reads: "Also with Salsa" for a dance (the festivals are Kizomba ones anyway), "With Pool party"
export const withPhrase = (key: With): Kid[] => [isDance(key) ? 'Also with ' : 'With ', WITH.get(key)];
export const hasWith = (e: Pick<Festival, 'styles' | 'features'>, key: With): boolean =>
  isDance(key) ? e.styles.has(key) : e.features.has(key);
// the highlights the festival list has a checkbox for, as [its address parameter, the feature, whether a festival has
// it]
export const CHECKED = [
  ['taxi', KEY.feature.TAXI_DANCERS, (e: Festival) => e.taxi_dancers === true],
  ['allin', KEY.feature.ALL_IN_ONE, (e: Festival) => e.all_in_one === true],
] as const;
export type Checked = (typeof CHECKED)[number][0];

// A view's state in the URL. Each key keeps the type of its default; a value not in `allowed` keeps the default.
type Defaults = Readonly<Record<string, string | number>>;
export function readState<D extends Defaults>(
  qs: string,
  defaults: D,
  allowed: { readonly [K in keyof D]?: readonly D[K][] } = {},
): { -readonly [K in keyof D]: D[K] } {
  const s: Record<string, string | number> = { ...defaults };
  for (const [k, v] of new URLSearchParams(qs)) {
    const d = defaults[k];
    if (d === undefined) continue;
    const x = typeof d === 'number' ? Number(v) : v;
    const ok: readonly (string | number)[] | undefined = allowed[k];
    if (ok ? ok.includes(x) : typeof x !== 'number' || Number.isFinite(x)) s[k] = x;
  }
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: s starts as the defaults and takes only values of their types
  return s as { -readonly [K in keyof D]: D[K] };
}
// The part of a state that differs from the defaults, for the URL.
export const changed = (s: Defaults, defaults: Defaults): Record<string, string | number> =>
  Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== defaults[k]));
