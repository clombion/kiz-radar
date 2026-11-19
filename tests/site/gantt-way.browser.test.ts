// A trip's roster with each of Cédric and Christina staying at more than one place for KUOF, within their own nights:
// Cédric, in on Thursday 19 November at 17:05 and out on Monday at 09:40, at an Airbnb the first night and the Scandic
// Holberg the three after; Christina, in on the Friday at 09:00 and out on Monday at 09:40, at an Airbnb, then the
// Thon, then the Scandic Holberg, a night each. A file of its own, since each trip and stay is a row every view reads.
import type { Database } from 'sql.js';
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { KUOF } from './community.fixture.ts';
import { APART, type Stay, stays, trips, unstayed } from './planted.ts';
import { atWidth, kuofOf, linesOf } from './seen.ts';

// their flights, each in on its own day and out on Monday (APART), without its stay
const FLOWN = unstayed(APART);
// their nights, each night at one place
const NIGHTS: readonly Stay[] = [
  ['cedric', KUOF, '2026-11-19', '2026-11-19', 'Airbnb'],
  ['cedric', KUOF, '2026-11-20', '2026-11-22', 'Scandic Holberg'],
  ['christina', KUOF, '2026-11-20', '2026-11-20', 'Airbnb'],
  ['christina', KUOF, '2026-11-21', '2026-11-21', 'Thon'],
  ['christina', KUOF, '2026-11-22', '2026-11-22', 'Scandic Holberg'],
];
// their flights, then their nights
function plant(db: Database): void {
  trips(db, FLOWN);
  stays(db, NIGHTS);
}
const app = await startSite({ now: '2026-11-01', plant });

test('one person’s way is written with its arrow; three places are counted, wherever, dotted', async () => {
  await atWidth(1200);
  await kuofOf(app.open);
  const { column, words } = linesOf();
  // Cédric's two places, one after the other; Christina's three, counted, the count opening their names
  expect(column.slice(0, 2)).toEqual([
    ['Airbnb → Scandic Holberg', false],
    ['3 places', true],
  ]);
  expect(words).toContain('Cédric in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Airbnb → Scandic Holberg');
});
