// The whole page, in Chromium: index.html's body with main.ts started on it, the libraries index.html loads as
// scripts, and the database the build ships. A new page takes the focus and names every control, and what goes wrong
// is said on the page.
import { beforeAll, expect, test, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { load, loadSite } from '../../site/db.ts';
import { done } from '../../site/report.ts';
import { artistsHref, communityHref, EXPLORE, sourcesHref, TABS } from '../../site/routes.ts';
import { FIXTURE_COMMUNITY, FIXTURE_DATA } from './community.fixture.ts';

const INDEX = new DOMParser().parseFromString(await commands.readFile('public/index.html'), 'text/html');
// the files the page asks for, by name: the packages the build copies to vendor/, or else the build's data
const VENDOR: Readonly<Record<string, string>> = {
  'sql-wasm.wasm': 'node_modules/sql.js/dist/sql-wasm.wasm',
  'countries-50m.json': 'node_modules/world-atlas/countries-50m.json',
};
// the scripts index.html loads before main.ts, from their packages
const SCRIPTS = [
  '/node_modules/sql.js/dist/sql-wasm.js',
  '/node_modules/leaflet/dist/leaflet.js',
  '/node_modules/topojson-client/dist/topojson-client.min.js',
];
const main = () => document.querySelector<HTMLElement>('#main');
let START = ''; // the page's own address, without a hash

const script = (src: string): Promise<unknown> =>
  new Promise((loaded, failed) => {
    const el = document.createElement('script');
    el.src = src;
    el.addEventListener('load', loaded);
    el.addEventListener('error', () => failed(new Error(`${src} did not load`)));
    document.head.append(el);
  });

beforeAll(async () => {
  await Promise.all(SCRIPTS.map(script));
  const fetched = fetch;
  vi.stubGlobal('fetch', async (url: URL | string, init?: RequestInit) => {
    if (!(url instanceof URL)) return fetched(url, init);
    const file = url.pathname.split('/').at(-1) ?? '';
    const data = await commands.readFile(VENDOR[file] ?? `${FIXTURE_DATA}/${file}`, 'base64');
    return new Response(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  });
  document.body.replaceChildren(...document.importNode(INDEX.body, true).childNodes);
  location.hash = '';
  START = location.href;
  await import('../../site/main.ts');
  // the page has started once the footer's currency switch is drawn (main.ts start)
  await vi.waitUntil(() => document.querySelector('.site-footer .currency-switch'), { timeout: 30_000 });
});

// the roles of what a keyboard or a screen reader acts on
const ROLES = ['button', 'checkbox', 'combobox', 'listbox', 'radio', 'searchbox', 'slider', 'switch', 'tab', 'textbox'];
// the controls shown on the page, its own and the view's, as the browser exposes them
const controls = () => ROLES.flatMap((role) => page.getByRole(role).elements());
// those of them with no name (their accessible name, as a screen reader says it), each said by its role and markup
const unnamed = (): string[] =>
  ROLES.flatMap((role) => {
    const named = new Set(page.getByRole(role, { name: /\S/u }).elements());
    return page
      .getByRole(role)
      .elements()
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

test('the page names every control it has before a view shows', () => {
  expect(controls().length).toBeGreaterThan(0);
  expect(unnamed()).toEqual([]);
});

test.for(VIEWS)('%s takes the focus as a new page and names every control', async (href) => {
  history.replaceState(null, '', START);
  if (location.hash === href) location.hash = ''; // so it is a new page
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  expect(document.activeElement).toBe(document.body);
  location.hash = href;
  await expect.poll(() => main()?.querySelector('.loading'), { timeout: 30_000 }).toBeNull();
  await expect.poll(() => document.activeElement).toBe(main());
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
  history.replaceState(null, '', START);
  const footer = document.querySelector('.site-footer');
  const to = footer?.querySelector<HTMLAnchorElement>(`a[href="${sourcesHref()}"]`);
  expect(to?.textContent).toBe('sources and acknowledgements');
  // where a click goes, from the page's base; followed by its hash, as a click from the site's root would (the test's
  // page has a query its base leaves out, so a click there would leave the test)
  expect(to?.href).toBe(new URL(sourcesHref(), document.baseURI).href);
  location.hash = new URL(to?.href ?? '').hash;
  await expect.poll(() => main()?.querySelector('h2')?.textContent).toBe('Sources and acknowledgements');
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

test('the search dialog names every control', async () => {
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

test('a view that throws while it builds says so in its place, and the page around it stays', async () => {
  // one bad row: an artist of a kind no state has, which reading the artists refuses
  const db = await load(loadSite());
  db.exec("PRAGMA ignore_check_constraints = ON; UPDATE artists SET kind = 'planted'");
  history.replaceState(null, '', START);
  location.hash = artistsHref({ q: 'a' });
  await expect.poll(() => main()?.textContent).toContain('This page could not be shown');
  expect(main()?.textContent).toContain('"planted" is no artist_kind state');
  expect(document.querySelectorAll('nav.tabs a')).toHaveLength(TABS.length);
});
