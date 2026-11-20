// The review page drawn anew on each change, holding the owners of its last draw alone however often it is drawn
// (owned.ts): moving between items, typing in the rail's search, the token checked again from the dialog, and an artist
// picked to join and let go, each draw's item, rail or side gone with the next draw; and what is drawn once, never
// changed in place, holds no owner of its own (a row of the rail the list's alone, a city's card none).
import { expect, onTestFinished, test } from 'vitest';
import { startReview } from './app.ts';
import { drawnAlike, owners } from './owned.ts';
import { AS_WRITER, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, keyed, reviewed, theItem, tokenDialog } from './seen.ts';

const app = await startReview(AS_WRITER);
// a field of the page, typed in as a visitor types (a script's input event, which does not bubble)
function typed(field: Element | null | undefined, words: string): void {
  if (!(field instanceof HTMLInputElement)) throw new Error(`no field to type ${words} in`);
  field.value = words;
  field.dispatchEvent(new Event('input'));
}
const rail = () => document.querySelector('aside[aria-label="Every item"] input[aria-label="Find"]');
// the rail's search emptied however the test ends, as the page keeps it while the tab stays
function emptiedAtEnd(): void {
  onTestFinished(() => {
    const field = rail();
    if (field instanceof HTMLInputElement && field.value !== '') typed(field, '');
  });
}

test('moving between items holds the owners of the last draw alone', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  await app.open('#contested/1');
  // to the other item and back, each round on the item it started on
  await drawnAlike(theItem, () => {
    keyed('ArrowRight');
    keyed('ArrowRight');
  });
  expect(location.hash).toBe('#contested/1');
});

test("typing in the rail's search holds the owners of the last draw alone", async () => {
  await app.open('#contested/1');
  emptiedAtEnd();
  await drawnAlike(
    () => rail()?.closest('aside')?.querySelector('li'),
    () => {
      typed(rail(), 'a');
    },
  );
  expect(rail()?.closest('aside')?.querySelectorAll('li')).toHaveLength(1); // Ana's row alone
});

test('the token checked again from the dialog holds the owners of the last draw alone', async () => {
  await app.open('#merges/1');
  const dlg = tokenDialog();
  await drawnAlike(theItem, async () => {
    buttonOf(dlg, 'Check and keep').click();
    await expect.poll(accessSays).toBe(WRITING);
  });
});

test('an artist picked to join and let go holds the owners of the last draw alone', async () => {
  await app.open('#join/1');
  await drawnAlike(
    () => reviewed().querySelector('article'),
    () => {
      typed(reviewed().querySelector('input[type="search"]'), 'kwenda');
      buttonOf(reviewed(), 'Kwenda Lima').click();
      buttonOf(reviewed(), 'Choose another').click();
    },
  );
  expect(reviewed().querySelectorAll('input[type="search"]')).toHaveLength(2);
});

test("a row of the rail holds one owner, the list's, and a city's card none", async () => {
  await app.open('#contested/1');
  emptiedAtEnd();
  const both = owners();
  typed(rail(), 'an'); // Ana's row alone
  const one = owners();
  typed(rail(), '');
  await app.open('#cities/1'); // two cities
  const cities = owners();
  await app.open('#timeline/1'); // no step and no read
  expect([both - one, cities - owners()]).toEqual([1, 0]);
});
