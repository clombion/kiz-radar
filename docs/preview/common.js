// Shared pieces for the editorial preview variants: festival data, soft filters, quiet flight line.
import { q } from '../js/db.js';
import { h, euro, today, addDays, flag, countryName } from '../js/ui.js';
import { candidates } from '../js/finder.js';

export const MONTHS = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
export const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
export const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
export const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
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

// "With A, B and C": the best-known names as links to their artist pages
export const names = e => e.headliners.map(a => a.name);
export function withArtists(e, { more = true } = {}) {
  const links = e.headliners.map(a => h('a', { href: `#artist/${a.id}`, class: 'artist',
    onclick: () => { try { localStorage.setItem('kr-artist-seen', '1'); } catch {} } }, a.name));
  const rest = (e.lineup || 0) - e.headliners.length;
  return h('p', { class: 'with' }, 'With ', ...links.flatMap((l, i) => i ? [i === links.length - 1 && !(more && rest > 0) ? ' and ' : ', ', l] : [l]),
    more && rest > 0 ? h('span', { class: 'muted' }, ` and ${rest} more`) : null);
}

const STYLE_NAMES = { kizomba: 'Kizomba', urbankiz: 'Urban Kiz', semba: 'Semba', tarraxo: 'Tarraxo', tarraxinha: 'Tarraxinha',
  douceur: 'Douceur', kompa: 'Kompa', zouk: 'Zouk', bachata: 'Bachata', salsa: 'Salsa', afro: 'Afro' };
export const styleLine = e => [...e.styles].map(s => STYLE_NAMES[s]).filter(Boolean).slice(0, 4).join(' · ');

// "how far are you willing to go" in plain words rather than a price filter
export const REACH = [['any', 'Anywhere'], [250, 'Easy trips'], [150, 'Cheap & close']];
export const WHEN = [[2, 'Next 2 months'], [4, 'Next 4 months'], [6, 'Next 6 months'], [12, 'The year ahead']];

export function filtersBar(state, onChange, { showReach = true } = {}) {
  const pills = (key, opts) => h('div', { class: 'group' }, ...opts.map(([v, t]) =>
    h('button', { type: 'button', class: 'pill' + (state[key] === v ? ' on' : ''), 'aria-pressed': String(state[key] === v),
      onclick: () => { state[key] = v; onChange(); } }, t)));
  return h('div', { class: 'ed-filters', role: 'group', 'aria-label': 'Filters' },
    h('div', { class: 'group' }, h('span', {}, 'When can you travel?'), pills('months', WHEN)),
    h('div', { class: 'group' }, h('span', {}, 'Style'), pills('style', [['kiz', 'Kizomba & Urban Kiz'], ['all', 'All, incl. mixed SBK']])),
    showReach ? h('div', { class: 'group' }, h('span', {}, 'Trips'), pills('reach', REACH)) : null);
}

export function visible(all, s) {
  const end = addDays(today(), Math.round(s.months * 30.4));
  return all.filter(e => e.depart <= end && (s.style === 'all' || e.kiz_only) &&
    (s.reach === 'any' || (e.fare && e.fare.price <= s.reach)))
    .sort((a, b) => a.depart.localeCompare(b.depart));
}

export function flightLine(e, home) {
  if (e.fare?.home) return h('span', { class: 'flight easy' }, 'In Bergen, no flight needed');
  if (!e.fare) return h('span', { class: 'flight' }, '✈ flight price not checked yet');
  const ret = addDays(e.depart, 3);
  const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${home} to ${e.airport} on ${e.depart} through ${ret}`)}&curr=EUR`;
  return h('span', { class: 'flight' + (e.fare.price <= 150 ? ' easy' : '') }, '✈ about ', h('span', { class: 'p' }, euro(e.fare.price)),
    ` return from Bergen`, e.airport_km > 30 ? ` + ${e.airport_km} km` : '', ' · ', h('a', { href: url, target: '_blank', rel: 'noopener' }, 'check'));
}

export const place = e => [flag(e.country_code), ' ', e.city || countryName(e.country_code)];

export function byMonth(rows) {
  const groups = new Map();
  for (const e of rows) {
    const k = e.depart.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return groups;
}

export function footerLinks() {
  return h('nav', { class: 'ed-footer-links', 'aria-label': 'More to explore' },
    h('a', { href: '#map' }, h('strong', {}, 'The map'), h('span', {}, 'Every festival across Europe, city by city.')),
    h('a', { href: '#artists' }, h('strong', {}, 'The artists'), h('span', {}, 'Who teaches and DJs where, and who travels most.')),
    h('a', { href: '#countries' }, h('strong', {}, 'The scenes'), h('span', {}, 'Country by country: festivals, line-ups, how open each scene is.')));
}

export function stateFromHash(qs, defaults) {
  const s = { ...defaults };
  for (const [k, v] of new URLSearchParams(qs)) if (k in defaults) s[k] = v === 'any' || v === 'all' || v === 'kiz' ? v : Number(v);
  return s;
}
export function writeHash(s, defaults) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v !== defaults[k]) p.set(k, v);
  history.replaceState(null, '', location.search + '#finder' + (p.toString() ? '?' + p : ''));
}
