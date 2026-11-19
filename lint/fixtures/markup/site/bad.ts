// What house/markup refuses in the site's modules but icons.ts: innerHTML or outerHTML read or assigned, by name or by
// a key in quotes, and the methods that parse or write markup.
declare const card: HTMLElement;
declare const said: string;
card.innerHTML = said; // refused
card.outerHTML = said; // refused
card['innerHTML'] = said; // refused
export const shown = card.innerHTML; // refused
export const keyed = card['outerHTML']; // refused
card.insertAdjacentHTML('beforeend', said); // refused
card.setHTMLUnsafe(said); // refused
export const fragment = document.createRange().createContextualFragment(said); // refused
export const parsed = new DOMParser().parseFromString(said, 'text/html'); // refused
document.write(said); // refused
document.writeln(said); // refused
card.innerHTML = card.outerHTML; // refused: markup, markup
