// The review page's links out, each opening a new tab that gets no hold on the page and no address from it: GitHub's
// page that makes a token (the token dialog's), an artist's page on the site (a home to settle) and a festival's
// ticket page (the festivals waiting for a read). On REVIEW with one festival waiting, its page known.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { AT, REVIEW } from './reviewed.ts';
import { reviewed, theItem, tokenDialog } from './seen.ts';

const waiting = {
  event_id: 7,
  event: 'Lisbon Kiz',
  start: '2026-12-04',
  waits_for: 'its ticket page',
  first_read: '2026-11-01',
  page: 'https://tickets.example/lisbon-kiz',
  to_do: 'read its prices',
};
const app = await startReview({ now: AT, route: '#contested/1', review: { ...REVIEW, festivals: [waiting] } });
// each link to a new tab in el: where it goes, and what it gives the tab
const outOf = (el: Element) =>
  [...el.querySelectorAll('a[target="_blank"]')].map((a) => [a.getAttribute('href'), a.getAttribute('rel')]);

test('each link to a new tab gives it no opener and no referrer', async () => {
  const links = [...outOf(tokenDialog()), ...outOf(theItem())];
  await app.open('#festivals');
  links.push(...outOf(reviewed()));
  expect(links).toEqual([
    ['https://github.com/settings/personal-access-tokens/new', 'noopener noreferrer'],
    [expect.stringMatching(/^\.\/#artists\/\d+$/u), 'noopener noreferrer'],
    ['https://tickets.example/lisbon-kiz', 'noopener noreferrer'],
  ]);
});
