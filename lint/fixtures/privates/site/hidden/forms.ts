// The forms the reading of a module must see through: a / that divides after a postfix operator or a non-null
// assertion, and one that starts a regular expression after a prefix !; a declaration overloaded, its strictest tag
// kept; a binding named type.
let i = 0;
export const n = [i++ / 2, 1];
export const m = [i-- / 2, 1];
declare const maybe: number | undefined;
export const k = [maybe! / 2, 1];
export const negated = [!/x/u.test('y'), 1];
export const odd = [{ valueOf: () => 4 } / 2, 1];

/** @private */
export const afterDivision = 1;

/** @private */
export function twice(a: number): number;
export function twice(a: number): number {
  return a;
}

/** @private */
const type = 10;
export { type };
