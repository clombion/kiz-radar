// A dialog over the page (the search, the quick view of who's going). It has a history entry of its own, so a
// phone's back button closes it instead of leaving the page; closing it any other way (×, Escape, a tap outside)
// removes that entry. go() opens a link once the entry is gone, so the link isn't undone by it.
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
