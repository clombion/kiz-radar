// The Solid pieces an h() view holds (mount.tsx held) in a part it draws again while it shows: each draw's pieces are
// taken away when the part is drawn again, so the roots of the page's owner stay as many as one draw holds, however
// often the visitor draws it again: the Map's panel (its cards), the friends' list (who goes, On now), and a
// community's page (a trip row's line of who goes, the agenda a step of the months draws, a day's words). On 1 November
// 2026, with a community beside the fixture's in which Tonje only may go to KUOF (a tag the lines of who goes and the
// days hold) and Ola, added, goes to Paris and Albania (two periods of the months, each with a trip).
import { DEV } from 'solid-js';
import { expect, test } from 'vitest';
import { page } from '../../site/owner.ts';
import { friendsHref, mapHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { ALBANIA, KUOF, PARIS } from './community.fixture.ts';
import { community } from './planted.ts';
import { COMM } from './seen.ts';

const REDRAWN = 'maybe-and-two-periods';
const ola = [PARIS, ALBANIA].map((e) => ['Ola', e] as const);
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => community(db, REDRAWN, { maybe: [['Tonje', KUOF]], added: ola }),
});
const main = () => document.querySelector('main');
// the roots the page's owner holds (Solid's development build, the tests', carries DEV)
const roots = () => {
  if (DEV === undefined || page === null) throw new Error("no development build of Solid, or no page's owner");
  return DEV.getChildren(page).length;
};
// The roots held after each of three draws of the same part, each draw done by `draw`: the same each time.
async function drawnAlike(draw: () => void | Promise<void>): Promise<void> {
  const counts: number[] = [];
  for (const _ of [1, 2, 3]) {
    await draw();
    counts.push(roots());
  }
  expect(counts).toEqual(counts.map(() => counts[0]));
}
// the page's element of the selector, of a class, which it must have
function one<E extends HTMLElement>(selector: string, of: new () => E): E {
  const found = main()?.querySelector(selector);
  if (!(found instanceof of)) throw new Error(`the page has no ${selector}`);
  return found;
}

test('the Map’s panel drawn again holds the cards of its last draw alone', async () => {
  await app.open(mapHref());
  const search = one('input[type="search"]', HTMLInputElement);
  await drawnAlike(async () => {
    const panel = one('.panel-cards', HTMLElement);
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await expect.poll(() => panel.isConnected).toBe(false);
  });
});

test('the friends’ list drawn again holds the pieces of its last draw alone', async () => {
  await app.open(friendsHref({ q: 'k' }));
  const search = one('input.mini-search', HTMLInputElement);
  await drawnAlike(() => {
    search.value = 'k';
    search.dispatchEvent(new Event('input'));
  });
  expect(main()?.querySelectorAll('.who-list li').length).toBeGreaterThan(0);
});

test('a trip row’s line of who goes, drawn again as the row opens and closes, holds its last tags alone', async () => {
  await app.open(COMM(REDRAWN));
  // KUOF's row, closed: who goes, Tonje's maybe tagged
  const row = [...(main()?.querySelectorAll<HTMLElement>('.trip') ?? [])].find((t) => t.textContent.includes('KUOF'));
  const toggle = row?.querySelector<HTMLElement>('.trip-toggle');
  if (row === undefined || toggle == null) throw new Error('the community’s page has no row of KUOF');
  await drawnAlike(() => {
    toggle.click();
    toggle.click();
  });
  expect(row.querySelector('.trip-who .plan-tag.unsure')).not.toBeNull();
});

test('the agenda a step of the months draws again holds its last rosters and cards alone', async () => {
  await app.open(COMM(REDRAWN));
  const steps = () => [...(main()?.querySelectorAll<HTMLElement>('.days-step') ?? [])];
  await drawnAlike(() => {
    steps().at(-1)?.click();
    steps()[0]?.click();
  });
  expect(main()?.querySelector('.agenda .gantt')).not.toBeNull();
});

test('a day’s words, drawn again for each day the pointer passes over, hold their last day’s tags alone', async () => {
  await app.open(COMM(REDRAWN));
  const days = [...(main()?.querySelectorAll<HTMLElement>('[data-day]') ?? [])];
  expect(days.length).toBeGreaterThan(1);
  await drawnAlike(() => {
    for (const day of days) day.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  expect(main()?.querySelector('.day-pop')?.textContent).not.toBe('');
});
