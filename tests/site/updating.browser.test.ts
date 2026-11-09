// The page in place of a view while the site is mid-update (site/updating.ts): it says how long that takes and counts
// down to a reload, and past a quarter of an hour it stops trying.
import { afterEach, expect, test, vi } from 'vitest';
import { updated, updatingPage } from '../../site/updating.ts';

const SINCE = 'kiz-radar-updating-since';

afterEach(() => {
  vi.useRealTimers();
  updated();
});

test('mid-update the page says how long it takes and counts down to loading again', () => {
  vi.useFakeTimers();
  const root = document.createElement('div');
  updatingPage(root);
  expect(root.querySelector('h1')?.textContent).toBe('Kiz Radar is being updated');
  expect(root.textContent).toContain('up to ten minutes');
  expect(root.textContent).toContain('in 60 seconds');
  vi.advanceTimersByTime(59_000);
  expect(root.textContent).toContain('in 1 second.');
  expect(sessionStorage.getItem(SINCE)).not.toBeNull(); // when it started, which a reload keeps
});

test('past a quarter of an hour it no longer blames the update, nor loads again by itself', () => {
  vi.useFakeTimers();
  sessionStorage.setItem(SINCE, String(Date.now() - 16 * 60_000));
  const root = document.createElement('div');
  updatingPage(root);
  expect(root.querySelector('h1')?.textContent).toBe('Kiz Radar could not load');
  expect(vi.getTimerCount()).toBe(0);
  updated();
  expect(sessionStorage.getItem(SINCE)).toBeNull();
});
