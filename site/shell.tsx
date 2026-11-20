// The page's own parts that no view or other module draws, each drawn by Solid through placed.tsx, once: the footer's
// links, the skip link and Back to top.
import { createSignal, For } from 'solid-js';
import { EXPLORE, TABS } from './routes.ts';
import { scrolling } from './ui.ts';

// the footer's links, from routes.ts: the header's tabs but the last, and Explore's pages
export const FooterLinks = () => (
  <For each={[...TABS.slice(0, -1), ...EXPLORE]}>{([, label, href]) => <a href={href}>{label}</a>}</For>
);

// the first thing a keyboard reaches: past the header and the tabs, to the page itself
export const Skip = (props: { readonly main: HTMLElement }) => (
  <button type="button" class="skip" onClick={() => props.main.focus()}>
    Skip to the page
  </button>
);

// "Back to top" once you're two screens down a long list
export function ToTop() {
  const [shown, setShown] = createSignal(false);
  addEventListener(
    'scroll',
    () => {
      setShown(scrollY > 2 * innerHeight);
    },
    { passive: true },
  );
  return (
    <button
      type="button"
      class={['to-top', shown() && 'shown']}
      onClick={() => window.scrollTo({ top: 0, behavior: scrolling() })}
    >
      ↑ Back to top
    </button>
  );
}
