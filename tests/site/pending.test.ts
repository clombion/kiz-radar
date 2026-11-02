// The review dashboard's own logic, on values alone: an item's id, the note a choice starts with, the days a token has
// left, and the next item still open.
import { expect, test } from 'vitest';
import {
  daysLeft,
  differs,
  homeId,
  homeNote,
  type Merge,
  mergeId,
  mergeNote,
  nextOpen,
  unjoinable,
} from '../../site/pending.ts';
import { REVIEW } from './reviewed.ts';

const [ANA] = REVIEW.homes;
if (ANA === undefined) throw new Error('the sample review has a home');
const side = (key: string, name: string) => ({
  key,
  name,
  festivals: 1,
  roles: [],
  stated: [],
  booked_in: [],
  written: [],
});
const PAIR: Merge = { a: side('p:a', 'A'), b: side('p:b', 'B'), shared: 0, rationale: '' };

test('an item is named by what its claim is about', () => {
  expect(homeId(ANA)).toBe('home p:ana');
  expect(mergeId(PAIR)).toBe('merge p:a p:b');
});

test('a choice starts the note with what says so', () => {
  expect(homeNote(ANA, 'AO', 'Angola')).toBe('Ana: from Angola, as 2 line-ups state');
  expect(homeNote(ANA, 'PT', 'Portugal')).toBe('Ana: from Portugal, as 1 line-up states');
  expect(homeNote(ANA, 'FR', 'France')).toBe('Ana: from France');
  expect(mergeNote(PAIR, true)).toBe('A / B: one artist');
  expect(mergeNote(PAIR, false)).toBe('A / B: two artists');
});

test('a token has the whole days to its expiry left, none on the day, fewer than none after', () => {
  const today = new Date('2026-11-02T23:30:00Z');
  expect(daysLeft('2026-11-05', today)).toBe(3);
  expect(daysLeft('2026-11-02', today)).toBe(0);
  expect(daysLeft('2026-11-01', today)).toBe(-1);
});

test('the next open item is the first after this one not settled, going round', () => {
  const ids = ['a', 'b', 'c', 'd'];
  expect(nextOpen(ids, 0, new Set())).toBe(1);
  expect(nextOpen(ids, 0, new Set(['b', 'c']))).toBe(3);
  expect(nextOpen(ids, 3, new Set(['a']))).toBe(1);
  expect(nextOpen(ids, 1, new Set(['a', 'b', 'c', 'd']))).toBe(1);
});

test('two sides differ on a row when each says something and they share nothing', () => {
  expect(differs(['GB'], ['FR'])).toBe(true);
  expect(differs(['GB', 'FR'], ['FR'])).toBe(false);
  expect(differs([], ['FR'])).toBe(false);
});

test('two artists are joined only when they are two of one kind', () => {
  const [kwenda, kl, couple] = REVIEW.artists;
  if (!(kwenda && kl && couple)) throw new Error('the sample review has three artists');
  expect(unjoinable(kwenda, kl)).toBeNull();
  expect(unjoinable(kwenda, kwenda)).toBe('They are one artist already.');
  expect(unjoinable(kwenda, couple)).toBe('A person and a couple are not one artist.');
});
