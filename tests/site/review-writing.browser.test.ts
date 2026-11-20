// The review page of a writer while a claim is written, GitHub's answer held until the test lets it go: every control
// of the item's form is disabled, its button saying so; written, the button says so, marked, for the beat (450 ms), and
// then the next open item shows; and a claim that lands once the admin has moved to another item leaves the page there.
import { expect, onTestFinished, test, vi } from 'vitest';
import { startReview } from './app.ts';
import { AS_WRITER, github, KEPT, WRITER, WRITING } from './reviewed.ts';
import { accessSays, buttonOf, said, theItem } from './seen.ts';

const app = await startReview({ ...AS_WRITER, route: '#contested/1' });
// GitHub, its answer to a claim put held until the function returned is called, or the test ends (so that a test that
// fails while it is held leaves no write under way for the next to queue behind)
function held(): () => void {
  const gate: { go?: () => void } = {};
  const answered = new Promise<void>((go) => {
    gate.go = go;
  });
  onTestFinished(() => gate.go?.());
  const known = github({ token: WRITER.token });
  app.answer(async (url, init) => {
    if (init.method === 'PUT') await answered;
    return await known(url, init);
  });
  return () => gate.go?.();
}
// the item's form: its controls, whether each is disabled, its write button's words and class, and what it says
function form(): { disabled: boolean[]; button: [string | undefined, string | null]; says: string | undefined } {
  const f = theItem().querySelector('form');
  if (f === null) throw new Error(`the item has no form: ${said(theItem()) ?? ''}`);
  const write = f.querySelector('.review-write button');
  return {
    disabled: [...f.querySelectorAll('button, input, select')].map((c) => c.hasAttribute('disabled')),
    button: [said(write), write?.getAttribute('class') ?? null],
    says: said(f.querySelector('[role="status"]')),
  };
}
const heading = () => said(theItem().querySelector('h2'));
// a real pause (the timeouts as they are before any is faked), which moves no faked clock
const realTimeout = setTimeout;
async function paused(): Promise<void> {
  await new Promise((done) => {
    realTimeout(done, 10);
  });
}
// the page's timeouts faked from here until the test ends
function faked(): void {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

test('a claim under way disables its form; written, its button says so for the beat, then the next open item shows', async () => {
  await expect.poll(accessSays).toBe(WRITING);
  const letGo = held();
  buttonOf(theItem(), 'Angola').click();
  buttonOf(theItem(), 'Write the claim').click();
  const writing = form();
  expect([writing.disabled.every(Boolean), writing.button, writing.says]).toEqual([true, ['Writing…', null], '']);
  faked();
  letGo();
  // waited for on real pauses, so the faked clock stands where the beat starts
  for (let n = 0; n < 200 && !(form().says ?? '').startsWith('Written as '); n += 1) await paused();
  expect(form().says).toMatch(/^Written as /u);
  await vi.advanceTimersByTimeAsync(449);
  const written = form();
  expect([written.disabled.every(Boolean), written.button, heading()]).toEqual([
    true,
    ['✓ Written', 'just-picked'],
    'Ana',
  ]);
  await vi.advanceTimersByTimeAsync(1);
  vi.useRealTimers();
  await expect.poll(heading).toBe('Bo');
});

test('a claim that lands once the admin has moved to another item leaves the page where they went', async () => {
  await app.open('#contested/2');
  const letGo = held();
  buttonOf(theItem(), 'Portugal').click();
  buttonOf(theItem(), 'Write the claim').click();
  await app.open('#merges/1');
  faked();
  letGo();
  await expect.poll(() => localStorage.getItem(KEPT.settled)).toContain('home p:bo');
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
  // what the beat's end would do, given a task to do it in
  await new Promise((done) => {
    setTimeout(done, 0);
  });
  expect([location.hash, heading()]).toEqual(['#merges/1', 'Abi or DJ Abi']);
});
