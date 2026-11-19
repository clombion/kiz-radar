// What house/buttons refuses in the site's modules but dom.ts: a button made by h(), with or without attributes and
// children.
import { h } from '../../../../site/dom.ts';

export const bare = h('button'); // refused
export const typed = h('button', { type: 'button' }, 'Close'); // refused
