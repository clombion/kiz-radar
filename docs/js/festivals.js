// The festivals the site works with, in the shape every card expects, and the small helpers the festival
// views share.
import { q } from './db.js';
import { today, addDays, flag, home } from './ui.js';

// Each row with the fare for its weekend, the best-known names on its line-up and its styles.
let heads, styles, fares;
export function withDetails(rows) {
  if (!heads) {
    heads = {}; styles = {};
    // the best-known teachers and DJs (couples count as one act)
    for (const r of q(`SELECT ea.event_id, a.id, a.display_name FROM event_artists ea JOIN artists a ON a.id = ea.artist_id
        JOIN artist_stats st ON st.artist_id = a.id WHERE ea.role IN ('teacher','dj') AND ea.as_couple IS NULL
        ORDER BY ea.event_id, st.bookings DESC`)) (heads[r.event_id] ||= []).length < 3 && heads[r.event_id].push({ id: r.id, name: r.display_name });
    for (const r of q(`SELECT event_id, genre FROM event_genres WHERE source = 'description'`)) (styles[r.event_id] ||= new Set()).add(r.genre);
    fares = Object.fromEntries(q('SELECT airport || depart AS k, price FROM fares').map(f => [f.k, f.price]));
  }
  return rows.map(e => {
    const depart = e.depart || e.weekend_friday, price = fares[e.airport + depart];
    return { ...e, depart, features: new Set(e.features.split(',')), headliners: heads[e.id] || [], styles: styles[e.id] || new Set(),
      fare: e.airport === home().code ? { price: 0, home: true } : price != null ? { price } : null };
  });
}

// Everything still to come, plus likely next editions: a festival whose last edition has passed suggests next
// year's on the same weekend, unless that is already listed.
const titleKey = t => t.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).slice(0, 3).join(' ');
const STOP = new Set(['the', 'official', 'edition', 'event', 'festival', 'fest', 'congress', 'and', 'with', 'vol',
  'annual', 'anniversary', 'international', 'kizomba', 'urbankiz', 'urban', 'kiz', 'weekend']);

export function festivals() {
  const from = today(), to = addDays(from, 365);
  const all = q('SELECT * FROM event_rows WHERE cancelled = 0');
  const upcoming = all.filter(e => e.upcoming);
  const listed = upcoming.map(e => ({ key: titleKey(e.title), city: e.city, f: e.weekend_friday }));
  const rows = upcoming.map(e => ({ ...e, projected: false }));
  for (const e of all) {
    if (e.upcoming) continue;
    const depart = addDays(e.weekend_friday, 364);       // same weekday a year on
    if (depart < from || depart > to) continue;
    const k = titleKey(e.title);
    const dup = listed.some(l => l.city === e.city && (l.key === k || Math.abs(new Date(l.f) - new Date(depart)) < 864e5 * 10 && l.key.split(' ')[0] === k.split(' ')[0]));
    if (!dup) rows.push({ ...e, depart, projected: true });
  }
  return withDetails(rows);
}

const STYLE_NAMES = { kizomba: 'Kizomba', urbankiz: 'Urban Kiz', semba: 'Semba', tarraxo: 'Tarraxo', tarraxinha: 'Tarraxinha',
  douceur: 'Douceur', kompa: 'Kompa', zouk: 'Zouk', bachata: 'Bachata', salsa: 'Salsa', afro: 'Afro' };
export const styleLine = e => [...e.styles].map(s => STYLE_NAMES[s]).filter(Boolean).slice(0, 4).join(' · ');

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
