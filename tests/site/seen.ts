// What a test reads of the drawn page, and the links it opens that routes.ts does not build, shared by the test files
// that start the page (app.ts).
import { onTestFinished } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { eventOnMapHref } from '../../site/routes.ts';
import { FIXTURE_COMMUNITY } from './community.fixture.ts';

// An older link to a community's page, #community/<key> with its query: the page moves it to c/<key>/, the community's
// own address (routes.ts's routeOf). routes.ts builds no such link (communityHref is the path, which open() refuses), so
// the tests spell it here alone.
export function COMM(key: string, params: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams(params);
  return `#community/${encodeURIComponent(key)}${query.size > 0 ? `?${query}` : ''}`;
}

// What an element shows, as text: what only a screen reader hears inside it (visually-hidden) left out, and nothing
// when the element itself is for a screen reader alone (heard reads that).
export function said(el: Element | null | undefined): string | undefined {
  const shown = el?.cloneNode(true);
  if (!(shown instanceof Element)) return;
  if (shown.matches('.visually-hidden')) return '';
  for (const hidden of shown.querySelectorAll('.visually-hidden')) hidden.remove();
  return shown.textContent?.replace(/\s+/gu, ' ').trim();
}

// What a screen reader hears of an element, its hidden words in.
export const heard = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.replace(/\s+/gu, ' ').trim();

// The names in an element that say on hover who added them, each with what it says.
export const titled = (el: Element | null | undefined): [name: string | undefined, title: string | null][] =>
  [...(el?.querySelectorAll('[title]') ?? [])].map((n) => [said(n), n.getAttribute('title')]);

// The tags in an element of what people do there, by their words ("maybe" one of them).
export const tags = (el: Element | null | undefined): (string | undefined)[] =>
  [...(el?.querySelectorAll('.plan-tag') ?? [])].map((t) => said(t));

// The entries of this frame's own history (the Navigation API's), which no other test file adds to.
export function entries(): number {
  const nav: unknown = Reflect.get(globalThis, 'navigation');
  const list: unknown =
    typeof nav === 'object' && nav !== null && 'entries' in nav && typeof nav.entries === 'function'
      ? Reflect.apply(nav.entries, nav, [])
      : null;
  if (!Array.isArray(list)) throw new Error('no Navigation API');
  return list.length;
}

// The review page (review.html): what its token button says, the dialog it opens, where it draws its queues, the item
// a queue shows, the choices it offers, by their words, and a button inside an element by its words; a page without
// the item, the dialog or the button is an error.
export const accessSays = (): string | undefined => said(document.querySelector('#access'));
export function tokenDialog(): HTMLDialogElement {
  const access = document.querySelector('#access');
  if (!(access instanceof HTMLButtonElement)) throw new Error('the page has no #access');
  access.click();
  const dlg = document.querySelector('dialog[open]');
  if (!(dlg instanceof HTMLDialogElement)) throw new Error('the token button opened no dialog');
  return dlg;
}
export function reviewed(): HTMLElement {
  const el = document.querySelector<HTMLElement>('#review');
  if (el === null) throw new Error('the page has no #review');
  return el;
}
export function theItem(): HTMLElement {
  const item = document.querySelector<HTMLElement>('article[aria-label="The item"]');
  if (item === null) throw new Error(`no item on the page, whose <main> says ${said(main())}`);
  return item;
}
export const choicesOf = (el: Element): (string | undefined)[] =>
  [...el.querySelectorAll('button[aria-pressed]')].map((b) => said(b));
export function buttonOf(el: Element, words: string): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => said(x)?.includes(words));
  if (b === undefined) throw new Error(`no button "${words}" in ${said(el)}`);
  return b;
}
// A key pressed on the window, where the review page listens: a real key would go to whichever frame has the focus,
// another file's maybe (test files share one window).
export const keyed = (key: string): boolean => globalThis.dispatchEvent(new KeyboardEvent('keydown', { key }));

