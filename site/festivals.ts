// The festivals the site works with, in the shape every card expects, and the small helpers the festival
// views share.
import { q, sql } from './db.ts';
import { h } from './dom.ts';
import { type Fare, fareKey, fareOf, tripOf } from './fares.ts';
import { DANCES } from './finder.ts';
import { convert, rounded } from './money.ts';
import { priceToday } from './passes.ts';
import { type Goer, goersOf } from './plans.ts';
import type { PriceLine } from './pricing.ts';
import { EVENT, type EventRow, num, opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { home } from './ui.ts';
import { type Key, text } from './wording.ts';

// A festival as every card has it: its row with the fare for its weekend (fares.ts), the best-known names on its
// line-up, its genres (event_stats: its description's and its kizomba-world tags), what its card says of its price
// today (passes.ts) and the trip: the card's pass plus the flight in the visitor's currency, null when either is
// unknown or the pass has no price today.
export type Festival = Omit<EventRow, 'features'> & {
  depart: string | null;
  features: Set<Key<'feature'>>;
  promo: { code: string; offer: string | null } | null;
  goers: Goer[];
  headliners: { id: number; name: string }[];
  styles: Set<Key<'genre'>>;
  fare: Fare | null;
  price: PriceLine;
  trip: number | null;
};

let cache:
  | {
      heads: Map<number, { id: number; name: string }[]>;
      fares: Map<string, { price: number; back: string }>; // by fareKey
      promos: Map<number, { code: string; offer: string | null }>;
    }
  | undefined;
function details() {
  if (!cache) {
    const heads = new Map<number, { id: number; name: string }[]>();
    // the three best-known teachers and DJs of each festival (couples count as one act, someone listed as both
    // teacher and DJ is one name), the most booked first
    for (const r of q(
      { event_id: num, id: num, display_name: str },
      sql`SELECT event_id, id, display_name FROM (
        SELECT ea.event_id, a.id, a.display_name,
          row_number() OVER (PARTITION BY ea.event_id ORDER BY st.bookings DESC, a.id) AS n
        FROM (SELECT DISTINCT event_id, artist_id FROM event_artists WHERE role IN (?, ?) AND as_couple IS NULL) ea
        JOIN artists a ON a.id = ea.artist_id JOIN artist_stats st ON st.artist_id = a.id
      ) WHERE n <= 3 ORDER BY event_id, n`,
      [KEY.role.TEACHER, KEY.role.DJ],
    ))
      heads.set(r.event_id, [...(heads.get(r.event_id) ?? []), { id: r.id, name: r.display_name }]);
    const fares = new Map(
      q(
        { airport: str, depart: str, back: str, price: num },
        sql`SELECT airport, depart, return AS back, price FROM fares`,
      ).map((f) => [fareKey(f.airport, f.depart), { price: f.price, back: f.back }]),
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
export function withDetails(rows: readonly EventRow[]): Festival[] {
  const { heads, fares, promos } = details();
  return rows.map((e) => {
    const fare = fareOf(e, home().code, fares),
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
      trip: tripOf('now' in price ? price.now.tier : null, fare, { convert, rounded }),
    };
  });
}

// Everything still to come, built once for the festival list and search alike (the database doesn't change).
let upcoming: readonly Festival[] | undefined;
export function festivals(): readonly Festival[] {
  upcoming ??= withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE upcoming`));
  return upcoming;
}

// the genres a card names, at most four
export const styleLine = (e: Pick<Festival, 'styles'>): string =>
  DANCES.filter((g) => e.styles.has(g))
    .slice(0, 4)
    .map((g) => text('genre', g))
    .join(' · ');

// what an address asked that the view has no such choice for, said at the top of the view
export function leftOut(root: HTMLElement, dropped: readonly string[]): void {
  if (dropped.length === 0) return;
  const said = `The link asks for ${dropped.join(', ')}, which ${dropped.length === 1 ? 'is' : 'are'} not among the choices here.`;
  root.prepend(h('p', { class: ['muted', 'left-out'], role: 'status' }, said));
}
