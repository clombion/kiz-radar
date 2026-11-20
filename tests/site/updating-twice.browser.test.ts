// The page mid-update (updating.tsx) drawn once when two find the site so at once: the start, and the view the page
// opens on, which waits for the data (Artists). One page, one countdown.
import { expect, test, vi } from 'vitest';
import { artistsHref } from '../../site/routes.ts';
import { startMidUpdate, UPDATING_SINCE, updatingSays } from './reload.ts';

// the countdowns the page sets, its intervals of a second, from before it starts (a spy's calls are cleared as each
// test starts, so the spy keeps them itself)
const countdowns: unknown[] = [];
const interval = globalThis.setInterval;
vi.spyOn(globalThis, 'setInterval').mockImplementation((handler, ms, ...args) => {
  if (ms === 1000) countdowns.push(handler);
  return interval(handler, ms, ...args);
});
await startMidUpdate({ now: UPDATING_SINCE.at, route: artistsHref() });

test('found mid-update by the start and by the view at once, the page is drawn once, with one countdown', async () => {
  await vi.waitUntil(() => updatingSays().heading !== undefined);
  expect(updatingSays().heading).toBe('Kiz Radar is being updated');
  expect(document.querySelectorAll('main section')).toHaveLength(1);
  expect(countdowns).toHaveLength(1);
});
