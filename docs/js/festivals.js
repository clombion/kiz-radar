// The festivals the site works with: everything upcoming, plus likely next editions of last year's, and the
// small helpers the festival views share.
import { q } from './db.js';
import { today, addDays, flag, countryName, EVENT_COLS } from './ui.js';

// A 2026 edition that has passed suggests next year's, on the same weekend, unless it is already listed.
const titleKey = t => t.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).slice(0, 3).join(' ');
const STOP = new Set(['the', 'official', 'edition', 'event', 'festival', 'fest', 'congress', 'and', 'with', 'vol',
  'annual', 'anniversary', 'international', 'kizomba', 'urbankiz', 'urban', 'kiz', 'weekend']);

export function candidates(p, home) {
  const from = today(), to = addDays(from, Math.round(p.months * 30.4));
  const base = q(`SELECT ${EVENT_COLS} FROM events e JOIN event_stats s ON s.event_id = e.id
    WHERE e.cancelled IS NOT 1 AND e.airport IS NOT NULL`);
  const upcoming = base.filter(e => e.weekend_friday >= from);
  const listed = upcoming.map(e => ({ key: titleKey(e.title), city: e.city, f: e.weekend_friday }));
  const rows = upcoming.map(e => ({ ...e, depart: e.weekend_friday, projected: false }));
  if (p.projected) {
    for (const e of base) {
      if (e.weekend_friday >= from) continue;
      const depart = addDays(e.weekend_friday, 364);       // same weekday a year on
      if (depart < from || depart > to) continue;
      const k = titleKey(e.title);
      const dup = listed.some(l => l.city === e.city && (l.key === k || Math.abs(new Date(l.f) - new Date(depart)) < 864e5 * 10 && l.key.split(' ')[0] === k.split(' ')[0]));
      if (!dup) rows.push({ ...e, depart, projected: true });
    }
  }
  const fare = Object.fromEntries(q('SELECT airport || depart AS k, price, fetched_at FROM fares').map(r => [r.k, r]));
  return rows.filter(e => e.depart <= to)
    .map(e => ({ ...e, fare: e.airport === home ? { price: 0, home: true } : fare[e.airport + e.depart] || null }));
}

export const d = iso => new Date(iso.slice(0, 10) + 'T12:00');

export function festivals(home) {
  const rows = candidates({ months: 12, projected: true }, home);
  // the best-known names on each line-up (couples count as one act)
  const heads = {};
  for (const r of q(`SELECT ea.event_id, a.id, a.display_name, st.bookings FROM event_artists ea JOIN artists a ON a.id = ea.artist_id
      JOIN artist_stats st ON st.artist_id = a.id WHERE ea.role IN ('teacher','dj') AND ea.as_couple IS NULL
      ORDER BY ea.event_id, st.bookings DESC`)) {
    (heads[r.event_id] ||= []).length < 3 && heads[r.event_id].push({ id: r.id, name: r.display_name, popular: r.bookings >= 10 });
  }
  const styles = {};
  for (const r of q(`SELECT event_id, genre FROM event_genres WHERE source = 'description'`)) (styles[r.event_id] ||= new Set()).add(r.genre);
  return rows.map(e => ({ ...e, headliners: heads[e.id] || [], styles: styles[e.id] || new Set() }));
}

const STYLE_NAMES = { kizomba: 'Kizomba', urbankiz: 'Urban Kiz', semba: 'Semba', tarraxo: 'Tarraxo', tarraxinha: 'Tarraxinha',
  douceur: 'Douceur', kompa: 'Kompa', zouk: 'Zouk', bachata: 'Bachata', salsa: 'Salsa', afro: 'Afro' };
export const styleLine = e => [...e.styles].map(s => STYLE_NAMES[s]).filter(Boolean).slice(0, 4).join(' · ');

export const place = e => [flag(e.country_code), ' ', e.city || countryName(e.country_code)];

export function stateFromHash(qs, defaults) {
  const s = { ...defaults };
  for (const [k, v] of new URLSearchParams(qs)) if (k in defaults) s[k] = v === 'any' || v === 'all' || v === 'kiz' ? v : Number(v);
  return s;
}

export function writeHash(s, defaults) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v !== defaults[k]) p.set(k, v);
  history.replaceState(null, '', '#finder' + (p.toString() ? '?' + p : ''));
}
