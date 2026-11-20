// The seam between the h() page and a Solid view (the shell's parts have their own, placed.tsx): a Solid view behind
// routes.ts's Show, the signature main.ts gives every view, and a Solid piece an h() view holds as an element (held).
// A view is rendered into the empty root main.ts hands it, with the address's parts and query as its props, and
// disposed when the signal aborts (another view shows), which empties root, as leaving an h() view leaves it unused.
// A view that throws, as it builds or later, says so in its place (report.ts cannotShow), within its error boundary:
// an error that escaped every boundary would halt each signal of the page, the router's among them (main.ts).
import { render } from '@solidjs/web';
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Component, createRoot, Errored, flatten, getOwner, runWithOwner, untrack } from 'solid-js';
import { asElement } from './bits.ts';
import './body.ts'; // <body> a root of delegated events, which a held piece's clicks reach
import { page } from './owner.ts';
import { cannotShow, report } from './report.ts';
import type { Show } from './routes.ts';

// dispose called once signal aborts, or at once if it has
function disposedWith(signal: AbortSignal, dispose: () => void): void {
  if (signal.aborted) dispose();
  else signal.addEventListener('abort', dispose, { once: true });
}

// The signals of the draws of a part an h() view draws again (a list, a panel, a line): each call's aborts when the next
// call is made, or when the view's signal aborts, so that what a draw holds (held) is taken away with it.
export function redraws(signal: AbortSignal): () => AbortSignal {
  let drawing = new AbortController();
  return () => {
    drawing.abort();
    drawing = new AbortController();
    return AbortSignal.any([signal, drawing.signal]);
  };
}

// what a Solid view is given: the parts of the address after its name, and its query
export interface ViewProps {
  readonly sub: readonly string[];
  readonly qs: string;
}

// the view, as main.ts shows a view, rendered under the page's owner (owner.ts)
export const mounted =
  (View: Component<ViewProps>): Show =>
  (root, sub, qs, { signal, name }) => {
    const dispose = runWithOwner(page, () =>
      render(
        () => (
          <Errored fallback={(e) => <>{cannotShow(name, e())}</>}>
            <View sub={sub} qs={qs} />
          </Errored>
        ),
        root,
      ),
    );
    disposedWith(signal, dispose);
  };

// A piece's top, refused when it is reactive (a function, or an array holding one): its boundary would draw it again
// where the h() code never reads it.
const reactive = (top: unknown): boolean =>
  typeof top === 'function' || (Array.isArray(top) && top.some((m: unknown) => reactive(m)));
function unchanging(made: JSX.Element, what: string): JSX.Element {
  if (reactive(made)) throw new TypeError(`${what} was drawn with a reactive top, which an h() view cannot hold`);
  return made;
}

// What a Solid piece draws, in a root of its own, for an h() view to hold: drawn whole when the call returns, its top
// what the h() code holds, which nothing draws again (a piece whose top is reactive, a function, is refused, naming
// what). Its root is under the page's owner, as a view is, disposed when the view's signal aborts (or at once, if it
// has); or, when the h() code drawing it runs inside Solid (called by a Solid part as it draws), under the owner it
// runs in, disposed with it (as that owner runs again, or goes). A piece that throws as it is drawn, in its body or in
// a reactive part (an expression of its JSX, run as an effect), throws to the h() code drawing it, as an h() element
// did, its root disposed: the part is drawn in an error boundary whose fallback keeps what was thrown, so no throw
// escapes to halt Solid for the page. So does what it drew, when read throws (read, the h() code's). A reactive part
// that throws later (on a click) is said under the words such a throw had before ("the page", reportUncaught's), and
// draws nothing.
function drawn<T>(signal: AbortSignal, what: string, part: () => JSX.Element, read: (made: unknown) => T): T {
  let dispose = (): void => undefined; // the root's, once it is made
  let thrown: { readonly e: unknown } | undefined; // what the first draw threw
  let first = true;
  const owner = getOwner();
  try {
    const made = runWithOwner(owner ?? page, () =>
      createRoot((disposer) => {
        dispose = disposer;
        const caught = (e: unknown): null => {
          if (first) thrown ??= { e };
          else report(e, 'the page');
          return null;
        };
        // the part as it is drawn, in its boundary, whose accessor is read once (flatten), untracked
        const shown = <Errored fallback={(e) => <>{caught(e())}</>}>{unchanging(part(), what)}</Errored>;
        return untrack((): unknown => flatten(shown));
      }),
    );
    first = false;
    if (thrown !== undefined) throw thrown.e;
    const value = read(made);
    if (owner === null) disposedWith(signal, dispose);
    return value;
  } catch (e) {
    dispose();
    throw e;
  }
}

// A Solid piece an h() view holds as an element of its own (a festival's card in its list), checked as an element of
// the class of (bits.ts asElement, naming what).
export const held = <E extends Element>(
  signal: AbortSignal,
  of: new () => E,
  what: string,
  part: () => JSX.Element,
): E => drawn(signal, what, part, (made) => asElement(made, of, what));

// A Solid piece an h() view holds as the nodes it is (who goes, in a line of other words): each text a text node. Its
// nodes are what the piece drew at its top; anything but nodes and text is refused, naming what.
export const heldNodes = (signal: AbortSignal, what: string, part: () => JSX.Element): Node[] =>
  drawn(signal, what, part, (made) => nodesOf(made, what));
const nodesOf = (made: unknown, what: string): Node[] => {
  if (made === null || made === undefined || typeof made === 'boolean') return [];
  if (made instanceof Node) return [made];
  if (typeof made === 'string' || typeof made === 'number') return [new Text(String(made))];
  if (Array.isArray(made)) return made.flatMap((m: unknown) => nodesOf(m, what));
  throw new TypeError(`${what} was drawn as something an h() view cannot hold, neither nodes nor text`);
};
