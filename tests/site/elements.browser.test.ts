// What the page's elements show where the site builds them (dom.ts, icons.ts, modal.ts, dismiss.ts, through the
// views): a festival's title with markup in it shown as text, nothing the page leaves out written as null or false,
// classes and styles as given, the drawings, the search dialog's history entry, the Festivals page's paged list and
// select, and the cards over a community's page. On 1 November 2026, Glasgow retitled with markup and flying to GLA,
// Cédric and Christina to KUOF with two more added in a community of its own, and one artist's bookings replaced.
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { artistHref, EXPLORE, festivalsHref, mapHref, sourcesHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, GLASGOW, KUOF } from './community.fixture.ts';
import { bookedArtist, bookings, community, flies, retitled, TO_KUOF, trips } from './planted.ts';
import {
  atWidth,
  back,
  COMM,
  cardTitled,
  cellOn,
  entryAt,
  kuofOf,
  monthsOf,
  popover,
  said,
  shownDialog,
  unhidden,
} from './seen.ts';

// a title of the build's that holds markup, and quotes and an ampersand, which would each be HTML if put in as such:
// its elements marked data-planted, so that one made from it shows anywhere on the page
const TITLE = 'Glasgow <i data-planted>Kizomba</i> & "Friends" <img data-planted alt="">';
// the fixture's community with two more added to KUOF: its roster says "Everyone else", whose names are a card
const NAMES = 'names-card-kuof';
let artist = 0;
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    retitled(db, GLASGOW, TITLE);
    flies(db, GLASGOW, [['GLA', 11]]);
    trips(db, TO_KUOF);
    community(db, NAMES, { added: ['Ola', 'Kari'].map((n) => [n, KUOF] as const) });
    artist = bookedArtist(db);
    bookings(db, artist, [
      ['NO', 4],
      ['SE', 1],
    ]);
  },
});
const main = () => document.querySelector<HTMLElement>('main');
const planted = () => document.querySelectorAll('[data-planted]').length;

// What the page shows that holds nothing a visitor should read: each attribute whose value says null, undefined, NaN or
// [object Object], or true or false where HTML takes none (aria-*, HTML's enumerated spellcheck, draggable and
// contenteditable, and SVG's focusable aside), and the words undefined, NaN and [object Object] anywhere; Leaflet's own markup left out.
const SAID_NOTHING = /null|undefined|NaN|\[object Object\]/u;
const WORDS_NOTHING = /\bundefined\b|\bNaN\b|\[object Object\]/u;
const ENUMERATED = new Set(['spellcheck', 'draggable', 'contenteditable', 'focusable']);
// an attribute that says nothing, as strays() reads it
const saysNothing = ({ name, value }: Attr) =>
  SAID_NOTHING.test(value) ||
  ((value === 'true' || value === 'false') && !name.startsWith('aria-') && !ENUMERATED.has(name));
function strays(): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    if (el.matches('.leaflet-container, script, style')) return;
    for (const a of [...el.attributes].filter(saysNothing))
      out.push(`${location.hash} <${el.tagName.toLowerCase()} ${a.name}="${a.value}">`);
    for (const node of el.childNodes) {
      if (node instanceof Element) walk(node);
      else if (node.nodeType === Node.TEXT_NODE && WORDS_NOTHING.test(node.textContent ?? ''))
        out.push(`${location.hash} text "${node.textContent?.trim() ?? ''}"`);
    }
  };
  walk(document.body);
  return out;
}

// the search opened from its button, and shut through its Cancel button once the test ends (seen.ts)
function searchOpened(): { dlg: HTMLDialogElement; input: HTMLInputElement } {
  document.querySelector<HTMLElement>('#search-btn')?.click();
  const dlg = shownDialog('.search-cancel');
  const input = dlg.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (input === null) throw new Error('the search button opened no search');
  return { dlg, input };
}
// the search's rows for what is typed, once its index is in (built after the dialog opens)
async function searched(input: HTMLInputElement, typed: string): Promise<Element[]> {
  input.value = typed;
  input.dispatchEvent(new Event('input'));
  const rows = () => [...document.querySelectorAll('dialog[open] [role="option"]')];
  await vi.waitUntil(() => rows().some((r) => r.querySelector('.name') !== null), { timeout: 5000 });
  return rows();
}

test('a festival’s title with markup in it is shown as text, on its card and in the search', async () => {
  await app.open(festivalsHref({ country: 'GB', reach: 'any' }));
  const card = cardTitled(TITLE);
  expect(said(card.querySelector('h3'))).toBe(TITLE);
  const flights = `Flights to ${TITLE}:`;
  expect(card.querySelector('.flights-btn')?.getAttribute('aria-label')?.slice(0, flights.length)).toBe(flights);
  expect(planted()).toBe(0);
  const { input } = searchOpened();
  const rows = await searched(input, 'Glasgow');
  expect(rows.map((r) => said(r.querySelector('.name')))).toContain(TITLE);
  expect(planted()).toBe(0);
});

