// What a pass costs on a day: every state of the tier today, of its next change and of the card's price is reached,
// and each has its words.
import { expect, test } from 'vitest';
import type { Pass, Tier } from '../../site/passes.ts';
import { nextChange, type Priced, priceLine, type TierNow, tierNow } from '../../site/pricing.ts';
import { KEY } from '../../site/states.ts';
import { text } from '../../site/wording.ts';

const E: Priced = {
  start_date: '2027-02-05',
  end_date: '2027-02-07',
  upcoming: true,
  price_state: KEY.price.PRICED,
  card_pass: 1,
};
const tier = (amount: number, k: Partial<Tier> = {}): Tier => ({
  event_id: 1,
  pass_no: 1,
  amount,
  currency: 'EUR',
  fee: null,
  valid_from: null,
  valid_until: null,
  door: false,
  sold_out: false,
  ...k,
});
const pass = (tiers: Tier[], k: Partial<Pass> = {}): Pass => ({
  event_id: 1,
  pass_no: 1,
  kind: KEY.pass_kind.FULL,
  style: null,
  label: null,
  group_size: null,
  people: KEY.people.ONE,
  days: null,
  includes_hotel: false,
  tiers,
  ...k,
});
const DAY = '2026-11-15';
// today's tier's price, or null when there is none
const todays = (now: TierNow) => ('tier' in now ? now.tier.amount : null);
const nextAmount = (now: TierNow) => ('next' in now ? (now.next?.amount ?? null) : null);

const TIER_CASES: readonly (readonly [Pass, TierNow['state']])[] = [
  [pass([tier(80, { valid_until: '2026-12-31' }), tier(100)]), KEY.tier_today.NOW],
  [pass([tier(80), tier(90)]), KEY.tier_today.FROM],
  [pass([tier(80, { valid_from: '2026-12-01' })]), KEY.tier_today.NEXT],
  [pass([tier(80, { sold_out: true })]), KEY.tier_today.SOLD_OUT],
  [pass([tier(80, { valid_until: '2026-10-31' })]), KEY.tier_today.ENDED],
];

test('every state of the tier today is reached', () => {
  for (const [p, state] of TIER_CASES) expect(tierNow(p, E, DAY).state).toBe(state);
  expect(new Set(TIER_CASES.map(([, s]) => s))).toEqual(new Set(Object.values(KEY.tier_today)));
  const [first] = TIER_CASES;
  expect(first && nextAmount(tierNow(first[0], E, DAY))).toBe(100);
});

test('a tier without dates runs from the day after the one before it to the day before the one after', () => {
  const p = pass([tier(70, { valid_until: '2026-11-10' }), tier(80), tier(95, { valid_from: '2026-12-01' })]);
  expect(todays(tierNow(p, E, '2026-11-10'))).toBe(70);
  expect(todays(tierNow(p, E, '2026-11-11'))).toBe(80);
  expect(todays(tierNow(p, E, '2026-11-30'))).toBe(80);
  expect(todays(tierNow(p, E, '2026-12-01'))).toBe(95);
});

test('a door price applies only during the festival, and is the next change before it', () => {
  const p = pass([tier(80, { valid_until: '2027-01-31' }), tier(120, { door: true })]);
  const before = tierNow(p, E, DAY);
  expect(todays(before)).toBe(80);
  expect('next' in before && before.next ? nextChange(before.next) : null).toBe(KEY.next_change.DOOR);
  expect(todays(tierNow(p, E, '2027-02-06'))).toBe(120);
});

test('of the tiers to come, the first is next; of the tiers today, the cheapest; the next change costs more', () => {
  const later = pass([tier(90, { valid_from: '2026-12-15' }), tier(70, { valid_from: '2026-12-01' })]);
  expect(todays(tierNow(later, E, DAY))).toBe(70);
  const undated = tierNow(pass([tier(95), tier(85)]), E, DAY);
  expect([undated.state, todays(undated)]).toEqual([KEY.tier_today.FROM, 85]);
  const cheaper = pass([
    tier(80, { valid_until: '2026-11-30' }),
    tier(60, { valid_from: '2026-12-01' }),
    tier(90, { valid_from: '2027-01-01' }),
  ]);
  expect(nextAmount(tierNow(cheaper, E, DAY))).toBe(90); // a cheaper later tier is no rise
});

test('every state of a next change is reached', () => {
  const cases = [
    [{ door: true, lo: null }, KEY.next_change.DOOR],
    [{ door: false, lo: '2026-12-01' }, KEY.next_change.DATED],
    [{ door: false, lo: null }, KEY.next_change.LATER],
  ] as const;
  for (const [t, state] of cases) expect(nextChange(t)).toBe(state);
  expect(new Set(cases.map(([, s]) => s))).toEqual(new Set(Object.values(KEY.next_change)));
});

test('every state of the card’s price is reached', () => {
  const twoPasses = [
    pass([tier(80)], { pass_no: 1, kind: KEY.pass_kind.PARTY }),
    pass([tier(120, { pass_no: 2 })], { pass_no: 2 }),
  ];
  const cases: readonly (readonly [Priced, Pass[], string])[] = [
    [{ ...E, card_pass: 2 }, twoPasses, KEY.card_price.FULL_PASS],
    [E, [pass([tier(900)], { kind: KEY.pass_kind.PACKAGE })], KEY.card_price.PACKAGE],
    [E, [pass([tier(80, { sold_out: true })])], KEY.card_price.SOLD_OUT],
    [E, [pass([tier(80, { valid_until: '2026-10-31' })])], KEY.card_price.ENDED],
    [{ ...E, upcoming: false }, [pass([tier(80)])], KEY.card_price.ENDED],
  ];
  for (const [e, passes, state] of cases) expect(priceLine(e, passes, DAY).key).toBe(state);
  expect(new Set(cases.map(([, , s]) => s))).toEqual(new Set(Object.values(KEY.card_price)));
  const line = priceLine({ ...E, card_pass: 2 }, twoPasses, DAY);
  expect('now' in line ? line.now.tier.amount : null).toBe(120);
});

test('every price line a card shows has its words', () => {
  const unpriced = Object.values(KEY.price).filter((k) => k !== KEY.price.PRICED);
  const lines = [
    ...unpriced.map((k) => priceLine({ ...E, price_state: k }, [], DAY)),
    priceLine(E, [pass([tier(80)])], DAY),
    priceLine(E, [pass([tier(80)], { kind: KEY.pass_kind.PACKAGE })], DAY),
    priceLine(E, [pass([tier(80, { sold_out: true })])], DAY),
    priceLine({ ...E, upcoming: false }, [], DAY),
  ];
  expect(new Set(lines.map((l) => `${l.point}.${l.key}`))).toEqual(
    new Set([...unpriced.map((k) => `price.${k}`), ...Object.values(KEY.card_price).map((k) => `card_price.${k}`)]),
  );
  for (const l of lines) {
    const words =
      l.point === 'price' ? text('price', l.key) : text('card_price', l.key, { pass: 'Full pass', price: '80 €' });
    expect(words, `${l.point}.${l.key} has no words`).toBeTruthy();
  }
  expect(text('card_price', KEY.card_price.FULL_PASS, { sum: '1 €' }, 'cost')).toBeTruthy();
  expect(text('card_price', KEY.card_price.PACKAGE, { sum: '1 €' }, 'cost')).toBeTruthy();
});
