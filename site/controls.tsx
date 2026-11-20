// The controls the views share, drawn by Solid: a row of choices pressed (segments), and the line saying what an
// address asked that the view has no choice for (leftOut). dom.ts's for the h() views, which a .tsx imports nothing of
// (house/legacy).
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Accessor, Show } from 'solid-js';

// A row of choices named label, one of them on (a segmented control): each is a button pressed while it is the choice.
// Its buttons are drawn anew whenever on is read anew (each choice of the view's, as each render drew the h() row
// again), so a button pressed goes, with the focus, as it did.
export const segments = <V extends string>(
  label: string,
  options: readonly (readonly [V, string])[],
  on: Accessor<V>,
  choose: (v: V) => void,
): JSX.Element => (
  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a segmented control's row, its markup kept as dom.ts's views drew it during the port (revisit after 4.10)
  <div class="seg" role="group" aria-label={label}>
    <Show when={{ now: on() }} keyed>
      {({ now }) =>
        options.map(([v, words]) => (
          <button
            type="button"
            class={{ 'is-on': v === now }}
            aria-pressed={v === now ? 'true' : 'false'}
            onClick={() => choose(v)}
          >
            {words}
          </button>
        ))
      }
    </Show>
  </div>
);

// what an address asked that the view has no such choice for, said at the top of the view
export const leftOut = (dropped: readonly string[]): JSX.Element =>
  dropped.length === 0 ? null : (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a line that says what the address asked in vain, its markup kept as festivals.ts drew it during the port (revisit after 4.10)
    <p class={['muted', 'left-out']} role="status">
      {`The link asks for ${dropped.join(', ')}, which ${dropped.length === 1 ? 'is' : 'are'} not among the choices here.`}
    </p>
  );
