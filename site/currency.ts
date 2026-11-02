// Amounts in a currency: the price steps of each currency the site shows, an amount converted by the euro's rates, and
// how it is written. Pure: the visitor's currency and the rates are arguments (money.ts gives the visitor's).

type Steps = Readonly<{ cheap: number; fair: number }>;
export type Step = keyof Steps;
export type Currency = 'NOK' | 'EUR' | 'USD';
// Price steps are round numbers in each currency: for a return flight (the map, a cheap flight in green) and for a
// trip, the full pass and the flight together (the festival filter).
export const CURRENCIES: Readonly<Record<Currency, { label: string; flight: Steps; trip: Steps }>> = {
  NOK: { label: 'kr', flight: { cheap: 1500, fair: 2500 }, trip: { cheap: 3000, fair: 5000 } },
  EUR: { label: '€', flight: { cheap: 150, fair: 250 }, trip: { cheap: 300, fair: 500 } },
  USD: { label: '$', flight: { cheap: 175, fair: 275 }, trip: { cheap: 350, fair: 550 } },
};
export const isCurrency = (c: string | undefined): c is Currency => c !== undefined && Object.hasOwn(CURRENCIES, c);

// a number as an amount shows it: whole, its thousands apart by a space that keeps it on one line ("1 850"), or with
// its cents ("12.50")
const WHOLE = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});
const grouped = (n: number): string =>
  WHOLE.formatToParts(n)
    .map((p) => (p.type === 'group' ? ' ' : p.value))
    .join('');
const decimals = (n: number): string => (Number.isInteger(n) ? grouped(n) : CENTS.format(n));
// an amount in its currency: "1 850 kr", "€160", "$12.50", "160 CHF"
export function written(n: number, c: string): string {
  if (c === 'NOK') return `${grouped(n)} kr`;
  if (c === 'EUR') return `€${decimals(n)}`;
  if (c === 'USD') return `$${decimals(n)}`;
  return `${decimals(n)} ${c}`;
}

// what the views need of prices, in one currency
export interface Prices {
  // an amount in the currency, or null when there is no rate for it
  convert: (amount: number, from?: string) => number | null;
  // step('flight', 'cheap'), step('trip', 'fair'): in the currency
  step: (what: 'flight' | 'trip', name: Step) => number;
  // whether a euro amount is within a step: a cheap flight (green), a fair one; never one with no rate to convert it by
  within: (eur: number, what: 'flight' | 'trip', name: Step) => boolean;
  // an amount converted, as an approximation shows it: whole, and in kroner to the ten
  rounded: (n: number) => number;
  // an amount already in the currency and rounded, as an approximation: "~4 130 kr"
  approximately: (n: number) => string;
  // "~1 850 kr" for €160; "€160" when euros are chosen; "160 CHF" when there is no rate to convert with. An approx
  // amount (a flight price, which changes by the hour) reads "~" in every currency.
  money: (amount: number, from?: string, opts?: { approx?: boolean }) => string;
}
// prices in a currency, converted by the rate of each currency to the euro (undefined where there is none)
export function pricesIn(currency: Currency, rate: (c: string) => number | undefined): Prices {
  const convert = (amount: number, from = 'EUR'): number | null => {
    if (from === currency) return amount;
    const a = rate(from),
      b = rate(currency);
    return a === undefined || b === undefined ? null : (amount / a) * b;
  };
  const step = (what: 'flight' | 'trip', name: Step): number => CURRENCIES[currency][what][name];
  const rounded = (n: number): number => (currency === 'NOK' ? Math.round(n / 10) * 10 : Math.round(n));
  const approximately = (n: number): string => `~${written(n, currency)}`;
  return {
    convert,
    step,
    within: (eur, what, name) => (convert(eur) ?? Number.POSITIVE_INFINITY) <= step(what, name),
    rounded,
    approximately,
    money: (amount, from = 'EUR', { approx = false } = {}) => {
      const n = convert(amount, from);
      if (n == null) return written(amount, from);
      if (from === currency) return (approx ? '~' : '') + written(n, currency);
      return approximately(rounded(n));
    },
  };
}
