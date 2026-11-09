// The page in place of any view while the site is mid-update for this browser (db.ts SiteUpdating): what is happening,
// how long it takes, and a reload by itself every minute, until the files agree or a quarter of an hour has gone by,
// past which the update is no longer the likely cause and the page stops trying.
import { button, h } from './dom.ts';
import { read, tab, write } from './kept.ts';
import { plural } from './wording.ts';

const SINCE = 'kiz-radar-updating-since'; // when this tab first found the site mid-update, in ms
const AGAIN_S = 60;
const GIVE_UP_MS = 15 * 60_000;

// the site loaded whole: the next update starts its own count
export const updated = (): void => write(tab, SINCE, null);

export function updatingPage(root: HTMLElement): void {
  const now = Date.now();
  const since = Number(read(tab, SINCE) ?? now);
  write(tab, SINCE, String(since));
  const again = button({ onclick: () => location.reload() }, 'Try again now');
  const intro = (...lines: (string | HTMLElement)[]) =>
    root.replaceChildren(h('section', {}, h('header', { class: 'page-intro' }, ...lines)));
  if (now - since > GIVE_UP_MS) {
    intro(
      h('h1', {}, 'Kiz Radar could not load'),
      h('p', {}, 'Its files still disagree after a quarter of an hour, which an update alone does not explain.'),
      h('p', {}, 'Try again later.'),
      again,
    );
    return;
  }
  const left = h('span', {}, plural(AGAIN_S, 'second'));
  intro(
    h('h1', {}, 'Kiz Radar is being updated'),
    h(
      'p',
      {},
      'A new version is on its way to every visitor, which takes up to ten minutes. Until it reaches you, your ' +
        'browser can get parts of the old one and the new one, which do not fit together.',
    ),
    h('p', {}, 'This page loads again by itself in ', left, '.'),
    again,
  );
  let n = AGAIN_S;
  const tick = setInterval(() => {
    n -= 1;
    left.textContent = plural(n, 'second');
    if (n === 0) {
      clearInterval(tick);
      location.reload();
    }
  }, 1000);
}
