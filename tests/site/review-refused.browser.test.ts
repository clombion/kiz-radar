// The review page in a browser that refuses storage (a private window, the site's data blocked: app.ts's 'refused'):
// a token pasted in its dialog, which GitHub names its owner for, unlocks the choices and is held for the page alone
// (kept.ts), a claim written with it, the item kept as settled for the page too, and nothing said to have gone wrong.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { AT, github, REVIEW, writes } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, pasteToken, said, theItem, tokenDialog } from './seen.ts';

const TOKEN = 'github_pat_held_for_the_page';
const app = await startReview({ now: AT, review: REVIEW, storage: 'refused', elsewhere: github({ token: TOKEN }) });

// what reaching a storage throws: its name, or none
function refusal(reach: () => Storage): string | null {
  try {
    reach();
  } catch (e) {
    return e instanceof DOMException ? e.name : String(e);
  }
  return null;
}

test("the helper's refused storage throws a SecurityError when the page reaches either", () => {
  expect([refusal(() => localStorage), refusal(() => sessionStorage)]).toEqual(['SecurityError', 'SecurityError']);
});

test('with storage refused, a token pasted that GitHub names its owner for unlocks the choices, writes as held, and the item settles', async () => {
  await app.open('#contested/1');
  expect(accessSays()).toBe('Read-only · add a token');
  expect(choicesOf(theItem())).toEqual([]);

  const dlg = tokenDialog();
  await pasteToken(dlg, TOKEN);
  buttonOf(dlg, 'Close').click();
  expect(choicesOf(theItem())).not.toEqual([]);
  // a claim written with the token the page reads again as it writes: the one held, as no storage keeps it
  const from = app.asked.length;
  buttonOf(theItem(), 'Angola').click();
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(() => writes(app.asked, from).map(({ auth }) => auth)).toEqual([`Bearer ${TOKEN}`]);
  // settled for the page, as storage would keep it until the next build
  await expect.poll(() => said(document.querySelector('main'))).toContain('1 open, 1 settled since the build');
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
});
