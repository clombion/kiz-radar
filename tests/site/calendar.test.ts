// A community's days away, on days alone: who is away on each day (a trip's days, else a festival's, whatever its
// weekdays), the days most are away at once, the months and weeks the page draws, and a trip's hours.
import { expect, test } from 'vitest';
import {
  awayDays,
  busiest,
  daysInto,
  daysOf,
  inPeriod,
  monthsIn,
  periodOf,
  periodSaid,
  periods,
  presence,
  relativeDay,
  spanOf,
  weekday,
  weeksOf,
} from '../../site/calendar.ts';

const festival = (start_date: string, end_date: string) => ({ start_date, end_date });

test('someone is away from the day they arrive to the day they leave, each end else their nights, else the festival’s', () => {
  const kuof = festival('2026-11-20', '2026-11-22');
  const said = (
    arrive: string | null,
    leave: string | null,
    nights: { first: string; last: string } | null = null,
  ) => ({
    arrive,
    leave,
    nights,
  });
  expect(awayDays(kuof, said('2026-11-19T21:05', '2026-11-23T09:30'))).toEqual({
    from: '2026-11-19',
    to: '2026-11-23',
  });
  expect(awayDays(kuof)).toEqual({ from: '2026-11-20', to: '2026-11-22' });
  // a departure not said: to the festival's last day, or the morning after their last night
  expect(awayDays(kuof, said('2026-11-19T21:05', null))).toEqual({ from: '2026-11-19', to: '2026-11-22' });
  const six = { first: '2026-11-18', last: '2026-11-23' };
  expect(awayDays(kuof, said('2026-11-18T10:00', null, six))).toEqual({ from: '2026-11-18', to: '2026-11-24' });
  // only where they stay: from their first night to the morning after their last
  expect(awayDays(kuof, said(null, null, six))).toEqual({ from: '2026-11-18', to: '2026-11-24' });
  expect(awayDays(kuof, said(null, '2026-11-23T09:00'))).toEqual({ from: '2026-11-20', to: '2026-11-23' });
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

test('the calendar steps by periods from today’s month, four months each, to the one of the last day away', () => {
  // from November: November to February, March to June, July to October, across years
  expect(periodOf('2026-11-03', '2026-11-20')).toBe('2026-11');
  expect(periodOf('2026-11-03', '2027-02-28')).toBe('2026-11');
  expect(periodOf('2026-11-03', '2027-03-01')).toBe('2027-03');
  expect(periodOf('2026-11-03', '2027-11-01')).toBe('2027-11');
  expect(periodOf('2026-11-03', '2026-10-30')).toBe('2026-11'); // a day before today's month: today's
  expect(monthsIn('2026-11')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  expect(monthsIn('2027-11')).toEqual(['2027-11', '2027-12', '2028-01', '2028-02']);
  // three periods make a year
  expect(periods('2026-11-03', '2027-09-04')).toEqual(['2026-11', '2027-03', '2027-07']);
  expect(periods('2026-11-03', '2026-12-01')).toEqual(['2026-11']);
  expect(periods('2026-11-03', undefined)).toEqual(['2026-11']);
  // trips only far off: today's period, empty, first
  expect(periods('2027-03-10', '2027-07-18')).toEqual(['2027-03', '2027-07']);
  // someone is in a period when any of their days is
  expect(inPeriod('2027-03', { from: '2027-02-28', to: '2027-03-01' })).toBe(true);
  expect(inPeriod('2027-03', { from: '2027-06-30', to: '2027-07-02' })).toBe(true);
  expect(inPeriod('2027-03', { from: '2027-07-01', to: '2027-07-02' })).toBe(false);
  expect(inPeriod('2027-03', { from: '2027-02-14', to: '2027-02-28' })).toBe(false);
});

test('a period is said by its months, with each year across two, and short without', () => {
  const name = (m: string) =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1] ?? m;
  expect(periodSaid('2026-11', name)).toBe('Nov 2026 – Feb 2027');
  expect(periodSaid('2027-03', name)).toBe('Mar – Jun 2027');
  expect(periodSaid('2027-03', name, true)).toBe('Mar–Jun');
});

test('a month is its weeks from Monday, with the days of other months left empty', () => {
  const nov = weeksOf('2026-11'); // the 1st is a Sunday
  expect(nov[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
  expect(nov.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null]);
  expect(nov.flat().filter(Boolean)).toHaveLength(30);
  expect(weeksOf('2027-02')[0]?.[0]).toBe('2027-02-01'); // a Monday: no empty day before it
});

test('a time is so far into a trip’s days, its hour a share of its day, across a month', () => {
  expect(daysInto('2026-11-19', '2026-11-19T00:00')).toBe(0);
  expect(daysInto('2026-11-19', '2026-11-19T18:00')).toBe(0.75);
  expect(daysInto('2026-11-29', '2026-12-01T12:00')).toBe(2.5);
});

test('a day is said from today: today, tomorrow, this weekday later in its week, and none further off', () => {
  const tuesday = '2026-11-03';
  expect(relativeDay(tuesday, '2026-11-03')).toBe('today');
  expect(relativeDay(tuesday, '2026-11-04')).toBe('tomorrow');
  expect(relativeDay(tuesday, '2026-11-06')).toBe('this Friday');
  expect(relativeDay(tuesday, '2026-11-08')).toBe('this Sunday');
  expect(relativeDay(tuesday, '2026-11-09')).toBeNull(); // next week's Monday
  expect(relativeDay(tuesday, '2026-11-01')).toBeNull();
});

test('a festival’s row runs from the first to arrive, or its start, to the last to leave, or its end', () => {
  const prague = festival('2027-01-14', '2027-01-18');
  // flying in the day before it starts
  expect(spanOf(prague, [{ from: '2027-01-13', to: '2027-01-18' }])).toEqual({
    from: '2027-01-13',
    to: '2027-01-18',
  });
  // the festival goes on after the last one leaves, and one arrives after it starts
  expect(
    spanOf(prague, [
      { from: '2027-01-15', to: '2027-01-16' },
      { from: '2027-01-12', to: '2027-01-17' },
    ]),
  ).toEqual({ from: '2027-01-12', to: '2027-01-18' });
  expect(spanOf(prague, [])).toEqual({ from: '2027-01-14', to: '2027-01-18' });
});
