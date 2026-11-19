// A Solid view that throws while it builds says so in its place, as an h() view does (broken.browser.test.ts), within
// its error boundary (site/mount.tsx): Solid is not halted, so the page goes on following its address. The page
// started (app.ts) on one bad row, a festival with a feature no state has, which reading the festivals refuses.
import { expect, test } from 'vitest';
import { EXPLORE, sourcesHref, TABS } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';

const week = EXPLORE.find(([k]) => k === 'week')?.[2] ?? '';
const app = await startSite({
  now: '2026-11-21',
  route: sourcesHref(),
  plant: (db) => {
    db.exec("PRAGMA ignore_check_constraints = ON; UPDATE event_stats SET features = 'planted'");
  },
});
const main = () => document.querySelector('main')?.textContent;

test('a Solid view that throws says so in its place, and the page around it goes on', async () => {
  // report.ts's words, in the console once a showing, naming the view; Solid's own REACTIVITY_HALTED would be undeclared
  expectConsole('error', /^Kiz Radar: week: TypeError: column features: "planted" is no feature state$/u, 2);
  await expect(app.open(week)).rejects.toThrow('This page could not be shown');
  expect(main()).toContain('"planted" is no feature state');
  expect(document.querySelectorAll('nav.tabs a')).toHaveLength(TABS.length);
  // the address still moves the page: another view, then this one again, which says it again
  await app.open(sourcesHref());
  expect(main()).toContain('Sources and acknowledgements');
  await expect(app.open(week)).rejects.toThrow('This page could not be shown');
});
