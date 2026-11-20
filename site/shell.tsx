// The page's own parts that no view or other module draws, each drawn by Solid through placed.tsx, once: the footer's
// links and its currency switch, the skip link and Back to top.
import { createSignal, For } from 'solid-js';
import { CURRENCIES } from './currency.ts';
import { currency } from './money.ts';
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

// "Prices in: kr · € · $": each reloads this page, at the same place, in that currency
export function CurrencySwitch() {
  const to = (c: string) => {
    const u = new URL(location.href);
    if (c === 'NOK') u.searchParams.delete('cur');
    else u.searchParams.set('cur', c.toLowerCase());
    location.href = u.href;
  };
  return (
    <p class="currency-switch">
      Prices in:{' '}
      <For each={Object.entries(CURRENCIES)}>
        {([c, { label }], i) => (
          <>
            {i() > 0 ? ' · ' : ''}
            {c === currency ? (
              <b aria-current="true">{label}</b>
            ) : (
              <button type="button" class="link" aria-label={c} onClick={() => to(c)}>
                {label}
              </button>
            )}
          </>
        )}
      </For>
    </p>
  );
}
