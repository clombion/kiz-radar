// The shell's seam, beside the views' (mount.tsx): a part of the page that Solid draws outside any view, once, for the
// page's life. Each is drawn under the page's owner (owner.ts), as a view is, in an error boundary that reports what
// went wrong (report.ts) and draws nothing, so a throw in one part neither halts Solid for the rest of the page nor
// takes the other parts with it; its clicks are delegated to <body> (body.ts). A part is drawn before a marker that
// stays, an empty Text node, never one of the page's own elements, and the drawing is flushed: the part is there when
// the call returns, as an h() element was.
import { insert } from '@solidjs/web';
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Component, createRoot, Errored, flush, runWithOwner } from 'solid-js';
import { startOfBody } from './body.ts';
import { page } from './owner.ts';
import { report } from './report.ts';

// What is drawn in a boundary that reports a throw, named where (as report.ts says it), and draws nothing in its place:
// a part of the shell, or what a piece draws later (a card's details, a quick view's parts, the search's results, a
// day's popover), so that the rest of the page, and Solid, go on.
const reported = (e: unknown, where: string): null => {
  report(e, where);
  return null;
};
export const Reported = (props: { readonly where: string; readonly children: JSX.Element }): JSX.Element => (
  <Errored fallback={(e) => <>{reported(e(), props.where)}</>}>{props.children}</Errored>
);

// Part, named where, drawn in parent before marker, in its boundary; the function that disposes it
function draw(where: string, Part: Component, parent: Node, marker: Node): () => void {
  const dispose = runWithOwner(page, () =>
    createRoot((disposer) => {
      const tree = (
        <Reported where={where}>
          <Part />
        </Reported>
      );
      insert(parent, () => tree, marker);
      return disposer;
    }),
  );
  flush();
  return dispose;
}

// Part in el's place: el replaced by the marker, the part drawn before it
export function inPlaceOf(el: Element, where: string, Part: Component): void {
  const marker = new Text();
  el.replaceWith(marker);
  const parent = marker.parentNode;
  if (parent === null) throw new Error(`${where}: the element to draw in place of is in no page`);
  draw(where, Part, parent, marker);
}

// Part inside el, after what it holds: before a marker appended to it
export function inside(el: Element, where: string, Part: Component): void {
  draw(where, Part, el, el.appendChild(new Text()));
}

// Part at the start of <body>, after its start (body.ts), where the problem line is put before it
export function atStart(where: string, Part: Component): void {
  const start = startOfBody();
  draw(where, Part, document.body, document.body.insertBefore(new Text(), start.nextSibling));
}

// Part at the end of <body>, after what is there: before a marker appended to it
export function atEnd(where: string, Part: Component): void {
  draw(where, Part, document.body, document.body.appendChild(new Text()));
}

// Part in place of what el holds, emptied first, as render empties an element it disposes (main.ts's <main>, whose
// view the page mid-update replaces); the function that disposes it
export function instead(el: Element, where: string, Part: Component): () => void {
  el.textContent = '';
  return draw(where, Part, el, el.appendChild(new Text()));
}
