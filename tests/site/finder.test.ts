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
import { pass as passOf } from './samples.ts';

const DAY = '2026-11-02';
const CHOICES = DEFAULTS;
const UNKNOWN = { point: 'price', key: KEY.price.NOT_YET } as const;
// a festival coming up, its weekend in a week, with a known trip of 2 000 in the visitor's currency
const festival = (id: number, over: Partial<Festival> = {}): Festival => ({
  id,
  title: `Festival ${id}`,
  url: 'https://kizomba-world.com/',
  city: 'Lisbon',
  country_code: 'PT',
  start_date: '2026-11-06',
  end_date: '2026-11-08',
  lat: 38.7,
  lon: -9.1,
  airport: 'LIS',
  airport_km: 7,
  airport_city: 'Lisbon',
  weekend_friday: '2026-11-06',
  cancelled: null,
  listing: KEY.listing.LISTED,
  venue: null,
  lineup: 12,
  popular_artists: 2,
  genres: [KEY.genre.KIZOMBA],
  phase: KEY.phase.AHEAD,
  upcoming: true,
  price_state: KEY.price.PRICED,
  ticket_page: null,
  card_pass: 1,
  depart: '2026-11-06',
  features: new Set(),
  promo: null,
  goers: [],
  headliners: [],
  styles: new Set([KEY.genre.KIZOMBA]),
  fare: { home: false, price: 120, back: '2026-11-09' },
  price: UNKNOWN,
  trip: 2000,
  begun: false,
  ...over,
});
const ids = (fs: readonly Festival[]) => fs.map((f) => f.id);

test('a festival is kept while its weekend is within the months chosen', () => {
  const all = [
    festival(1),
    festival(2, { depart: '2027-04-30' }),
    festival(3, { depart: '2027-06-04' }),
    festival(4, { depart: null }),
  ];
  expect(ids(matches(all, CHOICES, DAY, null))).toEqual([1, 2]);
  expect(ids(matches(all, { ...CHOICES, months: 12 }, DAY, null))).toEqual([1, 2, 3]);
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
    festival(5, { depart: '2026-12-04', trip: null, fare: { home: false, price: 90, back: '2026-12-07' } }),
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
