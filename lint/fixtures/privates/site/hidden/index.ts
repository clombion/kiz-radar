// The folder's index: what it marks @private is the folder's, what it marks @package its parent's; what it forwards
// keeps the visibility it was declared with.
/** @private */
export const inside = 1;

/** @package */
export const beside = 2;

export * from './parts.ts';
export { shared as forwarded } from './parts.ts';
