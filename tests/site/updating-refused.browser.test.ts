// The page mid-update in a browser that refuses storage (app.ts's 'refused'): it cannot keep when it first found the
// site so (updating.ts), and still says how long an update takes and counts down to loading again.
import { expect, test } from 'vitest';
import { startMidUpdate, UPDATING_SINCE, updatingSays } from './reload.ts';

const page = await startMidUpdate({ now: UPDATING_SINCE.at, storage: 'refused' });

test('with storage refused, the page mid-update still counts down to loading again', async () => {
  expect(await page.again()).toBe(1);
  const { heading, words } = updatingSays();
  expect(heading).toBe('Kiz Radar is being updated');
  expect(words).toContain('This page loads again by itself in 60 seconds.');
});
