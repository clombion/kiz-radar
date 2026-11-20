// A festival's card whose line-up cannot be read, as it opens (eventcard.tsx's boundary around what it opens to): the
// failure is said once, in the console and in a line, the card opens with nothing in it and closes again, and the page
// goes on, Solid not halted: another card opens and says the same of itself. The page started (app.ts) on every
// festival's line-up holding a role no state has, which only an opened card reads.
import { expect, test } from 'vitest';
import { EXPLORE } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';
import { said } from './seen.ts';

// every festival's line-up, a role no state has (an artist of two roles in one line-up is left one row)
const UNREAD = "PRAGMA ignore_check_constraints = ON; UPDATE OR REPLACE event_artists SET role = 'planted'";
await startSite({
  now: '2026-11-01',
  route: EXPLORE.find(([k]) => k === 'week')?.[2] ?? '',
  plant: (db) => {
    db.exec(UNREAD);
  },
});
const cards = () => [...document.querySelectorAll<HTMLElement>('main .festival-card')];
const lines = () => [...document.querySelectorAll('[role="alert"]')].map(said);
const BROKEN = /^Kiz Radar: opening a card: TypeError: column role: "planted" is no role state$/u;

test('a card whose line-up cannot be read says so once, opens empty, closes, and the next card opens', async () => {
  expectConsole('error', BROKEN, 2);
  const [first, second] = cards();
  const title = (card?: HTMLElement) => card?.querySelector<HTMLElement>('.title-btn');
  if (first === undefined || second === undefined) throw new Error('This week shows fewer than two cards');
  title(first)?.click();
  await expect.poll(() => title(first)?.getAttribute('aria-expanded')).toBe('true');
  await expect
    .poll(lines)
    .toEqual([
      'Something went wrong (opening a card: column role: "planted" is no role state). Reloading the page may help. Close',
    ]);
  const more = first.querySelector<HTMLElement>('.festival-more');
  expect([more?.hidden, more?.childElementCount]).toEqual([false, 0]);
  // the card closes again, and another opens, saying the same of itself once
  title(first)?.click();
  await expect.poll(() => [first.matches('.open'), more?.hidden]).toEqual([false, true]);
  title(second)?.click();
  await expect.poll(() => second.matches('.open')).toBe(true);
  await expect.poll(() => lines().length).toBe(1);
  expect(lines()[0]).toContain('opening a card');
});
