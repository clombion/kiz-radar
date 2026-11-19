// The whole page, in Chromium, started as a visitor gets it (app.ts): a new page takes the focus and names every
// control, and what goes wrong is said on the page (a view that throws: broken.browser.test.ts).
import { expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { done } from '../../site/report.ts';
import { communityHref, EXPLORE, sourcesHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY } from './community.fixture.ts';

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
const COMMUNITY = `#community/${FIXTURE_COMMUNITY}`;
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

test('the footer switches the currency: kroner shown, euros and dollars a button each', () => {
  const sw = document.querySelector('.site-footer .currency-switch');
  expect(sw?.querySelector('[aria-current]')?.textContent).toBe('kr');
  expect([...(sw?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label'))).toEqual(['EUR', 'USD']);
});

test('the search dialog opens from its button, every control named', async () => {
  document.querySelector<HTMLElement>('#search-btn')?.click();
  await expect.poll(() => document.querySelector('dialog[open]')).not.toBeNull();
  expect(unnamed()).toEqual([]);
  document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
});

// the alert line report.ts puts at the top of the page
const alertLine = () => document.querySelector('[role="alert"]')?.textContent ?? '';

test('a promise left to run on its own, or one nothing catches, is said on the page', async () => {
  done(Promise.reject(new Error('a planted failure')), 'a test');
  await expect.poll(alertLine).toContain('a test: a planted failure');
  const loose = Promise.reject(new Error('a loose promise'));
  setTimeout(() => loose, 0); // kept, but never caught: only the window's listener sees it fail
  await expect.poll(alertLine).toContain('the page: a loose promise');
});
