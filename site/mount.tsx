// The seam between main.ts and a view (the shell's parts have their own, placed.tsx): a Solid view behind routes.ts's
// Show, the signature main.ts gives every view. A view is rendered into the empty root main.ts hands it, from its
// address, and disposed when the signal aborts (another view shows), which empties root; its clicks are delegated to
// that root. A view that throws as it is first drawn says so in its place (report.ts cannotShow), within its error
// boundary: an error that escaped every boundary would halt each signal of the page, the router's among them
// (main.ts). What it draws again as the visitor changes it is drawn in a boundary of its own (Redrawn, redrawing,
// createDerived), which says a later throw as the page's.
import { render } from '@solidjs/web';
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Accessor, createEffect, createMemo, Errored, onCleanup, runWithOwner, untrack } from 'solid-js';
import { page } from './owner.ts';
import { reported } from './placed.tsx';
import { cannotShow } from './report.ts';
import type { Show } from './routes.ts';

// dispose called once signal aborts, or at once if it has
function disposedWith(signal: AbortSignal, dispose: () => void): void {
  if (signal.aborted) dispose();
  else signal.addEventListener('abort', dispose, { once: true });
}

// What a Solid view is given: the parts of the address after its name, its query, and the database loading (which a
// view that shows before it is in reads, the Festivals page; any other view is shown once it is in, main.ts).
export interface ViewProps {
  readonly sub: readonly string[];
  readonly qs: string;
  readonly data: Promise<unknown>;
}

// whether a view is being drawn for the first time: mounted's render, during which Solid draws it whole (measured)
let firstDraw = false;
function drawnFirst<T>(draw: () => T): T {
  firstDraw = true;
  try {
    return draw();
  } finally {
    firstDraw = false;
  }
}

// The view, as main.ts shows a view, rendered under the page's owner (owner.ts). It is a function of its address,
// which never changes over its life, called untracked inside its boundary, as Solid calls a component.
export const mounted =
  (view: (at: ViewProps) => JSX.Element): Show =>
  (root, sub, qs, { signal, data, name }) => {
    const shown = () => (
      <Errored fallback={(e) => <>{cannotShow(name, e())}</>}>{untrack(() => view({ sub, qs, data }))}</Errored>
    );
    disposedWith(
      signal,
      drawnFirst(() => runWithOwner(page, () => render(shown, root))),
    );
  };

// What a view draws again as the visitor changes it (a list on a choice, a panel on a pan, a row on a toggle, a query's
// result on a run), whose throw would otherwise take the whole view: as the view is first drawn, a throw is the view's
// (its boundary says it cannot be shown, as guarded did); later it is said as the page's (placed.tsx reported) and the
// part draws nothing, until its next change draws it again (Solid's Errored heals). A part drawn once and kept (a trip
// row's chart, its card) has no next change: it is drawn again the next time again turns true (the row opened again),
// as the h() row tried again on each opening. A throw the part says itself (says, true once said) is not the page's:
// the Festivals page's, as its festivals come in.
const redrawnThrew = (e: unknown, says?: (e: unknown) => boolean): null => {
  if (firstDraw) throw e;
  return says?.(e) === true ? null : reported(e, 'the page');
};
export const Redrawn = (props: {
  readonly children: JSX.Element;
  readonly again?: Accessor<boolean>;
  readonly says?: (e: unknown) => boolean;
}): JSX.Element => (
  <Errored
    fallback={(thrown, reset) => {
      const { again, says } = props;
      if (again !== undefined)
        createEffect(
          again,
          (on) => {
            if (on) reset();
          },
          { defer: true },
        );
      return redrawnThrew(thrown(), says);
    }}
  >
    {props.children}
  </Errored>
);
// The same for an effect that draws imperatively (the map's bubbles): its apply, whose throw would reach the view's
// boundary and take the whole view, said as Redrawn says one.
export const redrawing =
  <T,>(apply: (value: T) => void) =>
  (value: T): void => {
    try {
      apply(value);
    } catch (e) {
      redrawnThrew(e);
    }
  };

// What a view derives from its choices (a list's rows), drawn by a Redrawn part and read by other parts too (a count,
// a summary, a panel): a throw is held as its value, so that it is said once, by the Redrawn part (drawn, which throws
// it again), while the others read what it was before (last), as the h() view kept its count and summary as they were
// drawn; as the view is first drawn there is nothing before, and both throw, the view's.
type Held<T> = { readonly value: T } | { readonly thrown: unknown; readonly before: { readonly value: T } | undefined };
export function createDerived<T>(compute: () => T): { readonly drawn: Accessor<T>; readonly last: Accessor<T> } {
  const held = createMemo((was: Held<T> | undefined): Held<T> => {
    try {
      return { value: compute() };
    } catch (thrown) {
      return { thrown, before: was === undefined || 'value' in was ? was : was.before };
    }
  });
  return {
    drawn: () => {
      const now = held();
      if ('value' in now) return now.value;
      throw now.thrown;
    },
    last: () => {
      const now = held();
      if ('value' in now) return now.value;
      if (now.before === undefined) throw now.thrown;
      return now.before.value;
    },
  };
}

// A signal that aborts when the owner it is made under goes (a view left, a part drawn again): for a listener on the
// document or the window that must not outlive what made it.
export function disposal(): AbortSignal {
  const going = new AbortController();
  onCleanup(() => {
    going.abort();
  });
  return going.signal;
}