// The page this wide, 900px high, until the test ends; then the browser project's own size, 414 by 896.
export async function atWidth(width: number): Promise<void> {
  onTestFinished(() => page.viewport(414, 896));
  await page.viewport(width, 900);
}

// The dialog the page has open (modal.ts), shut through its own button (close, a selector inside it, which it must
// have) once the test ends, and awaited until its history entry is gone with it, so that no other file's page goes back
// to it: the test files' frames share one history.
export function shownDialog(close: string): HTMLDialogElement {
  const dlg = document.querySelector('dialog[open]');
  if (!(dlg instanceof HTMLDialogElement)) throw new Error('the page has no dialog open');
  const button = dlg.querySelector<HTMLElement>(close);
  if (button === null) throw new Error(`the dialog open has no ${close} to close it`);
  onTestFinished(async () => {
    if (!dlg.open) return;
    const gone = new Promise((done) => addEventListener('popstate', done, { once: true }));
    button.click();
    await gone;
  });
  return dlg;
}

// The Friends tab's list as read, in the page's <main> or the root given: its summary, and each festival's name,
// whether it is tagged on now, and its lines of who goes, each "teaching: Christina and Siân".
export function listOf(root: ParentNode | null = document.querySelector('main')): {
  who: string | undefined;
  when: string | undefined;
  count: string | undefined;
  months: (string | undefined)[];
  rows: { name: string | undefined; now: boolean; lines: string[] }[];
  bar: boolean;
} {
  return {
    who: said(root?.querySelector('.profile-head .lede')),
    when: said(root?.querySelector('.profile-head .community-next')),
    count: said(root?.querySelector('.bar-count')),
    months: [...(root?.querySelectorAll('.month-head') ?? [])].map((m) => said(m)),
    rows: [...(root?.querySelectorAll('.who-rows > li') ?? [])].map((li) => ({
      name: said(li.querySelector('.who-name')),
      now: li.querySelector('.now-tag') !== null,
      lines: [...li.querySelectorAll('.who-lines p')].map(
        (l) => `${said(l.querySelector('.who-label'))}: ${said(l.lastElementChild)}`,
      ),
    })),
    bar: root?.querySelector('.sticky-bar') != null,
  };
}
// A festival's row of the Friends tab's list (listOf's), by the start of its name.
export const rowOf = (name: string): ReturnType<typeof listOf>['rows'][number] | undefined =>
  listOf().rows.find((r) => r.name?.startsWith(name));
// A name on the Friends tab's lines, as the button that opens their plans.
export const goer = (name: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('main .who-lines .goer-name')].find((b) => said(b) === name);

// The page's <main>, where every view draws.
const main = () => document.querySelector('main');

// The titles of the festivals' cards the page shows, in its order.
export const cardTitles = (): (string | undefined)[] =>
  [...(main()?.querySelectorAll('.festival-card h3') ?? [])].map((h) => said(h));
// A festival's card on the page, by its title; a page without it is an error.
export function cardTitled(title: string): Element {
  const card = [...(main()?.querySelectorAll('.festival-card') ?? [])].find(
    (c) => said(c.querySelector('h3')) === title,
  );
  if (card === undefined)
    throw new Error(`no card of ${title} on the page, whose cards are ${cardTitles().join(', ')}`);
  return card;
}
// A festival's card, opened on the map by app's open (app.ts's), on the day given or else the start's; a map without
// it is an error.
type Day = `${number}-${number}-${number}`;
export async function mapCardOf(
  app: { open: (href: string, on?: Day) => Promise<void> },
  id: number,
  day?: Day,
): Promise<Element> {
  await app.open(eventOnMapHref(id), day);
  const card = main()?.querySelector('.festival-card');
  if (card == null) throw new Error(`festival ${id}: no card on the map, whose <main> says ${said(main())}`);
  return card;
}

