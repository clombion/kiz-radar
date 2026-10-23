// DOM and formatting helpers shared by the views. All text goes through textContent.
import { q, site } from './db.js';

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

const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const MY = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const asDay = iso => new Date(iso.slice(0, 10) + 'T12:00');      // dates are days; meta.built_at is a timestamp
export const dayMonth = iso => DM.format(asDay(iso));             // 23 Oct
export const dayYear = iso => DY.format(asDay(iso));              // 23 Oct 2026
export const monthYear = iso => MY.format(asDay(iso));            // October 2026

export const euro = n => n == null ? '—' : '€' + Math.round(n);

// Flights leave from the home airport (the tier-0 airport in pipeline/airports.csv).
export const home = () => site().home;

export function flightsUrl(airport, depart, ret) {
  const qs = `Flights from ${home().code} to ${airport} on ${depart} through ${ret}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(qs)}&curr=EUR`;
}

export function addDays(iso, n) {
  const d = new Date(iso.slice(0, 10) + 'T12:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);
