// Prices in the visitor's currency: kroner, or euros or dollars when the address says ?cur=eur or ?cur=usd (the footer
// switches it, shell.tsx). Amounts in another currency are converted with the rates table and marked "~" (currency.ts).
import { type Currency, isCurrency, pricesIn } from './currency.ts';
import { q, sql } from './db.ts';
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
