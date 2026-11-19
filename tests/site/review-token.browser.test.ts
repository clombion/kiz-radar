// The review page that found a token GitHub refuses: read-only, saying why; a token pasted in its dialog, which GitHub
// names its owner for, unlocks the choices, and is kept for the tab alone (review-kept reads it on a fresh page).
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { CLAIMS_TOKEN } from './reload.ts';
import { AT, github, REVIEW } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, onDeviceBox, pasteToken, said, theItem, tokenDialog } from './seen.ts';

const app = await startReview({
  now: AT,
  review: REVIEW,
  storage: { session: { [CLAIMS_TOKEN.key]: 'an expired token' } },
  elsewhere: github({ token: CLAIMS_TOKEN.value }),
});

test('a token GitHub refuses leaves the page read-only; one pasted that it names its owner for unlocks the choices', async () => {
  await app.open('#contested/1');
  await expect.poll(accessSays).toBe('Read-only · token refused');
  expect(choicesOf(theItem())).toEqual([]);
  expect(said(theItem())).toContain('GitHub refused this token: it is mistyped, expired or revoked.');

  const dlg = tokenDialog();
  const onDevice = onDeviceBox(dlg);
  expect(said(onDevice.closest('label'))).toBe('Keep it on this device (otherwise for this tab only)');
  expect(onDevice.checked).toBe(false);
  const from = app.asked.length;
  await pasteToken(dlg, CLAIMS_TOKEN.value);
  expect(
    app.asked
      .slice(from)
      .filter(({ url }) => url.href === 'https://api.github.com/user')
      .map(({ init }) => new Headers(init.headers).get('Authorization')),
  ).toEqual([`Bearer ${CLAIMS_TOKEN.value}`]);
  expect(choicesOf(theItem())).toHaveLength(2);
  // kept for the tab, as a reload keeps it, and not on the device
  expect([sessionStorage.getItem(CLAIMS_TOKEN.key), localStorage.getItem(CLAIMS_TOKEN.key)]).toEqual([
    CLAIMS_TOKEN.value,
    null,
  ]);
  buttonOf(dlg, 'Close').click();
  expect(document.querySelector('dialog[open]')).toBeNull();
});
