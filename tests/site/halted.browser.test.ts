// A write in the wrong scope, in Solid's development build: a component that writes a signal in its body
// (diagnosed.tsx) throws, and halts Solid's reactive system for the rest of the file, which is why the test has a file of
// its own. Solid says so in the console and hands the error to the window (reportError), whose listener the page has
// (report.ts): with a listener, Vitest prints the error rather than failing the run on it.
import { expect, onTestFinished, test } from 'vitest';
import { expectConsole } from './console.ts';
import { writes } from './diagnosed.tsx';

test('a component that writes a signal in its body throws, and Solid stops', () => {
  const errors: unknown[] = [];
  const heard = (ev: Readonly<ErrorEvent>): void => {
    errors.push(ev.error);
  };
  addEventListener('error', heard);
  onTestFinished(() => removeEventListener('error', heard));
  const write = /^\[REACTIVE_WRITE_IN_OWNED_SCOPE\] Writing to reactive state inside an owned scope/u;
  expectConsole('error', /^\[REACTIVITY_HALTED\] An uncaught error halted the reactive system\./u);
  // Vitest's, of the window's error, which it leaves to the listener
  expectConsole('error', /^Error: Uncaught Error: \[REACTIVE_WRITE_IN_OWNED_SCOPE\] /u);
  // the first report of each code ends with a pointer to its page and to Solid's skill
  expectConsole('warn', /^\[REACTIVE_WRITE_IN_OWNED_SCOPE\] what it means and how to fix it: /u);
  expectConsole('warn', /^\[REACTIVITY_HALTED\] what it means and how to fix it: /u);
  const root = document.body.appendChild(document.createElement('div'));
  onTestFinished(() => root.remove());
  expect(() => writes(root)).toThrow(write);
  expect(errors.map(String)).toEqual([expect.stringMatching(/^Error: \[REACTIVE_WRITE_IN_OWNED_SCOPE\] /u)]);
});
