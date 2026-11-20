// What house/buttons refuses in a .ts module of the site: a button made by h(), the hand-built way the views had before
// Solid, with or without attributes and children.
declare const h: (tag: string, ...rest: unknown[]) => HTMLElement;

export const bare = h('button'); // refused
export const typed = h('button', { type: 'button' }, 'Close'); // refused
export const optional = h?.('button'); // refused
export const generic = h<HTMLButtonElement>('button'); // refused
export const quoted = h(`button`); // refused
export const asserted = h('button' as const); // refused
