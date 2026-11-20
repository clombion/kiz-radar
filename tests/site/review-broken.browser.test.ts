// The review page when what it draws throws: a side's matches, drawn as its search is typed in, say so once as the
// page's, the page going on; a draw of the page (an address) says so in its place, the next address drawing the page
// again. Each throw planted: a count's words refused (wording.ts plural) while the test types or opens.
import { expect, onTestFinished, test, vi } from 'vitest';
import { startReview } from './app.ts';
import { expectConsole } from './console.ts';
import { AT, REVIEW } from './reviewed.ts';
import { reviewed, said, theItem } from './seen.ts';

const app = await startReview({ now: AT, route: '#join/1', review: REVIEW });
// a count's words refused, until the function returned is called or the test ends
function countsRefused(): () => void {
  const refused = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
    throw new RangeError('a count refused');
  });
  onTestFinished(() => {
    refused.mockRestore();
  });
  return () => {
    refused.mockRestore();
  };
}
const problem = () => document.querySelector('[role="alert"]')?.textContent;

test("a side's matches that throw as its search is typed in say so once as the page's, and the page goes on", async () => {
  expectConsole('error', /^Kiz Radar: the page: RangeError: a count refused/u);
  const field = reviewed().querySelector('input[aria-label="One name"]');
  if (!(field instanceof HTMLInputElement)) throw new Error(`no search for one name: ${said(reviewed()) ?? ''}`);
  const typed = (words: string) => {
    field.value = words;
    field.dispatchEvent(new Event('input'));
  };
  const matched = () => [...reviewed().querySelectorAll('li button .name')].map((n) => n.textContent);
  const restore = countsRefused();
  typed('kwenda');
  restore();
  await expect.poll(problem).toContain('(the page: a count refused)');
  expect([matched(), field.isConnected, said(reviewed())]).toEqual([
    [],
    true,
    expect.not.stringContaining('could not'),
  ]);
  typed('kwen');
  expect(matched()).toEqual(['Kwenda Lima']);
});

test('a draw of the page that throws says so in its place, and the next address draws the page again', async () => {
  expectConsole('error', /^Kiz Radar: the review: RangeError: a count refused/u);
  const restore = countsRefused();
  await expect(app.open('#contested/1')).rejects.toThrow('This page could not be shown: a count refused');
  restore();
  await app.open('#contested/2');
  expect(said(theItem().querySelector('h2'))).toBe('Bo');
});
