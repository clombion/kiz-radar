// What house/markup refuses in the site's Solid modules: the innerHTML or outerHTML prop, given a string, an expression
// or nothing, bare, in a namespace or in an object spread, which Solid sets as the property; and the DOM's own, as in a
// .ts module.
declare const said: string;
declare const card: HTMLElement;
export const set = <p innerHTML={said} />; // refused
export const literal = <p innerHTML="<b>x</b>" />; // refused
export const outer = <p outerHTML={said} />; // refused
export const namespaced = <p prop:innerHTML={said} />; // refused
export const valueless = <p innerHTML />; // refused
export const spread = <p {...{ innerHTML: said }} />; // refused
export const keyed = <p {...{ title: said, ['outerHTML']: said }} />; // refused
card.innerHTML = said; // refused
