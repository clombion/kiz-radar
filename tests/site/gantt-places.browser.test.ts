// A trip's roster by place: Cédric and Christina flying to KUOF together, in on Thursday 19 November at 17:05 and out
// on Monday at 09:40, and staying apart, Cédric at the Scandic Holberg and Christina at the Comfort Xpress Oslo
// Sentrum, the four nights. Read on the fixture's community; on another, the fixture's copied, whose choice of view is
// its own; and on a third whose members are six people of its own, five at the Scandic and one at the Thon, its added
// people community 1's (community() copies them, as it copies the members unless told whom). The choice of view is
// kept for the visit, so a test that makes it puts it back when it ends.
import type { Database } from 'sql.js';
import { expect, onTestFinished, test } from 'vitest';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, KUOF } from './community.fixture.ts';
import { community, FLOWN, planned, sharer, stays, trips } from './planted.ts';
import { atWidth, ganttCardOf, kuofOf, linesOf, said } from './seen.ts';

// the fixture's community copied; and one whose members are Ann, Bo, Cy and Di at the Scandic from Thursday, Nora from
// Friday, and Ed at the Thon, its added people the fixture's
const ELSEWHERE = 'quiet-amber-fjord-lark',
  SIX = 'six-at-two-places';
const SIX_PEOPLE = ['Ann', 'Bo', 'Cy', 'Di', 'Nora', 'Ed'];
// their stays apart, the two communities with the six people's plans and stays, and their flights (FLOWN)
function plant(db: Database): void {
  stays(db, [
    ['cedric', KUOF, '2026-11-19', '2026-11-22', 'Scandic Holberg'],
    ['christina', KUOF, '2026-11-19', '2026-11-22', 'Comfort Xpress Oslo Sentrum'],
  ]);
  community(db, ELSEWHERE, {});
  for (const name of SIX_PEOPLE) {
    const key = name.toLowerCase();
    sharer(db, key, name, null);
    planned(db, key, KUOF, KEY.plan.GOING);
    stays(db, [
      [
        key,
        KUOF,
        name === 'Nora' ? '2026-11-20' : '2026-11-19',
        '2026-11-22',
        name === 'Ed' ? 'Thon' : 'Scandic Holberg',
      ],
    ]);
  }
  community(db, SIX, { members: SIX_PEOPLE.map((n) => n.toLowerCase()) });
  trips(db, FLOWN);
}
const app = await startSite({ now: '2026-11-01', plant });

const kuof = async (key?: string) => await kuofOf(app.open, key);
// the buttons choosing a KUOF card's view, by travel and by place
const choice = (row: HTMLElement | undefined) => [
  ...(row?.querySelectorAll<HTMLButtonElement>('.gantt-views button') ?? []),
];
// the view a KUOF card shows, by its button pressed
const pressed = (row: HTMLElement | undefined) =>
  row?.querySelector('.gantt-views [aria-pressed="true"]')?.ariaLabel ?? undefined;
// the roster by place on a community's KUOF card, put back by travel when the test ends
async function byPlace(key: string): Promise<HTMLElement | undefined> {
  const row = await kuof(key);
  onTestFinished(async () => {
    const [byTravel] = choice(await kuof(key));
    if (byTravel === undefined) throw new Error(`${key}'s KUOF card has no By travel button to put back`);
    byTravel.click();
  });
  choice(row)[1]?.click();
  return row;
}

