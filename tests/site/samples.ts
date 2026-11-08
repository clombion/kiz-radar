// Passes and tiers made for the tests, each with the fields a test does not set at a plain value.
import type { Fare } from '../../site/fares.ts';
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
