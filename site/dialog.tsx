// A dialog over the page (the search, and the quick views: who's going, a festival's flights, its passes), drawn by
// Solid. It has a history entry of its own, so a phone's back button closes it instead of leaving the page; closing it
// any other way (×, Escape, a tap outside) removes that entry. go() opens a link once the entry is gone, so the link
// isn't undone by it.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createSignal, flush } from 'solid-js';
import { atEnd, Reported } from './placed.tsx';
import { done } from './report.ts';
import { go } from './routes.ts';

interface Modal {
  readonly open: (from?: Element | null) => boolean;
  readonly shut: () => Promise<unknown>;
  readonly go: (href: string) => Promise<void>;
}
// a dialog: its class, its name (its words, or the id of what says them), what Escape does first, and what it holds
interface DialogProps {
  readonly class: 'search' | 'peek';
  readonly label?: string;
  readonly labelledBy?: string;
  readonly onCancel?: (ev: Event) => void;
  readonly children: JSX.Element;
}
// A dialog's host and its <Dialog>, which the host opens and closes once it is drawn.
export function modal(): Modal & { readonly Dialog: (props: DialogProps) => JSX.Element } {
  let dlg: HTMLDialogElement | undefined, // once its <Dialog> is drawn
    pushed = false,
    returnTo: Element | null = null;
  async function shut(): Promise<void> {
    if (dlg?.open === true) dlg.close();
    if (!pushed) return;
    pushed = false;
    await new Promise((gone) => {
      addEventListener('popstate', gone, { once: true });
      history.back();
    });
  }
  // the back button
  addEventListener('popstate', () => {
    if (dlg?.open === true) {
      pushed = false;
      dlg.close();
    }
  });
  const drawn = (el: HTMLDialogElement) => {
    dlg = el;
  };
  // Escape, or any of the above; an event of an earlier closing, sent once the dialog is open again, is left alone
  const closed = () => {
    if (dlg?.open === true) return;
    done(shut(), 'closing a dialog');
    if (returnTo instanceof HTMLElement) returnTo.focus();
  };
  return {
    // false when the dialog is open already, or when its <Dialog> is not drawn; its history entry pushed unless the
    // last closing's is still there (opened again before its step back), which it takes again
    open(from = document.activeElement) {
      if (dlg?.isConnected !== true || dlg.open) return false;
      returnTo = from;
      dlg.showModal();
      if (!pushed) history.pushState({ modal: true }, '');
      pushed = true;
      return true;
    },
    shut,
    go: async (href) => {
      await shut();
      go(href);
    },
    Dialog: (props) => (
      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- a tap on the backdrop, which the keyboard does with Escape (cancel, then close)
      <dialog
        ref={drawn}
        class={props.class}
        aria-label={props.label}
        aria-labelledby={props.labelledBy}
        onClose={closed}
        onCancel={(ev) => props.onCancel?.(ev)}
        // a tap on the backdrop, which is the dialog's own
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) done(shut(), 'closing a dialog');
        }}
      >
        {props.children}
      </dialog>
    ),
  };
}

// A link out of a dialog: it goes once the dialog's history entry is gone, so the entry doesn't undo it (Modal.go).
export const leaving = (m: Modal, href: string, words: JSX.Element): JSX.Element => (
  <a
    href={href}
    onClick={(ev) => {
      ev.preventDefault();
      done(m.go(href), 'leaving a dialog');
    }}
  >
    {words}
  </a>
);

// A quick view over the page (who's going, a festival's passes, its flights): a head of a lead (faces, when there are
// some), a title and the line under it, and ×; a body; a foot. Drawn at the end of <body> when first asked for, empty;
// show() draws what its opener hands it, each part drawn inside the dialog from its function, in a boundary of its own
// that reports a part that throws and draws nothing in its place, so the dialog, its × and its history entry stay. The
// body's scroll goes back to its top. What is shown is flushed, so the dialog holds it when it opens.
export interface Shown {
  readonly lead?: () => JSX.Element;
  readonly title: string;
  readonly sub: () => JSX.Element;
  readonly body: () => JSX.Element;
  readonly foot?: () => JSX.Element;
}
export interface Peek {
  readonly m: Modal;
  readonly show: (what: Shown) => void;
}
export function peek(id: string): Peek {
  const m = modal();
  const [shown, setShown] = createSignal<Shown | null>(null);
  let body: HTMLDivElement | undefined;
  // a part of what is shown, in its boundary
  const part = (which: 'lead' | 'sub' | 'body' | 'foot') => (
    <Reported where="a quick view">{shown()?.[which]?.()}</Reported>
  );
  atEnd('a quick view', () => (
    <m.Dialog class="peek" labelledBy={id}>
      <div class="peek-head">
        <span class="peek-faces">{part('lead')}</span>
        <div>
          <h2 id={id}>{shown()?.title}</h2>
          <p class="sub">{part('sub')}</p>
        </div>
        <button type="button" class="peek-close" aria-label="Close" onClick={() => done(m.shut(), 'closing a dialog')}>
          ×
        </button>
      </div>
      <div ref={body} class="peek-body">
        {part('body')}
      </div>
      <div class="peek-foot">{part('foot')}</div>
    </m.Dialog>
  ));
  // its body, once drawn: none when its boundary drew nothing (reported), which nothing can be shown in
  if (!body) throw new Error(`the quick view ${id} was not drawn`);
  const drawn = body;
  return {
    m,
    show(what) {
      flush(() => setShown(what));
      drawn.scrollTop = 0;
    },
  };
}
