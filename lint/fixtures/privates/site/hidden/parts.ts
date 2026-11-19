// The module the fixtures import: exports marked @private and @package, as JSDoc tags or @access, before the
// declaration or before an exported one's own; a tag later in a line, a line comment or a list's comment marks nothing.
/** @private */
export const secret = 1;

/** @package */
export const shared = 2;

/**
 * Kept for the folder.
 * @access package
 */
export function helper(): number {
  return shared;
}

/** @access private */
export class Hidden {}

/** @private */
export type Secret = string;

/**
 * @private
 */
export const first = 1,
  second = 2;

/** @private */
export const { left, right: renamed } = { left: 1, right: 2 };

/** @deprecated */
/** @package */
export const older = 3;

/** @private */
// a note between them
export const noted = 4;

/** @private */
const listed = 5;
export { listed, listed as alias };

const plain = 6;
/** @private */
export { plain };

/** says @private in passing */
export const prose = 7;

// @private
export const commented = 8;

/** @public */
export const open = 9;

/** @private */
export default secret;
