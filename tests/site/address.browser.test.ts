// The router follows the address as one signal (site/address.ts), in an effect whose first run shows the view the page
// starts at where the page is, and whose later runs, each a move of the address, show a new page as a page load does:
// its top in view and the focus at its start.
import { expect, test } from 'vitest';
import { festivalsHref, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';

const app = await startSite({ now: '2026-11-01', route: sourcesHref() });
// what the page shows, and where the focus is, once it has drawn the view it started at, before any test moves them
const arrived = { shown: document.querySelector('main')?.textContent, focus: document.activeElement };

test('the view the page starts at takes no focus', () => {
  expect(arrived.shown).toContain('Sources and acknowledgements');
  expect(arrived.focus).not.toBe(document.querySelector('main'));
});

test('a move of the address scrolls up to the new view and gives it the focus', async () => {
  const spacer = document.body.appendChild(document.createElement('div'));
  spacer.style.height = `${3 * innerHeight}px`;
  scrollTo(0, innerHeight);
  expect(scrollY).toBeGreaterThan(0);
  await app.open(festivalsHref());
  expect([scrollY, document.activeElement === document.querySelector('main')]).toEqual([0, true]);
  spacer.remove();
});