test('what holds nothing is left out: no class or aria-current on a tab not shown, one selected option a select', async () => {
  await app.open(mapHref());
  const links = [...document.querySelectorAll('#subnav a')];
  expect(links.map((a) => [a.textContent, a.getAttribute('class'), a.getAttribute('aria-current')])).toEqual(
    EXPLORE.map(([key, label]) => (key === 'map' ? [label, 'active', 'page'] : [label, null, null])),
  );
  await app.open(festivalsHref());
  const selects = [...(main()?.querySelectorAll('select') ?? [])];
  expect(selects.length).toBeGreaterThan(4); // the sentence's, the bar's and More filters'
  for (const select of selects) {
    const marked = [...select.options].filter((o) => o.hasAttribute('selected'));
    expect(marked).toEqual([select.selectedOptions[0]]);
  }
});

test.for([
  ...new Set([...TABS, ...EXPLORE].map(([, , href]) => href)),
  sourcesHref(),
  COMM(FIXTURE_COMMUNITY),
  '(the planted artist)',
  // oxlint-disable-next-line jest/no-done-callback -- test.for's callback takes the case, not a done callback
])('%s writes no null, undefined, NaN, object or stray true and false, and hides every drawing', async (href) => {
  await app.open(href === '(the planted artist)' ? artistHref(artist) : href);
  expect(main()?.childElementCount).toBeGreaterThan(0);
  expect(strays()).toEqual([]);
  expect(unhidden()).toEqual([]);
});

test('every drawing is hidden once a trip’s card is open', async () => {
  const row = await kuofOf(app.open);
  expect(row?.querySelector<HTMLElement>('.trip-body')?.hidden).toBe(false);
  expect(main()?.querySelectorAll('svg').length).toBeGreaterThan(0);
  expect(unhidden()).toEqual([]);
});

test('every drawing is hidden once a festival’s passes are open', async () => {
  await app.open(festivalsHref());
  const passes = main()?.querySelector<HTMLElement>('.festival-card .pass-btn');
  if (passes == null) throw new Error('no card on the Festivals page lists its passes');
  passes.click();
  // shut once the test ends (seen.ts)
  expect(shownDialog('.peek-close').querySelector('#passes-title')).not.toBeNull();
  expect(unhidden()).toEqual([]);
});

test('every drawing is hidden on a phone’s map with its sheet slid up; Leaflet’s, by its class, left out', async () => {
  await atWidth(390);
  await app.open(mapHref());
  main()?.querySelector<HTMLElement>('.sheet-handle')?.click();
  expect(main()?.querySelector('.sheet-handle')?.getAttribute('aria-expanded')).toBe('true');
  // the festivals' circles, drawn by Leaflet in an SVG of its own (leaflet-zoom-animated)
  expect(main()?.querySelector('.leaflet-overlay-pane svg path')).not.toBeNull();
  expect(unhidden()).toEqual([]);
});

test('a drawing is put in as the SVG icons.ts writes: the map’s sheet handle, a dance’s note in the search', async () => {
  await app.open(mapHref());
  expect(main()?.querySelector('.sheet-handle svg path')).not.toBeNull();
  // the search left open on the map, shut once the test ends (seen.ts)
  const { input } = searchOpened();
  const semba = (await searched(input, 'Semba')).find(
    (r) =>
      said(r.querySelector('.name')) === 'Also with Semba' &&
      said(r.querySelector('.sub'))?.startsWith('Dance') === true,
  );
  if (semba === undefined) throw new Error('the search lists no Semba dance on 2026-11-01');
  const lead = semba.querySelector('.lead');
  expect([lead?.children.length, lead?.firstElementChild?.tagName]).toEqual([1, 'svg']);
  expect(lead?.querySelector('svg path')).not.toBeNull();
  expect(unhidden()).toEqual([]);
});

