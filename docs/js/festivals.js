// The festivals the site works with, in the shape every card expects, and the small helpers the festival
// views share.
import { q } from './db.js';
import { flag, home } from './ui.js';
import { TRAITS, MORE_TRAITS } from './icons.js';
import { goersOf } from './plans.js';
import { priceToday } from './passes.js';
import { convert } from './money.js';
import { KEY } from './states.js';
import { text, where } from './wording.js';

// Each row with the fare for its weekend, the best-known names on its line-up, its genres (event_stats: its
// description's and its kizomba-world tags), what its card says of its price today (passes.js) and the trip: the
// card's pass plus the flight in the visitor's currency, null when either is unknown or the pass has no price today.
let heads, fares, promos;
export function withDetails(rows) {
  if (!heads) {
    heads = {};
    // the best-known teachers and DJs (couples count as one act)
    // one row per person: someone listed as both teacher and DJ is still one name
    for (const r of q(`SELECT ea.event_id, a.id, a.display_name FROM event_artists ea JOIN artists a ON a.id = ea.artist_id
        JOIN artist_stats st ON st.artist_id = a.id WHERE ea.role IN (?, ?) AND ea.as_couple IS NULL
        GROUP BY ea.event_id, a.id ORDER BY ea.event_id, st.bookings DESC`, [KEY.role.TEACHER, KEY.role.DJ]))
      (heads[r.event_id] ||= []).length < 3 && heads[r.event_id].push({ id: r.id, name: r.display_name });
    fares = Object.fromEntries(q('SELECT airport || depart AS k, price FROM fares').map(f => [f.k, f.price]));
    promos = Object.fromEntries(q('SELECT event_id, code, offer FROM event_promos').map(p => [p.event_id, p]));
  }
  return rows.map(e => {
    const depart = e.weekend_friday, flown = fares[e.airport + depart];
    const fare = e.airport === home().code ? { price: 0, home: true } : flown != null ? { price: flown } : null;
    const price = priceToday(e);
    const cost = price.now && fare ? [convert(price.now.tier.amount, price.now.tier.currency), convert(fare.price)] : null;
    return { ...e, depart, features: new Set(e.features.split(',')), promo: promos[e.id] || null, goers: goersOf(e.id),
      headliners: heads[e.id] || [], styles: new Set(e.genres ? e.genres.split(',') : []),
      fare, price, trip: cost && !cost.includes(null) ? cost[0] + cost[1] : null };
  });
}

// Everything still to come.
export const festivals = () => withDetails(q('SELECT * FROM event_rows WHERE upcoming'));

// the genres a card names, in the order pipeline/states.py lists them
export const DANCES = where('genre', 'card');
export const styleLine = e => DANCES.filter(g => e.styles.has(g)).slice(0, 4).map(g => text('genre', g)).join(' · ');

// What "with" in the Festivals URL can name: a dance or a highlight, by key. Kizomba is on nearly every festival here,
// so it narrows nothing; taxi dancers and the all-in-one hotel have checkboxes of their own.
export const WITH = new Map([...DANCES.filter(k => k !== KEY.genre.KIZOMBA).map(k => [k, text('genre', k)]),
  ...[...TRAITS, ...MORE_TRAITS].filter(([k]) => k !== KEY.feature.TAXI_DANCERS)]);
// how a with filter reads: "Also with Salsa" for a dance (the festivals are Kizomba ones anyway), "With Pool party"
export const withPhrase = key => [DANCES.includes(key) ? 'Also with ' : 'With ', WITH.get(key)];
export const hasWith = (e, key) => e.styles.has(key) || e.features.has(key);

export const place = e => [flag(e.country_code), ' ', e.city];

// A view's state in the URL. Each key keeps the type of its default; a value not in `allowed` keeps the default.
export function readState(qs, defaults, allowed = {}) {
  const s = { ...defaults };
  for (const [k, v] of new URLSearchParams(qs)) {
    if (!(k in defaults)) continue;
    const x = typeof defaults[k] === 'number' ? Number(v) : v;
    if (allowed[k] ? allowed[k].includes(x) : typeof x !== 'number' || Number.isFinite(x)) s[k] = x;
  }
  return s;
}
// The part of a state that differs from the defaults, for the URL.
export const changed = (s, defaults) => Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== defaults[k]));
