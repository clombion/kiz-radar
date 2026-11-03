// A community's days away, on days alone: who is away on each day (a trip's days, else a festival's, whatever its
// weekdays), the days most are away at once, the shades, and the weeks the strip draws.
import { expect, test } from 'vitest';
import { awayDays, busiest, daysOf, presence, shade, weekday, weeksFrom } from '../../site/calendar.ts';

const festival = (start_date: string, end_date: string) => ({ start_date, end_date });

test('someone with a trip is away from the day they arrive to the day they leave; anyone else, the festival’s days', () => {
  const kuof = festival('2026-11-20', '2026-11-22');
  expect(awayDays(kuof, { arrive: '2026-11-19T21:05', leave: '2026-11-23T09:30' })).toEqual({
    from: '2026-11-19',
    to: '2026-11-23',
  });
  expect(awayDays(kuof)).toEqual({ from: '2026-11-20', to: '2026-11-22' });
});

test('a festival counts on each of its days, whatever weekdays: Wednesday to Tuesday, or a whole week', () => {
  const days = presence([
    { who: 'a', ...awayDays(festival('2026-11-04', '2026-11-10')) }, // Wednesday to Tuesday
    { who: 'b', ...awayDays(festival('2026-11-02', '2026-11-08')) }, // Monday to Sunday
  ]);
  expect(weekday('2026-11-04')).toBe(2);
  expect([...days].toSorted(([a], [b]) => a.localeCompare(b)).map(([d, on]) => [d, on.people])).toEqual([
    ['2026-11-02', 1],
    ['2026-11-03', 1],
    ['2026-11-04', 2],
    ['2026-11-05', 2],
    ['2026-11-06', 2],
    ['2026-11-07', 2],
    ['2026-11-08', 2],
    ['2026-11-09', 1],
    ['2026-11-10', 1],
  ]);
});

test('someone at two festivals that overlap counts once on the days they share; two people count two', () => {
  const days = presence([
    { who: 'a', from: '2026-12-30', to: '2027-01-02' }, // across the year's turn
    { who: 'a', from: '2027-01-01', to: '2027-01-03' },
    { who: 'b', from: '2027-01-02', to: '2027-01-02' },
  ]);
  expect(days.get('2026-12-31')?.people).toBe(1);
  expect(days.get('2027-01-01')?.people).toBe(1);
  expect(days.get('2027-01-01')?.aways).toHaveLength(2);
  expect(days.get('2027-01-02')?.people).toBe(2);
  expect(days.get('2027-01-03')?.people).toBe(1);
  expect(daysOf('2026-11-30', '2026-12-02')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
});

test('the days most are away are the first run with as many as any day, and of two that tie the soonest', () => {
  const days = presence([
    { who: 'a', from: '2026-11-06', to: '2026-11-09' },
    { who: 'b', from: '2026-11-07', to: '2026-11-08' },
    { who: 'c', from: '2026-11-20', to: '2026-11-21' },
    { who: 'd', from: '2026-11-20', to: '2026-11-22' },
  ]);
  const most = busiest(days);
  expect([most?.from, most?.to, most?.people]).toEqual(['2026-11-07', '2026-11-08', 2]);
  expect(new Set(most?.aways.map((a) => a.who))).toEqual(new Set(['a', 'b']));
  expect(busiest(presence([]))).toBeUndefined();
});

test('a day’s shade is a third of the most away on any day, and none for no one', () => {
  expect([0, 1, 2, 3, 4, 5, 6].map((n) => shade(n, 6))).toEqual([0, 1, 1, 2, 2, 3, 3]);
  expect(shade(1, 1)).toBe(3);
});

test('the strip’s weeks run from Monday of today’s week, across a month and a year, a year of them at most', () => {
  const weeks = weeksFrom('2026-12-30', '2027-01-12', 53);
  expect(weeks.map((w) => [w[0], w[6]])).toEqual([
    ['2026-12-28', '2027-01-03'],
    ['2027-01-04', '2027-01-10'],
    ['2027-01-11', '2027-01-17'],
  ]);
  expect(weeksFrom('2026-11-03', '2028-06-01', 53)).toHaveLength(53);
});
