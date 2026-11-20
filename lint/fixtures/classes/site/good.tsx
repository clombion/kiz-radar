// The intended way: JSX's class, one of the stylesheet's, a list of them or an object of them, a signal for one that
// changes.
declare const open: () => boolean;
export const card = <div class={['festival-card', { open: open() }]} />;
export const named = <p class="muted">Closed</p>;
