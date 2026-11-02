// Passes and tiers made for the tests, each with the fields a test does not set at a plain value.
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
