// What a pass costs on a day (pipeline/STATES.md: the tier today, its next change, and the card's price), from its
// tiers alone: the day is an argument and nothing here touches the page, so every state is reached in
// tests/site/pricing.test.ts.
//
// Today's tier: a tier applies from its valid_from (else the day after the tier before it ends) to its valid_until
// (else the day before the tier after it starts); door prices apply during the festival. Of the tiers that apply
// today and aren't sold out, the cheapest; when several undated tiers apply, the price is the lowest of them. When none
// applies yet, the first one to come. The next change is the first later tier, not sold out, that costs more.
import { addDays } from './days.ts';
import type { Pass, Tier } from './passes.ts';
import { KEY } from './states.ts';
import type { Key } from './wording.ts';

// what of a festival its prices depend on
export interface Dates {
  start_date: string;
  end_date: string;
}
// a tier with its first and last day (null: open)
export type Window = Tier & { lo: string | null; hi: string | null };
export type TierNow =
  | { state: typeof KEY.tier_today.SOLD_OUT | typeof KEY.tier_today.ENDED }
  | {
      state: typeof KEY.tier_today.NOW | typeof KEY.tier_today.FROM | typeof KEY.tier_today.NEXT;
      tier: Window;
      next: Window | undefined;
    };

// each tier's first and last day (null: open), from its own dates or its neighbours'
function windows(pass: Pass, e: Dates): Window[] {
  const sold = pass.tiers.filter((t) => !t.door);
  return pass.tiers.map((t) => {
    if (t.door) return { ...t, lo: e.start_date, hi: e.end_date };
    const i = sold.indexOf(t),
      prev = sold[i - 1],
      next = sold[i + 1];
    return {
      ...t,
      lo: t.valid_from ?? (prev?.valid_until ? addDays(prev.valid_until, 1) : null),
      hi: t.valid_until ?? (next?.valid_from ? addDays(next.valid_from, -1) : null),
    };
  });
}
const cheapest = (ts: readonly Window[], first: Window): Window =>
  ts.reduce((a, b) => (b.amount < a.amount ? b : a), first);

// A pass's price on a day: { state, tier, next } (now, from: several undated tiers apply, next: none applies yet),
// or { state } once it is sold out or every dated tier has ended with no door price.
export function tierNow(pass: Pass, e: Dates, day: string): TierNow {
  const ts = windows(pass, e);
  const open = ts.filter((t) => !t.sold_out);
  if (open.length === 0) return { state: KEY.tier_today.SOLD_OUT };
  const now = open.filter(
    (t) => (t.lo == null || t.lo <= day) && (t.hi == null || day <= t.hi) && (!t.door || day >= e.start_date),
  );
  const later = open
    .filter((t): t is Window & { lo: string } => t.lo != null && t.lo > day)
    .sort((a, b) => a.lo.localeCompare(b.lo));
  const tier = now[0] ? cheapest(now, now[0]) : later[0];
  if (!tier) return { state: KEY.tier_today.ENDED };
  const next = ts
    .slice(ts.indexOf(tier) + 1)
    .find((t) => !t.sold_out && t.amount > tier.amount && (t.lo == null || t.lo > day));
  const state =
    now.length > 0
      ? now.filter((t) => t.lo == null && t.hi == null).length > 1
        ? KEY.tier_today.FROM
        : KEY.tier_today.NOW
      : KEY.tier_today.NEXT;
  return { state, tier, next };
}

// When a pass's next price starts: at the door, on a known day (its lo), or on a day not known.
export const nextChange = (t: Pick<Window, 'door' | 'lo'>) =>
  t.door ? KEY.next_change.DOOR : t.lo ? KEY.next_change.DATED : KEY.next_change.LATER;

// a festival as its card's price needs it
export interface Priced extends Dates {
  upcoming: boolean;
  card_pass: number | null;
  price_state: Key<'price'>;
}
// What the card of a priced festival says on a day: the pass its card prices (card_pass, chosen by the pipeline) at
// its tier then, as a full pass or a package; or that it is sold out; or that its prices have ended, as they all have
// once the festival is over.
type CardPrice =
  | { key: typeof KEY.card_price.ENDED; pass?: Pass }
  | { key: typeof KEY.card_price.SOLD_OUT; pass: Pass }
  | {
      key: typeof KEY.card_price.FULL_PASS | typeof KEY.card_price.PACKAGE;
      pass: Pass;
      now: Extract<TierNow, { tier: Window }>;
    };
function cardPrice(e: Priced, passes: readonly Pass[], day: string): CardPrice {
  if (!e.upcoming) return { key: KEY.card_price.ENDED };
  const pass = passes.find((p) => p.pass_no === e.card_pass);
  if (!pass) throw new Error(`card_pass ${e.card_pass} is none of the festival's passes`); // the build pairs them
  const now = tierNow(pass, e, day);
  if (now.state === KEY.tier_today.SOLD_OUT) return { key: KEY.card_price.SOLD_OUT, pass };
  if (!('tier' in now)) return { key: KEY.card_price.ENDED, pass };
  return { key: pass.kind === KEY.pass_kind.PACKAGE ? KEY.card_price.PACKAGE : KEY.card_price.FULL_PASS, pass, now };
}

// What a festival's card says of its price on a day, as the state whose words it shows: why it has none (price, from
// its price_state), or its card's price (card_price).
export type PriceLine = { point: 'price'; key: Key<'price'> } | ({ point: 'card_price' } & CardPrice);
export function priceLine(e: Priced, passes: readonly Pass[], day: string): PriceLine {
  if (e.price_state !== KEY.price.PRICED) return { point: 'price', key: e.price_state };
  return { point: 'card_price', ...cardPrice(e, passes, day) };
}