// A community's page: its agenda of trips, and the months of its calendar.
// A trip's row of the agenda, by the start of its festival's title.
export const agendaRow = (title: string): HTMLElement | undefined =>
  [...(main()?.querySelectorAll<HTMLElement>('.trip') ?? [])].find((r) =>
    r.querySelector('.trip-fest')?.textContent?.startsWith(title),
  );
// A trip's row with its card open, opened from its button when it was closed; a row without its button is an error.
export function opened(title: string): HTMLElement {
  const row = agendaRow(title);
  const toggle = row?.querySelector<HTMLElement>('.trip-toggle');
  if (row === undefined || toggle == null) throw new Error(`no trip row of ${title} with its button on the page`);
  if (row.querySelector<HTMLElement>('.trip-body')?.hidden === true) toggle.click();
  return row;
}

// The months of the calendar.
export const monthsOf = (): HTMLElement[] => [...(main()?.querySelectorAll<HTMLElement>('.days-month') ?? [])];
// A day of the months, whether anyone travels on it or not.
export const cellOn = (day: string): HTMLElement | undefined =>
  main()?.querySelector<HTMLElement>(`.days-month [data-date="${day}"]`) ?? undefined;
// How many people a day of the months says are away on it; a day missing, or without its label, is an error.
export function awayOn(cell: HTMLElement | undefined): number {
  const label = cell?.ariaLabel;
  if (label == null) throw new Error(`no day${cell === undefined ? '' : ` ${cell.dataset['day']}`} with its label`);
  return Number(/: (?<n>\d+) (?:person|people) /u.exec(label)?.groups?.['n'] ?? 0);
}
// The count at the end of a day's week row.
export const countOn = (day: string): string | undefined =>
  said(cellOn(day)?.closest('.days-week')?.querySelector('.days-count'));
// The festivals' strokes in a day's week row: the columns each spans, whether it goes on from the row before or to the
// row after, and its title.
export const strokesOn = (day: string): { columns: string; from: boolean; on: boolean; title: string }[] =>
  [...(cellOn(day)?.closest('.days-week')?.querySelectorAll<HTMLElement>('.days-stroke') ?? [])].map((s) => ({
    columns: s.style.gridColumn.replace(/\s/gu, ''),
    from: s.matches('.days-stroke-from'),
    on: s.matches('.days-stroke-on'),
    title: s.title,
  }));
// The day's popover the calendar opens.
export const popover = (): HTMLElement | null | undefined => main()?.querySelector<HTMLElement>('.day-pop');
// The day the focus is on, by its date.
export const focusedDay = (): string | undefined =>
  document.activeElement instanceof HTMLElement ? document.activeElement.dataset['day'] : undefined;
// A key pressed where the focus is.
export const press = (key: string): boolean | undefined =>
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

// What the page shows of its period: its name, its months, its steps (by their labels, each whether it is off), the
// agenda's headings or what it says when it has none, and the sentence of when most people travel with "Next".
export const periodOf = (): {
  said: string | undefined;
  months: (string | null)[];
  steps: [label: string | null, off: boolean][];
  agenda: (string | undefined)[];
  head: (string | undefined)[];
} => ({
  said: said(main()?.querySelector('.days-said')),
  months: monthsOf().map((m) => m.ariaLabel),
  steps: [...(main()?.querySelectorAll<HTMLButtonElement>('.days-step') ?? [])].map((b) => [b.ariaLabel, b.disabled]),
  agenda: [...(main()?.querySelectorAll('.agenda h2, .agenda > p') ?? [])].map((x) => said(x)),
  head: [said(main()?.querySelector('.community-when')), said(main()?.querySelector('.community-next'))],
});
// The days on the axis of a trip's chart, as its row draws it once opened.
export const axisOf = (row: HTMLElement | undefined): (string | undefined)[] =>
  [...(row?.querySelectorAll('.gantt .gantt-axis span') ?? [])].map((s) => said(s));

