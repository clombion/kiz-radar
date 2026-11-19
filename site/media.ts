// The media queries the script shares with the stylesheet: each is also one of the stylesheet's @media, the same
// spelling (tests/site/styles.test.ts holds every query here to one there).
export const MEDIA = {
  // a screen wide enough for a card to float beside what opened it (a day's popover, a roster's names), as the
  // stylesheet lays the community's page out; narrower, a card goes in the page's flow
  WIDE: '(min-width: 700px)',
  // a visitor who asked for less motion
  REDUCED_MOTION: '(prefers-reduced-motion: reduce)',
} as const;
