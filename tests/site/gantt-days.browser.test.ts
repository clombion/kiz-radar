// A trip's roster with Cédric and Christina saying only the days they arrive at KUOF and leave, the Friday and the
// Sunday, no time. A file of its own, since each trip is one row every view reads.
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, KUOF } from './community.fixture.ts';
import { trips } from './planted.ts';
import { COMM, ganttOf, opened } from './seen.ts';

// their days in and out, Friday and Sunday
const DAYS_ALONE = ['cedric', 'christina'].map((key) => [key, KUOF, '2026-11-20', '2026-11-22', null, null] as const);
const app = await startSite({ now: '2026-11-01', plant: (db) => trips(db, DAYS_ALONE) });

test('a day said without its time is drawn whole: arriving from its start, leaving to its end', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  const [bar] = ganttOf(opened('KUOF')).bars;
  // the festival's three days, Friday to Sunday: all of them, the Sunday to its end
  expect([bar?.left, bar?.width]).toEqual([0, 100]);
  expect(bar?.fades).toEqual([true, true]);
});
