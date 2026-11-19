// Prices in the visitor's currency: kroner, or euros or dollars when the address says ?cur=eur or ?cur=usd (the
// footer switches it). Amounts in another currency are converted with the rates table and marked "~" (currency.ts).
import { CURRENCIES, type Currency, isCurrency, pricesIn } from './currency.ts';
import { q, sql } from './db.ts';
import { button, h } from './dom.ts';
import { num, str } from './rows.ts';

const asked = new URLSearchParams(location.search).get('cur')?.toUpperCase();
export const currency: Currency = isCurrency(asked) ? asked : 'NOK';

let rates: Map<string, number> | undefined;
const rate = (c: string): number | undefined => {
  rates ??= new Map(
    q({ currency: str, per_eur: num }, sql`SELECT currency, per_eur FROM rates`).map((r) => [r.currency, r.per_eur]),
  );
  return rates.get(c);
};
export const { convert, step, within, rounded, approximately, money } = pricesIn(currency, rate);

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
