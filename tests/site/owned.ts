// What the page's owner holds (site/owner.ts), as Solid's development build, the tests', counts it (DEV): the roots it
// holds (a view shown, a part of the shell), and every owner under it, however deep (each root, and what a Solid view
// draws in it: its parts, their rows, their effects); and a part drawn again three times, holding as many each time.
import { DEV } from 'solid-js';
import { expect } from 'vitest';
import { page } from '../../site/owner.ts';

function counted(): {
  readonly getChildren: NonNullable<typeof DEV>['getChildren'];
  readonly top: NonNullable<typeof page>;
} {
  if (DEV === undefined || page === null) throw new Error("no development build of Solid, or no page's owner");
  return { getChildren: DEV.getChildren, top: page };
}
export const roots = (): number => {
  const { getChildren, top } = counted();
  return getChildren(top).length;
};
export const owners = (): number => {
  const { getChildren, top } = counted();
  let n = 0;
  for (const seen = [top]; seen.length > 0;) {
    const children = getChildren(seen.pop() ?? top);
    n += children.length;
    seen.push(...children);
  }
  return n;
};

// The owners under the page's after each of three draws of the same part, each draw done by `draw`: the same each time;
// and each a draw, the element of the part `drawn` finds before it gone after it.
export async function drawnAlike(
  drawn: () => Element | null | undefined,
  draw: () => void | Promise<void>,
): Promise<void> {
  const counts: number[] = [];
  for (const _ of [1, 2, 3]) {
    const before = drawn();
    if (before == null) throw new Error('the page has no part to draw again');
    await draw();
    expect(before.isConnected).toBe(false);
    counts.push(owners());
  }
  expect(counts).toEqual(counts.map(() => counts[0]));
}
