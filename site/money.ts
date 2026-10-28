// Prices in the visitor's currency: kroner, or euros or dollars when the address says ?cur=eur or ?cur=usd (the
// footer switches it). Amounts in another currency are converted with the rates table and marked "~". Price steps
// are round numbers in each currency: for a return flight (the map, a cheap flight in green) and for a trip, the full
// pass and the flight together (the festival filter).
import { q, sql } from './db.ts';
import { button, h } from './dom.ts';
import { num, str } from './rows.ts';

type Steps = Readonly<{ cheap: number; fair: number }>;
type Currency = 'NOK' | 'EUR' | 'USD';
const CURRENCIES: Readonly<Record<Currency, { label: string; flight: Steps; trip: Steps }>> = {
  NOK: { label: 'kr', flight: { cheap: 1500, fair: 2500 }, trip: { cheap: 3000, fair: 5000 } },
  EUR: { label: '€', flight: { cheap: 150, fair: 250 }, trip: { cheap: 300, fair: 500 } },
  USD: { label: '$', flight: { cheap: 175, fair: 275 }, trip: { cheap: 350, fair: 550 } },
};
const isCurrency = (c: string | undefined): c is Currency => c !== undefined && Object.hasOwn(CURRENCIES, c);
const asked = new URLSearchParams(location.search).get('cur')?.toUpperCase();
export const currency: Currency = isCurrency(asked) ? asked : 'NOK';
// step('flight', 'cheap'), step('trip', 'fair'): in the visitor's currency
export const step = (what: 'flight' | 'trip', name: keyof Steps): number => CURRENCIES[currency][what][name];

let rates: Map<string, number> | undefined;
const rate = (c: string): number | undefined => {
  rates ??= new Map(
    q({ currency: str, per_eur: num }, sql`SELECT currency, per_eur FROM rates`).map((r) => [r.currency, r.per_eur]),
  );
  return rates.get(c);
};
// an amount in the visitor's currency, or null when there is no rate for it
export const convert = (amount: number, from = 'EUR'): number | null => {
  if (from === currency) return amount;
  const a = rate(from),
    b = rate(currency);
  return a === undefined || b === undefined ? null : (amount / a) * b;
};

const grouped = (n: number) => Math.round(n).toLocaleString('en-GB').replace(/,/gu, '\u00a0'); // 1 850, kept on one line
const decimals = (n: number) => (Number.isInteger(n) ? grouped(n) : n.toFixed(2));
function written(n: number, c: string): string {
  if (c === 'NOK') return `${grouped(n)} kr`;
  if (c === 'EUR') return `€${decimals(n)}`;
  if (c === 'USD') return `$${decimals(n)}`;
  return `${decimals(n)} ${c}`;
}
// "~1 850 kr" for €160; "€160" when euros are chosen; "160 CHF" when there is no rate to convert with. An approx
// amount (a flight price, which changes by the hour) reads "~" in every currency.
export function money(amount: number, from = 'EUR', { approx = false } = {}): string {
  const n = convert(amount, from);
  if (n == null) return written(amount, from);
  if (from === currency) return (approx ? '~' : '') + written(n, currency);
  return `~${written(currency === 'NOK' ? Math.round(n / 10) * 10 : Math.round(n), currency)}`;
}
// the sum of [amount, currency] pairs in the visitor's currency, "~4 130 kr"; null when one has no rate
export function total(parts: readonly (readonly [number, string])[]): string | null {
  let n = 0;
  for (const [a, c] of parts) {
    const x = convert(a, c);
    if (x == null) return null;
    n += x;
  }
  return `~${written(currency === 'NOK' ? Math.round(n / 10) * 10 : Math.round(n), currency)}`;
}

// "Prices in: kr · € · $": each reloads this page, at the same place, in that currency
export function currencySwitch(): HTMLElement {
  const to = (c: string) => {
    const u = new URL(location.href);
    if (c === 'NOK') u.searchParams.delete('cur');
    else u.searchParams.set('cur', c.toLowerCase());
    location.href = u.href;
  };
  return h(
    'p',
    { class: 'currency-switch' },
    'Prices in: ',
    Object.entries(CURRENCIES).flatMap(([c, { label }], i) => [
      i ? ' · ' : '',
      c === currency
        ? h('b', { 'aria-current': 'true' }, label)
        : button({ class: 'link', 'aria-label': c, onclick: () => to(c) }, label),
    ]),
  );
}
