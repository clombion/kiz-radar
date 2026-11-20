// What house/classes refuses in the site: an element's classList or className read, to change it or to test it.
declare const card: HTMLElement;
card.classList.add('open'); // refused
card.classList.toggle('open', true); // refused
export const open = card.classList.contains('open'); // refused
export const named = card.className; // refused
export const body = document.body.classList.length; // refused
