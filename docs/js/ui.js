// DOM and formatting helpers shared by the views. All text goes through textContent.
import { q } from './db.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const flag = cc => cc && cc.length === 2
  ? String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';

let names;
export function countryName(cc) {
  if (!names) names = Object.fromEntries(q('SELECT code, name FROM countries').map(r => [r.code, r.name]));
  return names[cc] || cc || '—';
}

const D = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const day = iso => iso ? D.format(new Date(iso.slice(0, 10) + 'T12:00')) : '';
export const dayYear = iso => iso ? DY.format(new Date(iso.slice(0, 10) + 'T12:00')) : '';
export function range(start, end) {
  if (!end || end.slice(0, 10) === start.slice(0, 10)) return dayYear(start);
  const a = new Date(start.slice(0, 10) + 'T12:00'), b = new Date(end.slice(0, 10) + 'T12:00');
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${a.getDate()}–${DY.format(b)}`
    : `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(a)} – ${DY.format(b)}`;
}

export function ago(iso) {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  return `${Math.round(d)} days ago`;
}

export const euro = n => n == null ? '—' : '€' + Math.round(n);

export function flightsUrl(home, airport, depart, ret) {
  const qs = `Flights from ${home} to ${airport} on ${depart} through ${ret}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(qs)}&curr=EUR`;
}

export function addDays(iso, n) {
  const d = new Date(iso.slice(0, 10) + 'T12:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);

export function chip(text, cls = '') { return h('span', { class: 'chip ' + cls }, text); }

const FEATURE_LABEL = {
  taxi_dancers: 'Taxi dancers', all_in_one: 'All-in-one hotel', competition: 'Competition', pool_party: 'Pool party',
  beach_party: 'Beach party', boat_party: 'Boat party', live_music: 'Live music', bootcamp_intensive: 'Bootcamp',
  masterclass: 'Masterclass', all_levels_beginners: 'Beginners welcome', accommodation_included: 'Hotel in pass',
  meals_included: 'Meals in pass', transfers_shuttle: 'Airport shuttle', cruise: 'Cruise', camping: 'Camping',
  multiple_rooms: 'Several rooms', day_socials: 'Day socials', shows: 'Shows', pre_party: 'Pre-party',
  after_party: 'After-party', themed_parties: 'Themed parties', partner_hotel: 'Partner hotel',
  workshops: 'Workshops', private_classes: 'Private classes', dress_code: 'Dress code', adults_only: '18+',
};
export const featureLabel = f => FEATURE_LABEL[f] || f.replace(/_/g, ' ');
const GENRE_LABEL = { urbankiz: 'Urban Kiz', kizomba: 'Kizomba', semba: 'Semba', tarraxo: 'Tarraxo',
  tarraxinha: 'Tarraxinha', douceur: 'Douceur', kompa: 'Kompa', zouk: 'Zouk', bachata: 'Bachata', salsa: 'Salsa',
  afro: 'Afro', reggaeton: 'Reggaeton', kuduro: 'Kuduro', other: 'Other' };
export const genreLabel = g => GENRE_LABEL[g] || g;
export const KIZ = new Set(['kizomba', 'urbankiz', 'semba', 'tarraxo', 'tarraxinha', 'douceur']);

export function where(e) {
  return [flag(e.country_code), ' ', e.city || '', e.city && e.country_code ? ', ' : '', countryName(e.country_code)];
}

export function airportNote(e, home) {
  if (!e.airport) return 'No covered airport nearby';
  if (e.airport === home) return e.airport_km <= 30 ? 'At home' : `${e.airport_km} km from home`;
  return e.airport_km <= 30 ? `Fly to ${e.airport}` : `Fly to ${e.airport}, then ${e.airport_km} km by land`;
}

// One line of facts used on every event card.
export function eventFacts(e) {
  const facts = [];
  if (e.kiz_only) facts.push(chip('Kiz only', 'kiz'));
  if (e.taxi_dancers) facts.push(chip('Taxi dancers', 'taxi'));
  if (e.all_in_one) facts.push(chip('All-in-one'));
  if (e.lineup) facts.push(chip(`${e.lineup} artists`));
  if (e.popular_artists) facts.push(chip(`★ ${e.popular_artists} popular`, 'star'));
  if (e.cancelled === 1) facts.push(chip('Cancelled', 'bad'));
  return h('div', { class: 'chips' }, facts);
}

// Columns every event query returns, so cards can be built from any view.
export const EVENT_COLS = `e.id, e.title, e.url, e.start_date, e.end_date, e.city, e.country_code, e.lat, e.lon,
  e.airport, e.airport_km, e.weekend_friday, e.cancelled, e.venue,
  s.lineup, s.popular_artists, s.imported, s.kiz, s.kiz_only, s.taxi_dancers, s.all_in_one, s.genres, s.features`;
