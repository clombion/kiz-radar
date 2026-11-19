// The update over: the page started with the tab's entry of when it first found the site mid-update (seeded, as a
// reload keeps it: reload.ts), on a database that loads.
import { expect, test } from 'vitest';
import { startSite } from './app.ts';
import { UPDATING_SINCE } from './reload.ts';

await startSite({ now: UPDATING_SINCE.at, storage: { session: { [UPDATING_SINCE.key]: UPDATING_SINCE.value } } });

test('once the site loads whole, the next update starts its own count', async () => {
  // the entry is cleared once the data is in, which the start does not wait for
  await expect.poll(() => sessionStorage.getItem(UPDATING_SINCE.key)).toBeNull();
});
