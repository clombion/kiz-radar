// A trip's roster (who travels when) on a community's page, with Cédric and Christina flying to KUOF together, from
// Thursday 19 to Monday 23 November, both at the Scandic Holberg. The community is the fixture's, opened on 1 November
// 2026; the rosters with more people added to KUOF read communities of their own, planted beside it (their members
// the fixture's, their trips the same), so that the fixture's stays as it is for every other test.
import type { Database } from 'sql.js';
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, KUOF } from './community.fixture.ts';
import { community, TO_KUOF, trips } from './planted.ts';
import {
  agendaRow,
  atWidth,
  COMM,
  cellOn,
  collectiveOf,
  ganttOf,
  kuofOf,
  opened,
  popover,
  said,
  titled,
} from './seen.ts';

// the fixture's community with seven more added to KUOF (ten in all), and with two more (five in all)
const SEVEN_MORE = 'seven-more-kuof',
  TWO_MORE = 'two-more-kuof';
// their trip to KUOF, and the two communities
function plant(db: Database): void {
  trips(db, TO_KUOF);
  community(db, SEVEN_MORE, {
    added: ['Ola', 'Kari', 'Per', 'Nils', 'Eva', 'Liv', 'Siri'].map((n) => [n, KUOF] as const),
  });
  community(db, TWO_MORE, { added: ['Ola', 'Kari'].map((n) => [n, KUOF] as const) });
}
const app = await startSite({ now: '2026-11-01', plant });
const main = () => document.querySelector('main');
const kuof = () => kuofOf(app.open);

test('a day only travelled has a dot, and a festival’s own days none', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  const dots = [...(main()?.querySelectorAll('.days-month .days-dot') ?? [])].map(
    (d) => d.closest<HTMLElement>('[data-date]')?.dataset['date'],
  );
  // Siân in to Glasgow the day before it; Cédric and Christina in to Oslo the day before KUOF and out the day after;
  // Prague's Wednesday
  expect(dots).toEqual(['2026-11-05', '2026-11-19', '2026-11-23', '2027-01-13']);
  expect(cellOn('2026-11-19')?.ariaLabel).toBe('Thu 19 Nov: 2 people travelling to Oslo');
});

test('a day’s popover says who flies in and out, and when, who is there, and where they stay', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  const open = (day: string) => {
    cellOn(day)?.focus();
    return [...(popover()?.querySelectorAll('p') ?? [])].map((p) => said(p));
  };
  expect(open('2026-11-19')).toEqual([
    'Thu 19 Nov',
    'KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo',
    'Flying in: Cédric & Christina 17:05 OSL', // one flight, so the couple as one
    'Staying: Scandic Holberg: Cédric & Christina',
  ]);
  expect(open('2026-11-20')).toEqual([
    'Fri 20 Nov',
    'KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo',
    'There: Cédric & Christina, Tonje, Ragnhild and Maja',
    'Staying: Scandic Holberg: Cédric & Christina',
  ]);
  expect(open('2026-11-23')).toContain('Flying out: Cédric & Christina 09:40 OSL');
  open('2026-11-20');
  expect(titled(popover())).toEqual(['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']));
});

