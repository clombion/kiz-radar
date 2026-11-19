// A community's page with Christina flying on to KUOF the night she leaves Glasgow: in to Oslo on Monday 9 November at
// 22:30, out on the 23rd. A file of its own, since her trip is one row every view reads (the community's sentence
// would go to Glasgow and Oslo).
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, KUOF } from './community.fixture.ts';
import { trips } from './planted.ts';
import { COMM, cellOn, popover, said } from './seen.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => trips(db, [['christina', KUOF, '2026-11-09T22:30', '2026-11-23T09:40', 'OSL', null]]),
});

test('a day someone leaves one festival and flies to another says both', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  cellOn('2026-11-09')?.focus();
  // out of Glasgow on the Monday at 19:10, and into Oslo that night
  const box = [...(popover()?.querySelectorAll('p') ?? [])].map((p) => said(p));
  expect(box).toContain('Flying out: Christina 19:10 ABZ');
  expect(box).toContain('Flying in: Christina 22:30 OSL');
});
