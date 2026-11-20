// The search with one result that throws as it is drawn: a festival long over whose dates are no days, which its row
// cannot say (ui.ts dayMonth). What went wrong is said once, and the search goes on, the dialog and its history entry
// with it; a file of its own, for the planted row.
import { expect, test, vi } from 'vitest';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';
import { said, shownDialog } from './seen.ts';

const BROKEN = 'Zzyzx Broken Weekender';
await startSite({
  now: '2026-11-01',
  plant: (db) => {
    db.exec(`PRAGMA ignore_check_constraints = ON; UPDATE events SET title = '${BROKEN}', start_date = '0000-00-00',
      end_date = '0000-00-00' WHERE id = (SELECT min(id) FROM event_rows WHERE NOT upcoming)`);
  },
});

const search = () => document.querySelector<HTMLDialogElement>('dialog.search');
const typed = (input: HTMLInputElement, words: string) => {
  input.value = words;
  input.dispatchEvent(new Event('input'));
};
const options = () => [...document.querySelectorAll('dialog[open] [role="option"]')];

test('a result that throws as it is drawn is said once, and the search still searches, closes and opens again', async () => {
  expectConsole('error', /^Kiz Radar: the search's results: RangeError: /u);
  const state: unknown = history.state;
  document.querySelector<HTMLElement>('#search-btn')?.click();
  const dlg = shownDialog('.search-cancel');
  const input = dlg.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (input === null) throw new Error('the search has no text field');
  // the festival over, then included: its row throws
  typed(input, 'Zzyzx');
  const include = await vi.waitUntil(() => dlg.querySelector<HTMLButtonElement>('.search-none button'), {
    timeout: 5000,
  });
  include.click();
  await vi.waitUntil(() => document.querySelector('[role="alert"]') !== null);
  expect([...document.querySelectorAll('[role="alert"]')].map(said)).toEqual([
    expect.stringMatching(/^Something went wrong \(the search's results: /u),
  ]);
  // the dialog stays, open, with its entry
  expect([search(), dlg.open, history.state]).toEqual([dlg, true, { modal: true }]);
  // it searches
  typed(input, 'Munich');
  await vi.waitUntil(() => options().length > 0, { timeout: 5000 });
  // it closes, its entry gone
  const gone = new Promise((done) => addEventListener('popstate', done, { once: true }));
  dlg.querySelector<HTMLButtonElement>('.search-cancel')?.click();
  await gone;
  expect([dlg.open, history.state]).toEqual([false, state]);
  // and opens again
  document.querySelector<HTMLElement>('#search-btn')?.click();
  expect([search(), dlg.open, history.state]).toEqual([dlg, true, { modal: true }]);
});
