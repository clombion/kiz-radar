// The address the page shows a view for, as one signal: routes.ts's routeOf, read as the page starts and again on each
// hashchange, whose every move is a new value (equals: false), as each was a new view before. routes.ts stays the one
// source of the routes; this only says when the address it reads has moved. A view's own state written into the
// address bar (routes.ts showInAddressBar, a replaceState) fires no hashchange and shows no new view: it is no new
// address here either.
import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { routeOf } from './routes.ts';

// a view's name, the parts after it, its query, and the address an older link has moved to (routes.ts routeOf)
export interface Address {
  readonly name: string;
  readonly sub: readonly string[];
  readonly qs: string;
  readonly moved: string | null;
}

const here = (): Address => routeOf(location.href, document.baseURI);

// the address, until the owner it is made in is disposed
export function createAddress(): Accessor<Address> {
  const [address, setAddress] = createSignal(here(), { equals: false });
  const moved = () => {
    setAddress(here());
  };
  addEventListener('hashchange', moved);
  onCleanup(() => {
    removeEventListener('hashchange', moved);
  });
  return address;
}
