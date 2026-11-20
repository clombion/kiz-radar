// The seam between main.ts and a view (site/mount.tsx; the shell's parts are drawn through placed.tsx, and
// stay), through the page: This week, a Solid view, drawn into the root the page hands every view, with its cards
// (eventcard.tsx's) inside it, and taken away when the visitor leaves; and the Festivals page's cards, owners under the
// page's while it shows (a list drawn again is drawn-again.browser.test.ts's).
import { expect, test } from 'vitest';
import { EXPLORE, festivalsHref, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { owners, roots } from './owned.ts';

const week = EXPLORE.find(([k]) => k === 'week')?.[2] ?? '';
// the fixture's festival of the week of 21 November (KUOF, 20–22 November)
const app = await startSite({ now: '2026-11-21', route: week });
const main = () => document.querySelector('main');

test('This week is drawn into the root the page hands it, its cards inside it', () => {
  const section = main()?.querySelector(':scope > div > section');
  expect(section?.querySelector('header.page-intro h1')?.textContent).toBe('This week');
  const cards = [...(section?.querySelectorAll('.festival-cards > .festival-card') ?? [])].map((c) => c.textContent);
  expect(cards.some((card) => card.includes('KUOF – Kizomba & Urban Kiz Oslo Festival'))).toBe(true);
});

test('a Solid view left is disposed: the root it was drawn in is emptied, and it is drawn anew on return', async () => {
  await app.open(week);
  const root = main()?.querySelector(':scope > div');
  expect(root?.querySelector('section')).not.toBeNull();
  await app.open(sourcesHref());
  expect(root?.isConnected).toBe(false);
  expect(root?.childNodes).toHaveLength(0);
  await app.open(week);
  const again = main()?.querySelector(':scope > div');
  expect(again).not.toBe(root);
  expect(again?.querySelector('section h1')?.textContent).toBe('This week');
});

// Every view is a Solid view, each drawn in a root of its own under the page's owner (one made outside any owner Solid
// refuses, which fails the other tests here): the page holds as many roots on any view, the root of the view left gone
// with it, never one left behind.
test("the page holds as many roots on any view: a Solid view's root goes when the view is left", async () => {
  await app.open(sourcesHref());
  const before = roots();
  await app.open(week);
  expect(roots()).toBe(before);
  await app.open(sourcesHref());
  expect(roots()).toBe(before);
});

test("the cards a Solid view draws are owners under the page's until the view is left", async () => {
  await app.open(sourcesHref());
  const before = owners();
  await app.open(festivalsHref());
  const cards = main()?.querySelectorAll('.festival-card').length ?? 0;
  expect(cards).toBeGreaterThan(0);
  expect(owners()).toBeGreaterThan(before + cards);
  await app.open(sourcesHref());
  expect(owners()).toBe(before);
});
