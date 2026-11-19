// The review page with no token: read-only, it shows no choice to make and asks GitHub nothing; the arrow keys move
// between items, the address following; the rail's search stays with its tab; the cities are listed with nothing to
// choose; an empty list says so; and its drawings, the steps between items, are hidden from assistive technology, the
// buttons named by their words.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { CLAIMS_TOKEN, REVIEW_ROUTE } from './reload.ts';
import { AT, github, REVIEW } from './reviewed.ts';
import { accessSays, choicesOf, keyed, reviewed, said, theItem } from './seen.ts';

const app = await startReview({ now: AT, review: REVIEW, elsewhere: github({ token: CLAIMS_TOKEN.value }) });

test('without a token the page is read-only: no choice, no note, no write button', async () => {
  await app.open('#contested/1');
  expect(accessSays()).toBe('Read-only · add a token');
  expect(choicesOf(theItem())).toEqual([]);
  expect(theItem().querySelector('input[aria-label="Why"]')).toBeNull();
  expect(said(theItem())).not.toContain('Write the claim');
  expect(said(theItem())).toContain('add a token');
  // since it started: GitHub is asked only to check a token, and the page has none
  expect(app.asked.filter(({ url }) => url.origin === 'https://api.github.com')).toEqual([]);
});

test('the steps between items are drawn hidden from assistive technology, each button named by its words', async () => {
  await app.open('#contested/1');
  const drawn = [...document.querySelectorAll('svg')];
  expect(
    drawn.map((svg) => [svg.closest('button')?.getAttribute('aria-label'), svg.getAttribute('aria-hidden')]),
  ).toEqual([
    ['Previous item', 'true'],
    ['Next item', 'true'],
  ]);
});

test('the arrow keys move between items, and the address follows', async () => {
  await app.open('#contested/1');
  keyed('ArrowRight');
  // the address a reload keeps: review-kept starts at it
  expect([location.hash, said(theItem().querySelector('h2'))]).toEqual([REVIEW_ROUTE, 'Bo']);
  keyed('ArrowRight');
  expect([location.hash, said(theItem().querySelector('h2'))]).toEqual(['#contested/1', 'Ana']);
});

// the rows of the rail beside the item, as they read
const railRows = (): (string | undefined)[] =>
  [...document.querySelectorAll('aside[aria-label="Every item"] li button')].map((b) => said(b));

test("the rail's search stays with its tab: another tab opened by its address lists all its items", async () => {
  await app.open('#contested/1');
  const find = document.querySelector('aside[aria-label="Every item"] input[aria-label="Find"]');
  if (!(find instanceof HTMLInputElement)) throw new Error('the rail has no search');
  find.value = 'bo';
  find.dispatchEvent(new Event('input'));
  expect(railRows()).toEqual([expect.stringContaining('Bo')]);
  // as back, forward or a pasted link moves it
  await app.open('#merges/1');
  expect(railRows()).toEqual([expect.stringContaining('Abi · DJ Abi')]);
});

test('the cities with no decision of the admin are listed with their festivals and proposal, and nothing to choose', async () => {
  await app.open('#cities/1');
  const link = [...document.querySelectorAll('#queues a')].find((a) => a.getAttribute('href') === '#cities/1');
  expect(said(link)).toBe('Cities 2');
  const [porto, faro] = [...reviewed().querySelectorAll('article')];
  expect(said(porto?.querySelector('h3'))).toBe('🇵🇹 Porto');
  expect(said(porto?.querySelector('p'))).toBe('porto-pt · Portugal · 2 festivals to come');
  expect([...(porto?.querySelectorAll('li') ?? [])].map((li) => said(li))).toEqual(['Porto Kizomba', 'Kiz Gaia']);
  expect(said(porto?.querySelector('p:last-child'))).toBe(
    'Proposed: small (OPO, VGO). OPO 25 min by metro; VGO 1 h 40 by bus',
  );
  expect(said(faro?.querySelector('p:last-child'))).toBe('No proposal yet.');
  expect(reviewed().querySelectorAll('button')).toHaveLength(0);
});

test('a list with nothing in it says so', async () => {
  await app.open('#festivals/1'); // the review's festivals are none
  expect(said(reviewed())).toContain('Nothing waits here.');
});