test('the search has a history entry of its own: the back button closes it, and so does Escape, removing it', async () => {
  await app.open(festivalsHref());
  // the search opened from its button as a tap leaves it, the focus on it
  const opener = document.querySelector<HTMLElement>('#search-btn');
  opener?.focus();
  const at = entryAt();
  const state: unknown = history.state;
  const { dlg } = searchOpened();
  expect([entryAt(), history.state]).toEqual([at + 1, { modal: true }]);
  expect(strays()).toEqual([]);
  // the back button: the dialog's close event is sent after the step back, and the page handles both
  const closed = new Promise((done) => dlg.addEventListener('close', done, { once: true }));
  await back();
  await closed;
  expect([dlg.open, entryAt(), document.activeElement]).toEqual([false, at, opener]);
  // opened again, closed as Escape closes it (cancel, then close), which takes its entry away: a first Escape clears
  // what is typed, the next closes
  const { input } = searchOpened();
  expect(entryAt()).toBe(at + 1);
  input.value = 'Glasgow';
  input.dispatchEvent(new Event('input'));
  dlg.requestClose();
  expect([dlg.open, input.value]).toEqual([true, '']);
  const gone = new Promise((done) => addEventListener('popstate', done, { once: true }));
  dlg.requestClose();
  await gone;
  expect([dlg.open, entryAt(), history.state]).toEqual([false, at, state]);
});

// the Festivals page's count, from its words "N festivals like that"
function countSaid(): number {
  const n = /(?<n>\d+) festivals? like that/u.exec(said(main()) ?? '')?.groups?.['n'];
  if (n === undefined) throw new Error(`the page says no count: ${said(main())?.slice(0, 300)}`);
  return Number(n);
}
const cards = () => [...(main()?.querySelectorAll('.festival-cards > .festival-card') ?? [])];
const showMore = () => main()?.querySelector<HTMLButtonElement>('.show-more');
// what the more button says, null when it is hidden
const moreSays = () => (showMore()?.hidden === false ? said(showMore()) : null);
const PAGE = 30;
const nextSays = (left: number) => (left > 0 ? `Show ${Math.min(PAGE, left)} more` : null);

test('the festivals are shown 30 at a time, each page added to what is there; other festivals start over', async () => {
  await app.open(festivalsHref({ when: 'year', reach: 'any' }));
  const n = countSaid();
  if (n <= PAGE) throw new Error(`${n} festivals in the coming year: the list needs more than ${PAGE}`);
  const [first] = cards();
  for (let shown = PAGE; ; shown += PAGE) {
    expect([cards().length, moreSays()]).toEqual([Math.min(shown, n), nextSays(n - shown)]);
    expect(cards()[0]).toBe(first);
    if (shown >= n) break;
    showMore()?.click();
  }
  const where = main()?.querySelector<HTMLSelectElement>('select[aria-label="Where to"]');
  const gb = [...(where?.options ?? [])].findIndex((o) => o.value === 'GB');
  if (where == null || gb < 0) throw new Error('no Where to with Great Britain on the page');
  where.selectedIndex = gb;
  where.dispatchEvent(new Event('change'));
  const m = countSaid();
  expect([cards().length, moreSays()]).toEqual([Math.min(PAGE, m), nextSays(m - PAGE)]);
  expect(cards()[0]).not.toBe(first);
});

// the Festivals page's Line-up select (More filters)
const lineUp = () =>
  [...(main()?.querySelectorAll('label.field') ?? [])]
    .find((l) => l.textContent.startsWith('Line-up'))
    ?.querySelector('select');

test('a select gives back the option picked as its value: the line-up chosen stays in the address and shown', async () => {
  await app.open(festivalsHref());
  const select = lineUp();
  const twenty = [...(select?.options ?? [])].findIndex((o) => o.text === '20+ artists');
  if (select == null || twenty < 0) throw new Error('no Line-up select with 20+ artists on the page');
  select.selectedIndex = twenty;
  select.dispatchEvent(new Event('change'));
  expect(new URLSearchParams(location.hash.split('?')[1]).get('lineup')).toBe('20');
  expect(lineUp()?.selectedOptions[0]?.text).toBe('20+ artists');
  await app.open(location.hash);
  expect(lineUp()?.selectedOptions[0]?.text).toBe('20+ artists');
});

// KUOF's roster on the community NAMES, laid out on a computer: its laid-out chart, and "Everyone else" with its names
async function roster() {
  await atWidth(1200);
  const row = await kuofOf(app.open, NAMES);
  const chart = row?.querySelector('.gantt:not([hidden])');
  const who = [...(chart?.querySelectorAll<HTMLButtonElement>('.gantt-who') ?? [])].find(
    (b) => said(b) === 'Everyone else',
  );
  const names = who && row?.querySelector(`#${who.getAttribute('aria-controls')}`);
  if (chart == null || who === undefined || names == null) throw new Error('no "Everyone else" and its names on KUOF');
  return { chart, who, names };
}
const classesOf = (el: Element) => el.getAttribute('class')?.split(' ') ?? [];
const pressEscape = (on: Element) => on.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

test('a class list leaves out what is false, and a toggle changes its one class', async () => {
  const { chart, who, names } = await roster();
  expect([...chart.querySelectorAll('.gantt-name')].map((n) => n.getAttribute('class'))).toEqual([
    'gantt-name',
    'gantt-name gantt-unsaid',
  ]);
  const before = classesOf(names);
  expect(before).not.toContain('gantt-open');
  who.click();
  expect(classesOf(names)).toEqual([...before, 'gantt-open']);
  pressEscape(who);
  expect(classesOf(names)).toEqual(before);
});

