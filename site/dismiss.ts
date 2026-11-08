// A card shown over the page from something on it (a day's popover, the names behind a roster's text, what a list is
// behind its (i)): one open at a time, site-wide; it closes on Escape wherever the focus is, when the focus leaves what
// it belongs to, and on a tap outside that, and it is placed again when the window's size changes. Each card says when
// it opens and closes (opened, closed); the rule of when it goes away is this one.

// A screen wide enough for a card to float beside what opened it (a day's popover, a roster's names), as the
// stylesheet's @media (min-width: 700px) blocks lay the community's page out; narrower, a card goes in the page's flow.
export const WIDE = '(min-width: 700px)';

interface Shown {
  close: () => void;
}
let current: Shown | null = null; // the card open, of the whole page

export function dismissable({
  within,
  close,
  place,
  signal,
}: {
  within: () => readonly Element[]; // what the card belongs to: its openers, the card itself
  close: () => void; // hides it (and then calls closed)
  place?: () => void; // places it again, when the window's size changes
  signal?: AbortSignal;
}): { opened: () => void; closed: () => void } {
  const me: Shown = { close };
  const opts: AddEventListenerOptions = signal === undefined ? {} : { signal };
  const inside = (t: EventTarget | null) => t instanceof Node && within().some((el) => el.contains(t));
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && current === me) close();
    },
    opts,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (current === me && !inside(e.target)) close();
    },
    opts,
  );
  document.addEventListener(
    'focusout',
    (e) => {
      // the focus leaving what the card belongs to, for somewhere else on the page (not to nowhere: a tap on a card's
      // own text takes the focus nowhere, and the pointer rule says what that does)
      if (current === me && inside(e.target) && e.relatedTarget !== null && !inside(e.relatedTarget)) close();
    },
    opts,
  );
  addEventListener(
    'resize',
    () => {
      if (current === me) place?.();
    },
    opts,
  );
  return {
    opened: () => {
      if (current !== null && current !== me) current.close();
      current = me;
    },
    closed: () => {
      if (current === me) current = null;
    },
  };
}
