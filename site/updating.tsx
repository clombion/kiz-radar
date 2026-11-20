// The page in place of any view while the site is mid-update for this browser (db.ts SiteUpdating), drawn by Solid:
// what is happening, how long it takes, and a reload by itself every minute, until the files agree or a quarter of an
// hour has gone by, past which the update is no longer the likely cause and the page stops trying.
import { onCleanup } from 'solid-js';
import { read, tab, write } from './kept.ts';
import { instead } from './placed.tsx';
import { plural } from './wording.ts';

const SINCE = 'kiz-radar-updating-since'; // when this tab first found the site mid-update, in ms
const AGAIN_S = 60;
const GIVE_UP_MS = 15 * 60_000;

// the site loaded whole: the next update starts its own count
export const updated = (): void => {
  write(tab, SINCE, null);
};

// the page while it shows, and how to dispose it once another view has taken its place
let shown: HTMLElement | undefined;
let dispose: (() => void) | undefined;

// The page in root's place. Drawn once however many find the site mid-update at once (the start, and a view that
// waits for the data): while the page shows, another call draws nothing, no second page and no second countdown. Drawn
// anew once a view has taken its place, as each view that fails for it calls again; the page before is disposed, and
// its countdown with it.
export function updatingPage(root: HTMLElement): void {
  if (shown?.isConnected === true) return;
  dispose?.();
  const now = Date.now();
  const since = Number(read(tab, SINCE) ?? now);
  write(tab, SINCE, String(since));
  const drawn = (el: HTMLElement) => {
    shown = el;
  };
  const again = () => (
    <button type="button" onClick={() => location.reload()}>
      Try again now
    </button>
  );
  if (now - since > GIVE_UP_MS) {
    dispose = instead(root, 'the page mid-update', () => (
      <section ref={drawn}>
        <header class="page-intro">
          <h1>Kiz Radar could not load</h1>
          <p>Its files still disagree after a quarter of an hour, which an update alone does not explain.</p>
          <p>Try again later.</p>
          {again()}
        </header>
      </section>
    ));
    return;
  }
  const seconds = plural(AGAIN_S, 'second');
  dispose = instead(root, 'the page mid-update', () => {
    // the countdown, the page's own: started once its seconds are drawn, set through their span each second, so the
    // count goes on whatever Solid is doing, and stopped with the page; a page that failed to draw has none
    let tick: ReturnType<typeof setInterval> | undefined;
    onCleanup(() => {
      clearInterval(tick);
    });
    const counted = (left: HTMLElement) => {
      let n = AGAIN_S;
      tick = setInterval(() => {
        n -= 1;
        left.textContent = plural(n, 'second');
        if (n === 0) {
          clearInterval(tick);
          location.reload();
        }
      }, 1000);
    };
    return (
      <section ref={drawn}>
        <header class="page-intro">
          <h1>Kiz Radar is being updated</h1>
          <p>
            A new version is on its way to every visitor, which takes up to ten minutes. Until it reaches you, your
            browser can get parts of the old one and the new one, which do not fit together.
          </p>
          <p>
            This page loads again by itself in <span ref={counted}>{seconds}</span>.
          </p>
          {again()}
        </header>
      </section>
    );
  });
}
