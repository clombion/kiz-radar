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
