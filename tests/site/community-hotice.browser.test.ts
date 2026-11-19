// A community's page on a phone with Cédric away a fortnight for HOT Ice: in to Riga on 19 November at 10:00, out on
// 2 December at 18:00, his stay not said. A file of its own, since his trip is one row every view reads (the
// community's head would go to Oslo and Riga).
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, HOT_ICE } from './community.fixture.ts';
import { trips } from './planted.ts';
import { atWidth, axisOf, COMM, cellOn, monthsOf, opened } from './seen.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => trips(db, [['cedric', HOT_ICE, '2026-11-19T10:00', '2026-12-02T18:00', 'RIX', null]]),
});

test('on a phone the months go two a row and a fortnight’s Gantt fits, with no sideways scroll', async () => {
  await atWidth(390);
  await app.open(COMM(FIXTURE_COMMUNITY));
  const hot = opened('HOT Ice');
  expect(axisOf(hot)).toHaveLength(14);
  const [first, second] = monthsOf().map((m) => m.getBoundingClientRect());
  expect(second?.top).toBeCloseTo(first?.top ?? 0, 0); // side by side
  // nothing wider than the phone, and the chart within the page's column
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
  const main = document.querySelector('main');
  const pad = main === null ? undefined : getComputedStyle(main);
  const column =
    (main?.clientWidth ?? 0) - Number.parseFloat(pad?.paddingLeft ?? '0') - Number.parseFloat(pad?.paddingRight ?? '0');
  expect(column).toBeGreaterThan(300);
  expect(hot.querySelector('.gantt')?.getBoundingClientRect().width).toBeLessThanOrEqual(column);
  expect(cellOn('2026-11-20')?.getBoundingClientRect().width).toBeGreaterThanOrEqual(16);
});