// A trip's row with its card open and laid out: three frames on, as its roster measures itself and then places what it
// measured.
export async function laidOut(title: string): Promise<HTMLElement | undefined> {
  const row = opened(title);
  for (const _ of [1, 2, 3]) await new Promise(requestAnimationFrame);
  return row;
}

// A community's page, the fixture's unless another key is given, opened by `open` (app.ts's), its KUOF card open and
// laid out.
export async function kuofOf(
  open: (href: string) => Promise<void>,
  key = FIXTURE_COMMUNITY,
): Promise<HTMLElement | undefined> {
  await open(COMM(key));
  return laidOut('KUOF');
}

// A bar of a trip's chart: the times written at its ends, and which of its ends fade (a time not said).
const timesOf = (bar: HTMLElement): (string | undefined)[] =>
  [...bar.querySelectorAll(':scope > span:not(.gantt-ink)')].map((t) => said(t));
const fadesOf = (bar: HTMLElement): boolean[] => ['gantt-fade-in', 'gantt-fade-out'].map((c) => bar.matches(`.${c}`));

// The chart of a trip's row, as drawn: its axis (each day's words, and whether it is the festival's), the parties it
// names, its bars (their times, where they start and how wide they are, in % of the axis, which ends fade, and their
// ink's shape), and its words for a screen reader (heard) and the line of those who have not said.
export function ganttOf(row: HTMLElement | undefined): {
  axis: { day: string | undefined; festival: boolean }[];
  parties: (string | undefined)[];
  bars: { said: string; left: number; width: number; fades: boolean[]; ink: string }[];
  said: string | undefined;
  unsaid: string | undefined;
} {
  const g = row?.querySelector<HTMLElement>('.gantt');
  return {
    axis: [...(g?.querySelectorAll('.gantt-axis span') ?? [])].map((s) => ({
      day: said(s),
      festival: s.matches('.gantt-fest'),
    })),
    parties: [...(g?.querySelectorAll('.gantt-name:not(.gantt-unsaid)') ?? [])].map((n) => said(n)),
    bars: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      said: timesOf(b).join(''),
      left: Number.parseFloat(b.style.left),
      width: Number.parseFloat(b.style.width),
      fades: fadesOf(b),
      ink: ['height', 'translate', 'rotate', 'border-radius', 'opacity']
        .map((p) => b.querySelector<HTMLElement>('.gantt-ink')?.style.getPropertyValue(p) ?? '')
        .join(' '),
    })),
    said: heard(row?.querySelector('.gantt-said')),
    unsaid: said(row?.querySelector('.gantt-unsaid')),
  };
}

// KUOF's roster as shown (by travel or by place), its card opened: its lines' names, their strokes (their times, which
// ends fade, where they run in days from the axis's first, and their titles), what each line's column beside it and
// under its name says and whether it opens names, its words for a screen reader (heard), and all its card shows.
export function linesOf(): {
  names: (string | undefined)[];
  strokes: { said: (string | undefined)[]; fades: boolean[]; at: number[]; title: string }[];
  column: [said: string | undefined, opens: boolean][];
  under: [said: string | undefined, opens: boolean][];
  words: string | undefined;
  text: string | undefined;
} {
  const card = opened('KUOF');
  const g = card?.querySelector<HTMLElement>('.gantt:not([hidden])');
  const days = g?.querySelectorAll('.gantt-axis span').length ?? 1;
  const dayOf = (x: number) => Math.round(((x * days) / 100) * 100) / 100;
  const opens = (selector: string): [string | undefined, boolean][] =>
    [...(g?.querySelectorAll<HTMLElement>(selector) ?? [])].map((x) => [said(x), x.querySelector('button') !== null]);
  return {
    names: [...(g?.querySelectorAll('.gantt-name') ?? [])].map((n) => said(n)),
    strokes: [...(g?.querySelectorAll<HTMLElement>('.gantt-bar') ?? [])].map((b) => ({
      said: timesOf(b),
      fades: fadesOf(b),
      at: [
        dayOf(Number.parseFloat(b.style.left)),
        dayOf(Number.parseFloat(b.style.left) + Number.parseFloat(b.style.width)),
      ],
      title: b.title,
    })),
    column: opens('.gantt-name ~ .gantt-stay'),
    under: opens('.gantt-under'),
    words: heard(card?.querySelector('.gantt-said:not([hidden])')),
    text: said(card?.querySelector('.trip-body')),
  };
}