test('an opened trip draws who travels when: the days from the first in to the last out, a bar a party', async () => {
  await app.open(COMM(FIXTURE_COMMUNITY));
  const kuofRow = opened('KUOF');
  const chart = ganttOf(kuofRow);
  // in the day before the festival, out the day after
  expect(chart.axis).toEqual([
    { day: 'T19', festival: false },
    { day: 'F20', festival: true },
    { day: 'S21', festival: true },
    { day: 'S22', festival: true },
    { day: 'M23', festival: false },
  ]);
  // the couple as one party, on one flight, the one bar, and where they stay under their name on a phone (beside the
  // bar on a computer); the people added, who never travel, on one last line. What they do there is the row's to say:
  // the card has no role tag
  expect(chart.parties).toEqual(['Cédric & Christina Scandic Holberg']);
  expect(kuofRow?.querySelector('.trip-body')?.querySelectorAll('.plan-tag')).toHaveLength(0);
  expect(said(kuofRow?.querySelector('.trip-who'))).toBe('5 going · Cédric & Christina teaching');
  const [couple, silent, ...others] = chart.bars;
  expect(others).toEqual([]);
  expect([couple?.said, couple?.fades]).toEqual(['17:05 OSL09:40 OSL', [false, false]]);
  expect(couple?.left).toBeCloseTo((100 * (17 + 5 / 60)) / 24 / 5, 3); // 17:05 on the first of five days
  expect((couple?.left ?? 0) + (couple?.width ?? 0)).toBeCloseTo((100 * (4 + (9 + 40 / 60) / 24)) / 5, 3);
  // no band behind the stroke: the axis marks the festival's days. Those who have said nothing are there too: a
  // stroke over the festival's days, the second to the fourth of five, both its ends fading, nothing written
  expect(kuofRow?.querySelector('.gantt-lane')?.childElementCount).toBe(1);
  expect([silent?.left, silent?.width, silent?.fades, silent?.said]).toEqual([20, 60, [true, true], '']);
  expect(chart.said).toBe(
    'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said: Maja, Ragnhild and Tonje',
  );
  // the three who have not said, more than half of the five but only three: named
  expect(chart.unsaid).toBe('Maja, Ragnhild and Tonje');
  expect(titled(kuofRow?.querySelector('.gantt-unsaid'))).toEqual(
    ['Maja', 'Ragnhild', 'Tonje'].map((n) => [n, 'Added by Cédric']),
  );
  // no sentences about who has not said or where who stays: the lines say it
  expect(said(kuofRow?.querySelector('.trip-body'))).not.toMatch(/Not said|Staying/u);
  // Prague from travel.csv: in on the Wednesday before it
  expect(ganttOf(opened('Prague')).axis.map((a) => a.day)).toEqual(['W13', 'T14', 'F15', 'S16', 'S17', 'M18']);
  // Glasgow from travel.csv: Siân in on the Thursday before it, its day alone; Christina on its Friday, its day alone,
  // and out on Monday at 19:10 from Aberdeen; Caroline, who said nothing, on its days
  const glasgow = ganttOf(agendaRow('Glasgow'));
  expect(glasgow.axis.map((a) => a.day)).toEqual(['T5', 'F6', 'S7', 'S8', 'M9']);
  expect(glasgow.parties).toEqual(['Siân', 'Christina']);
  expect(glasgow.bars.map((b) => [b.left, Math.round((b.left + b.width) * 100) / 100, b.fades, b.said])).toEqual([
    [0, 100, [true, true], ''],
    [20, 95.97, [true, false], '19:10 ABZ'],
    [20, 100, [true, true], ''],
  ]);
  expect(glasgow.said).toBe(
    'Siân arrives Thu 5 Nov, time not said, departure not said; Christina arrives Fri 6 Nov, time not said, out Mon 19:10 ABZ; not said: Caroline',
  );
  expect(glasgow.unsaid).toBe('Caroline');
  expect(titled(agendaRow('Glasgow')?.querySelector('.gantt-unsaid'))).toEqual([['Caroline', 'Added by Cédric']]);
  // a couple who has not said is named as one
  expect(ganttOf(opened('HOT Ice')).unsaid).toBe('Cédric & Christina');
});

