// The controls the views share, drawn by Solid: a select of choices, a row of them pressed (segments), the more button
// with its panel (dropdown), a search field, and the line saying what an address asked that the view has no choice for
// (leftOut).
// dom.ts's for the h() views, which a .tsx imports nothing of (house/legacy).
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Accessor, createSignal, flush, For, Show } from 'solid-js';
import type { ClassName } from './classes.ts';
import { disposal } from './mount.tsx';

// A select of choices, the one on as it is drawn its selected option: the choice comes back as the option at the
// picked place, so of its type and never a string to parse; named by label where no visible label names it.
export function choices<V extends string | number>(
  options: readonly (readonly [V, string])[],
  on: V,
  choose: (v: V) => void,
  { class: cls, label }: { readonly class?: ClassName; readonly label?: string } = {},
): JSX.Element {
  return (
    <select
      class={cls}
      aria-label={label}
      onChange={(ev) => {
        const picked = options[ev.currentTarget.selectedIndex];
        if (picked) choose(picked[0]);
      }}
    >
      <For each={options}>
        {([v, words]) => (
          <option value={v} defaultSelected={v === on}>
            {words}
          </option>
        )}
      </For>
    </select>
  );
}

// A row of choices named label, one of them on (a segmented control): each is a button pressed while it is the choice.
// Its buttons are drawn anew whenever on is read anew (each choice of the view's, as each render drew the h() row
// again), so a button pressed goes, with the focus, as it did.
export const segments = <V extends string>(
  label: string,
  options: readonly (readonly [V, string])[],
  on: Accessor<V>,
  choose: (v: V) => void,
): JSX.Element => (
  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a segmented control's row, its markup kept as dom.ts's views drew it during the port (revisit after 4.10)
  <div class="seg" role="group" aria-label={label}>
    <Show when={{ now: on() }} keyed>
      {({ now }) =>
        options.map(([v, words]) => (
          <button
            type="button"
            class={{ 'is-on': v === now }}
            aria-pressed={v === now ? 'true' : 'false'}
            onClick={() => choose(v)}
          >
            {words}
          </button>
        ))
      }
    </Show>
  </div>
);

// The more button of a panel of more choices (aria-controls names it), which opens and closes it; a click outside what
// counts as inside (the button and the panel, or the bar they are on, within) closes it again. Its listener on the
// document goes with the owner it is made under (a view). Its words are drawn as given, a reactive part of them drawn
// again with the button kept; the panel is the caller's, hidden unless open.
export function dropdown(within: () => readonly (Element | undefined)[]): {
  readonly open: Accessor<boolean>;
  readonly button: (panelId: string, words: JSX.Element) => JSX.Element;
} {
  const [open, setOpen] = createSignal(false);
  document.addEventListener(
    'click',
    ({ target }) => {
      if (!open() || (target instanceof Node && within().some((n) => n?.contains(target) === true))) return;
      flush(() => {
        setOpen(false);
      });
    },
    { signal: disposal() },
  );
  return {
    open,
    button: (panelId, words) => (
      <button
        type="button"
        class="more-btn"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={panelId}
        onClick={() => {
          flush(() => {
            setOpen((was) => !was);
          });
        }}
      >
        {words}
      </button>
    ),
  };
}

// A search field, named label, its placeholder hint, whose words are heard (a script's input event, which does not
// bubble to a delegated handler, on the field itself), and that starts with first when given, as its value too.
export const searchField = ({
  label,
  hint,
  heard,
  first,
}: {
  readonly label: string;
  readonly hint: string;
  readonly heard: (words: string) => void;
  readonly first?: string;
}): JSX.Element => (
  <input
    ref={(el) => {
      el.addEventListener('input', () => {
        heard(el.value);
      });
    }}
    type="search"
    class="mini-search"
    placeholder={hint}
    aria-label={label}
    {...(first === undefined ? {} : { defaultValue: first })}
  />
);

// what an address asked that the view has no such choice for, said at the top of the view
export const leftOut = (dropped: readonly string[]): JSX.Element =>
  dropped.length === 0 ? null : (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a line that says what the address asked in vain, its markup kept as festivals.ts drew it during the port (revisit after 4.10)
    <p class={['muted', 'left-out']} role="status">
      {`The link asks for ${dropped.join(', ')}, which ${dropped.length === 1 ? 'is' : 'are'} not among the choices here.`}
    </p>
  );
