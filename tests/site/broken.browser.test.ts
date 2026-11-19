// A view that throws while it builds says so in its place, and the page around it stays: the page started (app.ts)
// on one bad row, an artist of a kind no state has, which reading the artists refuses.
import { expect, test } from 'vitest';
import { artistsHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => db.exec("PRAGMA ignore_check_constraints = ON; UPDATE artists SET kind = 'planted'"),
});

test('a view that throws while it builds says so in its place, and the page around it stays', async () => {
  // the helper refuses a page that says it failed, with its words
  await expect(app.open(artistsHref({ q: 'a' }))).rejects.toThrow('This page could not be shown');
  const main = document.querySelector('main')?.textContent;
  expect(main).toContain('This page could not be shown');
  expect(main).toContain('"planted" is no artist_kind state');
  expect(document.querySelectorAll('nav.tabs a')).toHaveLength(TABS.length);
});