test('a style sets each property, a custom one as the stylesheet reads it', async () => {
  const { chart } = await roster();
  const bars = [...chart.querySelectorAll<HTMLElement>('.gantt-bar')];
  expect(bars.length).toBeGreaterThan(0);
  for (const bar of bars) expect([bar.style.left, bar.style.width].every((v) => v.endsWith('%'))).toBe(true);
  await app.open(artistHref(artist));
  const booked = [...(main()?.querySelectorAll('section') ?? [])].find(
    (s) => said(s.querySelector('h2'))?.startsWith('Where they’re booked') === true,
  );
  const shares = [...(booked?.querySelectorAll<HTMLElement>('.bars .bar') ?? [])];
  expect(shares.map((b) => b.style.getPropertyValue('--w'))).toEqual(['100.0%', '25.0%']);
  expect(getComputedStyle(shares[1] ?? document.body).backgroundImage).toMatch(/ 25%\)$/u);
});

// whether two boxes overlap
const meet = (a?: DOMRect, b?: DOMRect) =>
  a !== undefined && b !== undefined && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('a card over the page is the only one open, and goes on Escape, the focus leaving and a tap outside', async () => {
  const { who, names } = await roster();
  const pop = () => popover();
  const shown = () => [pop()?.hidden === false, who.getAttribute('aria-expanded') === 'true'];
  const focus = (day: string) => {
    cellOn(day)?.focus();
    expect(document.activeElement).toBe(cellOn(day));
  };
  // one at a time, opened with the focus left where it is: the day's popover, then the names shown by the pointer
  focus('2026-11-19');
  expect(shown()).toEqual([true, false]);
  await userEvent.hover(who);
  expect([pop()?.hidden, classesOf(names).includes('gantt-open')]).toEqual([true, true]);
  await userEvent.unhover(who);
  // the popover on another day, then the names by a click, then the popover again on the first day
  focus('2026-11-23');
  who.click();
  expect(shown()).toEqual([false, true]);
  focus('2026-11-19');
  expect(shown()).toEqual([true, false]);
  expect(classesOf(names)).not.toContain('gantt-open');
  expect(strays()).toEqual([]);
  // the focus moving within what it belongs to keeps it, never closed on the way, on the day now focused; leaving for
  // elsewhere closes it
  const closing = new MutationObserver(() => undefined);
  closing.observe(pop() ?? document.body, { attributes: true, attributeFilter: ['hidden'] });
  focus('2026-11-23');
  expect(closing.takeRecords()).toEqual([]);
  closing.disconnect();
  expect([pop()?.hidden, cellOn('2026-11-23')?.getAttribute('aria-describedby')]).toEqual([false, pop()?.id]);
  const share = [...(main()?.querySelectorAll('button') ?? [])].find((b) => said(b) === 'Share this page');
  share?.focus();
  expect(document.activeElement).toBe(share);
  expect(pop()?.hidden).toBe(true);
  // a tap on it keeps it, a tap outside closes it
  focus('2026-11-19');
  pop()?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(pop()?.hidden).toBe(false);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(pop()?.hidden).toBe(true);
  // Escape wherever it is pressed, opened on another day
  focus('2026-11-23');
  expect(pop()?.hidden).toBe(false);
  pressEscape(document.body);
  expect(pop()?.hidden).toBe(true);
  // placed again when the window changes size: beside January, at its day's height, over none of it
  focus('2027-01-13');
  const january = () => monthsOf().find((m) => m.contains(cellOn('2027-01-13') ?? null));
  const was = january()?.getBoundingClientRect();
  await atWidth(760);
  await expect.poll(() => january()?.getBoundingClientRect().left).not.toBe(was?.left);
  // shown, over none of the month, in the window, 8 px from the month's side and at the day's height, once placed
  const placed = () => {
    const [at, month, day] = [pop(), january(), cellOn('2027-01-13')].map((el) => el?.getBoundingClientRect());
    if (at === undefined || month === undefined || day === undefined) return 'no popover, January or 13 January';
    const gap = Math.min(Math.abs(at.left - month.right), Math.abs(month.left - at.right));
    return {
      shown: pop()?.hidden === false,
      over: meet(at, month),
      inWindow: at.left >= 0 && at.right <= innerWidth,
      beside: Math.abs(gap - 8) < 1,
      level: Math.abs(at.top - day.top) < 1,
    };
  };
  await expect.poll(placed).toEqual({ shown: true, over: false, inWindow: true, beside: true, level: true });
});
