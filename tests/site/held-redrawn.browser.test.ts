// What a view draws again while it shows goes with the draw before, so the page holds as much after each draw as after
// one, however often the visitor draws it again. In an h() view, the Solid pieces it holds (mount.tsx held), each a
// root of the page's owner: the Map's panel (its cards), the friends' list (who goes, On now), and a community's page
// (a trip row's line of who goes, the agenda a step of the months draws, a day's words). In a Solid view, every owner
// under the page's (each draw an owner of the view's root, and what it draws owners of it): Countries' order. On 1
// November 2026, with a community beside the fixture's in which Tonje only may go to KUOF (a tag the lines of who goes
// and the days hold) and Ola, added, goes to Paris and Albania (two periods of the months, each with a trip).
import { DEV } from 'solid-js';
import { expect, test } from 'vitest';
import { page } from '../../site/owner.ts';
import { countriesHref, friendsHref, mapHref } from '../../site/routes.ts';
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
// every owner under the page's, however deep
const owners = () => {
  if (DEV === undefined || page === null) throw new Error("no development build of Solid, or no page's owner");
  const { getChildren } = DEV;
  let n = 0;
  for (const seen = [page]; seen.length > 0;) {
    const children = getChildren(seen.pop() ?? page);
    n += children.length;
    seen.push(...children);
  }
  return n;
};
// What the page holds (count, the roots of the page's owner unless said) after each of three draws of the same part,
// each draw done by `draw`: the same each time; and each a draw, the element of the part `drawn` finds before it gone
// after it.
async function drawnAlike(
  drawn: () => Element | null | undefined,
  draw: () => void | Promise<void>,
  count = roots,
): Promise<void> {
  const counts: number[] = [];
  for (const _ of [1, 2, 3]) {
    const before = drawn();
    if (before == null) throw new Error('the page has no part to draw again');
    await draw();
    expect(before.isConnected).toBe(false);
    counts.push(count());
  }
  expect(counts).toEqual(counts.map(() => counts[0]));
}
// the page's element of the selector, of a class, which it must have
function one<E extends HTMLElement>(selector: string, of: new () => E): E {
  const found = main()?.querySelector(selector);
  if (!(found instanceof of)) throw new Error(`the page has no ${selector}`);
  return found;
}

test('Countries’ order buttons drawn again on a choice hold the owners of their last draw alone', async () => {
  await app.open(countriesHref());
  const order = () => [...(main()?.querySelectorAll<HTMLElement>('.seg button') ?? [])];
  await drawnAlike(
    () => main()?.querySelector('.seg button'),
    () => {
      order()[1]?.click();
      order()[0]?.click();
    },
    owners,
  );
  expect(main()?.querySelectorAll('.country-row').length).toBeGreaterThan(0);
});

test('the Map’s panel drawn again holds the cards of its last draw alone', async () => {
  await app.open(mapHref());
  const search = one('input[type="search"]', HTMLInputElement);
  await drawnAlike(
    () => main()?.querySelector('.panel-cards'),
    async () => {
      const panel = one('.panel-cards', HTMLElement);
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await expect.poll(() => panel.isConnected).toBe(false);
    },
  );
});

test('the friends’ list drawn again holds the pieces of its last draw alone', async () => {
  await app.open(friendsHref({ q: 'k' }));
  const search = one('input.mini-search', HTMLInputElement);
  await drawnAlike(
    () => main()?.querySelector('.who-rows'),
    () => {
      search.value = 'k';
      search.dispatchEvent(new Event('input'));
    },
  );
  expect(main()?.querySelectorAll('.who-list li').length).toBeGreaterThan(0);
});

test('a trip row’s line of who goes, drawn again as the row opens and closes, holds its last tags alone', async () => {
  await app.open(COMM(REDRAWN));
  // KUOF's row, closed: who goes, Tonje's maybe tagged
  const row = [...(main()?.querySelectorAll<HTMLElement>('.trip') ?? [])].find((t) => t.textContent.includes('KUOF'));
  const toggle = row?.querySelector<HTMLElement>('.trip-toggle');
  if (row === undefined || toggle == null) throw new Error('the community’s page has no row of KUOF');
  await drawnAlike(
    () => row.querySelector('.trip-who > *'),
    () => {
      toggle.click();
      toggle.click();
    },
  );
  expect(row.querySelector('.trip-who .plan-tag.unsure')).not.toBeNull();
});

test('the agenda a step of the months draws again holds its last rosters and cards alone', async () => {
  await app.open(COMM(REDRAWN));
  const steps = () => [...(main()?.querySelectorAll<HTMLElement>('.days-step') ?? [])];
  await drawnAlike(
    () => main()?.querySelector('.agenda .gantt'),
    () => {
      steps().at(-1)?.click();
      steps()[0]?.click();
    },
  );
  expect(main()?.querySelector('.agenda .gantt')).not.toBeNull();
});

test('a day’s words, drawn again for each day the pointer passes over, hold their last day’s tags alone', async () => {
  await app.open(COMM(REDRAWN));
  const days = [...(main()?.querySelectorAll<HTMLElement>('[data-day]') ?? [])];
  expect(days.length).toBeGreaterThan(1);
  const passed = () => {
    for (const day of days) day.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  };
  passed();
  await drawnAlike(() => main()?.querySelector('.day-pop > *'), passed);
  expect(main()?.querySelector('.day-pop')?.textContent).not.toBe('');
});
