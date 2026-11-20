// What dom.ts held that draws nothing: the types of an element's contents and classes, an id no other element has, and
// two ways to wait (a pause in typing, a frame after a resize). A Solid view (.tsx), which imports nothing of dom.ts
// (house/legacy), takes them from here.
import type { ClassName } from './classes.ts';

// what an element holds: nodes and text, nested as lists; null, undefined and false hold nothing
export type Kid = Node | string | number | false | null | undefined | readonly Kid[];
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

// What JSX made (made, an element as Solid makes it) as an element of the class of, for code that holds it as one (the
// problem line, the oval's shapes, a link out of a dialog); else a TypeError naming what ("the problem line").
export function asElement<E extends Element>(made: unknown, of: new () => E, what: string): E {
  if (made instanceof of) return made;
  throw new TypeError(`${what} was drawn as no element`);
}
