// A community's calendar and its busiest weekend, on days alone: weeks from Monday, the months it shows, and the
// weekend a festival is travelled on.
import { expect, test } from 'vitest';
import { busiest, daysOf, monthsFrom, weekendOf, weekends, weeksOf } from '../../site/calendar.ts';

test('a festival is travelled the weekend of the Monday-to-Sunday week it starts in', () => {
  expect(weekendOf('2026-11-06')).toBe('2026-11-06'); // a Friday is its own
  expect(weekendOf('2026-11-26')).toBe('2026-11-27'); // a Thursday, the Friday after
  expect(weekendOf('2026-11-08')).toBe('2026-11-06'); // a Sunday, the Friday before
  expect(weekendOf('2026-11-09')).toBe('2026-11-13'); // a Monday begins a week
});

test('the calendar shows the months from today’s through the last festival’s, at most the cap, across a year', () => {
  expect(monthsFrom('2026-11-03', '2027-02-28', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  expect(monthsFrom('2026-11-03', '2027-05-01', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  expect(monthsFrom('2026-11-03', '2026-11-20', 4)).toEqual(['2026-11']);
});

test('a month is its weeks from Monday, with the days of other months left empty', () => {
  const nov = weeksOf('2026-11'); // the 1st is a Sunday
  expect(nov[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
  expect(nov.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null]);
  expect(nov.flat().filter(Boolean)).toHaveLength(30);
  expect(weeksOf('2027-02')[0]?.[0]).toBe('2027-02-01'); // a Monday: no empty day before it
  expect(daysOf('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
});

test('the busiest weekend sums its festivals’ people, and of two that tie it is the soonest', () => {
  const trips = weekends([
    { festival: 'B', start: '2026-11-20', people: 5 },
    { festival: 'A', start: '2026-11-06', people: 3 },
    { festival: 'C', start: '2026-11-08', people: 2 }, // the same weekend as A
  ]);
  expect(trips).toEqual([
    { friday: '2026-11-06', people: 5, festivals: ['A', 'C'] },
    { friday: '2026-11-20', people: 5, festivals: ['B'] },
  ]);
  expect(busiest(trips)?.festivals).toEqual(['A', 'C']);
  expect(busiest(weekends([{ festival: 'D', start: '2027-01-14', people: 2 }]))?.friday).toBe('2027-01-15');
  expect(busiest([])).toBeUndefined();
});
