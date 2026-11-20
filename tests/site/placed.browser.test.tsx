// A part of the shell that throws as it is drawn (placed.tsx): its boundary says so once and draws nothing in its
// place, and the shell goes on, Solid not halted: a part drawn after it is drawn, its click heard, and a signal written
// later is drawn. The parts are this file's, each drawn in the place of an element of a holder put in the started
// page; a file of its own, since what a throw left would be its window's.
import { createSignal } from 'solid-js';
import { expect, onTestFinished, test } from 'vitest';
import { inPlaceOf } from '../../site/placed.tsx';
import { startSite } from './app.ts';
import { expectConsole } from './console.ts';
import { said } from './seen.ts';

await startSite({ now: '2026-11-01' });

test('a shell part that throws is said once and drawn as nothing; the next part is drawn, heard and redrawn', async () => {
  expectConsole('error', /^Kiz Radar: a broken part: Error: planted$/u);
  const first = <p />;
  const second = <p />;
  const holder = (
    <div>
      {first}
      {second}
    </div>
  );
  if (!(holder instanceof HTMLDivElement && first instanceof Element && second instanceof Element))
    throw new Error('the holder was drawn as no elements');
  document.body.append(holder);
  onTestFinished(() => {
    holder.remove();
    for (const line of document.querySelectorAll('[role="alert"]')) line.remove();
  });
  inPlaceOf(first, 'a broken part', () => {
    throw new Error('planted');
  });
  // said once, in the console and in a line; in its place, nothing: the next element alone, and no words
  expect([...document.querySelectorAll('[role="alert"]')].map(said)).toEqual([
    'Something went wrong (a broken part: planted). Reloading the page may help. Close',
  ]);
  expect([...holder.children]).toEqual([second]);
  expect(holder.textContent).toBe('');
  // a part after it: drawn, its click heard, a later write drawn
  const [count, setCount] = createSignal(0);
  let button: HTMLButtonElement | undefined;
  inPlaceOf(second, 'a counter', () => (
    <button
      ref={button}
      type="button"
      onClick={() => {
        setCount((n) => n + 1);
      }}
    >{`pressed ${count()}`}</button>
  ));
  expect([button?.parentNode, said(button)]).toEqual([holder, 'pressed 0']);
  button?.click();
  await expect.poll(() => said(button)).toBe('pressed 1');
  setCount(5);
  await expect.poll(() => said(button)).toBe('pressed 5');
});
