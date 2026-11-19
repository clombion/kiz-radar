// The intended way: a memo derives the value; an effect does work of its own with it; a setter given a constant reacts
// to a change, it does not mirror it; an element's method is no signal's setter.
import { createEffect, createMemo, createSignal } from 'solid-js';

declare const title: { textContent: string; setAttribute(name: string, value: string): void };
const [count] = createSignal(0);
const [, setPage] = createSignal(0);
const [, setDouble] = createSignal(0);
export const double = createMemo(() => count() * 2);
createEffect(
  () => count(),
  (n) => {
    title.textContent = String(n);
  },
);
createEffect(
  () => count(),
  () => setPage(0),
);
createEffect(
  () => count(),
  (n) => {
    setDouble(n);
    title.textContent = String(n);
  },
);
createEffect(
  () => count(),
  (n) => console.info(n),
);
createEffect(
  () => count(),
  (n) => setDouble,
);
createEffect(
  () => count(),
  (n) => title.setAttribute('data-count', String(n)),
);
