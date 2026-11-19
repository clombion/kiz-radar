// A community's page: its head, its agenda of trips, the months of its calendar and the popover of a day, its Share
// button, and how they are laid out. The community is the fixture's (community.fixture.ts), as it stood on 1 November
// 2026, before Glasgow: opened by its older link, #community/<key>, on that day or another. A test of another set of
// people the manager added reads a community of its own, planted beside it by its key, so that this one stays the
// fixture's for every other test.
import { expect, onTestFinished, test, vi } from 'vitest';
import { eventOnMapHref, personHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import {
  ALBANIA,
  FIXTURE_COMMUNITY,
  FIXTURE_NAME,
  GLASGOW,
  KUOF,
  PARIS,
  pinFestival,
  RIGA,
} from './community.fixture.ts';
import { community as planted } from './planted.ts';
import {
  agendaRow,
  atWidth,
  awayOn,
  axisOf,
  cellOn,
  COMM,
  countOn,
  focusedDay,
  heard,
  monthsOf,
  opened,
  periodOf,
  popover,
  press,
  said,
  strokesOn,
  tags,
  titled,
} from './seen.ts';

// the page's own address, where a community's link is spelled from (c/<key>/ beside it)
const address = location.href.split('#')[0] ?? '';
// the other communities, each the fixture's but for the people its manager added: Maja only maybe going to KUOF; all
// three added to KUOF only maybe; five more to Glasgow; Ola to Paris (on as KUOF is) and to Albania in May; Maja to
// Riga in September; Maja to KizzEssence in Cologne in July; and two Annas to KUOF
const MAJA_MAYBE = 'maja-maybe-kuof',
  ALL_MAYBE = 'all-maybe-kuof',
  FIVE_MORE = 'five-more-glasgow',
  OLA_ABROAD = 'ola-paris-albania',
  MAJA_RIGA = 'maja-riga-september',
  MAJA_JULY = 'maja-cologne-july',
  TWO_ANNAS = 'two-annas-kuof';
// KizzEssence All-in-One, Cologne, Thursday 15 to Sunday 18 July 2027, whatever the data says of it
const KIZZESSENCE = 18_766;
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    planted(db, MAJA_MAYBE, { maybe: [['Maja', KUOF]] });
    planted(db, ALL_MAYBE, { maybe: ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, KUOF] as const) });
    planted(db, FIVE_MORE, { added: ['Ola', 'Kari', 'Per', 'Nils', 'Eva'].map((n) => [n, GLASGOW] as const) });
    planted(db, OLA_ABROAD, {
      added: [
        ['Ola', PARIS],
        ['Ola', ALBANIA],
      ],
    });
    planted(db, MAJA_RIGA, { added: [['Maja', RIGA]] });
    planted(db, MAJA_JULY, { added: [['Maja', KIZZESSENCE]] });
    pinFestival(db, [KIZZESSENCE, 'KizzEssence All-in-One', '2027-07-15', '2027-07-18', 'Cologne', 'DE', '2027-07-16']);
    planted(db, TWO_ANNAS, {
      added: [
        ['Anna', KUOF],
        ['Anna', KUOF],
      ],
    });
  },
});
const main = () => document.querySelector('main');
type On = Parameters<typeof app.open>[1];
// a community's page, the fixture's unless another key is given, on a day other than the start's when given, with its
// address's query
const community = async (on?: On, params?: Readonly<Record<string, string>>, key = FIXTURE_COMMUNITY) =>
  await app.open(COMM(key, params), on);
// the elements of the page a selector picks
const all = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...(main()?.querySelectorAll<E>(selector) ?? []),
];

// who goes to KUOF, as its row says it closed: Cédric and Christina teach there, and the three Cédric added go
const KUOF_WHO = 'Cédric & Christina teaching · Tonje, Ragnhild and Maja going';
// Christina and Siân, members, go to Glasgow and teach there, each named as herself; Caroline, added by Cédric, goes
const GLASGOW_WHO = 'Christina teaching and Siân teaching · Caroline going';

test('a community’s head says who it is, when most members travel and where next, and whom it is for', async () => {
  await community('2026-11-03');
  expect(said(main()?.querySelector('h1'))).toBe(FIXTURE_NAME);
  // the badge says how many members; who manages it is said with the members, at the foot
  expect(said(main()?.querySelector('.profile-head'))).not.toMatch(/members ·|managed by/u);
  const head = all('.profile-head p').map((p) => said(p));
  // KUOF: Cédric, Christina and the three added; Glasgow, this Friday, comes first
  expect(head).toContain('Most people are travelling 20–22 Nov: 5 people, to Oslo.');
  expect(said(main()?.querySelector('.profile-head .community-next'))).toBe('Next: Glasgow, this Friday');
  expect(said(main())).not.toMatch(/\baway\b|Most of the community/u);
  // who sees it, as a badge beside Share: a lock, people and their number, named in full
  const badge = main()?.querySelector<HTMLElement>('.share-row .privacy');
  expect(said(main()?.querySelector('.share-row button'))).toBe('Share this page');
  expect([badge?.getAttribute('role'), badge?.ariaLabel, badge?.title]).toEqual([
    'img',
    'Anyone with the link can see this page · 3 members',
    'Anyone with the link can see this page · 3 members',
  ]);
  expect([badge?.querySelectorAll('svg').length, said(badge)]).toEqual([2, '3']);
  // a week on, Glasgow is under way and KUOF is two weeks off
  await community('2026-11-07');
  expect(said(main()?.querySelector('.community-next'))).toBe('Now: Glasgow, until Mon · Next: Oslo, on 20 Nov');
  await community('2026-11-10');
  expect(said(main()?.querySelector('.community-next'))).toBe('Next: Oslo, on 20 Nov');
});

