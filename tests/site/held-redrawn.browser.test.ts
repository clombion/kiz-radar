// The Solid pieces an h() view holds (mount.tsx held) in a part it draws again while it shows: each draw's pieces are
// taken away when the part is drawn again, so the roots of the page's owner stay as many as one draw holds, however
// often the visitor draws it again: the Map's panel (its cards). On 1 November 2026, the page started on the Map.
import { DEV } from 'solid-js';
import { expect, test } from 'vitest';
import { page } from '../../site/owner.ts';
import { mapHref } from '../../site/routes.ts';
import { startSite } from './app.ts';

const app = await startSite({ now: '2026-11-01', route: mapHref() });
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
