// A Solid component, the least that proves the toolchain: tsc types its JSX by @solidjs/web, the plugin compiles it in
// the tests (solid.browser.test.ts, Solid's development build) and in the site's build (vite.config.ts, the production
// one), and each renders it. Nothing in site/ imports it; the site's first Solid view is task 4.4's.
import { render } from '@solidjs/web';
import { createSignal } from 'solid-js';

// whether Solid runs its development build, which carries its diagnostics
export { isDev } from '@solidjs/web';

// a greeting, and a button counting its presses
function Hello(props: { readonly name: string }) {
  const [presses, setPresses] = createSignal(0);
  return (
    <p>
      Hello, {props.name}.{' '}
      <button
        type="button"
        onClick={() => {
          setPresses((n) => n + 1);
        }}
      >
        Pressed {presses()}
      </button>
    </p>
  );
}

// the greeting drawn into root; the returned function takes it away
export const greet = (root: HTMLElement, name: string): (() => void) => render(() => <Hello name={name} />, root);