test('the sentence of when most members travel leaves out a trip that has ended', async () => {
  // Glasgow with five more people added: the most at once, until it ends
  const when = async (day: On) => {
    await community(day, undefined, FIVE_MORE);
    return said(main()?.querySelector('.community-when'));
  };
  expect(await when('2026-11-04')).toBe('Most people are travelling 6–9 Nov: 8 people, to Glasgow.');
  expect(await when('2026-11-10')).toBe('Most people are travelling 20–22 Nov: 5 people, to Oslo.');
});

// A trip while it happens and after: Glasgow, Friday 6 to Monday 9 November, Siân there from the Thursday and
// Christina leaving on the Monday at 19:10. What the page says of it on a day.
async function glasgowOn(day: On) {
  await community(day);
  const row = agendaRow('Glasgow');
  return {
    next: said(main()?.querySelector('.community-next')),
    now: row?.querySelector('.now-tag')?.textContent ?? '',
    open: row?.querySelector<HTMLElement>('.trip-body')?.hidden === false,
    first: said(main()?.querySelector('.trip .trip-fest')),
    opened: all('.trip-body').filter((b) => b.hidden === false).length,
    stroke: all('.days-stroke')
      .filter((st) => st.title.startsWith('Glasgow'))
      .map((st) => st.matches('.days-stroke-past')),
    count: countOn('2026-11-06'),
  };
}

// Glasgow before it, the next trip: its row first and open, its stroke not past, its week counting its three
const BEFORE = {
  next: 'Next: Glasgow, this Friday',
  now: '',
  open: true,
  first: 'Glasgow Kizomba Festival 5.0',
  opened: 1,
  stroke: [false, false],
  count: '3',
};

test('before Glasgow, it is next, its row open', async () => {
  expect(await glasgowOn('2026-11-04')).toEqual(BEFORE);
});

test('while Glasgow is on, from its first arrival to its last departure, its row says Now and is open', async () => {
  // Siân arrives on the Thursday: the trip is on from then
  expect((await glasgowOn('2026-11-05')).now).toBe('Now');
  // on its Friday, as before it but for Now
  expect(await glasgowOn('2026-11-06')).toEqual({
    ...BEFORE,
    next: 'Now: Glasgow, until Mon · Next: Oslo, on 20 Nov',
    now: 'Now',
  });
  // the "Now" tag before its days, and today's ring on its stroke
  expect(said(agendaRow('Glasgow')?.querySelector('.trip-head p'))).toMatch(/^Now Fri 6 – Mon 9 Nov /u);
  expect(cellOn('2026-11-06')?.ariaCurrent).toBe('date');
  expect(cellOn('2026-11-06')?.querySelector('.days-ring')).not.toBeNull();
  expect(strokesOn('2026-11-06').map((st) => st.title)).toEqual(['Glasgow Kizomba Festival 5.0']);
  // its last day, Christina leaving that evening
  expect(await glasgowOn('2026-11-09')).toMatchObject({
    next: 'Now: Glasgow, until today · Next: Oslo, on 20 Nov',
    now: 'Now',
  });
});

test('after Glasgow, it leaves the agenda, its stroke stays grey, and it is no longer counted', async () => {
  for (const day of ['2026-11-13', '2026-11-10'] as const)
    expect(await glasgowOn(day)).toEqual({
      next: 'Next: Oslo, on 20 Nov',
      now: '',
      open: false,
      first: 'KUOF – Kizomba & Urban Kiz Oslo Festival',
      opened: 1,
      stroke: [true, true],
      count: '',
    });
  // the period still starts at today's month (the page of the 10th, opened last)
  expect(said(main()?.querySelector('.days-said'))).toMatch(/^Nov/u);
});

