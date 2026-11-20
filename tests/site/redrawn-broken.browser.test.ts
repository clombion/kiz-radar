// A part a Solid view draws again as the visitor changes it (mount.tsx Redrawn) that throws: on a later draw, the throw
// is said once, as the page's, as a throw in an h() view's listener was, and the view works on, its part drawn again
// on the next change; as the view is first drawn, the view says it cannot be shown, as guarded did. The Friends tab on
// 1 November 2026, its list to three months, then a year: Cloudkiz, from 26 February, comes in, its last day planted
// as a day no month has, which its row's days read as it is drawn.
import { expect, test } from 'vitest';
import { friendsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { CLOUDKIZ } from './community.fixture.ts';
import { expectConsole } from './console.ts';
import { unreadable } from './planted.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    unreadable(db, `UPDATE events SET end_date = '2027-13-01' WHERE id = ${CLOUDKIZ}`);
  },
});
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
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(listed()).toEqual([]);
  expect(count()).toMatch(/^\d+ festivals$/u); // the bar's count drawn, a year keeping them all
  chosen(1); // three months again
  expect(listed()).toEqual(months);
  expect(document.querySelector('main')?.textContent).not.toContain('This page could not be shown');
});

test('a list that throws as its view is first drawn is the view’s, said in its place', async () => {
  expectConsole('error', /^Kiz Radar: friends: RangeError/u);
  await expect(app.open(friendsHref())).rejects.toThrow('This page could not be shown');
});