test('a trip’s bars are thin, and the chart in words is for a screen reader alone', async () => {
  await atWidth(1200);
  const row = await kuof();
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  const ink = [...(row?.querySelectorAll<HTMLElement>('.gantt-ink') ?? [])];
  expect(ink).toHaveLength(2);
  for (const i of ink) expect(i.offsetHeight).toBeLessThanOrEqual(0.7 * rem + 0.5);
  // its times still on it
  expect(ganttOf(row).bars[0]?.said).toBe('17:05 OSL09:40 OSL');
  // the line in words: not shown, but what describes the chart
  const words = row?.querySelector<HTMLElement>('.gantt-said');
  expect(words?.textContent).toBe(
    'Cédric & Christina in Thu 17:05 OSL, out Mon 09:40 OSL, staying at Scandic Holberg; not said: Maja, Ragnhild and Tonje',
  );
  expect(words?.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  expect(row?.querySelector('.gantt')?.getAttribute('aria-describedby')).toBe(words?.id);
  // the people who have not said, on their line
  expect(row?.querySelector<HTMLElement>('.gantt-unsaid')?.getBoundingClientRect().width).toBeGreaterThan(50);
});

test('on a computer a card of names with no room to float by its text in the trip’s card goes in the flow', async () => {
  await atWidth(1200);
  // the couple, and ten people added: two lines, and ten names, too many to float above or below the last
  await app.open(COMM(SEVEN_MORE));
  const seen = await collectiveOf();
  expect([seen.floats, seen.inCard, seen.coversItsLine]).toEqual(['static', true, false]);
});

test('a roster of more than three, its biggest line of more than three people "Everyone else", names them on demand', async () => {
  for (const width of [1200, 390]) {
    await atWidth(width);
    // Cédric and Christina flying together, and five people added who never say how they travel: seven people
    await app.open(COMM(TWO_MORE));
    const seen = await collectiveOf();
    // the couple's line named, by arrival; the five who have not said "Everyone else", last, a stroke over the
    // festival's days, both its ends fading
    expect(seen.lines).toEqual(['Cédric & Christina Scandic Holberg', 'Everyone else']);
    expect(seen.unsaid).toEqual([false, true]);
    expect([seen.silent?.fades, seen.silent?.said]).toEqual([[true, true], '']);
    // its label as dark as the text, dotted under as the other names
    expect(seen.label).toEqual([true, 'dotted']);
    // its names, a list: hidden; shown by a tap, hidden again by Escape; shown while the pointer is over it; and in
    // the words
    expect(seen.names).toEqual(['Kari', 'Maja', 'Ola', 'Ragnhild', 'Tonje']);
    // a card in the trip's card, never over its own line: on a phone in the flow, on a computer floating by its text
    expect(seen.inCard).toBe(true);
    expect(seen.coversItsLine).toBe(false);
    expect(seen.floats).toBe(width < 700 ? 'static' : 'absolute');
    expect(seen.states).toEqual([
      ['false', false],
      ['true', true],
      ['false', false],
      ['false', true],
      ['false', false],
    ]);
    expect(seen.words).toContain('not said: Everyone else (Kari, Maja, Ola, Ragnhild and Tonje)');
  }
});

// a line of KUOF's roster laid out: its stay beside the bar or under the name, its airports, the stay's heading
function rosterAt(row: HTMLElement | undefined) {
  const shown = (el: Element | null | undefined) =>
    el instanceof HTMLElement && el.checkVisibility() && el.offsetWidth > 0 ? said(el) : null;
  return {
    beside: shown(row?.querySelector('.gantt-name ~ .gantt-stay')),
    under: shown(row?.querySelector('.gantt-under')),
    airports: [...(row?.querySelectorAll('.gantt-ap') ?? [])].map((a) => shown(a)),
    // no heading over the column: what it holds says itself
    head: said(row?.querySelector('.gantt > div:nth-child(3)')),
  };
}

test('where a line stays is beside its stroke on a computer, under its name on a phone, airports only on a computer', async () => {
  const stay = 'Scandic Holberg';
  for (const [width, seen] of [
    [1200, { beside: stay, under: null, airports: ['OSL', 'OSL'], head: '' }],
    [390, { beside: null, under: stay, airports: [null, null], head: '' }],
  ] as const) {
    await atWidth(width);
    expect(rosterAt(await kuof())).toEqual(seen);
  }
});

// an element's colour's alpha, and its opacity
const alpha = (el: Element | null | undefined, pseudo?: string): [number, number] => {
  const st = el ? getComputedStyle(el, pseudo) : undefined;
  const channels = (st?.backgroundColor ?? '').match(/[\d.]+/gu) ?? [];
  return [channels.length > 3 ? Number(channels[3]) : 1, Number(st?.opacity ?? 1)];
};

test('the roster’s strokes are the calendar’s ink, its second pass the same, and light', async () => {
  await atWidth(1200);
  const row = await kuof();
  const ink = row?.querySelector('.gantt-ink');
  const stroke = main()?.querySelector('.days-week .days-stroke');
  // one ink everywhere: the card's as the calendar's
  expect(ink ? getComputedStyle(ink).backgroundColor : '').toBe(
    stroke ? getComputedStyle(stroke).backgroundColor : '-',
  );
  expect(alpha(ink, '::after')[1]).toBe(alpha(stroke, '::after')[1]);
  // the times on it as dark as any text
  const time = row?.querySelector('.gantt-bar > span:not(.gantt-ink)');
  const root = main();
  expect(time ? getComputedStyle(time).color : '').toBe(root ? getComputedStyle(root).color : '-');
  expect(alpha(stroke)[0]).toBeLessThanOrEqual(0.25);
  expect(alpha(stroke, '::after')[1]).toBeLessThanOrEqual(0.45);
});

test('the axis is the calendar’s: festival days in the accent, a dot under a day only travelled, dates not bold', async () => {
  await atWidth(1200);
  const axis = [...((await kuof())?.querySelectorAll<HTMLElement>('.gantt-axis span') ?? [])];
  const look = (s: HTMLElement) => [
    s.matches('.gantt-fest') ? 'festival' : 'travel',
    getComputedStyle(s, '::after').content !== 'none',
    Number(getComputedStyle(s.querySelector('b') ?? s).fontWeight) <= 500,
  ];
  expect(axis.map(look)).toEqual([
    ['travel', true, true],
    ['festival', false, false],
    ['festival', false, false],
    ['festival', false, false],
    ['travel', true, true],
  ]);
});

test('a card whose people all stay at one place has no choice of view', async () => {
  // one place for everyone: no choice (the choice itself is read where two places are planted: gantt-places)
  await atWidth(1200);
  expect((await kuof())?.querySelector('.gantt-views')).toBeNull();
});
