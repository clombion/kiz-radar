// The review page of a writer who settles an item: a home is written as the claims repository's file named by its
// digest, the page moves to the next open item, and the item is kept as settled since the build, as a reload keeps it
// (review-kept reads it on a fresh page).
import { expect, test } from 'vitest';
import { claimText, homeClaim } from '../../site/claims.ts';
import { startReview } from './app.ts';
import { REVIEW_ROUTE, REVIEW_SETTLED } from './reload.ts';
import { AS_WRITER, AT, claimed, writes, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, said, theItem } from './seen.ts';

const app = await startReview(AS_WRITER);

test('a home is written at its digest, said on its button, kept as settled, and the next open item follows', async () => {
  await app.open('#contested/1');
  await expect.poll(accessSays).toBe(WRITING);
  const from = app.asked.length;
  buttonOf(theItem(), 'Angola').click();
  const note = theItem().querySelector('input[aria-label="Why"]');
  expect(note instanceof HTMLInputElement ? note.value : null).toBe('Ana: from Angola, as 2 line-ups state');
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(() => said(theItem().querySelector('h2'))).toBe('Bo');
  expect(said(theItem())).toContain('2 of 2');
  expect(said(document.querySelector('main'))).toContain('1 open, 1 settled since the build');
  expect(location.hash).toBe(REVIEW_ROUTE);
  const text = claimText(homeClaim('p:ana', 'AO', 'Ana: from Angola, as 2 line-ups state', AT));
  expect(writes(app.asked, from)).toEqual([await claimed(text)]);
  // what a reload keeps: the build and the item settled since
  expect(localStorage.getItem(REVIEW_SETTLED.key)).toBe(REVIEW_SETTLED.value);
});
