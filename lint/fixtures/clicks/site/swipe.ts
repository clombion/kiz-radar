// Exempt: swipe.ts keeps a swipe from the map.
export const held = (event: PointerEvent): void => {
  event.stopPropagation();
};
