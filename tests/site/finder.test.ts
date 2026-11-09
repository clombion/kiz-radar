// What the festival list keeps of its festivals for each choice (site/finder.ts), on festivals made here.
import { expect, test } from 'vitest';
import type { Festival } from '../../site/festivals.ts';
import {
  allowedChoices,
  type Choices,
  choicesAddress,
  DEFAULTS,
  hasWith,
  isDance,
  isOn,
  isWith,
  matches,
  readChoices,
  WITH,
  withPhrase,
} from '../../site/finder.ts';
import { festivalsHref } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { festival, flownTo, pass as passOf } from './samples.ts';

const DAY = '2026-11-02';
const CHOICES = DEFAULTS;
const ids = (fs: readonly Festival[]) => fs.map((f) => f.id);

test('a festival is kept while its weekend is within the time chosen: three months, or a year', () => {
  const all = [
    festival(1),
    festival(2, { depart: '2027-01-29' }),
    festival(3, { depart: '2027-06-04' }),
    festival(4, { depart: null }),
  ];
  expect(ids(matches(all, CHOICES, DAY, null))).toEqual([1, 2]);
  expect(ids(matches(all, { ...CHOICES, when: 'year' }, DAY, null))).toEqual([1, 2, 3]);
});

test('the weekend keeps the festivals on any day of the coming one, or of the one under way', () => {
  const all = [
    festival(1), // Friday 6 to Sunday 8 November
    festival(2, { start_date: '2026-11-04', end_date: '2026-11-06' }), // ends on its Friday
    festival(3, { start_date: '2026-11-13', end_date: '2026-11-15', depart: '2026-11-13' }), // the weekend after
  ];
  const weekend = { ...CHOICES, when: 'weekend' } as const;
  expect(ids(matches(all, weekend, DAY, null))).toEqual([1, 2]); // a Monday: the coming weekend
  expect(ids(matches(all, weekend, '2026-11-08', null))).toEqual([1, 2]); // its Sunday: the one under way
  expect(ids(matches(all, weekend, '2026-11-09', null))).toEqual([3]);
});

test('with a price limit a trip is kept within it, a sold-out one never, and an unknown one when asked for', () => {
  const pass = passOf([], { event_id: 4 });

  const soldOut: Festival['price'] = { point: 'card_price', key: KEY.card_price.SOLD_OUT, pass };
  const all = [
    festival(1, { trip: 2999 }),
    festival(2, { trip: 3001 }),
    festival(3, { trip: null }),
    festival(4, { trip: 1000, price: soldOut }),
  ];
  expect(ids(matches(all, CHOICES, DAY, 3000))).toEqual([1]);
  expect(ids(matches(all, { ...CHOICES, unchecked: 1 }, DAY, 3000))).toEqual([1, 3]);
  expect(ids(matches(all, { ...CHOICES, reach: '' }, DAY, null))).toEqual([1, 2, 3, 4]);
});

test('with a price limit a festival whose flight has left is out: its trip is the pass alone', () => {
  const all = [festival(1, { trip: 900, begun: true, phase: KEY.phase.ON }), festival(2, { trip: 2999 })];
  expect(ids(matches(all, CHOICES, DAY, 3000))).toEqual([2]);
  expect(ids(matches(all, CHOICES, DAY, null))).toEqual([1, 2]); // at any price it is in
});

test('a festival is kept by its country, a dance or highlight, friends going, a checkbox and its line-up', () => {
  const featured = { person_id: 1, key: 'p', name: 'P', featured: true, plan: KEY.plan.GOING, booked_as: null };
  const all = [
    festival(1),
    festival(2, { country_code: 'ES', styles: new Set([KEY.genre.KIZOMBA, KEY.genre.SALSA]) }),
    festival(3, { features: new Set([KEY.feature.POOL_PARTY, KEY.feature.TAXI_DANCERS]), lineup: 30 }),
    festival(4, { goers: [{ ...featured, featured: false }] }),
    festival(5, { goers: [featured], features: new Set([KEY.feature.ALL_IN_ONE]) }),
    // a featured person who only may go, and one who may but teaches there, which is going
    festival(6, { goers: [{ ...featured, plan: KEY.plan.MAYBE }] }),
    festival(7, { goers: [{ ...featured, plan: KEY.plan.MAYBE, booked_as: KEY.role.TEACHER }] }),
  ];
  const kept = (s: Partial<Choices>) => ids(matches(all, { ...CHOICES, ...s }, DAY, null));
  expect(kept({ country: 'ES' })).toEqual([2]);
  expect(kept({ with: KEY.genre.SALSA })).toEqual([2]);
  expect(kept({ with: KEY.feature.POOL_PARTY })).toEqual([3]);
  expect(kept({ with: 'nothing' })).toEqual([]); // no such dance or highlight
  expect(kept({ friends: 1 })).toEqual([5, 7]);
  expect(kept({ taxi: 1 })).toEqual([3]);
  expect(kept({ allin: 1 })).toEqual([5]);
  expect(kept({ lineup: 20 })).toEqual([3]);
});

