// Passes and tiers made for the tests, each with the fields a test does not set at a plain value.
import type { Fare } from '../../site/fares.ts';
import type { Festival } from '../../site/festivals.ts';
import type { Pass, Tier } from '../../site/passes.ts';
import { KEY } from '../../site/states.ts';

export const tier = (amount: number, k: Partial<Tier> = {}): Tier => ({
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
export const pass = (tiers: Tier[], k: Partial<Pass> = {}): Pass => ({
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

// a festival's flight to Lisbon, 10 km on, at this price in euros, back on this day
export const flownTo = (price: number, back: string): Fare => ({
  home: false,
  airport: 'LIS',
  airport_city: 'Lisbon',
  km: 10,
  stops: { out: null, back: null },
  resold: null,
  fetched: '2026-11-01',
  price,
  back,
});

const UNKNOWN = { point: 'price', key: KEY.price.NOT_YET } as const;
// a festival coming up, its weekend in a week, with a known trip of 2 000 in the visitor's currency
export const festival = (id: number, over: Partial<Festival> = {}): Festival => ({
  id,
  title: `Festival ${id}`,
  url: 'https://kizomba-world.com/',
  city: 'Lisbon',
  country_code: 'PT',
  start_date: '2026-11-06',
  end_date: '2026-11-08',
  city_key: 'lisbon-pt',
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
  options: [],
  fare: flownTo(120, '2026-11-09'),
  price: UNKNOWN,
  trip: 2000,
  begun: false,
  ...over,
});
