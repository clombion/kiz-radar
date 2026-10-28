// A dialog over the page (the search, the quick view of who's going). It has a history entry of its own, so a
// phone's back button closes it instead of leaving the page; closing it any other way (×, Escape, a tap outside)
// removes that entry. go() opens a link once the entry is gone, so the link isn't undone by it.
import { h } from './dom.ts';

export interface Modal {
  open: (from?: Element | null) => boolean;
  shut: () => Promise<unknown>;
  go: (href: string) => Promise<void>;
}
export function modal(dlg: HTMLDialogElement): Modal {
  let pushed = false,
    returnTo: Element | null = null;
  document.body.append(dlg);
  function shut(): Promise<unknown> {
    if (dlg.open) dlg.close();
    if (!pushed) return Promise.resolve();
    pushed = false;
    return new Promise((done) => {
      addEventListener('popstate', done, { once: true });
      history.back();
    });
  }
  dlg.addEventListener('click', (ev) => {
    if (ev.target === dlg) void shut();
  }); // a tap on the backdrop
  dlg.addEventListener('close', () => {
    void shut();
    if (returnTo instanceof HTMLElement) returnTo.focus();
  }); // Escape, or any of the above
  addEventListener('popstate', () => {
    if (dlg.open) {
      pushed = false;
      dlg.close();
    }
  }); // the back button
  return {
    open(from = document.activeElement) {
      if (dlg.open) return false;
      returnTo = from;
      dlg.showModal();
      history.pushState({ modal: true }, '');
      pushed = true;
      return true;
    },
    shut,
    go: (href) =>
      shut().then(() => {
        location.hash = href;
      }),
  };
}

// A quick view over the page (who's going, a festival's passes): a head of a lead (faces, when there are some), a
// title and the line under it, and ×; a body; a foot. Each view fills the parts.
export interface Peek {
  m: Modal;
  lead: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
}
export function peek(id: string): Peek {
  const title = h('h2', { id }),
    sub = h('p', { class: 'sub' }),
    lead = h('span', { class: 'peek-faces' });
  const body = h('div', { class: 'peek-body' }),
    foot = h('div', { class: 'peek-foot' });
  const close = h('button', { type: 'button', class: 'peek-close', 'aria-label': 'Close' }, '×');
  const m = modal(
    h(
      'dialog',
      { class: 'peek', 'aria-labelledby': id },
      h('div', { class: 'peek-head' }, lead, h('div', {}, title, sub), close),
      body,
      foot,
    ),
  );
  close.addEventListener('click', () => void m.shut());
  return { m, lead, title, sub, body, foot };
}
