// What the page's owner holds (site/owner.ts), as Solid's development build, the tests', counts it (DEV): the roots it
// holds (a view shown, a part of the shell), and every owner under it, however deep (each root, and what a Solid view
// draws in it: its parts, their rows, their effects).
import { DEV } from 'solid-js';
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
