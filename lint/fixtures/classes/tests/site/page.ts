// What house/classes refuses in a test too: a test reads what the page shows, not its classes.
declare const card: HTMLElement;
export const open = card.classList.contains('open'); // refused
