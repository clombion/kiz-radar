// Elements built from their tag, attributes and contents. All text goes in as text nodes, never as HTML.
import type { ClassName } from './classes.ts';

const ON = /^on/u;

// what an element holds: nodes and text, nested as lists; null, undefined and false hold nothing
export type Kid = Node | string | number | false | null | undefined | readonly Kid[];
// an element's attributes: on… a listener, class its classes, dataset its data-…, style its properties (set one by
// one, which the page's CSP allows where it refuses a style attribute), the rest as written (true: present)
type Value = string | number | boolean | null | undefined;
// an element's classes: one of the stylesheet's, or a list of them, where false, null or undefined stand for none
export type Classes = ClassName | readonly (ClassName | false | null | undefined)[];
export type Attrs = Readonly<{ class?: Classes | false | null | undefined }> &
  Readonly<Record<string, Value | EventListener | Readonly<Record<string, string>> | Classes>>;

const set = (el: HTMLElement, k: string, v: Attrs[string]): void => {
  if (v == null || v === false) return;
  if (Array.isArray(v)) el.className = v.filter(Boolean).join(' ');
  else if (typeof v === 'function') el.addEventListener(k.replace(ON, ''), v);
  else if (typeof v !== 'object') el.setAttribute(k, v === true ? '' : String(v));
  else if (k === 'style') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
  else Object.assign(el.dataset, v);
};
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) set(el, k, v);
  el.append(...nodes(kids));
  return el;
}
// whether el has one of the stylesheet's classes; the one way the code sets a class after building an element
export const toggle = (el: Element, cls: ClassName, on: boolean): void => {
  el.classList.toggle(cls, on);
};
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

// A select of choices, one of them on: the choice comes back as the option at the picked place, so of its type and
// never a string to parse.
export function choices<V extends string | number>(
  options: readonly (readonly [V, string])[],
  on: V,
  choose: (v: V) => void,
  attrs: Attrs = {},
): HTMLSelectElement {
  const el = h(
    'select',
    attrs,
    options.map(([v, words]) => h('option', { value: v, selected: v === on }, words)),
  );
  el.addEventListener('change', () => {
    const picked = options[el.selectedIndex];
    if (picked) choose(picked[0]);
  });
  return el;
}

// A row of choices, one of them on (a segmented control): each is a button pressed while it is the choice.
export const segments = <V extends string>(
  options: readonly (readonly [V, string])[],
  on: V,
  choose: (v: V) => void,
): HTMLButtonElement[] =>
  options.map(([v, words]) =>
    button({ class: v === on && 'on', 'aria-pressed': String(v === on), onclick: () => choose(v) }, words),
  );

// A list shown a page at a time: its first page now, and the more button (in the list, last, or anywhere else) adding
// the next page to what is there, so the rows already shown are kept as they are. Showing other items starts over.
export function paged<T>(
  { list, more }: { list: HTMLElement; more: HTMLButtonElement },
  items: readonly T[],
  page: number,
  row: (item: T, i: number) => Node,
): void {
  let shown = 0;
  const next = () => {
    const rows = items.slice(shown, shown + page).map((x, i) => row(x, shown + i));
    if (more.parentElement === list) more.before(...rows);
    else list.append(...rows);
    shown += rows.length;
    more.hidden = shown >= items.length;
    more.textContent = `Show ${Math.min(page, items.length - shown)} more`;
  };
  list.replaceChildren(...(more.parentElement === list ? [more] : []));
  more.onclick = next; // the one listener, so a list shown again never adds to the one before
  next();
}

// f, called once calls to it have paused for ms (typing in a search box, say)
export function debounced<A extends unknown[]>(f: (...args: A) => void, ms = 150): (...args: A) => void {
  let waiting: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    clearTimeout(waiting);
    waiting = setTimeout(() => f(...args), ms);
  };
}

// f on every resize, at most once a frame, until signal (a view's) fires
export function onResize(f: () => void, signal?: AbortSignal): void {
  let frame = 0;
  addEventListener(
    'resize',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(f);
    },
    signal === undefined ? { passive: true } : { passive: true, signal },
  );
}
