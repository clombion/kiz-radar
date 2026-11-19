// Two Solid components each doing what Solid's development build reports (console.browser.test.ts): one writes a
// signal in its body, an owned scope, which Solid refuses by throwing; one reads a signal in its body, outside any
// tracking scope, which Solid warns of in the console. oxlint refuses both, each line suppressed: Solid's own report is
// what the test watches. Nothing in site/ imports it.
import { render } from '@solidjs/web';
import { createSignal } from 'solid-js';

// a count set as the component builds
function Writes() {
  const [count, setCount] = createSignal(0);
  // oxlint-disable-next-line solid/no-write-in-pure-computation -- the write Solid's development build throws on, which the test watches
  setCount(1);
  return <p>{count()}</p>;
}

// a count read once, as the component builds, so that its presses never show
function Reads() {
  const [count, setCount] = createSignal(0);
  // oxlint-disable-next-line solid/reactivity -- the read Solid's development build warns of, which the test watches
  const once = count();
  return (
    <button
      type="button"
      onClick={() => {
        setCount((n) => n + 1);
      }}
    >
      Pressed {once}
    </button>
  );
}

// each drawn into root; the returned function takes it away
export const writes = (root: HTMLElement): (() => void) => render(() => <Writes />, root);
export const reads = (root: HTMLElement): (() => void) => render(() => <Reads />, root);
