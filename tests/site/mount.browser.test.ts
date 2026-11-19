// The seam between the h() page and Solid (site/mount.tsx), through the page: This week, a Solid view, drawn into the
// root the page hands every view, with eventcard.ts's cards (h()'s) inside it, and taken away when the visitor leaves.
import { DEV } from 'solid-js';
import { expect, test } from 'vitest';
import { page } from '../../site/owner.ts';
import { EXPLORE, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';

const week = EXPLORE.find(([k]) => k === 'week')?.[2] ?? '';
// the fixture's festival of the week of 21 November (KUOF, 20–22 November)
const app = await startSite({ now: '2026-11-21', route: week });
const main = () => document.querySelector('main');

test('This week is drawn into the root the page hands it, its cards built by h() inside it', () => {
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

// what the page's owner holds: one root while a Solid view shows, none once it is left (Solid's development build,
// the tests', carries DEV)
const held = () => {
  if (DEV === undefined || page === null) throw new Error("no development build of Solid, or no page's owner");
  return DEV.getChildren(page).length;
};

test("a Solid view's root leaves the page's owner when the view is left", async () => {
  await app.open(sourcesHref());
  const before = held();
  await app.open(week);
  expect(held()).toBe(before + 1);
  await app.open(sourcesHref());
  expect(held()).toBe(before);
});
