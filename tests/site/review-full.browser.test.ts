// The review page in a browser whose storage is full (app.ts's `full`: it reads what it holds, and refuses a value
// set), with an old token kept on this device: a new token pasted with "Keep it on this device" ticked, which the
// device refuses, is the one the page writes with, held for the page (kept.ts); the device keeps no token then, which
// the box says.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { AT, github, KEPT, REVIEW, writes } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, onDeviceBox, pasteToken, theItem, tokenDialog } from './seen.ts';

const OLD = 'github_pat_kept_before';
const NEW = 'github_pat_the_device_refuses';
const app = await startReview({
  now: AT,
  review: REVIEW,
  storage: { local: { [KEPT.token]: OLD }, full: true },
  elsewhere: github({ token: NEW }),
});

test("the helper's full storage reads what it holds and refuses a value set with a QuotaExceededError", () => {
  expect(localStorage.getItem(KEPT.token)).toBe(OLD);
  let refused: unknown = null;
  try {
    sessionStorage.setItem('a key', 'a value');
  } catch (e) {
    refused = e;
  }
  expect(refused instanceof DOMException ? refused.name : refused).toBe('QuotaExceededError');
  expect(sessionStorage.getItem('a key')).toBeNull();
});

test('a new token the full device refuses is the one the page writes with, and the box says the device keeps none', async () => {
  await app.open('#contested/1');
  await expect.poll(accessSays).toBe('Read-only · token refused');

  const dlg = tokenDialog();
  const onDevice = onDeviceBox(dlg);
  // the old token is on the device
  expect(onDevice.checked).toBe(true);
  await pasteToken(dlg, NEW);
  expect(onDevice.checked).toBe(false);
  buttonOf(dlg, 'Close').click();

  expect(choicesOf(theItem())).not.toEqual([]);
  const from = app.asked.length;
  buttonOf(theItem(), 'Angola').click();
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(() => writes(app.asked, from).map(({ auth }) => auth)).toEqual([`Bearer ${NEW}`]);
  // the old token is no longer what a reload would find
  expect(localStorage.getItem(KEPT.token)).toBeNull();
});
