// A trip's roster on the fixture's community with Cédric and Christina flying to KUOF apart: Cédric from Thursday 19
// November at 17:05 to Monday at 09:40, at the Scandic Holberg; Christina from Friday at 08:00 to Sunday at 20:00, her
// stay not said, both through Oslo. And Cédric in to Cloudkiz (26–28 February) on the last evening of January, at
// Münster Osnabrück (FMO), the airport nearest Enschede in the data. A file of its own, since
// each trip is one row every view reads.
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { CLOUDKIZ, FIXTURE_COMMUNITY, KUOF } from './community.fixture.ts';
import { TO_KUOF, type Trip, trips } from './planted.ts';
import { atWidth, COMM, ganttOf, laidOut, opened, periodOf } from './seen.ts';

// Cédric's two trips, and Christina's
const PARTIES: readonly Trip[] = [
  ...TO_KUOF.slice(0, 1),
  ['christina', KUOF, '2026-11-20T08:00', '2026-11-22T20:00', 'OSL', null],
  ['cedric', CLOUDKIZ, '2027-01-31T20:00', '2027-03-01T10:00', 'FMO', null],
];
const app = await startSite({ now: '2026-11-01', plant: (db) => trips(db, PARTIES) });

test('a trip’s bars are highlighter swipes, each party its own, the same however often drawn', async () => {
  const bars = async () => {
    await app.open(COMM(FIXTURE_COMMUNITY));
    return ganttOf(opened('KUOF')).bars;
  };
  const once = await bars();
  // the two flights, and those who said nothing on the festival's days
  expect(once.map((b) => b.said)).toEqual(['17:05 OSL09:40 OSL', '08:00 OSL20:00 OSL', '']);
  for (const b of once) expect(b.ink).toMatch(/^[\d.]+rem 0px( [\d.]+rem)? -?[\d.]+deg /u);
  expect(once[0]?.ink).not.toBe(once[1]?.ink); // a party's own swipe
  expect(await bars()).toEqual(once); // drawn again, the same
});

test('a trip’s bars lie level, on a computer as on a phone: one end no more than 2px above the other', async () => {
  for (const width of [1200, 390]) {
    await atWidth(width);
    await app.open(COMM(FIXTURE_COMMUNITY));
    // each bar's ink in KUOF's card: how wide it is, and how far one end is above the other (its box's height less its
    // own)
    const bars = [...((await laidOut('KUOF'))?.querySelectorAll<HTMLElement>('.gantt-ink') ?? [])].map((i) => ({
      wide: i.getBoundingClientRect().width,
      rise: i.getBoundingClientRect().height - i.offsetHeight,
    }));
    expect(bars).toHaveLength(3); // the two flights, and those who said nothing
    for (const b of bars) {
      expect(b.wide).toBeGreaterThan(width === 1200 ? 150 : 50);
      expect(b.rise).toBeLessThanOrEqual(2);
    }
  }
});

test('a trip with a day in the period is among its trips, though its festival is in the next', async () => {
  // seen from October, the first four months are October to January; Cédric flies in to Cloudkiz on the last day of
  // January (without his trip, the community's file reads January's one trip alone)
  await app.open(COMM(FIXTURE_COMMUNITY), '2026-10-15');
  expect(periodOf().agenda).toEqual(['November · 3 trips', 'January 2027 · 1 trip', 'February · 1 trip']);
});