test('two places are written beside the stroke, and counted under the name on a phone, the count opening names', async () => {
  await atWidth(1200);
  await kuof();
  const seen = linesOf();
  // one travel, one line, its people each a unit, named
  expect(seen.names[0]).toBe('Cédric and Christina 2 places'); // the phone's, hidden here
  // written in full, a detail, no names behind it: no dotted underline
  expect(seen.column[0]).toEqual(['Comfort Xpress Oslo Sentrum 1 · Scandic Holberg 1', false]);
  expect(seen.words).toContain(
    'Cédric and Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying: Comfort Xpress Oslo Sentrum: Christina, Scandic Holberg: Cédric',
  );
  // nothing cut short, nor a "+1"
  expect(seen.text).not.toMatch(/…|\+\d/u);
  await atWidth(390);
  const row = await kuof();
  expect(linesOf().under[0]).toEqual(['2 places', true]);
  const count = row?.querySelector<HTMLElement>('.gantt-under button');
  count?.click();
  // a small card of names by place: each place a heading, then its names
  expect(ganttCardOf(document.querySelector(`#${CSS.escape(count?.getAttribute('aria-controls') ?? '')}`))).toEqual([
    '# Comfort Xpress Oslo Sentrum',
    'Christina',
    '# Scandic Holberg',
    'Cédric',
  ]);
  expect(count ? getComputedStyle(count).textDecorationStyle : '').toBe('dotted');
});

test('a card whose people stay at two places or more can be seen by place, from icon buttons, kept for the visit', async () => {
  await atWidth(1200);
  const row = await kuof();
  const labels = () => choice(row).map((b) => [b.ariaLabel, b.title, b.getAttribute('aria-pressed')]);
  expect(labels()).toEqual([
    ['By travel', 'By travel', 'true'],
    ['By place', 'By place', 'false'],
  ]);
  expect(choice(row).map((b) => b.querySelector('svg') !== null && said(b) === '')).toEqual([true, true]);
  const placed = await byPlace(FIXTURE_COMMUNITY);
  expect(choice(placed).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  // a line a place, the most people first, those who said none last, its people under its name; one stroke over
  // the nights anyone stays there, its ends the weekdays of the first evening and the morning after the last
  const seen = linesOf();
  expect(seen.names).toEqual([
    'Comfort Xpress Oslo Sentrum Christina',
    'Scandic Holberg Cédric',
    'Not said Maja, Ragnhild and Tonje',
  ]);
  const nights = [
    ['Thu', 'Mon'],
    [false, false],
    [0, 4],
  ];
  expect(seen.strokes.map((s) => [s.said, s.fades, s.at])).toEqual([
    nights,
    nights,
    [
      ['', ''],
      [true, true],
      [1, 4],
    ],
  ]);
  expect(seen.words).toBe(
    'Comfort Xpress Oslo Sentrum, the nights of Thu 19 to Sun 22: Christina; Scandic Holberg, the nights of Thu 19 to Sun 22: Cédric; place not said: Maja, Ragnhild and Tonje',
  );
  // drawn again, as when the calendar steps: still by place
  expect(pressed(await kuof())).toBe('By place');
  // another community's card of the festival is a roster of its own: by travel, until chosen there
  expect(pressed(await kuof(ELSEWHERE))).toBe('By travel');
});

test('by place, the names a count opens say each one’s own nights when they are not all of the place’s', async () => {
  await atWidth(1200);
  // five at the Scandic, Thursday to Sunday nights, but Nora from Friday
  const row = await byPlace(SIX);
  const count = [...(row?.querySelectorAll<HTMLElement>('.gantt:not([hidden]) .gantt-who') ?? [])].find(
    (b) => said(b) === '5 people',
  );
  count?.click();
  const names = document.querySelector(`#${CSS.escape(count?.getAttribute('aria-controls') ?? '')}`);
  expect(ganttCardOf(names)).toEqual(['Ann', 'Bo', 'Cy', 'Di', 'Nora · Fri–Sun']);
  expect(said(names?.querySelector('.gantt-who-nights'))).toBe('· Fri–Sun');
});

test('the view switch shows its focus ring inside its rounded border', async () => {
  // the view switch's focus ring, on the real By place button, inside its rounded border, which clips what is outside
  // it (the days gone by are read on the fixture's community alone)
  const [, view] = choice(await kuof());
  view?.focus({ focusVisible: true });
  expect(document.activeElement).toBe(view);
  const style = view === undefined ? undefined : getComputedStyle(view);
  expect([style?.outlineStyle, style?.outlineOffset]).toEqual(['solid', '-3px']);
});
