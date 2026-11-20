// The seam between the h() page and a Solid view (the shell's parts have their own, placed.tsx): a Solid view behind
// routes.ts's Show, the signature main.ts gives every view. It is rendered into the empty root main.ts hands it, with
// the address's parts and query as its props, and disposed when the signal aborts (another view shows), which empties
// root, as leaving an h() view leaves it unused. A view that throws, as it builds or later, says so in its place
// (report.ts cannotShow), within its error boundary: an error that escaped every boundary would halt each signal of the
// page, the router's among them (main.ts).
import { render } from '@solidjs/web';
import { type Component, Errored, runWithOwner } from 'solid-js';
import { page } from './owner.ts';
import { cannotShow } from './report.ts';
import type { Show } from './routes.ts';

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
    if (signal.aborted) dispose();
    else signal.addEventListener('abort', dispose, { once: true });
  };
