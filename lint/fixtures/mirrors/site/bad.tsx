// What house/mirrors refuses in a Solid file: an effect whose apply half only gives setters what the effect read, each
// refused at its first setter: returned, voided, called optionally, cast, awaited; the effect imported by another name,
// or read from Solid's namespace.
import * as Solid from 'solid-js';
import { createEffect, createRenderEffect, createSignal, createEffect as effect } from 'solid-js';

const [count] = createSignal(0);
const [, setDouble] = createSignal(0);
const [, setLabel] = createSignal('');
createEffect(() => count(), setDouble); // refused
createEffect(
  () => count(),
  (n) => setDouble(n * 2), // refused
);
createEffect(
  () => count(),
  (n) => {
    setDouble(n); // refused
    setLabel(String(n));
  },
);
createRenderEffect(
  () => count(),
  (n) => setDouble(n), // refused
);
createEffect(
  () => ({ n: count() }),
  ({ n }) => setDouble(n), // refused
);
createEffect(
  () => count(),
  function mirror(n) {
    setDouble(n); // refused
  },
);
createEffect(
  () => count(),
  (n) => setDouble(() => n), // refused
);
createEffect(
  () => count(),
  (n) => {
    return setDouble(n); // refused
  },
);
createEffect(
  () => count(),
  (n) => void setDouble(n), // refused
);
createEffect(
  () => count(),
  (n) => setDouble?.(n), // refused
);
createEffect(
  () => count(),
  ((n: number) => setDouble(n)) as (n: number) => void, // refused
);
createEffect(
  () => count(),
  async (n) => setDouble(await Promise.resolve(n)), // refused
);
effect(
  () => count(),
  (n) => setDouble(n), // refused
);
Solid.createEffect(
  () => count(),
  (n) => setDouble(n), // refused
);
