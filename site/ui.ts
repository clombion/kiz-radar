// Formatting helpers shared by the views: dates, countries, flight links, the home city.
import { today } from './days.ts';
import { q, site, sql } from './db.ts';
import { h, type Kid } from './dom.ts';
import { currency } from './money.ts';
import { str } from './rows.ts';

// whether the visitor asked for less motion, and how a scroll goes for them: at once when they did
export const calm = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const scrolling = (): ScrollBehavior => (calm() ? 'auto' : 'smooth');

// the arrow after words that lead off the site, shown and not read out (the link's own words say where it goes)
export const away = () => h('span', { 'aria-hidden': 'true' }, ' ↗');

export const flag = (cc: string | null | undefined): string =>
  cc?.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1_f1_e6 + c.charCodeAt(0) - 65)) : '';

// where a festival is: its country's flag and its city
export const place = (e: { country_code: string | null; city: string | null }): Kid[] => [
  flag(e.country_code),
  ' ',
  e.city ?? 'Place not given',
];

let names: Map<string, string> | undefined;
export function countryName(cc: string | null | undefined): string {
  names ??= new Map(q({ code: str, name: str }, sql`SELECT code, name FROM countries`).map((r) => [r.code, r.name]));
  return cc == null || cc === '' ? '—' : (names.get(cc) ?? cc);
}

const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const MY = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const asDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00`); // dates are days; meta.built_at is a timestamp
export const dayMonth = (iso: string) => DM.format(asDay(iso)); // 23 Oct
export const dayYear = (iso: string) => DY.format(asDay(iso)); // 23 Oct 2026
export const monthYear = (iso: string) => MY.format(asDay(iso)); // October 2026
// " 2027" for a day of another year than the visitor's, '' for one of theirs
export const otherYear = (iso: string): string =>
  iso.slice(0, 4) === today().slice(0, 4) ? '' : ` ${iso.slice(0, 4)}`;
// a festival's days in parts, each day's number and month, for the ways they are laid out ("6–9 Nov", a date box)
export function dayParts(start: string, end: string): { d1: string; m1: string; d2: string; m2: string } {
  const [d1 = '', m1 = ''] = dayMonth(start).split(' '),
    [d2 = '', m2 = ''] = dayMonth(end).split(' ');
  return { d1, m1, d2, m2 };
}
// "6–9 Nov", or "26 Nov – 1 Dec" across a month end
export function dayRange(start: string, end: string): string {
  const { d1, m1, d2, m2 } = dayParts(start, end);
  return start === end ? `${d1} ${m1}` : m1 === m2 ? `${d1}–${d2} ${m1}` : `${d1} ${m1} – ${d2} ${m2}`;
}

// the animated mark, while something loads (index.html holds the same, for before the scripts run)
export const loading = (words = '') =>
  h(
    'p',
    { class: 'status loading', role: 'status' },
    h('img', { src: 'loading.svg', alt: '', width: 56, height: 56 }),
    h('span', {}, words || h('span', { class: 'visually-hidden' }, 'Loading')),
  );

// Flights leave from the home airport (the tier-0 airport in pipeline/airports.csv).
export const home = () => site().home;

export function flightsUrl(airport: string, depart: string, ret: string): string {
  const qs = `Flights from ${home().code} to ${airport} on ${depart} through ${ret}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(qs)}&curr=${currency}`;
}
