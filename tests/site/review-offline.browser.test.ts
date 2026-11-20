// The review page of a writer when GitHub goes out of reach, each request to it then failing on the network as a fetch
// does: a country picked shows in its picker while its claim is written and once it could not be; a claim written says
// it could not be, said once, its form usable again and the item still shown, and the next claim goes once GitHub is
// back; their token, checked again from the dialog, leaves the page checking it, said once, as before.
import { expect, test } from 'vitest';
import { startReview } from './app.ts';
import { expectConsole } from './console.ts';
import { AS_WRITER, github, WRITER, writes, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, choicesOf, said, theItem, tokenDialog } from './seen.ts';

const app = await startReview(AS_WRITER);
// GitHub out of reach, for the test that calls it
const unreachable = () => {
  app.answer(() => {
    throw new TypeError('Failed to fetch');
  });
};

// the line that says something went wrong, the last said (problem.tsx), and how many there are
const problem = () => document.querySelector('[role="alert"]')?.textContent;
const alerts = () => document.querySelectorAll('[role="alert"]').length;

test('a country picked shows in its picker while its claim is written, and once it could not be', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  await app.open('#contested/2');
  unreachable();
  expectConsole('error', /^Kiz Radar: writing a claim: TypeError: Failed to fetch$/u);
  const picker = () => theItem().querySelector('select[aria-label="Country"]');
  const shown = () => {
    const p = picker();
    return p instanceof HTMLSelectElement ? p.value : null;
  };
  const p = picker();
  if (!(p instanceof HTMLSelectElement)) throw new Error('the item has no picker');
  p.value = 'PT';
  p.dispatchEvent(new Event('change', { bubbles: true }));
  buttonOf(theItem(), 'Write the claim').click();
  const writing = [shown(), picker()?.hasAttribute('disabled')];
  await expect
    .poll(() => said(theItem().querySelector('form [role="status"]')))
    .toBe('The claim could not be written: try again.');
  expect([writing, [shown(), picker()?.hasAttribute('disabled')]]).toEqual([
    ['PT', true],
    ['PT', false],
  ]);
});

test('a claim written while GitHub is out of reach says so once, its form usable again; the next goes once it is back', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  await app.open('#contested/1');
  unreachable();
  expectConsole('error', /^Kiz Radar: writing a claim: TypeError: Failed to fetch$/u);
  buttonOf(theItem(), 'Angola').click();
  buttonOf(theItem(), 'Write the claim').click();
  const form = () => theItem().querySelector('form');
  await expect
    .poll(() => said(form()?.querySelector('[role="status"]')))
    .toBe('The claim could not be written: try again.');
  const controls = [...(form()?.querySelectorAll('button, input, select') ?? [])];
  expect([controls.filter((c) => c.hasAttribute('disabled')), said(theItem().querySelector('h2')), alerts()]).toEqual([
    [],
    'Ana',
    1,
  ]);
  app.answer(github({ token: WRITER.token }));
  const from = app.asked.length;
  buttonOf(theItem(), 'Write the claim').click();
  await expect.poll(() => writes(app.asked, from).length).toBe(1);
  await expect.poll(() => said(theItem().querySelector('h2'))).toBe('Bo');
});

test('a token checked while GitHub is out of reach leaves the page checking it, and says so once', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  unreachable();
  expectConsole('error', /^Kiz Radar: checking the token: TypeError: Failed to fetch$/u);
  const dlg = tokenDialog();
  buttonOf(dlg, 'Check and keep').click(); // the token kept, the field empty
  await expect.poll(problem).toContain('(checking the token: Failed to fetch)');
  expect([accessSays(), said(dlg.querySelector('[role="status"]')), choicesOf(theItem())]).toEqual([
    'Checking the token…',
    'Asking GitHub…',
    [],
  ]);
});
