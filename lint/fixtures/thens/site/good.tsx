// The intended way: the promise from a memo, read under <Loading>; an await where an event sends.
import { createMemo, Loading } from 'solid-js';

declare const get: (path: string) => Promise<string>;
declare const send: (said: string) => Promise<void>;
export const Card = () => {
  const said = createMemo(() => get('/data/x.json'));
  return (
    <Loading>
      <button type="button" onClick={async () => await send(said())}>
        {said()}
      </button>
    </Loading>
  );
};
