// The review page of a writer whose token is kept on this device, with the day it expires, and for the tab: Forget in
// its dialog leaves the page read-only and clears the token and the day from the page's storage, as a reload finds it.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { AS_WRITER, KEPT, WRITER, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, said, theItem, tokenDialog } from './seen.ts';

const app = await startReview({
  ...AS_WRITER,
  storage: { ...WRITER.storage, session: { [KEPT.token]: WRITER.token } },
});

test('Forget leaves the page read-only and keeps neither the token nor the day it expires', async () => {
  await app.open('#contested/1');
  await expect.poll(accessSays).toBe(WRITING);
  expect(choicesOf(theItem())).toHaveLength(2);

  const dlg = tokenDialog();
  buttonOf(dlg, 'Forget').click();
  expect(said(dlg.querySelector('[role="status"]'))).toBe('Forgotten: the page is read-only.');
  expect(accessSays()).toBe('Read-only · add a token');
  expect(choicesOf(theItem())).toEqual([]);
  // nothing a reload would find: the token neither for the tab nor on the device, nor the day it expires
  expect([
    sessionStorage.getItem(KEPT.token),
    localStorage.getItem(KEPT.token),
    localStorage.getItem(KEPT.expires),
  ]).toEqual([null, null, null]);
  buttonOf(dlg, 'Close').click();
  expect(document.querySelector('dialog[open]')).toBeNull();
});
