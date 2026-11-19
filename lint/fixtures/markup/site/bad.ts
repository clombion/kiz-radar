// What house/markup refuses in the site's modules but icons.ts: any member access to innerHTML or outerHTML, read or
// written however (a compound assignment, an optional chain, a destructuring, a loop's variable), by name or by a key
// in quotes, a destructured key of that name, and the methods that parse or write markup.
declare const card: HTMLElement;
declare const said: string;
declare const maybe: HTMLElement | null;
declare const saids: readonly string[];
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
card.innerHTML += said; // refused
card.outerHTML ??= said; // refused
card[`innerHTML`] = said; // refused
export const chained = maybe?.innerHTML; // refused
[card.innerHTML] = saids; // refused
({ said: card.outerHTML } = { said }); // refused
for (card.innerHTML of saids); // refused
export const { innerHTML } = card; // refused
export const { ['outerHTML']: outer } = card; // refused
