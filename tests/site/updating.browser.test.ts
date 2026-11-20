// The page a visitor gets while the site is mid-update for them (updating.tsx): it says how long an update takes and
// counts down to loading again, and keeps when it first found the site so, which a reload keeps (updating-late and
// updating-over read it).
import { expect, test, vi } from 'vitest';
import { startMidUpdate, UPDATING_SINCE, updatingSays } from './reload.ts';

const page = await startMidUpdate({ now: UPDATING_SINCE.at });

test('mid-update the page says how long it takes and counts down to loading again', async () => {
  expect(updatingSays().heading).toBe('Kiz Radar is being updated');
  expect(await page.again()).toBe(1); // its countdown
  const { heading, words } = updatingSays();
  expect(heading).toBe('Kiz Radar is being updated');
  expect(words).toContain('up to ten minutes');
  expect(words).toContain('This page loads again by itself in 60 seconds.');
  vi.advanceTimersByTime(59_000);
  expect(updatingSays().words).toContain('This page loads again by itself in 1 second.');
  // when it first found the site mid-update, which a reload keeps: the instant the page started on
  expect(sessionStorage.getItem(UPDATING_SINCE.key)).toBe(UPDATING_SINCE.value);
});

test('drawn anew, the page counts its own minute: the countdown of the page before is gone with it', async () => {
  expect(await page.again()).toBe(1);
  vi.advanceTimersByTime(45_000);
  expect(updatingSays().words).toContain('This page loads again by itself in 15 seconds.');
  // the view opened again 45 seconds on, which draws the page anew under the same timers: one countdown, the new
  // page's, from a minute, counted before the first page's minute is up (which would reload this test's page), and on
  // past it
  await page.at(new Date(UPDATING_SINCE.at.getTime() + 45_000));
  expect(vi.getTimerCount()).toBe(1);
  expect(updatingSays().words).toContain('This page loads again by itself in 60 seconds.');
  vi.advanceTimersByTime(59_000);
  expect(updatingSays().words).toContain('This page loads again by itself in 1 second.');
});
