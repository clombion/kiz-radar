// The intended way: <Loading>, isPending() and <Errored>; and names that hold no state of their own: ui.ts's loading
// and pending.ts's exports imported, a parameter, a property, a store's key, a name that only starts like one.
import { createMemo, createStore, Errored, isPending, Loading } from 'solid-js';
import * as pending from '../../../../site/pending.ts';
import { reviewOf } from '../../../../site/pending.ts';
import { loading } from '../../../../site/ui.ts';

declare const get: (path: string) => Promise<string>;
export const shown = loading('Reading…');
export const read = pending.reviewOf;
export const review = reviewOf;
export const [store] = createStore({ loading: false, error: '' });
export const onError = (error: unknown) => String(error);
export const loadingWords = 'Loading…';
export function Card() {
  const said = createMemo(() => get('/data/x.json'));
  return (
    <Errored fallback={<p>Failed</p>}>
      <Loading fallback={<p>{store.loading}</p>}>
        <p aria-busy={isPending(() => said())}>{said()}</p>
      </Loading>
    </Errored>
  );
}
declare const runs: readonly { failed: boolean }[];
export const tally = (): number => {
  let n = 0;
  for (const failed of runs) if (failed.failed) n += 1;
  for (const error in runs) n += error.length;
  return n;
};
export const setLabel = (label: string): string => label;
export class Note {
  loadingWords = 'Loading…';
}
