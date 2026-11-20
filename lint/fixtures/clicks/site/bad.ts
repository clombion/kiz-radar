// What house/clicks refuses outside bits.ts and swipe.ts: an event's stopPropagation() called, on a parameter or a
// property.
export const stop = (event: Event): void => {
  event.stopPropagation(); // refused
};
export const stopHeld = (held: { event: Event }): void => {
  held.event.stopPropagation(); // refused
};
