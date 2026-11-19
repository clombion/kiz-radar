// The review page as a reload finds it, on a fresh page: the token kept for the tab (review-token's), the item settled
// since the build (review-settle's) and the address of the item shown (review-readonly's), each read on its own.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { CLAIMS_TOKEN, REVIEW_ROUTE, REVIEW_SETTLED } from './reload.ts';
import { AT, github, LOGIN, REVIEW } from './reviewed.ts';
import { accessSays, choicesOf, said, theItem } from './seen.ts';

const app = await startReview({
  now: AT,
  route: REVIEW_ROUTE,
  review: REVIEW,
  storage: {
    session: { [CLAIMS_TOKEN.key]: CLAIMS_TOKEN.value },
    local: { [REVIEW_SETTLED.key]: REVIEW_SETTLED.value },
  },
  elsewhere: github({ token: CLAIMS_TOKEN.value }),
});
// the item the page arrived at, before any test opens another
const arrived = { name: said(theItem().querySelector('h2')), shown: said(theItem()) };
// what an item's row in the rail beside it leads with, by its name: its flag, or ✓ once settled
const railLead = (name: string): string | undefined => {
  const rows = [...document.querySelectorAll('aside[aria-label="Every item"] button')].map((b) => {
    const lead = said(b.querySelector('[aria-hidden="true"]')) ?? '';
    return { lead, name: said(b)?.slice(lead.length) };
  });
  return rows.find((r) => r.name?.startsWith(name) === true)?.lead;
};

test('the item in the address is the one a reload shows', () => {
  expect(arrived).toEqual({ name: 'Bo', shown: expect.stringContaining('2 of 2') });
});

test('the token kept for the tab is checked with GitHub as the page starts, and offers the choices', async () => {
  await expect.poll(accessSays).toBe(`Writing as ${LOGIN}`);
  const user = app.asked.find(({ url }) => url.href === 'https://api.github.com/user');
  expect(new Headers(user?.init.headers).get('Authorization')).toBe(`Bearer ${CLAIMS_TOKEN.value}`);
  // Bo's, the item open (Ana's is settled here, so offers none)
  await app.open(REVIEW_ROUTE);
  expect(choicesOf(theItem())).toEqual(['🇵🇹 Portugal1']);
});

test('the item settled since the build shows so, with nothing to write, whatever the token', async () => {
  await app.open('#contested/1');
  expect(said(theItem())).toContain('✓ Settled since this build: on the site after the next run.');
  expect(choicesOf(theItem())).toEqual([]);
  expect(said(document.querySelector('main'))).toContain('1 open, 1 settled since the build');
  expect(railLead('Ana')).toBe('✓');
  // the other item is open
  expect(railLead('Bo')).toBe('🇵🇹');
  await app.open(REVIEW_ROUTE);
  expect(said(theItem())).not.toContain('Settled since this build');
});
