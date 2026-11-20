// The whole page, in Chromium, started as a visitor gets it (app.ts): a new page takes the focus and names every
// control, and what goes wrong is said on the page (a view that throws: broken.browser.test.ts).
import { expect, onTestFinished, test, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { communityHref, eventOnMapHref, EXPLORE, sourcesHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, FIXTURE_PROMO, PRAGUE_GOLD } from './community.fixture.ts';
import { expectConsole } from './console.ts';
import { COMM, shownDialog } from './seen.ts';

const INDEX = new DOMParser().parseFromString(await commands.readFile('public/index.html'), 'text/html');
const main = () => document.querySelector<HTMLElement>('#main');
const app = await startSite({ now: '2026-11-01' });

// the roles of what a keyboard or a screen reader acts on
const ROLES = ['button', 'checkbox', 'combobox', 'listbox', 'radio', 'searchbox', 'slider', 'switch', 'tab', 'textbox'];
// the controls on the page, its own and the view's, as the browser exposes them: those the stylesheet hides too (a
// shut menu's), which a visitor reaches once it shows them
const controls = (role: string) => page.getByRole(role, { includeHidden: true }).elements();
// those of them with no name (their accessible name, as a screen reader says it), each said by its role and markup:
// a shown control's name from what is shown alone (hidden text names nothing), a hidden one's as it will be shown
const unnamed = (): string[] =>
  ROLES.flatMap((role) => {
    const shown = new Set(page.getByRole(role).elements());
    const named = new Set([
      ...page.getByRole(role, { name: /\S/u }).elements(),
      ...page
        .getByRole(role, { name: /\S/u, includeHidden: true })
        .elements()
        .filter((c) => !shown.has(c)),
    ]);
    return controls(role)
      .filter((c) => !named.has(c))
      .map((c) => `${location.hash} ${role}: <${c.tagName.toLowerCase()} class="${c.getAttribute('class') ?? ''}">`);
  });

// every view the page links to: its tabs and Explore's, and the links index.html has (the SQL page); and the
// community's page, which no tab links to: an older link to it, #community/<key>, which moves the address to its
// own, c/<key>/ (each view starts from the page's own address again)
const COMMUNITY = COMM(FIXTURE_COMMUNITY);
const VIEWS = [
  ...new Set([
    ...[...TABS, ...EXPLORE].map(([, , href]) => href),
    ...[...INDEX.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].map((a) => a.getAttribute('href') ?? ''),
    COMMUNITY,
  ]),
];

test('the page as it starts names every control', () => {
  expect(ROLES.flatMap(controls).length).toBeGreaterThan(0);
  expect(unnamed()).toEqual([]);
});

// oxlint-disable-next-line jest/no-done-callback -- test.for's callback takes the case, not a done callback
test.for(VIEWS)('%s takes the focus as a new page and names every control', async (href) => {
  await app.open(href);
  expect(document.activeElement).toBe(main());
  expect(main()?.childElementCount).toBeGreaterThan(0);
  expect(unnamed()).toEqual([]);
  // an older link to a community's page moves to its own address
  const own = new URL(communityHref(FIXTURE_COMMUNITY), document.baseURI).href;
  expect(href !== COMMUNITY || location.href === own).toBe(true);
});

test('every view the page shows is tested', () => {
  // Explore's tab is its map, one view fewer; the SQL and sources pages, two more, and a community's have no tab
  expect(VIEWS.filter((v) => v !== COMMUNITY).length).toBe(TABS.length + EXPLORE.length + 1);
});

test('the footer links to the sources page, which says what the festival data covers and when it was built', async () => {
  const footer = document.querySelector('.site-footer');
  const to = footer?.querySelector<HTMLAnchorElement>(`a[href="${sourcesHref()}"]`);
  expect(to?.textContent).toBe('sources and acknowledgements');
  // where a click goes, from the page's base; followed by its hash, as a click from the site's root would (the test's
  // page has a query its base leaves out, so a click there would leave the test)
  expect(to?.href).toBe(new URL(sourcesHref(), document.baseURI).href);
  await app.open(new URL(to?.href ?? '').hash);
  expect(main()?.querySelector('h2')?.textContent).toBe('Sources and acknowledgements');
  expect(document.title).toBe('Sources · Kiz Radar');
  expect(main()?.querySelector('#freshness')?.textContent).toMatch(
    /^It covers \w+ \d{4} to \w+ \d{4} and was last updated on \d+ \w+ \d{4}\.$/u,
  );
  // the footer's long column is gone: the sources are said on their page, not twice
  expect(footer?.textContent).not.toContain('Google Flights');
});

test('the skip link comes first and takes the focus to the page; the footer links the pages but Friends', async () => {
  const skip = document.querySelector('body > button');
  expect([skip?.className, skip?.textContent]).toEqual(['skip', 'Skip to the page']);
  expect(document.body.querySelector(':scope > :not(script)')).toBe(skip);
  // shown once a keyboard reaches it, and pressed
  if (!(skip instanceof HTMLElement)) throw new Error('no skip link');
  skip.focus();
  await userEvent.keyboard('{Enter}');
  expect(document.activeElement).toBe(main());
  const links = [...document.querySelectorAll<HTMLAnchorElement>('#footer-nav > a')];
  expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
    [...TABS.slice(0, -1), ...EXPLORE].map(([, label, href]) => [label, href]),
  );
  expect(document.querySelector('#footer-nav > :first-child')?.textContent).toBe('The site’s pages');
});

