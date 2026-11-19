// The page mid-update a quarter of an hour on: started 16 minutes after the tab first found the site so, its entry
// seeded as a reload keeps it (reload.ts).
import { expect, test } from 'vitest';
import { startMidUpdate, UPDATING_SINCE, updatingSays } from './reload.ts';

const page = await startMidUpdate({
  now: new Date(UPDATING_SINCE.at.getTime() + 16 * 60_000),
  storage: { session: { [UPDATING_SINCE.key]: UPDATING_SINCE.value } },
});

test('past a quarter of an hour it no longer blames the update, nor loads again by itself', async () => {
  expect(updatingSays().heading).toBe('Kiz Radar could not load');
  // drawn again under vi's interval, it sets none
  expect(await page.again()).toBe(0);
  const { heading, words } = updatingSays();
  expect(heading).toBe('Kiz Radar could not load');
  expect(words).not.toContain('loads again by itself');
});
