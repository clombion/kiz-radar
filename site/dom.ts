// Elements built from their tag, attributes and contents. All text goes in as text nodes, never as HTML.

const ON = /^on/u;

// what an element holds: nodes and text, nested as lists; null, undefined and false hold nothing
export type Kid = Node | string | number | false | null | undefined | readonly Kid[];
// an element's attributes: on… a listener, class its classes, dataset its data-…, the rest as written (true: present)
type Value = string | number | boolean | null | undefined;
export type Attrs = Readonly<Record<string, Value | EventListener | Readonly<Record<string, string>>>>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(ON, ''), v);
    else if (typeof v === 'object') Object.assign(el.dataset, v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...nodes(kids));
  return el;
}
// a button, of type button: it never submits a form, whatever it is put in
export const button = (attrs: Attrs, ...kids: Kid[]): HTMLButtonElement =>
  h('button', { type: 'button', ...attrs }, ...kids);
export const nodes = (kids: readonly Kid[]): Node[] =>
  kids.flatMap((kid): Node[] =>
    kid == null || kid === false
      ? []
      : Array.isArray(kid)
        ? nodes(kid)
        : kid instanceof Node
          ? [kid]
          : [document.createTextNode(String(kid))],
  );

// A click handler for a control inside a card, which opens on a click: the click is the control's alone. act gets the
// control, for a dialog to give the focus back to.
export const own =
  (act?: (control: Element | null) => void) =>
  (ev: Event): void => {
    ev.stopPropagation();
    act?.(ev.currentTarget instanceof Element ? ev.currentTarget : null);
  };

// The button of a panel of more choices (aria-controls names the panel); dropdown() makes it open and close it.
export const moreButton = (panelId: string, ...words: Kid[]): HTMLButtonElement =>
  button({ class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': panelId }, ...words);
// The panel's button shows or hides it; a click outside what counts as inside (the button and the panel, or the bar
// they are on) hides it again, until signal aborts.
export function dropdown(opener: HTMLElement, panel: HTMLElement, inside: readonly Node[], signal: AbortSignal): void {
  opener.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    opener.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener(
    'click',
    ({ target }) => {
      if (panel.hidden || (target instanceof Node && inside.some((n) => n.contains(target)))) return;
      panel.hidden = true;
      opener.setAttribute('aria-expanded', 'false');
    },
    { signal },
  );
}

// A row of choices, one of them on (a segmented control): each is a button pressed while it is the choice.
export const segments = <V extends string>(
  options: readonly (readonly [V, string])[],
  on: V,
  choose: (v: V) => void,
): HTMLButtonElement[] =>
  options.map(([v, words]) =>
    button({ class: v === on ? 'on' : '', 'aria-pressed': String(v === on), onclick: () => choose(v) }, words),
  );
