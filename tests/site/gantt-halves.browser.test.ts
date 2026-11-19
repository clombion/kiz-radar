// A trip's roster with half of each trip said: Cédric only his flight in to KUOF, on Thursday 19 November at 17:05;
// Christina only where she stays, the Comfort Xpress, on the Saturday night. A file of its own, since each trip and
// stay is a row every view reads.
import type { Database } from 'sql.js';
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { KUOF } from './community.fixture.ts';
import { stays, trips } from './planted.ts';
import { atWidth, kuofOf, linesOf } from './seen.ts';

// Christina's Saturday night, and Cédric's flight in
function plant(db: Database): void {
  stays(db, [['christina', KUOF, '2026-11-21', '2026-11-21', 'Comfort Xpress']]);
  trips(db, [['cedric', KUOF, '2026-11-19T17:05', null, 'OSL', null]]);
}
const app = await startSite({ now: '2026-11-01', plant });

test('a stroke is "there": hard ends at times said, fading where not, over the festival’s days at least', async () => {
  await atWidth(1200);
  const row = await kuofOf(app.open);
  const seen = linesOf();
  // the axis from Thursday 19 to Sunday 22, the festival its days 1 to 4
  expect(seen.names).toEqual(['Cédric', 'Christina Comfort Xpress', 'Maja, Ragnhild and Tonje']);
  expect(seen.strokes.map((s) => [s.said, s.fades, s.at, s.title])).toEqual([
    // in at 17:05 on Thursday, a hard start; to the festival's close, fading
    [['17:05 OSL', ''], [false, true], [0.71, 4], 'departure not said'],
    // only where she stays: the festival's days, both ends fading; her night is in her place
    [['', ''], [true, true], [1, 4], 'arrival not said; departure not said'],
    // those who said nothing: the festival's days, both ends fading
    [['', ''], [true, true], [1, 4], 'arrival not said; departure not said'],
  ]);
  // no thin line, no question mark, no second ink
  expect(row?.querySelectorAll('.gantt-none, .gantt-shared')).toHaveLength(0);
  expect(seen.text).not.toContain('?');
  // a fading end fades over a longer way than a hard one
  const masks = [...(row?.querySelectorAll('.gantt-ink') ?? [])].map((i) => getComputedStyle(i).maskImage);
  expect(masks[0]).not.toBe(masks[1]);
  expect(seen.words).toContain('Cédric in Thu 17:05 OSL, departure not said');
  expect(seen.words).toContain('Christina, staying at Comfort Xpress');
});
