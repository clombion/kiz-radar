// A database the page cannot read says so in the place of the view that waited for it, and the page around it stays: a
// load that failed, not the site mid-update (updating.browser.test.ts). The page started (app.ts) on Sources, which
// waits for no data, on a database without its meta, which the load reads once site.json is in (a failure before it,
// as the database is opened, may come before the page listens for it, and is then said as the page's too).
import type { Database } from 'sql.js';
import { expect, test } from 'vitest';
import { countriesHref, sourcesHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { owners } from './owned.ts';

// the database's meta dropped: the load's check of its build fails
const dropped = (db: Database): void => {
  db.exec('DROP TABLE meta');
};
const app = await startSite({ now: '2026-11-01', route: sourcesHref(), plant: dropped });

test('a database that fails to load says so in the view, and the page around it goes on', async () => {
  // the helper refuses a page that says it failed, with its words
  await expect(app.open(countriesHref())).rejects.toThrow('Could not load the data: no such table: meta');
  const line = document.querySelectorAll('main p.status.error');
  expect([...line].map((p) => p.textContent)).toEqual(['Could not load the data: no such table: meta']);
  expect(document.querySelectorAll('nav.tabs a')).toHaveLength(TABS.length);
  // another view that needs no data still shows, and one that does says it again; the line goes with its view, the
  // page holding as many owners on Sources as before it
  await app.open(sourcesHref());
  const before = owners();
  expect(document.querySelector('main')?.textContent).toContain('Sources and acknowledgements');
  await expect(app.open(countriesHref())).rejects.toThrow('Could not load the data');
  expect(document.querySelectorAll('main p.status.error')).toHaveLength(1);
  await app.open(sourcesHref());
  expect(owners()).toBe(before);
});
