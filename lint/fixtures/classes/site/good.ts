// The intended way in a module that draws nothing: what an element is, read from its attributes, not its classes.
declare const card: HTMLElement;
export const open = card.getAttribute('aria-expanded') === 'true';
export const named = card.dataset['key'];
