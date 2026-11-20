// Let through in a .ts module: a call naming the tag button that is no call of h(), and the word itself (a button is
// drawn in JSX).
declare const tagOf: (tag: string) => string;
export const named = tagOf('button');
export const tag = 'button';
