// The line that says something went wrong (report.ts, problem.tsx), once Solid has halted: an error that escapes every
// boundary halts it for the rest of the page, and is what the line then says. A component that writes a signal in its
// body (diagnosed.tsx) halts it, as halted.browser.test.ts shows; a file of its own, since the halt lasts its window.
import { expect, onTestFinished, test } from 'vitest';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';
import { writes } from './diagnosed.tsx';
import { said } from './seen.ts';

await startSite({ now: '2026-11-01' });
const lines = (): Element[] => [...document.querySelectorAll('[role="alert"]')];
const closed = (line: Element | undefined): void => {
  line?.querySelector('button')?.click();
};

test('with Solid halted, a problem is still said in a line that closes, each problem a new line', () => {
  // Solid's words, and Vitest's of each error the window hears, which it leaves to the page's listener
  expectConsole('error', /^\[REACTIVITY_HALTED\] An uncaught error halted the reactive system\./u);
  expectConsole('warn', /^\[REACTIVE_WRITE_IN_OWNED_SCOPE\] what it means and how to fix it: /u);
  expectConsole('warn', /^\[REACTIVITY_HALTED\] what it means and how to fix it: /u);
  expectConsole('error', /^Error: Uncaught Error: \[REACTIVE_WRITE_IN_OWNED_SCOPE\] /u);
  expectConsole('error', /^Error: Uncaught Error: (?:one|two)$/u, 2);
  // the page's, naming each
  expectConsole('error', /^Kiz Radar: the page: Error: \[REACTIVE_WRITE_IN_OWNED_SCOPE\] /u);
  expectConsole('error', /^Kiz Radar: the page: Error: (?:one|two)$/u, 2);
  const root = document.body.appendChild(document.createElement('div'));
  onTestFinished(() => root.remove());
  expect(() => writes(root)).toThrow(/^\[REACTIVE_WRITE_IN_OWNED_SCOPE\] /u);
  // the halt's own error, handed to the window once Solid has halted
  const [halt] = lines();
  expect(lines()).toHaveLength(1);
  expect(said(halt)).toMatch(/^Something went wrong \(the page: \[REACTIVE_WRITE_IN_OWNED_SCOPE\] .*\. Close$/u);
  closed(halt);
  expect(lines()).toEqual([]);
  // two more: each said in a line of its own, the last one in place of the one before
  reportError(new Error('one'));
  const [one] = lines();
  reportError(new Error('two'));
  const [two] = lines();
  expect(lines()).toEqual([two]);
  expect(two).not.toBe(one);
  expect(said(two)).toBe('Something went wrong (the page: two). Reloading the page may help. Close');
  closed(two);
  expect(lines()).toEqual([]);
});
