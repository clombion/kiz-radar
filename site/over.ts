// A card shown over the page from something on it (a day's popover, the names behind a roster's text): one open at a
// time, site-wide, which closes on Escape wherever the focus is, when the focus leaves what it belongs to for
// somewhere else on the page, and on a tap outside that; placed again when the window's size changes while it is open.
// Which card is open is a signal, of the page's life; each card reads whether it is the one (shown). A card's
// listeners are made where it is drawn and taken away with it (onCleanup), and each asks first whether its card is the
// one open, before what it belongs to is searched, as dismissable did; what it does as it closes (closed) and as it is
// placed again (place) is flushed, so the card has changed when the event is handled.
import { type Accessor, createMemo, createRoot, createSignal, flush, onCleanup } from 'solid-js';

interface Card {
  readonly close: () => void;
}
const [open, setOpen] = createRoot(() => createSignal<Card | null>(null));

export function overPage({
  within,
  closed,
  place,
}: {
  readonly within: () => readonly Element[]; // what the card belongs to: its openers, the card itself
  readonly closed?: () => void; // the card's own state as it closes
  readonly place?: () => void; // places it again, when the window's size changes
}): { readonly shown: Accessor<boolean>; readonly opened: () => void; readonly close: () => void } {
  const close = (): void => {
    if (open() !== me) return;
    flush(() => {
      setOpen(null);
      closed?.();
    });
  };
  const me: Card = { close };
  const inside = (t: EventTarget | null) => t instanceof Node && within().some((el) => el.contains(t));
  const listening = new AbortController();
  onCleanup(() => {
    listening.abort();
  });
  const { signal } = listening;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close();
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (open() === me && !inside(e.target)) close();
    },
    { signal },
  );
  document.addEventListener(
    'focusout',
    (e) => {
      // the focus leaving what the card belongs to, for somewhere else on the page (not to nowhere: a tap on a card's
      // own text takes the focus nowhere, and the pointer rule says what that does)
      if (open() === me && inside(e.target) && e.relatedTarget !== null && !inside(e.relatedTarget)) close();
    },
    { signal },
  );
  addEventListener(
    'resize',
    () => {
      if (open() === me && place) flush(place);
    },
    { signal },
  );
  const shown = createMemo(() => open() === me);
  return {
    shown,
    opened: () => {
      const was = open();
      if (was === me) return;
      was?.close();
      flush(() => setOpen(me));
    },
    close,
  };
}
