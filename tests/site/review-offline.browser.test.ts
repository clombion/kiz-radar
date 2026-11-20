// The review page of a writer when GitHub goes out of reach, each request to it then failing on the network as a fetch
// does: their token, checked again from the dialog, leaves the page checking it, said once, as before.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { expectConsole } from './console.ts';
import { AS_WRITER, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, said, theItem, tokenDialog } from './seen.ts';

const app = await startReview(AS_WRITER);
// GitHub out of reach, for the test that calls it
const unreachable = () => {
  app.answer(() => {
    throw new TypeError('Failed to fetch');
  });
};

test('a token checked while GitHub is out of reach leaves the page checking it, and says so once', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  unreachable();
  expectConsole('error', /^Kiz Radar: checking the token: TypeError: Failed to fetch$/u);
  const dlg = tokenDialog();
  buttonOf(dlg, 'Check and keep').click(); // the token kept, the field empty
  await expect.poll(() => document.querySelectorAll('[role="alert"]').length).toBe(1);
  expect([accessSays(), said(dlg.querySelector('[role="status"]')), choicesOf(theItem())]).toEqual([
    'Checking the token…',
    'Asking GitHub…',
    [],
  ]);
});