test('Back to top shows two screens down a long page, and takes the page back up', async () => {
  const toTop = document.querySelector<HTMLButtonElement>('body > button.to-top');
  expect(toTop?.textContent).toBe('↑ Back to top');
  // a page four screens long, whatever the view holds
  const tall = document.body.appendChild(document.createElement('div'));
  tall.style.setProperty('height', `${4 * innerHeight}px`);
  onTestFinished(() => tall.remove());
  window.scrollTo(0, 2 * innerHeight + 10);
  await expect.poll(() => toTop?.classList.contains('shown')).toBe(true);
  await userEvent.click(toTop ?? document.body);
  await expect.poll(() => scrollY).toBe(0);
  expect(toTop?.classList.contains('shown')).toBe(false);
});

test('the footer switches the currency: kroner shown, euros and dollars a button each', () => {
  const sw = document.querySelector('.site-footer .currency-switch');
  expect([sw?.textContent, sw?.id]).toEqual(['Prices in: kr · € · $', '']);
  expect(sw?.querySelector('[aria-current]')?.textContent).toBe('kr');
  expect([...(sw?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label'))).toEqual(['EUR', 'USD']);
});

test('the search dialog opens from its button, every control named', async () => {
  document.querySelector<HTMLElement>('#search-btn')?.click();
  await expect.poll(() => document.querySelector('dialog[open]')).not.toBeNull();
  // shut through its Cancel button once the test ends (seen.ts)
  shownDialog('.search-cancel');
  expect(unnamed()).toEqual([]);
});

// the alert line report.ts puts at the top of the page
const alertLine = () => document.querySelector('[role="alert"]')?.textContent ?? '';

test('a promo code copied says so on its button for two seconds, then Copy again', async () => {
  const copied = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  onTestFinished(() => copied.mockRestore());
  await app.open(eventOnMapHref(PRAGUE_GOLD));
  const copy = [...document.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent === 'Copy');
  copy?.click();
  expect(copied).toHaveBeenCalledWith(FIXTURE_PROMO);
  await expect.poll(() => copy?.textContent).toBe('Copied');
  const at = performance.now();
  await expect.poll(() => copy?.textContent, { timeout: 4000 }).toBe('Copy');
  expect(performance.now() - at).toBeGreaterThan(1500);
});

test('a promise left to run on its own, or one nothing catches, is said on the page', async () => {
  // report.ts says each in the console, with where; and Vitest's own catcher, which leaves a rejection to the page's
  // listener when it has one, prints the event
  expectConsole('error', /^Kiz Radar: copying the code: Error: a refused clipboard$/u);
  expectConsole('error', /^Kiz Radar: the page: Error: a loose promise$/u);
  expectConsole('error', /^\[object PromiseRejectionEvent\]$/u);
  // the copy of a festival's promo code is left to run (report.ts done); the clipboard refuses it
  const refused = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('a refused clipboard'));
  onTestFinished(() => refused.mockRestore());
  await app.open(eventOnMapHref(PRAGUE_GOLD));
  const copy = [...document.querySelectorAll<HTMLButtonElement>('main button')].find((b) => b.textContent === 'Copy');
  if (copy === undefined) throw new Error(`no Copy button on the card: <main> says ${main()?.textContent ?? ''}`);
  copy.click();
  expect(refused).toHaveBeenCalledWith(FIXTURE_PROMO);
  await expect.poll(alertLine).toContain('copying the code: a refused clipboard');
  const loose = Promise.reject(new Error('a loose promise'));
  // oxlint-disable-next-line typescript/no-misused-promises, typescript/promise-function-async, typescript/strict-void-return -- the rejected promise is left uncaught on purpose: only the window's listener may see it
  setTimeout(() => loose, 0); // kept, but never caught: only the window's listener sees it fail
  await expect.poll(alertLine).toContain('the page: a loose promise');
});
