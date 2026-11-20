// A part a Solid view draws again as the visitor changes it (mount.tsx Redrawn, redrawing, createDerived) that throws:
// on a later draw, the throw is said once, as the page's, and the view works on, what other parts read of it as it was
// before, its part drawn again on the next change; as the view is first drawn, the view says it cannot be shown. On 1
// November 2026: the Friends tab, its list to three months, then a year: Cloudkiz, from 26 February, comes in, its last
// day planted as a day no month has, which its row's days read as it is drawn; Artists searched, the artists' aliases
// planted away, which only a search reads; the Map's bubbles, Leaflet's circles refused as a filter draws them again;
// the SQL page's result, its count of rows refused as a run draws it.
import { expect, test, vi } from 'vitest';
import { artistsHref, friendsHref, mapHref, sqlHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { CLOUDKIZ } from './community.fixture.ts';
import { expectConsole } from './console.ts';
import { unreadable } from './planted.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    unreadable(db, `UPDATE events SET end_date = '2027-13-01' WHERE id = ${CLOUDKIZ}`);
    db.exec('DROP TABLE artist_aliases');
  },
});
const main = () => document.querySelector('main');
const alerts = () => document.querySelectorAll('[role="alert"]').length;
const when = () => {
  const select = document.querySelector<HTMLSelectElement>('main .bar-inner select');
  if (select === null) throw new Error('the Friends tab has no choice of when');
  return select;
};
// the festivals the list names, and the bar's count
const listed = () => [...document.querySelectorAll('main .who-name')].map((a) => a.textContent);
const count = () => document.querySelector('main .bar-count')?.textContent;
const chosen = (i: number) => {
  when().selectedIndex = i;
  when().dispatchEvent(new Event('change'));
};

test('a list drawn again that throws says so once as the page, and the view goes on', async () => {
  expectConsole('error', /^Kiz Radar: the page: RangeError/u);
  await app.open(friendsHref({ when: 'months' }));
  const months = listed();
  expect(months.length).toBeGreaterThan(0);
  chosen(2); // a year: Cloudkiz with it
  expect(alerts()).toBe(1);
  expect(listed()).toEqual([]);
  expect(count()).toMatch(/^\d+ festivals$/u); // the bar's count drawn, a year keeping them all
  chosen(1); // three months again
  expect(listed()).toEqual(months);
  expect(main()?.textContent).not.toContain('This page could not be shown');
});

test('a list that throws as its view is first drawn is the view’s, said in its place', async () => {
  expectConsole('error', /^Kiz Radar: friends: RangeError/u);
  await expect(app.open(friendsHref())).rejects.toThrow('This page could not be shown');
});

test('a list whose rows throw as they are chosen says so once as the page, and its summary stays', async () => {
  expectConsole('error', /^Kiz Radar: the page: Error: no such table: artist_aliases/u);
  await app.open(artistsHref());
  const summary = () => main()?.querySelector('.list-summary')?.textContent;
  const rows = () => main()?.querySelectorAll('.artist-row').length;
  const all = summary();
  expect(rows()).toBeGreaterThan(0);
  const search = main()?.querySelector<HTMLInputElement>('input[type="search"]');
  if (search == null) throw new Error('Artists has no search');
  const searched = (words: string) => {
    search.value = words;
    search.dispatchEvent(new Event('input'));
  };
  searched('a'); // the aliases read: the throw
  await expect.poll(rows).toBe(0);
  expect([summary(), alerts()]).toEqual([all, 1]);
  expect(main()?.textContent).not.toContain('This page could not be shown');
  searched(''); // no search: the list again
  await expect.poll(rows).toBeGreaterThan(0);
  expect([summary(), alerts()]).toEqual([all, 1]);
});

test('the Map’s bubbles that throw as a filter draws them again say so once as the page, and the map goes on', async () => {
  expectConsole('error', /^Kiz Radar: the page: RangeError: planted/u);
  await app.open(mapHref());
  const bubbles = () => main()?.querySelectorAll('.leaflet-overlay-pane path').length ?? 0;
  const drawn = bubbles();
  expect(drawn).toBeGreaterThan(0);
  const filter = main()?.querySelector<HTMLSelectElement>('.map-bar select');
  if (filter == null) throw new Error('the Map has no select');
  const filtered = (i: number) => {
    filter.selectedIndex = i;
    filter.dispatchEvent(new Event('change'));
  };
  const refused = vi.spyOn(L, 'circleMarker').mockImplementation(() => {
    throw new RangeError('planted');
  });
  try {
    filtered(1);
  } finally {
    refused.mockRestore();
  }
  await expect.poll(alerts).toBe(1);
  expect(main()?.textContent).not.toContain('This page could not be shown');
  filtered(0);
  await expect.poll(bubbles).toBe(drawn);
});

test('the SQL page’s result that throws as a run draws it says so once as the page, and the page goes on', async () => {
  expectConsole('error', /^Kiz Radar: the page: RangeError: a count refused/u);
  await app.open(sqlHref());
  const area = main()?.querySelector('textarea');
  const run = [...(main()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Run (Ctrl+Enter)');
  if (area == null || run === undefined) throw new Error('the SQL page has no query to run');
  const cells = () => [...(main()?.querySelectorAll('.sql-out td') ?? [])].map((td) => td.textContent);
  const ran = (query: string) => {
    area.value = query;
    run.click();
  };
  // the problem line (problem.tsx), one at most, the last said (the Map's above)
  const problem = () => document.querySelector('[role="alert"]')?.textContent;
  // the count of rows, which a run draws above them
  const refused = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
    throw new RangeError('a count refused');
  });
  try {
    ran('SELECT 1');
  } finally {
    refused.mockRestore();
  }
  await expect.poll(problem).toContain('(the page: a count refused)');
  expect(cells()).toEqual([]);
  expect(main()?.textContent).not.toContain('This page could not be shown');
  expect(main()?.querySelector('textarea')).toBe(area);
  ran('SELECT 2');
  expect(cells()).toEqual(['2']);
});
