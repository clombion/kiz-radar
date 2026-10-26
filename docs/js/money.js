// Prices in the visitor's currency: kroner, or euros or dollars when the address says ?cur=eur or ?cur=usd (the
// footer switches it). Amounts in another currency are converted with the rates table and marked "~". Price steps
// are round numbers in each currency: for a return flight (the map, a cheap flight in green) and for a trip, the full
// pass and the flight together (the festival filter).
import { q } from './db.js';
import { h } from './ui.js';

const CURRENCIES = {
  NOK: { label: 'kr', flight: { cheap: 1500, fair: 2500 }, trip: { cheap: 3500, fair: 5000 } },
  EUR: { label: '€', flight: { cheap: 150, fair: 250 }, trip: { cheap: 350, fair: 500 } },
  USD: { label: '$', flight: { cheap: 175, fair: 275 }, trip: { cheap: 400, fair: 550 } },
};
const asked = new URLSearchParams(location.search).get('cur')?.toUpperCase();
export const currency = asked in CURRENCIES ? asked : 'NOK';
// step('flight', 'cheap'), step('trip', 'fair'): in the visitor's currency
export const step = (what, name) => CURRENCIES[currency][what][name];

let rates;
const rate = c => (rates ||= Object.fromEntries(q('SELECT currency, per_eur FROM rates').map(r => [r.currency, r.per_eur])))[c];
// an amount in the visitor's currency, or null when there is no rate for it
export const convert = (amount, from = 'EUR') => from === currency ? amount : rate(from) && rate(currency) ? amount / rate(from) * rate(currency) : null;

const grouped = n => Math.round(n).toLocaleString('en-GB').replace(/,/g, '\u00a0');   // 1 850, kept on one line
const decimals = n => Number.isInteger(n) ? grouped(n) : n.toFixed(2);
function written(n, c) {
  if (c === 'NOK') return `${grouped(n)} kr`;
  if (c === 'EUR') return `€${decimals(n)}`;
  if (c === 'USD') return `$${decimals(n)}`;
  return `${decimals(n)} ${c}`;
}
// "~1 850 kr" for €160; "€160" when euros are chosen; "160 CHF" when there is no rate to convert with. An approx
// amount (a flight price, which changes by the hour) reads "~" in every currency.
export function money(amount, from = 'EUR', { approx = false } = {}) {
  const n = convert(amount, from);
  if (n == null) return written(amount, from);
  if (from === currency) return (approx ? '~' : '') + written(n, currency);
  return '~' + written(currency === 'NOK' ? Math.round(n / 10) * 10 : Math.round(n), currency);
}
// the sum of [amount, currency] pairs in the visitor's currency, "~4 130 kr"; null when one has no rate
export function total(parts) {
  const ns = parts.map(([a, c]) => convert(a, c));
  if (ns.some(n => n == null)) return null;
  const n = ns.reduce((a, b) => a + b, 0);
  return '~' + written(currency === 'NOK' ? Math.round(n / 10) * 10 : Math.round(n), currency);
}

// "Prices in: kr · € · $": each reloads this page, at the same place, in that currency
export function currencySwitch() {
  const to = c => { const u = new URL(location.href); c === 'NOK' ? u.searchParams.delete('cur') : u.searchParams.set('cur', c.toLowerCase()); location.href = u.href; };
  return h('p', { class: 'currency-switch' }, 'Prices in: ', Object.entries(CURRENCIES).flatMap(([c, { label }], i) => [i ? ' · ' : '',
    c === currency ? h('b', { 'aria-current': 'true' }, label)
      : h('button', { type: 'button', class: 'link', 'aria-label': c, onclick: () => to(c) }, label)]));
}
