// The controls the views share, drawn by Solid: a view's choices kept in its address (chosen), a select of them, a row
// of them pressed (segments), a checkbox (check), the more button with its panel (dropdown), a search field, a list
// shown a page at a time (paged), the line saying what an address asked that the view has no choice for (leftOut), and
// what a control says for a while (awhile).
import type { JSX } from 'kiz-jsx/jsx-runtime';
import {
  type Accessor,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  flush,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import type { ClassName } from './classes.ts';
import { disposal } from './mount.tsx';
import { showInAddressBar } from './routes.ts';

// A view's choices, as its address gave them: one signal, a new record on each choice, drawn at once (flushed) in the
// choice's listener, before it returns; and the address bar following them (address, from the choices).
export function chosen<C extends Readonly<Record<string, unknown>>>(
  first: C,
  address: (now: C) => string,
): readonly [Accessor<C>, (to: Partial<C>) => void] {
  // held in a record of its own, as a signal's value is never a function
  const [held, setHeld] = createSignal<{ readonly now: C }>({ now: first });
  const now = () => held().now;
  createEffect(
    () => address(now()),
    (href) => {
      showInAddressBar(href);
    },
  );
  const set = (to: Partial<C>) => {
    flush(() => {
      setHeld(({ now: was }) => ({ now: { ...was, ...to } }));
    });
  };
  return [now, set];
}

// One choice as a record of it, its value checked against its key's type, which a computed key's record ({ [key]: v })
// is not: a generic or a union key widens it to a record of any string.
export function only<C, K extends keyof C>(key: K, value: C[K]): Partial<C> {
  const to: { -readonly [P in keyof C]?: C[P] } = {};
  to[key] = value;
  return to;
}

// A checkbox and its words (a space before them), on as it is drawn when on, telling change of each change.
export const check = (words: string, on: boolean, change: (on: boolean) => void): JSX.Element => (
  <label class="check">
    <input type="checkbox" defaultChecked={on} onChange={(ev) => change(ev.currentTarget.checked)} />
    {words}
  </label>
);

// A select of choices, the one on as it is drawn its selected option (none when on is null: the first shown, as a
// select shows one, and no option marked so, as the SQL page's examples were drawn): the choice comes back as the
// option at the picked place, so of its type and never a string to parse; named by label where no visible label names
// it. kept, when given, is the choice it shows from then on, changed elsewhere too (the Festivals page's selects of one
// choice); off, when given, disables it while it is true (a review's country picker while its claim is written), in an
// effect of its own: Solid's compiler puts an element's attributes in one effect, which sets a select's value again
// each time it runs, so off beside the value would put the select back on its first choice each time off changed.
export function choices<V extends string | number>(
  options: readonly (readonly [V, string])[],
  on: V | null,
  choose: (v: V) => void,
  {
    class: cls,
    label,
    kept,
    off,
  }: {
    readonly class?: ClassName;
    readonly label?: string | undefined;
    readonly kept?: Accessor<V>;
    readonly off?: Accessor<boolean>;
  } = {},
): JSX.Element {
  let select: HTMLSelectElement | undefined;
  const drawn = (
    <select
      ref={(el) => {
        select = el;
      }}
      class={cls}
      aria-label={label}
      value={kept === undefined ? (on ?? options[0]?.[0]) : kept()}
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
  if (off !== undefined)
    createRenderEffect(off, (o) => {
      select?.toggleAttribute('disabled', o);
    });
  return drawn;
}

// A row of choices named label, one of them on (a segmented control): each is a button pressed while it is the choice.
// Its buttons are drawn anew whenever on is read anew (on each choice of the view's), so a button pressed is replaced,
// and the focus goes with it.
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
// counts as inside (within: the bar they are on; else the button and the panel) closes it again. Its listener on the
// document goes with the owner it is made under (a view). The button's words are drawn as they are given, a reactive
// part of JSX following what it reads, so the button stays; the panel is the caller's, hidden unless open, or the one
// wrapped draws beside the button.
export function dropdown(within?: () => readonly (Element | undefined)[]): {
  readonly open: Accessor<boolean>;
  readonly button: (panelId: string, words: JSX.Element) => JSX.Element;
  readonly wrapped: (panelId: string, words: JSX.Element, fields: JSX.Element) => JSX.Element;
} {
  const [open, setOpen] = createSignal(false);
  let opener: HTMLButtonElement | undefined, panel: HTMLDivElement | undefined;
  const inside = () => within?.() ?? [opener, panel];
  document.addEventListener(
    'click',
    ({ target }) => {
      if (!open() || (target instanceof Node && inside().some((n) => n?.contains(target) === true))) return;
      flush(() => {
        setOpen(false);
      });
    },
    { signal: disposal() },
  );
  const button = (panelId: string, words: JSX.Element): JSX.Element => (
    <button
      ref={(el) => {
        opener = el;
      }}
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
  );
  return {
    open,
    button,
    wrapped: (panelId, words, fields) => (
      <div class="filters-wrap">
        {button(panelId, words)}
        <div
          ref={(el) => {
            panel = el;
          }}
          class="more-panel"
          id={panelId}
          hidden={!open()}
        >
          {fields}
        </div>
      </div>
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

// A list shown a page at a time: its rows (a row an item), the first page of them as it is drawn, and the more button
// (put in the list, last, or anywhere else; of the class given, else more-btn show-more) adding the next page to what
// is there, so the rows already shown are kept as they are. Other items are a list drawn anew.
export function paged<T>(
  items: readonly T[],
  page: number,
  row: (item: T) => JSX.Element,
  { class: cls }: { readonly class?: ClassName } = {},
): { readonly rows: JSX.Element; readonly more: JSX.Element } {
  const [shown, setShown] = createSignal(Math.min(page, items.length));
  return {
    rows: <For each={items.slice(0, shown())}>{(item) => row(item)}</For>,
    more: (
      <button
        type="button"
        class={cls ?? ['more-btn', 'show-more']}
        hidden={shown() >= items.length}
        onClick={() => {
          flush(() => {
            setShown((n) => Math.min(n + page, items.length));
          });
        }}
      >
        {`Show ${Math.min(page, items.length - shown())} more`}
      </button>
    ),
  };
}

// what an address asked that the view has no such choice for, said at the top of the view
export const leftOut = (dropped: readonly string[]): JSX.Element =>
  dropped.length === 0 ? null : (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a line that says what the address asked in vain, its markup kept as festivals.ts drew it during the port (revisit after 4.10)
    <p class={['muted', 'left-out']} role="status">
      {`The link asks for ${dropped.join(', ')}, which ${dropped.length === 1 ? 'is' : 'are'} not among the choices here.`}
    </p>
  );

// What a control says (a Copy's Copied, a Share's Link copied): still, or what it was last told to say, for ms after
// each telling, each change drawn at once; its timers go with the owner it is made under.
export function awhile<T>(still: T, ms: number): readonly [Accessor<T>, (said: T) => void] {
  const [now, setNow] = createSignal<{ readonly said: T }>({ said: still });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => {
    for (const t of timers) clearTimeout(t);
  });
  const shown = (said: T) => {
    flush(() => {
      setNow({ said });
    });
  };
  const tell = (said: T) => {
    shown(said);
    const back = setTimeout(() => {
      timers.delete(back);
      shown(still);
    }, ms);
    timers.add(back);
  };
  const said = createMemo(() => now().said);
  return [said, tell];
}
