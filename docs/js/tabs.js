// Moving between tabs. The oval behind the current tab is one element per row of tabs. Going to another tab, it
// moves like a slime: it reaches out a thin arm to the new tab, a blob gathers at the arm's tip and swells around
// the tab, a little too big for a moment, while the old oval drains into the arm and the arm is drawn in. The page
// itself slides like a phone's: the next section comes in from the side the swipe or the tab is on. With reduced
// motion, the oval moves at once and the page only changes.
import { h } from './ui.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const last = new WeakMap();       // a row of tabs → where its oval is
const box = a => ({ left: a.offsetLeft, top: a.offsetTop, width: a.offsetWidth, height: a.offsetHeight });
const px = b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, `${v}px`]));
const SLIME = { ms: 640, arm: 0.32, easing: 'cubic-bezier(.4, 0, .2, 1)' };      // ms; the arm's share of a tab's height

// Put the row's oval behind its current tab: moving there, unless still (on a resize) or there was none
export function pill(nav, { still = false } = {}) {
  const tab = nav.querySelector('a.active');
  const oval = nav.querySelector(':scope > .pill') || nav.insertBefore(h('span', { class: 'pill', 'aria-hidden': 'true' }), nav.firstChild);
  if (!tab || nav.hidden) { oval.hidden = true; last.delete(nav); return; }
  const was = last.get(nav), to = box(tab);
  last.set(nav, to);
  oval.hidden = false;
  Object.assign(oval.style, px(to));
  if (still || !was || calm() || (was.left === to.left && was.top === to.top)) return;
  absorb(nav, oval, was, to);
}

// The slime's move from one tab's box to another's (see above)
function absorb(nav, oval, was, to) {
  const timing = { duration: SLIME.ms, easing: SLIME.easing };
  const rightward = to.left > was.left;
  const from = was.left + was.width / 2, at = to.left + to.width / 2;      // the two tabs' middles
  const thick = Math.round(to.height * SLIME.arm);
  const span = (a, b) => ({ left: `${Math.min(a, b)}px`, width: `${Math.abs(b - a)}px` });
  // the old oval, left behind: it holds on, then drains toward the arm
  const old = h('span', { class: 'pill', 'aria-hidden': 'true' });
  Object.assign(old.style, px(was), { transformOrigin: rightward ? 'right center' : 'left center' });
  // the arm: a thin band, centred on the row, from the old tab's middle to the new one's
  const arm = h('span', { class: 'pill', 'aria-hidden': 'true' });
  Object.assign(arm.style, { top: `${to.top + (to.height - thick) / 2}px`, height: `${thick}px`, ...span(from, from) });
  nav.insertBefore(old, oval);
  nav.insertBefore(arm, oval);
  old.animate([
    { transform: 'scale(1, 1)', opacity: 1 },
    { transform: 'scale(1, .9)', opacity: 1, offset: 0.35 },
    { transform: 'scale(.12, .36)', opacity: 1, offset: 0.58 },
    { transform: 'scale(0, .32)', opacity: 0, offset: 0.62 },
    { transform: 'scale(0, .32)', opacity: 0 },
  ], timing);
  arm.animate([
    span(from, from),
    { ...span(from, at), offset: 0.4 },
    { ...span(from, at), offset: 0.6 },
    { ...span(from + (at - from) * 0.85, at), offset: 0.85 },
    span(at, at),
  ], timing);
  oval.style.transformOrigin = rightward ? 'left center' : 'right center';
  oval.animate([
    { transform: 'scale(0, .3)', opacity: 0 },
    { transform: 'scale(0, .3)', opacity: 0, offset: 0.38 },      // nothing until the arm gets there
    { transform: 'scale(.12, .32)', opacity: 1, offset: 0.4 },
    { transform: 'scale(.55, .7)', offset: 0.6 },
    { transform: 'scale(1.06, 1.12)', offset: 0.82 },
    { transform: 'scale(1, 1)' },
  ], timing).finished.finally(() => { old.remove(); arm.remove(); oval.style.transformOrigin = ''; });
}

// Change the page as a slide to the next (1) or previous (-1) section, or at once
export function slide(direction, change) {
  if (!direction || !document.startViewTransition || calm()) { change(); return; }
  const root = document.documentElement, main = document.getElementById('main');
  root.dataset.vt = direction > 0 ? 'ahead' : 'back';
  main.style.viewTransitionName = 'section';
  document.startViewTransition(change).finished.finally(() => { main.style.viewTransitionName = ''; delete root.dataset.vt; });
}