// A card of names, as it reads: each place's heading as "# place", each name (with its own nights).
export const ganttCardOf = (list: Element | null | undefined): string[] =>
  [...(list?.querySelectorAll('.gantt-who-place, .gantt-who-list li') ?? [])].map((x) =>
    x.matches('.gantt-who-place') ? `# ${said(x)}` : (said(x) ?? ''),
  );

// What KUOF's roster shows of its collective line, its card laid out: its lines, which are of those who have not said,
// its last bar, its label's look (the colour of the text around it, and its underline), its names as a card (whether
// it is inside the trip's card, over its own line, and floating), how many columns they take, and its names shown and
// hidden by a tap, Escape and the pointer, each time as [aria-expanded, the names seen]; and the words for a screen
// reader (heard).
export async function collectiveOf(): Promise<{
  lines: (string | undefined)[];
  unsaid: boolean[];
  silent: ReturnType<typeof ganttOf>['bars'][number] | undefined;
  inCard: boolean;
  coversItsLine: boolean;
  floats: string;
  columns: string;
  label: (string | boolean)[];
  names: string[];
  states: (string | boolean | null | undefined)[][];
  words: string | undefined;
}> {
  const row = await laidOut('KUOF');
  const root = main();
  const lines = [...(row?.querySelectorAll('.gantt-name') ?? [])];
  const who = row?.querySelector<HTMLButtonElement>('.gantt-who');
  const list = row?.querySelector(`#${who?.getAttribute('aria-controls')}`);
  const state = () => [who?.getAttribute('aria-expanded'), list?.checkVisibility() ?? null];
  // its label, before the pointer is over it
  const label =
    who && root
      ? [getComputedStyle(who).color === getComputedStyle(root).color, getComputedStyle(who).textDecorationStyle]
      : [];
  const states = [state()];
  who?.click();
  states.push(state());
  // the names opened: their box inside the card's, and never over its own line (its name and its stroke)
  const card = row?.querySelector('.trip-body')?.getBoundingClientRect();
  const box = list?.getBoundingClientRect();
  const inCard =
    card !== undefined &&
    box !== undefined &&
    box.width > 0 &&
    box.left >= card.left &&
    box.right <= card.right &&
    box.top >= card.top &&
    box.bottom <= card.bottom;
  const meets = (r: DOMRect | undefined) =>
    box !== undefined &&
    r !== undefined &&
    r.width > 0 &&
    Math.min(r.right, box.right) - Math.max(r.left, box.left) > 0.5 &&
    Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) > 0.5;
  const own = who?.closest('.gantt-name');
  const coversItsLine = meets(own?.getBoundingClientRect()) || meets(own?.nextElementSibling?.getBoundingClientRect());
  const floats = list ? getComputedStyle(list).position : '';
  who?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  states.push(state());
  if (who) await userEvent.hover(who);
  states.push(state());
  if (who) await userEvent.unhover(who);
  states.push(state());
  const names = list?.querySelector('.gantt-who-list');
  return {
    lines: lines.map((n) => said(n.querySelector('.gantt-who') ?? n)),
    unsaid: lines.map((n) => n.matches('.gantt-unsaid')),
    silent: ganttOf(row).bars.at(-1),
    inCard,
    coversItsLine,
    floats,
    columns: names ? getComputedStyle(names).columnCount : '',
    label,
    names: ganttCardOf(list),
    states,
    words: heard(row?.querySelector('.gantt-said')),
  };
}