test('the agenda has a heading a month and a row a trip, soonest first, naming who of the community goes', async () => {
  await community();
  expect(all('.agenda h2').map((h2) => said(h2))).toEqual([
    'November · 3 trips',
    'January 2027 · 1 trip',
    'February · 2 trips',
  ]);
  const rows = all('.trip');
  expect(rows.map((r) => said(r.querySelector('.trip-when')))).toEqual([
    'Fri 6 – Mon 9 Nov',
    'Fri 20 – Sun 22 Nov',
    'Thu 26 Nov – Tue 1 Dec',
    'Thu 14 – Mon 18 Jan',
    'Thu 11 – Mon 15 Feb',
    'Fri 26 – Sun 28 Feb',
  ]);
  expect(said(agendaRow('KUOF')?.querySelector('.trip-who'))).toBe(KUOF_WHO);
  // Glasgow's card is open: its row says how many go and who teaches; the card names everyone
  const glasgow = () => agendaRow('Glasgow');
  const toggleGlasgow = () => glasgow()?.querySelector<HTMLElement>('.trip-toggle')?.click();
  expect(said(glasgow()?.querySelector('.trip-who'))).toBe('3 going · Christina and Siân teaching');
  toggleGlasgow(); // closed, the whole line again
  expect(said(glasgow()?.querySelector('.trip-who'))).toBe(GLASGOW_WHO);
  toggleGlasgow();
  expect(agendaRow('KUOF')).toBeDefined();
  expect(said(agendaRow('KUOF')?.querySelector('.trip-what'))).toBeUndefined();
  expect(said(agendaRow('KUOF')?.querySelector('p'))).toContain('· 🇳🇴 Oslo');
  // who added them is said on hover only, on each added name
  expect(said(main())).not.toContain('added by');
  expect(titled(agendaRow('KUOF')?.querySelector('.trip-who'))).toEqual(
    ['Tonje', 'Ragnhild', 'Maja'].map((n) => [n, 'Added by Cédric']),
  );
  toggleGlasgow(); // closed: its whole who-line
  expect(
    [...(glasgow()?.querySelectorAll('.trip-who a') ?? [])].map((a) => [a.textContent, a.getAttribute('href')]),
  ).toEqual([
    ['Christina', personHref('christina')],
    // a member now, her plans page as Christina's
    ['Siân', personHref('sian')],
  ]);
  toggleGlasgow();
  // the next trip open, the others closed; a row opens and closes from its button
  const toggles = rows.map((r) => r.querySelector<HTMLElement>('.trip-toggle'));
  expect(toggles.map((t) => t?.getAttribute('aria-expanded'))).toEqual([
    'true',
    'false',
    'false',
    'false',
    'false',
    'false',
  ]);
  expect(rows.map((r) => r.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual([
    false,
    true,
    true,
    true,
    true,
    true,
  ]);
  toggles[1]?.click();
  expect(rows[1]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(toggles[1]?.getAttribute('aria-expanded')).toBe('true');
  expect(toggles[1]?.getAttribute('aria-label')).toBe('Who travels when, to KUOF – Kizomba & Urban Kiz Oslo Festival');
  // no link of its own to the line-up: the festival's name shows its line-up and prices, the festival's card opened
  // in the trip's, and hides them again
  expect(said(main())).not.toContain('Line-up & prices');
  const lineup = () => rows[2]?.querySelector<HTMLElement>('.trip-lineup');
  const name = rows[2]?.querySelector<HTMLButtonElement>('button.trip-fest');
  expect([name?.textContent, name?.getAttribute('aria-expanded')]).toEqual([
    'HOT Ice KIZ Festival 11th edition',
    'false',
  ]);
  expect(name?.getAttribute('aria-controls')).toBe(lineup()?.id);
  name?.click(); // its card was closed: the name opens it, on its line-up
  await expect.poll(() => lineup()?.hidden).toBe(false);
  expect(rows[2]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(name?.getAttribute('aria-expanded')).toBe('true');
  expect(rows[2]?.querySelector('.trip-toggle')?.getAttribute('aria-expanded')).toBe('true');
  expect(lineup()?.querySelector('.festival-card.open .card-details')).not.toBeNull();
  expect(all('.festival-card')).toHaveLength(1); // no cards but the one opened
  name?.click();
  await expect.poll(() => [lineup()?.hidden, name?.getAttribute('aria-expanded')]).toEqual([true, 'false']);
  expect(rows[2]?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false); // its card stays open
  // the next trip's card opens on who travels, its line-up folded
  expect(rows[0]?.querySelector<HTMLElement>('.trip-lineup')?.hidden).toBe(true);
  // where a festival is leads to it on the map
  const place = rows[1]?.querySelector<HTMLAnchorElement>('.trip-head a');
  expect([said(place), place?.getAttribute('href')]).toEqual(['🇳🇴 Oslo', eventOnMapHref(KUOF)]);
  // the members, at the foot of the page (the view's own root, in <main>)
  const members = all(':scope > div > article > section').at(-1);
  expect(said(members?.querySelector('p'))).toBe('Cédric manager, Christina and Siân');
});

test('a trip’s chart is drawn the first time its row opens, not with the agenda', async () => {
  await community();
  const rows = all('.trip');
  const toggle = () => rows[1]?.querySelector<HTMLElement>('.trip-toggle')?.click();
  expect(rows.map((r) => r.querySelector('.gantt') !== null)).toEqual([true, false, false, false, false, false]);
  toggle();
  expect(rows[1]?.querySelectorAll('.gantt')).toHaveLength(1);
  expect(rows[1]?.querySelector('.trip-body > .gantt + .gantt-said')).not.toBeNull(); // before its line-up, as drawn
  toggle();
  toggle();
  expect(rows[1]?.querySelectorAll('.gantt')).toHaveLength(1); // once
});

test('a festival listed and not cancelled is on now on its days, nothing said of its state', async () => {
  // KUOF listed, on its second day: on now, and nothing said of it (cancelled and gone: a file that plants them so)
  await community('2026-11-21');
  const kuof = agendaRow('KUOF');
  expect([said(kuof?.querySelector('.now-tag')), kuof?.querySelector('.trip-off')]).toEqual(['Now', null]);
});

test('a link to no community says so', async () => {
  await community(undefined, undefined, 'no-such-community-here');
  expect(said(main())).toBe('No community at this link.');
});

// the page's Share button
const shareButton = () => all<HTMLButtonElement>('button').find((b) => b.textContent === 'Share this page');
// an own property of navigator over the browser's, until undone
function over(name: 'clipboard' | 'share', value: unknown): () => void {
  Object.defineProperty(navigator, name, { configurable: true, value });
  return () => {
    Reflect.deleteProperty(navigator, name);
  };
}
// the browser's clipboard, which copies by write, until undone
function copying(write: (text: string) => Promise<void>): () => void {
  const spy = vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(write);
  return () => spy.mockRestore();
}

test('the community’s page shares its page for a shared link, copied when the browser has no share sheet', async () => {
  await community();
  const share = shareButton();
  // no share sheet, whatever the machine's browser has, and a clipboard that copies
  onTestFinished(over('share', undefined));
  const copied: string[] = [];
  onTestFinished(
    copying(async (text) => {
      copied.push(text);
      await Promise.resolve();
    }),
  );
  share?.click();
  await expect.poll(() => share?.textContent).toBe('Link copied');
  // its page for a shared link, which chat apps read for its card, not the site's hash, which they never see
  expect(copied).toEqual([new URL(`c/${FIXTURE_COMMUNITY}/`, address).href]);
});

test('the Share button says what to do when there is no clipboard or it is refused, then shows its label again', async () => {
  // the button's words just after a click, still at 2.4 s, and back by 2.6 s: the page says what it did for 2.5 s
  // (people.ts), on a page of its own, with the browser as the stubs make it
  const shared = async (...stubs: readonly (() => () => void)[]) => {
    await community();
    const share = shareButton();
    const undo = stubs.map((stub) => stub());
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    try {
      share?.click();
      await vi.advanceTimersByTimeAsync(0);
      const first = share?.textContent;
      await vi.advanceTimersByTimeAsync(2400);
      const still = share?.textContent;
      await vi.advanceTimersByTimeAsync(200);
      return [first, still, share?.textContent];
    } finally {
      vi.useRealTimers();
      for (const u of undo) u();
    }
  };
  const noShare = () => over('share', undefined);
  const copy = 'Copy the address bar to share';
  expect(await shared(noShare, () => copying(async () => await Promise.resolve()))).toEqual([
    'Link copied',
    'Link copied',
    'Share this page',
  ]);
  expect(await shared(noShare, () => over('clipboard', {}))).toEqual([copy, copy, 'Share this page']);
  expect(
    await shared(noShare, () => copying(async () => await Promise.reject(new DOMException('no', 'NotAllowedError')))),
  ).toEqual([copy, copy, 'Share this page']);
  // the visitor closing the share sheet is not refused: nothing said
  expect(
    await shared(() => over('share', async () => await Promise.reject(new DOMException('closed', 'AbortError')))),
  ).toEqual(['Share this page', 'Share this page', 'Share this page']);
});

test('the months are today’s period, four of them, a festival one stroke across its days, its count once', async () => {
  await community();
  expect(monthsOf().map((m) => said(m.querySelector('.days-caption')))).toEqual([
    'Nov 2026',
    'Dec 2026',
    'Jan 2027',
    'Feb 2027',
  ]);
  expect([...(monthsOf()[0]?.querySelectorAll('.days-head span') ?? [])].map((s) => s.textContent)).toEqual([
    'M',
    'T',
    'W',
    'T',
    'F',
    'S',
    'S',
  ]);
  // the most travelling on a day is the sentence's
  const cells = all('.days-month [data-day]');
  const most = Math.max(...cells.map(awayOn));
  expect(most).toBe(5);
  expect(cells.filter((c) => awayOn(c) === most).map((c) => c.dataset['day'])).toEqual([
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ]);
  expect(cellOn('2026-11-20')?.ariaLabel).toBe('Fri 20 Nov: 5 people at the festival in Oslo');
  // one colour, whatever the count: no shades, no shade key
  expect(main()?.querySelector('[class*="days-1"], [class*="days-2"], [class*="days-3"], .days-swatch')).toBeNull();
  expect(said(main()?.querySelector('.days-legend'))).toBe(
    'festival travel day today · at a row’s end, how many go to the festivals that begin that week',
  );
  // HOT Ice, Thursday 26 Nov to Tuesday 1 Dec: one stroke, round where it begins, cut where it goes on, its count on
  // the row it begins only
  expect(strokesOn('2026-11-26')).toEqual([
    { columns: '4/8', from: false, on: true, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect(strokesOn('2026-11-30')).toEqual([
    { columns: '1/2', from: true, on: true, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect(strokesOn('2026-12-01')).toEqual([
    { columns: '2/3', from: true, on: false, title: 'HOT Ice KIZ Festival 11th edition' },
  ]);
  expect([countOn('2026-11-26'), countOn('2026-11-30'), countOn('2026-12-01')]).toEqual(['2', '', '']);
  // KUOF's row: its 5, as the sentence; Glasgow's 3 on the row it begins, not on the Monday it ends
  expect(countOn('2026-11-20')).toBe('5');
  expect([countOn('2026-11-06'), countOn('2026-11-09')]).toEqual(['3', '']);
  expect(countOn('2026-12-08')).toBe('');
  // Prague from travel.csv: in on Wednesday 13, the day before it, a travel day; its stroke from the 14th
  expect(['12', '13', '18', '19'].map((d) => awayOn(cellOn(`2027-01-${d}`)))).toEqual([0, 2, 2, 0]);
  expect(strokesOn('2027-01-14').map((s) => s.columns)).toEqual(['4/8']);
  expect(cellOn('2027-01-13')?.querySelector('.days-dot')).not.toBeNull();
  expect(cellOn('2027-01-14')?.querySelector('.days-dot')).toBeNull();
  // today ringed, the days before it greyed
  expect(all('[aria-current="date"]')).toHaveLength(1);
  expect(cellOn('2026-11-01')?.querySelector('.days-ring svg')).not.toBeNull();
  await community('2026-11-10');
  expect(cellOn('2026-11-09')?.matches('.days-past')).toBe(true);
  expect(cellOn('2026-11-11')?.matches('.days-past')).toBe(false);
});

// the cursor over an element, by the stylesheet
const cursorOver = (el: Element | undefined) => (el === undefined ? '' : getComputedStyle(el).cursor);

test('a day no one travels on does nothing: no popover, no tab stop, no pointer', async () => {
  await community();
  const empty = cellOn('2026-11-15');
  expect(empty?.dataset['day']).toBeUndefined();
  expect(empty?.hasAttribute('tabindex')).toBe(false);
  expect(empty?.ariaLabel).toBe('Sun 15 Nov');
  expect(cursorOver(empty)).not.toBe('pointer');
  empty?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  empty?.click();
  expect(popover()?.hidden ?? true).toBe(true);
  expect(cursorOver(cellOn('2026-11-20'))).toBe('pointer');
  // December, where only HOT Ice's last day is: its one stop
  const stops = [...(monthsOf()[1]?.querySelectorAll<HTMLElement>('[tabindex="0"]') ?? [])];
  expect(stops.map((c) => c.dataset['day'])).toEqual(['2026-12-01']);
});

test('each page’s day popover has an id of its own, which the day it is open on is described by', async () => {
  // a page opened, and a day's popover in it: the popover's id, and what the day is described by
  const ids = async () => {
    await community();
    const day = cellOn('2026-11-05');
    day?.focus();
    return [popover()?.id, day?.getAttribute('aria-describedby')];
  };
  const [firstPop, firstDay] = await ids();
  const [secondPop] = await ids();
  expect([firstPop?.startsWith('day-pop-'), firstPop === firstDay]).toEqual([true, true]);
  expect(secondPop).not.toBe(firstPop);
});

test('a month is one stop for the keyboard, its arrows passing over the days no one travels on', async () => {
  await community();
  const stops = (month: HTMLElement | undefined) =>
    [...(month?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].filter((c) => c.tabIndex === 0);
  const [november] = monthsOf();
  // November's first day someone travels on: the Thursday Siân flies in to Glasgow
  expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-05']);
  stops(november)[0]?.focus();
  expect(popover()?.hidden).toBe(false);
  press('ArrowRight');
  expect(focusedDay()).toBe('2026-11-06');
  press('ArrowRight');
  press('ArrowRight');
  press('ArrowRight');
  press('ArrowRight'); // from Monday 9, over the empty days, to KUOF's Friday
  expect(focusedDay()).toBe('2026-11-20');
  press('ArrowLeft');
  expect(focusedDay()).toBe('2026-11-09');
  press('ArrowDown'); // the first day a week or more on that anyone travels: KUOF's Friday again
  expect(focusedDay()).toBe('2026-11-20');
  press('ArrowUp');
  expect(focusedDay()).toBe('2026-11-09');
  expect(stops(november).map((c) => c.dataset['day'])).toEqual(['2026-11-09']); // still one stop
  expect(said(popover())).toContain('Glasgow Kizomba Festival 5.0 · Glasgow');
  press('Escape');
  expect(popover()?.hidden).toBe(true);
  cellOn('2026-11-20')?.click();
  expect(popover()?.hidden).toBe(false);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(popover()?.hidden).toBe(true);
});

test('two festivals on at once both have their row and stroke, a day counts everyone at either, their week both', async () => {
  await community(undefined, undefined, OLA_ABROAD);
  expect(said(main()?.querySelector('.agenda h2'))).toBe('November · 4 trips');
  expect(agendaRow('Paris Kizomba Congress')).toBeDefined();
  expect(agendaRow('KUOF')).toBeDefined();
  expect(awayOn(cellOn('2026-11-21'))).toBe(6);
  expect(awayOn(cellOn('2026-11-19'))).toBe(1); // Paris begins the day before
  // two strokes, Paris under KUOF; the week's count their sum, each named on hover
  expect(strokesOn('2026-11-21').map((s) => s.title)).toEqual([
    'Paris Kizomba Congress',
    'KUOF – Kizomba & Urban Kiz Oslo Festival',
  ]);
  const count = cellOn('2026-11-21')?.closest('.days-week')?.querySelector<HTMLElement>('.days-count');
  expect(said(count)).toBe('6');
  expect(count?.title).toBe('Paris Kizomba Congress: 1 person; KUOF – Kizomba & Urban Kiz Oslo Festival: 5 people');
  cellOn('2026-11-21')?.focus();
  expect(said(popover())).toContain('Paris Kizomba Congress · Paris');
  expect(said(popover())).toContain('KUOF – Kizomba & Urban Kiz Oslo Festival · Oslo');
});

test('a festival from a Wednesday to a Tuesday, a week long, fills its every day and its Gantt’s axis', async () => {
  // Ola to Albania, Wednesday 5 to Tuesday 11 May 2027, in the period from March
  await community(undefined, { from: '2027-03' }, OLA_ABROAD);
  expect(['04', '05', '08', '11', '12'].map((d) => awayOn(cellOn(`2027-05-${d}`)))).toEqual([0, 1, 1, 1, 0]);
  expect(axisOf(opened('Albania'))).toEqual(['W5', 'T6', 'F7', 'S8', 'S9', 'M10', 'T11']);
});

test('two people added of one first name are two people, each on the calendar and in the day’s box', async () => {
  await community(undefined, undefined, TWO_ANNAS);
  // KUOF's three added and Cédric and Christina, and two Annas
  expect(awayOn(cellOn('2026-11-21'))).toBe(7);
  cellOn('2026-11-21')?.focus();
  const there = [...(popover()?.querySelectorAll('p') ?? [])]
    .map((p) => said(p))
    .find((t) => t?.startsWith('There') === true);
  expect(there?.match(/Anna/gu)).toHaveLength(2);
});

test('with nothing to come, the community’s page has no sentence of when it travels, nor months', async () => {
  await community('2028-01-01');
  expect(said(main())).not.toContain('Most members');
  expect(main()?.querySelector('.days-month')).toBeNull();
  // its trips all over: none to come
  expect(said(main())).toContain('No trips coming up.');
});

// where a day's popover is, against the month the day is in, once the day has the focus
const boxes = (day: string) => {
  const cell = cellOn(day);
  cell?.focus();
  return {
    pop: popover()?.getBoundingClientRect(),
    grid: cell?.closest('.days-month')?.getBoundingClientRect(),
    shown: popover()?.hidden === false,
  };
};
const meet = (a?: DOMRect, b?: DOMRect) =>
  a !== undefined && b !== undefined && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('on a computer a day’s popover opens beside its month, never over it', async () => {
  await atWidth(1200);
  await community();
  for (const day of ['2026-11-20', '2026-11-06', '2027-01-13']) {
    const b = boxes(day);
    expect(b.shown).toBe(true);
    expect(meet(b.pop, b.grid)).toBe(false);
  }
  // to the right of November, at the day's height
  const nov = boxes('2026-11-20');
  expect(nov.pop?.left).toBeGreaterThanOrEqual(nov.grid?.right ?? Number.POSITIVE_INFINITY);
  expect(Math.abs((nov.pop?.top ?? 0) - (cellOn('2026-11-20')?.getBoundingClientRect().top ?? 0))).toBeLessThan(1);
  expect(document.activeElement).toBe(cellOn('2026-11-20')); // the focus stays in the month
});

test('on a phone a day opens a panel under its row of months, moving what follows down; a tap on it again closes', async () => {
  await atWidth(390);
  await community();
  const legend = () => main()?.querySelector('.days-legend')?.getBoundingClientRect().top ?? 0;
  const before = legend();
  const b = boxes('2026-11-20');
  const pop = popover();
  expect(b.shown).toBe(true);
  expect(pop == null ? '' : getComputedStyle(pop).position).toBe('static'); // in the page's flow
  expect(meet(b.pop, b.grid)).toBe(false);
  expect(b.pop?.top).toBeGreaterThanOrEqual(b.grid?.bottom ?? Number.POSITIVE_INFINITY);
  // under November and December, which share a row, before January
  const [, december, january] = monthsOf();
  expect(b.pop?.top).toBeGreaterThanOrEqual(december?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY);
  expect(b.pop?.bottom).toBeLessThanOrEqual(january?.getBoundingClientRect().top ?? 0);
  expect(b.pop?.width).toBeGreaterThan((b.grid?.width ?? 0) * 1.5); // the page's width, not a month's
  expect(legend()).toBeGreaterThan(before); // what follows moved down
  expect(document.activeElement).toBe(cellOn('2026-11-20'));
  // a tap on the day again closes it
  const cell = cellOn('2026-11-20');
  cell?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  cell?.click();
  expect(pop?.hidden).toBe(true);
  expect(legend()).toBe(before);
});

test('a trip is a row of the agenda, and what it opens a card under it, as a festival’s; only the next one open', async () => {
  await community();
  const trips = all('.agenda .trip');
  expect(trips.length).toBeGreaterThan(1);
  expect(trips.map((t) => t.querySelector<HTMLElement>('.trip-body')?.hidden)).toEqual(trips.map((_, i) => i !== 0));
  const look = (el: Element | null | undefined) => {
    const st = el == null ? undefined : getComputedStyle(el);
    return [st?.borderTopLeftRadius, st?.backgroundColor, st?.boxShadow !== 'none', st?.borderTopStyle];
  };
  // a festival's card, as the next trip's name opens it on its line-up: how a card looks
  const name = trips[0]?.querySelector<HTMLButtonElement>('button.trip-fest');
  name?.click();
  const card = () => trips[0]?.querySelector('.trip-lineup:not([hidden]) .festival-card');
  await expect.poll(card).not.toBeNull();
  const [radius, surface] = look(card());
  name?.click();
  expect(radius).not.toBe('0px');
  for (const t of trips) {
    // the row is no card: no radius, no shadow, no box but the line under it
    expect(look(t)).toEqual(['0px', 'rgba(0, 0, 0, 0)', false, 'none']);
    // what it opens is
    expect(look(t.querySelector('.trip-body'))).toEqual([radius, surface, true, 'solid']);
    expect(t.querySelector('.trip-head')?.closest('.trip-body')).toBeNull();
  }
});

// each week's swipe of each festival on the page as opened: its shape, without where it lies
async function swipes(): Promise<Map<string, string>> {
  await community();
  return new Map(
    all('.days-week .days-stroke').map((s) => [
      `${s.title} ${s.closest('.days-week')?.querySelector('[data-date]')?.getAttribute('data-date') ?? ''}`,
      ['height', 'translate', 'rotate', 'border-radius', 'opacity'].map((p) => s.style.getPropertyValue(p)).join(' '),
    ]),
  );
}

test('each festival’s stroke is a swipe of its own, the same however often it is drawn', async () => {
  const once = await swipes();
  expect(once.size).toBeGreaterThan(3);
  expect(await swipes()).toEqual(once); // drawn again, the same
  expect(new Set(once.values()).size).toBe(once.size); // no two alike
  for (const shape of once.values()) expect(shape).toMatch(/^[\d.]+rem 0px [\d.]+rem -?[\d.]+deg /u);
});

test('a festival’s stroke runs across the lower half of its days’ numbers', async () => {
  await community();
  const strokes = all('.days-week .days-stroke');
  expect(strokes.length).toBeGreaterThan(3);
  for (const s of strokes) {
    const height = Number.parseFloat(s.style.height),
      drop = Number.parseFloat(s.style.translate.split(' ')[1] ?? '');
    expect(height).toBeLessThanOrEqual(0.66); // thinner than a number is tall (1.45rem a row)
    expect(drop).toBeGreaterThanOrEqual(0.18); // and lower than its middle
  }
});

test('a count keeps its word: "5 people" never breaks', async () => {
  await community();
  const sentence = main()?.querySelector('.community-when')?.textContent ?? '';
  expect(sentence).toContain('5 people');
  expect(sentence).toContain('20–22 Nov');
});

test('the calendar shows today’s four months between its steps, the agenda their trips', async () => {
  await community('2026-11-04');
  // every trip of the community is in them: both steps off
  expect(periodOf()).toEqual({
    said: 'Nov 2026 – Feb 2027',
    months: ['November 2026', 'December 2026', 'January 2027', 'February 2027'],
    steps: [
      ['Previous four months', true],
      ['Next four months', true],
    ],
    agenda: ['November · 3 trips', 'January 2027 · 1 trip', 'February · 2 trips'],
    head: ['Most people are travelling 20–22 Nov: 5 people, to Oslo.', 'Next: Glasgow, this Friday'],
  });
  // the steps are drawings, of the icons' module
  expect(main()?.querySelector('.days-step svg')).not.toBeNull();
});

test('a festival of the next period, with no trip day in this one, is not among its trips', async () => {
  // seen from October, the first four months are October to January: Cloudkiz (26–28 Feb), with no one in before
  // February, is not among them (with a trip in on the last day of January: a file that plants it)
  await community('2026-10-15');
  expect(periodOf().agenda).toEqual(['November · 3 trips', 'January 2027 · 1 trip']);
});

// a step of the calendar, by its label, pressed
const step = (label: string) => main()?.querySelector<HTMLButtonElement>(`.days-step[aria-label="${label}"]`)?.click();
// the community with Maja to Riga in September, as on 4 November: March to June with nothing, then July to October
const toRiga = async () => await community('2026-11-04', undefined, MAJA_RIGA);

test('the steps go through the periods in place to the last trip’s, the agenda with them, the address keeping it', async () => {
  await toRiga();
  const seen = [periodOf()];
  const addresses: string[] = [];
  for (const _ of [1, 2]) {
    step('Next four months');
    seen.push(periodOf());
    addresses.push(`${location.pathname.split('/').slice(-3).join('/')}${location.search}`);
  }
  expect(seen.map((t) => t.said)).toEqual(['Nov 2026 – Feb 2027', 'Mar – Jun 2027', 'Jul – Oct 2027']);
  expect(seen[1]?.months).toEqual(['March 2027', 'April 2027', 'May 2027', 'June 2027']);
  expect(seen.map((t) => t.agenda)).toEqual([
    ['November · 3 trips', 'January 2027 · 1 trip', 'February · 2 trips'],
    ['Nothing planned in Mar–Jun'],
    ['September 2027 · 1 trip'],
  ]);
  expect(seen.map((t) => t.steps.map(([, off]) => off))).toEqual([
    [true, false],
    [false, false],
    [false, true],
  ]);
  // the community's own address, c/<key>/, the period in its query
  expect(addresses).toEqual([`c/${MAJA_RIGA}/?from=2027-03`, `c/${MAJA_RIGA}/?from=2027-07`]);
  // the sentence and "Next" are of every trip, whatever period shows
  for (const t of seen)
    expect(t.head).toEqual(['Most people are travelling 20–22 Nov: 5 people, to Oslo.', 'Next: Glasgow, this Friday']);
  for (const _ of [1, 2]) step('Previous four months');
  expect(periodOf().said).toBe('Nov 2026 – Feb 2027');
  expect(location.search).not.toContain('from=');
});

test('the period in the address shows, one the calendar does not step to is today’s', async () => {
  const at = async (from: string) => {
    await community('2026-11-04', { from }, MAJA_RIGA);
    return periodOf().said;
  };
  expect(await at('2027-03')).toBe('Mar – Jun 2027');
  expect(await at('2027-02')).toBe('Nov 2026 – Feb 2027'); // no period begins in February
  expect(await at('2027-11')).toBe('Nov 2026 – Feb 2027'); // after the last trip
  expect(await at('2026-07')).toBe('Nov 2026 – Feb 2027'); // before today's
});

test('trips only far off: today’s period shows empty, and the next its trips', async () => {
  // from 1 March 2027: March to June has none of the community; July to October, Maja's to Cologne
  await community('2027-03-01', undefined, MAJA_JULY);
  expect(periodOf().agenda).toEqual(['Nothing planned in Mar–Jun']);
  step('Next four months');
  expect([periodOf().said, periodOf().agenda]).toEqual(['Jul – Oct 2027', ['July · 1 trip']]);
});

test('a step that turns itself off leaves the focus on the other', async () => {
  await toRiga();
  const next = main()?.querySelector<HTMLButtonElement>('.days-step[aria-label="Next four months"]');
  next?.focus();
  next?.click();
  next?.click();
  expect(document.activeElement?.ariaLabel).toBe('Previous four months');
});

test('on a phone a day’s panel opens under its row of months in a later period too', async () => {
  await atWidth(390);
  await toRiga();
  step('Next four months');
  step('Next four months');
  cellOn('2027-09-04')?.focus();
  expect(popover()?.checkVisibility()).toBe(true);
  // a step closes it
  const pop = popover();
  step('Previous four months');
  expect(pop?.hidden).toBe(true);
});

test('the steps sit on the line of the period’s name, and its months in two rows on a phone, one on a computer', async () => {
  // the middle of a box, from its top
  const middle = (el: { readonly getBoundingClientRect: () => DOMRect } | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r === undefined ? Number.NaN : r.top + r.height / 2;
  };
  for (const width of [390, 600, 1200]) {
    await atWidth(width);
    await community('2026-11-04');
    // the name's text, by a range over it, whatever box its element has
    const text = document.createRange();
    text.selectNodeContents(main()?.querySelector('.days-said') ?? document.body);
    const at = middle(text);
    for (const b of all('.days-step')) expect(Math.abs(middle(b) - at)).toBeLessThanOrEqual(1);
    // the four months: two rows of two on a phone or a small tablet, one row of four on a computer, never three and one
    const placed = monthsOf().map((m) => m.getBoundingClientRect());
    const grid = [
      new Set(placed.map((b) => Math.round(b.top))).size,
      new Set(placed.map((b) => Math.round(b.left))).size,
    ];
    expect(grid).toEqual(width < 700 ? [2, 2] : [1, 4]);
  }
});

test('who added someone is said to a screen reader too, not on hover alone', async () => {
  await community();
  const who = agendaRow('KUOF')?.querySelector('.trip-who');
  expect(said(who)).toBe(KUOF_WHO);
  expect(heard(who)).toContain('Tonje (added by Cédric)');
});

// the contrast of a colour on another, as WCAG measures it
const luminance = (rgb: string) => {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+(?:\.\d+)?/gu) ?? []).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].toSorted((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

test('a day gone by is struck through and readable; a travelled one keeps its weight; a bar’s times stay legible', async () => {
  // the view switch's focus ring is read on a card with two places to switch between, in a file that plants them
  await community('2026-11-10');
  const style = (el: Element | null | undefined) => (el == null ? undefined : getComputedStyle(el));
  const past = style(cellOn('2026-11-02')),
    travelled = style(cellOn('2026-11-06'));
  const ground = getComputedStyle(document.body).backgroundColor;
  expect(past?.textDecorationLine).toBe('line-through');
  expect(contrast(past?.color ?? '', ground)).toBeGreaterThanOrEqual(4.5);
  expect([travelled?.textDecorationLine, travelled?.fontWeight]).toEqual(['line-through', '650']);
  // a bar's times at 0.7rem at least, in the open card of the next trip
  const bar = main()?.querySelector('.trip-body:not([hidden]) .gantt-bar');
  expect(bar).not.toBeNull();
  expect(Number.parseFloat(style(bar)?.fontSize ?? '0')).toBeGreaterThanOrEqual(0.7 * 16);
});

// Someone who may go: in the fixture, Tonje, added, may go to Prague GOLD (where Cédric and Christina go), and Siân may
// go to Prague Kwanza.
const PRAGUE = 'Prague GOLD';

test('on the community page someone who may go is named with a maybe tag and counted apart', async () => {
  await community();
  const row = agendaRow(PRAGUE);
  expect(said(row?.querySelector('.trip-who'))).toBe('Cédric & Christina going · Tonje maybe');
  expect(tags(row?.querySelector('.trip-who'))).toEqual(['going', 'maybe']);
  opened(PRAGUE);
  expect(said(row?.querySelector('.trip-who'))).toBe('2 going · 1 maybe');
  // the roster: Tonje on her line, tagged, and in words
  expect(tags(row?.querySelector('.gantt'))).toEqual(['maybe']);
  expect(heard(row?.querySelector('.gantt-said'))).toContain('Tonje (maybe)');
  // Siân, a member, may go to Prague Kwanza
  expect(said(agendaRow('Prague Kwanza')?.querySelector('.trip-who'))).toBe('Siân maybe');
  // of those added to KUOF, Maja only may go: named apart from those going
  await community(undefined, undefined, MAJA_MAYBE);
  expect(said(agendaRow('KUOF')?.querySelector('.trip-who'))).toBe(
    'Cédric & Christina teaching · Tonje and Ragnhild going and Maja maybe',
  );
});

test('the calendar and the sentence count those going, not those who may go, whom a day’s popover names', async () => {
  await community();
  // Prague GOLD's days: Cédric and Christina, not Tonje
  expect(awayOn(cellOn('2027-01-15'))).toBe(2);
  expect(countOn('2027-01-15')).toBe('2');
  cellOn('2027-01-15')?.focus();
  expect(said(popover())).toBe(
    'Fri 15 JanPrague GOLD KIZ Tarraxo Festival · PragueThere: Cédric & Christina and Tonje maybe',
  );
  expect(tags(popover())).toEqual(['maybe']);
  // Prague Kwanza, where only Siân may go: no day counted
  expect(awayOn(cellOn('2027-02-12'))).toBe(0);
  // KUOF's five going, the three added among them
  expect(said(main()?.querySelector('.community-when'))).toContain('5 people, to Oslo');
  // everyone added to KUOF only maybe: KUOF counts Cédric and Christina alone, fewer than Glasgow's three
  await community(undefined, undefined, ALL_MAYBE);
  expect(said(main()?.querySelector('.community-when'))).toBe(
    'Most people are travelling 6–9 Nov: 3 people, to Glasgow.',
  );
});