test('on now only keeps the festivals on today', () => {
  const all = [festival(1), festival(2, { phase: KEY.phase.ON }), festival(3, { phase: KEY.phase.ON })];
  expect(ids(matches(all, { ...CHOICES, onnow: 1 }, DAY, null))).toEqual([2, 3]);
  expect(ids(matches(all, CHOICES, DAY, null))).toEqual([1, 2, 3]);
  expect([isOn(all[0] ?? festival(0)), isOn(all[1] ?? festival(0))]).toEqual([false, true]);
});

test('the soonest first, or the cheapest trip, then the cheapest flight, then the soonest', () => {
  const all = [
    festival(1, { depart: '2026-11-20', trip: null, fare: null }),
    festival(2, { depart: '2026-11-13', trip: 2500 }),
    festival(3, { depart: '2026-11-27', trip: 2000, fare: { home: true } }),
    festival(4, { depart: '2026-11-06', trip: 2000 }),
    festival(5, {
      depart: '2026-12-04',
      trip: null,
      fare: flownTo(90, '2026-12-07'),
    }),
    festival(6, { depart: '2026-12-11', trip: null, fare: null }),
  ];
  expect(ids(matches(all, CHOICES, DAY, null))).toEqual([4, 2, 1, 3, 5, 6]);
  expect(ids(matches(all, { ...CHOICES, sort: 'fare' }, DAY, null))).toEqual([3, 4, 2, 5, 1, 6]);
  // at one trip, a festival whose flight has left reads none, as its trip does
  const tied = [festival(7, { depart: '2026-11-06' }), festival(8, { depart: '2026-11-13', begun: true })];
  expect(ids(matches(tied, { ...CHOICES, sort: 'fare' }, DAY, null))).toEqual([8, 7]);
});

test('a with names a dance or a highlight, and reads as one', () => {
  expect(isDance(KEY.genre.SALSA)).toBe(true);
  expect(isDance(KEY.feature.POOL_PARTY)).toBe(false);
  expect(isWith(KEY.genre.KIZOMBA)).toBe(false); // on nearly every festival: it narrows nothing
  expect(isWith(KEY.feature.TAXI_DANCERS)).toBe(false); // a checkbox of its own
  expect(isWith(KEY.feature.POOL_PARTY)).toBe(true);
  expect(withPhrase(KEY.genre.SALSA)).toEqual(['Also with ', WITH.get(KEY.genre.SALSA)]);
  expect(withPhrase(KEY.feature.POOL_PARTY)).toEqual(['With ', WITH.get(KEY.feature.POOL_PARTY)]);
  expect(hasWith(festival(1, { styles: new Set([KEY.genre.SALSA]) }), KEY.genre.SALSA)).toBe(true);
  expect(hasWith(festival(1), KEY.feature.POOL_PARTY)).toBe(false);
});

test('every choice of every blank and filter comes back from the address it writes, any price among them', () => {
  const countries = ['NO', 'PT'];
  const allowed = allowedChoices(countries);
  const back = (s: Choices) => {
    const qs = new URL(`https://x/${festivalsHref(choicesAddress(s))}`).hash.split('?')[1] ?? '';
    return readChoices(qs, countries);
  };
  expect(new Set(Object.keys(allowed))).toEqual(new Set(Object.keys(DEFAULTS))); // every choice has its values
  for (const [key, values] of Object.entries(allowed)) {
    expect(values.length, key).toBeGreaterThan(1);
    for (const value of values) {
      const s = { ...DEFAULTS, [key]: value };
      expect(back(s), `${key}=${value}`).toEqual({ state: s, dropped: [] });
    }
  }
  // any price is written as "any", and an older link's empty reach still reads as any price
  expect(choicesAddress({ ...DEFAULTS, reach: '' })).toEqual({ reach: 'any' });
  expect(readChoices('reach=', countries).state.reach).toBe('');
  expect(readChoices('reach=150', countries).dropped).toEqual(['reach=150']);
});
