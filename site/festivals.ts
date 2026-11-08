// The festivals the site works with, in the shape every card expects, and the small helpers the festival
// views share.

import { today } from './days.ts';
import { freshDay, q, sql } from './db.ts';
import { h } from './dom.ts';
import { type Fare, fareOf, flightBegun, type Option, tripOf } from './fares.ts';
import { DANCES } from './finder.ts';
import { convert, rounded } from './money.ts';
import { priceToday } from './passes.ts';
import { type Goer, goersOf } from './plans.ts';
import type { PriceLine } from './pricing.ts';
import { EVENT, type EventRow, num, opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { home } from './ui.ts';
import { type Key, text } from './wording.ts';

// A festival as every card has it: its row with the airports it can fly to (options) and the best fare of theirs for
// its weekend (fares.ts best), the best-known names on its
// line-up, its genres (event_stats: its description's and its kizomba-world tags), what its card says of its price
// today (passes.ts) and the trip: the card's pass plus the flight in the visitor's currency, null when either is
// unknown or the pass has no price today; once its weekend's Friday-to-Monday return has left (begun, fares.ts
// flightBegun), the trip is the pass alone (what the price filter and the order by price read too).
export type Festival = Omit<EventRow, 'features'> & {
  depart: string | null;
  features: Set<Key<'feature'>>;
  promo: { code: string; offer: string | null } | null;
  goers: Goer[];
  headliners: { id: number; name: string }[];
  styles: Set<Key<'genre'>>;
  options: Option[]; // every airport it can fly to, the nearest first, each with its fare for the weekend
  fare: Fare | null;
  price: PriceLine;
  trip: number | null;
  begun: boolean; // its weekend's flight has left today: no flight is priced
};

let cache:
  | {
      heads: Map<number, { id: number; name: string }[]>;
      options: Map<number, Option[]>; // by festival
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
    // each festival's airports, the nearest first, with the fare and the last search of its weekend; home is none
    const options = new Map<number, Option[]>();
    for (const r of q(
      {
        event_id: num,
        airport: str,
        name: str,
        city: str,
        km: num,
        price: opt(num),
        back: opt(str),
        stops_out: opt(num),
        stops_back: opt(num),
        resold: opt(str),
        transfer_price: opt(num),
        transfer_airlines: opt(str),
        fetched: opt(str),
        checked: opt(str),
        direct: opt(num),
      },
      sql`SELECT ea.event_id, ea.airport, a.name, a.city, ea.km, f.price, f.return AS back, f.stops_out, f.stops_back,
        f.resold, f.fetched_at AS fetched, s.searched_at AS checked, s.direct, t.price AS transfer_price,
        t.airlines AS transfer_airlines
      FROM event_airports ea JOIN events e ON e.id = ea.event_id JOIN airports a ON a.code = ea.airport
        LEFT JOIN fares f ON f.airport = ea.airport AND f.depart = e.weekend_friday
        LEFT JOIN fare_searches s ON s.airport = ea.airport AND s.depart = e.weekend_friday
        LEFT JOIN fare_transfers t ON t.airport = ea.airport AND t.depart = e.weekend_friday
      WHERE a.home = 0 ORDER BY ea.event_id, ea.km, ea.airport`,
    )) {
      const { event_id, price, back, stops_out, stops_back, resold, fetched, direct, transfer_price, ...rest } = r;
      const { transfer_airlines, ...at } = rest;
      const transfer =
        transfer_price === null || transfer_airlines === null
          ? null
          : { price: transfer_price, airlines: transfer_airlines };
      const stops = { out: stops_out, back: stops_back };
      const fare = price === null || back === null || fetched === null ? null : { price, back, stops, resold, fetched };
      options.set(event_id, [
        ...(options.get(event_id) ?? []),
        { ...at, fare, transfer, direct: direct === null ? null : direct === 1 },
      ]);
    }
    const promos = new Map(
      q({ event_id: num, code: str, offer: opt(str) }, sql`SELECT event_id, code, offer FROM event_promos`).map((p) => [
        p.event_id,
        { code: p.code, offer: p.offer },
      ]),
    );
    cache = { heads, options, promos };
  }
  return cache;
}
export function withDetails(rows: readonly EventRow[]): Festival[] {
  const { heads, options, promos } = details();
  return rows.map((e) => {
    const flies = options.get(e.id) ?? [];
    const fare = fareOf(e, home().code, flies),
      price = priceToday(e),
      begun = flightBegun(e.weekend_friday, today());
    return {
      ...e,
      depart: e.weekend_friday,
      features: new Set(e.features),
      promo: promos.get(e.id) ?? null,
      goers: goersOf(e.id),
      headliners: heads.get(e.id) ?? [],
      styles: new Set(e.genres),
      options: flies,
      fare,
      price,
      trip: tripOf('now' in price ? price.now.tier : null, fare, { convert, rounded }, begun),
      begun,
    };
  });
}

// Everything still to come, built once a day for the festival list and search alike (the database doesn't change).
// They are built again on a new day (past midnight, the page left open), as where each festival stands is the day's.
let upcoming: { day: string; festivals: readonly Festival[] } | undefined;
export function festivals(): readonly Festival[] {
  const day = freshDay();
  if (upcoming?.day !== day)
    upcoming = { day, festivals: withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE upcoming`)) };
  return upcoming.festivals;
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
