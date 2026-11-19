// The console guard (console.ts) and what it is for: Solid's development build warns in the console of a read outside
// any tracking scope (diagnosed.tsx), and a warning no test declared fails the test that heard it, as do a failing
// console.assert, a declaration said other than as often as it says, and a test that replaces the console's methods.
// Its other report, a write in the wrong scope, which halts Solid for the rest of the file, is
// halted.browser.test.ts's.
import { expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { expectConsole } from './console.ts';
import { reads } from './diagnosed.tsx';

// a new element of the page, removed as the test ends
function rooted(): HTMLElement {
  const root = document.body.appendChild(document.createElement('div'));
  onTestFinished(() => root.remove());
  return root;
}

test('a component that reads a signal in its body is warned of, and its presses never show', async () => {
  expectConsole(
    'warn',
    /^\[STRICT_READ_UNTRACKED\] Reactive value "count" read directly in <Reads> will not update\./u,
  );
  const root = rooted();
  const gone = reads(root);
  onTestFinished(gone);
  const button = page.elementLocator(root).getByRole('button');
  await button.click();
  await expect.element(button).toHaveTextContent('Pressed 0');
});

// what the guard said of the tests below, which fail by it
const failures = new Map<string, readonly string[]>();
// the test's errors kept once it has run, the guard's among them, for the test after it to read
function kept(name: string): void {
  onTestFinished(({ task }) => {
    failures.set(
      name,
      (task.result?.errors ?? []).map((e) => e.message),
    );
  });
}

test.fails('an undeclared warning fails the test', () => {
  kept('undeclared');
  const root = rooted();
  onTestFinished(reads(root));
  // drawn, so that the guard alone fails it
  expect(root.textContent).toBe('Pressed 0');
});

test('…with the guard’s words, naming what was said', () => {
  expect(failures.get('undeclared')).toEqual([
    expect.stringMatching(
      /^the console was told what no expectConsole\(\) declared:\nconsole\.warn: \[STRICT_READ_UNTRACKED\] /u,
    ),
  ]);
});

test.fails('a declared warning never said fails the test', () => {
  kept('unsaid');
  expectConsole('warn', /never said/u);
  expect(failures.has('unsaid')).toBe(false);
});

test('…with the guard’s words, naming the declaration', () => {
  expect(failures.get('unsaid')).toEqual(["expectConsole('warn', /never said/u) was declared and never said"]);
});

test('a declaration says how often, and a pattern that keeps its place is refused', () => {
  expectConsole('warn', /^\[STRICT_READ_UNTRACKED\] /u, 2);
  onTestFinished(reads(rooted()));
  onTestFinished(reads(rooted()));
  expect(() => {
    expectConsole('warn', /x/gu);
  }).toThrow('expectConsole(): /x/gu has the g or y flag');
  expect(() => {
    expectConsole('warn', /x/uy);
  }).toThrow('has the g or y flag');
});

test.fails('a warning said more often than declared fails the test', () => {
  kept('twice');
  expectConsole('warn', /^\[STRICT_READ_UNTRACKED\] /u);
  onTestFinished(reads(rooted()));
  onTestFinished(reads(rooted()));
  expect(failures.has('twice')).toBe(false);
});

test('…with the guard’s words, naming the count', () => {
  expect(failures.get('twice')).toEqual([
    "expectConsole('warn', /^\\[STRICT_READ_UNTRACKED\\] /u) was said 2 times, not 1",
  ]);
});

// the console's assert and error, by a key as console.ts names them: Chromium's assert never calls console.error
const ASSERT = 'assert',
  ERROR = 'error';

test('a console.assert that holds says nothing, and a failing one can be declared', () => {
  expectConsole('error', /^Assertion failed: declared$/u);
  console[ASSERT](true, 'holds');
  console[ASSERT](false, 'declared');
  expect(failures.has('asserted')).toBe(false);
});

test.fails('a failing console.assert nobody declared fails the test', () => {
  kept('asserted');
  console[ASSERT](document.title === 'no such title', 'the page is titled so');
  expect(failures.has('asserted')).toBe(false);
});

test('…as an error, in Chromium’s words', () => {
  expect(failures.get('asserted')).toEqual([
    'the console was told what no expectConsole() declared:\nconsole.error: Assertion failed: the page is titled so',
  ]);
});

test.fails('a test that replaces console.error fails', () => {
  kept('spied');
  // not restored: the guard puts its own back
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(spy).not.toHaveBeenCalled();
});

test('…with the guard’s words, and the guard is put back', () => {
  expect(failures.get('spied')).toEqual([
    'console.error was replaced, which hides what is said from the guard: declare it with expectConsole()',
  ]);
  expectConsole('error', /^put back$/u);
  console[ERROR]('put back');
});
