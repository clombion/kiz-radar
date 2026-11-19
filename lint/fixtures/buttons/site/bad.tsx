// What house/buttons refuses in the site's Solid modules: h()'s button as in a .ts module, and a <button> whose type is
// not the string button: none, submit, reset, an expression, a type only in a spread, no value, a type given twice, a
// spread after the type.
declare const h: (tag: string, ...rest: unknown[]) => HTMLElement;

declare const kind: 'button' | 'submit';
declare const rest: { type: 'button' };
export const made = h('button'); // refused
export const bare = <button>Close</button>; // refused
export const submits = <button type="submit">Send</button>; // refused
export const resets = <button type="reset">Clear</button>; // refused
export const chosen = <button type={kind}>Send</button>; // refused
export const spread = <button {...rest}>Send</button>; // refused
export const valueless = <button type>Send</button>; // refused
export const twice = <button type="button" type="submit" />; // refused
export const respread = <button type="button" {...rest} />; // refused
export const inline = <button type="button" {...{ type: 'submit' }} />; // refused
