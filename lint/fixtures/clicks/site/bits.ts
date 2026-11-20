// Exempt: bits.ts's own() keeps a control's click from its card.
export const own = (event: Event): void => {
  event.stopPropagation();
};
