// What dom.ts held that draws nothing: the types of an element's contents and classes, what contents hold, an id no
// other element has, two ways to wait (a pause in typing, a frame after a resize), and a control's click kept its own
// (own); and for JSX, an element's style set through a ref (styled) and an element JSX made checked (asElement). A Solid
// view (.tsx), which imports nothing of dom.ts (house/legacy), takes them from here.
import type { ClassName } from './classes.ts';

// what an element holds: nodes and text, nested as lists; null, undefined and false hold nothing
export type Kid = Node | string | number | false | null | undefined | readonly Kid[];
// what kids hold, in order, one list: each node, and each text or number as a string (h()'s contents, dom.ts nodes, and
// what an h() module hands a Solid part, dialog.tsx leaving)
export const flat = (kids: readonly Kid[]): (Node | string)[] =>
  kids.flatMap((kid): (Node | string)[] =>
    kid == null || kid === false
      ? []
      : kid instanceof Node
        ? [kid]
        : typeof kid === 'string' || typeof kid === 'number'
          ? [String(kid)]
          : flat(kid),
  );
// an element's classes: one of the stylesheet's, or a list of them, where false, null or undefined stand for none
export type ClassList = readonly (ClassName | false | null | undefined)[];
export type Classes = ClassName | ClassList;

// An id no other element of the page has, from a stem ("day-pop-3"): a view drawn twice, or two of one kind on a page,
// never shares one, which a label or a description reaching for it by id would find the wrong one of.
let ids = 0;
export const uniqueId = (stem: string): string => `${stem}-${++ids}`;

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

// A click handler for a control inside a card, which opens on a click: the click is the control's alone, kept from the
// card and from a click outside heard on the document (dom.ts dropdown). act gets the control, for a dialog to give the
// focus back to. An h() listener and a JSX handler alike. A JSX one is delegated to the root it is drawn into (<body>,
// body.ts, or a Solid view's root): the stop ends Solid's walk of the delegated handlers there (the card's own, a
// delegated onClick, never hears it) and keeps the click from the document, but not, as on the control, from a native
// listener on an element between the control and that root, which hears it first; none of a card's ancestors has one,
// and one added there must stop at its own target, or be a delegated handler too.
export const own =
  (act?: (control: Element | null) => void) =>
  (ev: Event): void => {
    ev.stopPropagation();
    act?.(ev.currentTarget instanceof Element ? ev.currentTarget : null);
  };

// A ref that sets each of an element's style properties, one by one, which the page's Content-Security-Policy allows
// where it refuses a style attribute (house/styles): a stroke's place and ink, known only as it is drawn.
export const styled =
  (properties: Readonly<Record<string, string>>) =>
  (el: HTMLElement): void => {
    for (const [k, v] of Object.entries(properties)) el.style.setProperty(k, v);
  };

// What JSX made (made, an element as Solid makes it) as an element of the class of, for code that holds it as one (the
// problem line, the oval's shapes, a link out of a dialog); else a TypeError naming what ("the problem line").
export function asElement<E extends Element>(made: unknown, of: new () => E, what: string): E {
  if (made instanceof of) return made;
  throw new TypeError(`${what} was drawn as no element`);
}
