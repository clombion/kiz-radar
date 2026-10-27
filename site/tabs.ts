// Moving between tabs. The oval behind the current tab lives in a layer of its own per row of tabs, drawn through the
// gooey filter of index.html: shapes in it are blurred and their edges sharpened again, so two that come close flow
// into one with a soft neck between them, like liquid. Going to another tab, the oval moves like a slime: it bulges
// toward the new tab and pushes out an arm with a drop at its tip; where the drop lands, the new oval swells and
// wobbles to rest (a damped spring), while the old one drains into the arm and the arm is drawn in after it. The
// page itself slides like a phone's: the next section comes in from the side the swipe or the tab is on. With
// reduced motion, the oval moves at once and the page only changes.
import { h } from './dom.ts';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// a box in a row of tabs, in px
type Box = { left: number; top: number; width: number; height: number };
const last = new WeakMap<HTMLElement, Box>(); // a row of tabs → where its oval is
// a row of tabs → its oval; the slime's other shapes share its class, but only while it moves
const ovals = new WeakMap<HTMLElement, HTMLElement>();
const box = (a: HTMLElement): Box => ({
  left: a.offsetLeft,
  top: a.offsetTop,
  width: a.offsetWidth,
  height: a.offsetHeight,
});
const px = (b: Readonly<Record<string, number>>): Record<string, string> =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, `${v}px`]));
const PAD = 12; // px: the goo layer reaches this far past its row (site.css .goo), so the blur isn't cut
const SLIME = { ms: 760, arm: 0.36, drop: 0.62 }; // ms; the arm's and the drop's share of a tab's height
// a damped spring: past the mark, back, and still (samples of 1 - e^(-ζωt)(cos ω_d t + ζ/√(1-ζ²) sin ω_d t))
const SPRING =
  'linear(0, 0.077, 0.262, 0.496, 0.729, 0.927, 1.074, 1.164, 1.202, 1.199, 1.169, 1.123, 1.074, 1.03, 0.995, 0.972, 0.96, 0.958, 0.962, 0.971, 0.981, 0.99, 0.998, 1.004, 1.007, 1.009, 1.008, 1.007, 1.005, 1.003, 1)';
const SOFT = 'cubic-bezier(.45, 0, .2, 1)';

// Put the row's oval behind its current tab: moving there, unless still (on a resize) or there was none
export function pill(nav: HTMLElement, { still = false } = {}): void {
  const tab = nav.querySelector<HTMLElement>('a.active');
  const goo =
    nav.querySelector<HTMLElement>(':scope > .goo') ??
    nav.insertBefore(h('span', { class: 'goo', 'aria-hidden': 'true' }), nav.firstChild);
  const oval = ovals.get(nav) ?? goo.appendChild(h('span', { class: 'pill' }));
  ovals.set(nav, oval);
  // a move still running gives way to this one: its shapes go, and the oval starts from where it was going
  for (const shape of goo.querySelectorAll('.pill')) if (shape !== oval) shape.remove();
  for (const a of oval.getAnimations()) a.cancel();
  if (!tab || nav.hidden) {
    oval.hidden = true;
    last.delete(nav);
    return;
  }
  const was = last.get(nav),
    to = box(tab);
  last.set(nav, to);
  oval.hidden = false;
  Object.assign(oval.style, px(inGoo(to)));
  if (still || !was || calm() || (was.left === to.left && was.top === to.top)) return;
  absorb(goo, oval, inGoo(was), inGoo(to));
}

const inGoo = (b: Box): Box => ({ ...b, left: b.left + PAD, top: b.top + PAD });

// The slime's move from one tab's box to another's, in the goo layer's coordinates (see above)
function absorb(goo: HTMLElement, oval: HTMLElement, was: Box, to: Box): void {
  const time = (easing = SOFT) => ({ duration: SLIME.ms, easing });
  const dir = to.left > was.left ? 1 : -1;
  const from = was.left + was.width / 2,
    at = to.left + to.width / 2,
    mid = to.top + to.height / 2;
  const blob = (size: number, x: number) => ({
    left: `${x - size / 2}px`,
    top: `${mid - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  const span = (a: number, b: number, thick: number) => ({
    left: `${Math.min(a, b)}px`,
    width: `${Math.abs(b - a)}px`,
    top: `${mid - thick / 2}px`,
    height: `${thick}px`,
  });
  const arm = to.height * SLIME.arm,
    drop = to.height * SLIME.drop;
  const part = (style: Readonly<Record<string, string>>) => {
    const e = h('span', { class: 'pill' });
    Object.assign(e.style, style);
    return goo.insertBefore(e, oval);
  };
  // the old oval: it leans toward the new tab, then drains away into the arm
  const old = part({ ...px(was), transformOrigin: dir > 0 ? 'right center' : 'left center' });
  old.animate(
    [
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.06, .94)', offset: 0.22 },
      { transform: 'scale(.7, .8)', offset: 0.42 },
      { transform: 'scale(.15, .45)', offset: 0.6 },
      { transform: 'scale(0, .3)', offset: 0.66 },
      { transform: 'scale(0, .3)' },
    ],
    time(),
  );
  // the arm: thick where it leaves, thinner as it stretches, drawn in after the old oval is gone
  const reach = part(span(from, from, arm));
  reach.animate(
    [
      span(from, from, arm),
      { ...span(from, at, arm * 0.7), offset: 0.4 },
      { ...span(from + dir * was.width * 0.25, at, arm * 0.65), offset: 0.6 },
      { ...span(at - dir * to.width * 0.1, at, arm * 0.8), offset: 0.82 },
      span(at, at, arm),
    ],
    time(),
  );
  // the drop at the arm's tip, travelling to the new tab
  const tip = part(blob(drop * 0.7, from));
  tip.animate(
    [
      blob(drop * 0.7, from),
      { ...blob(drop, at - dir * to.width * 0.15), offset: 0.4 },
      { ...blob(drop * 0.9, at), offset: 0.55 },
      blob(0, at),
    ],
    time(),
  );
  // the new oval: nothing until the drop lands, then it swells past its size and wobbles to rest
  oval.style.transformOrigin = 'center';
  const grow = oval.animate(
    [
      { transform: 'scale(0, 0)', opacity: 0, easing: 'linear' },
      { transform: 'scale(0, 0)', opacity: 0, offset: 0.36, easing: 'linear' },
      { transform: 'scale(.3, .55)', opacity: 1, offset: 0.4, easing: SPRING },
      { transform: 'scale(1, 1)' },
    ],
    { duration: SLIME.ms, easing: 'linear' },
  );
  // once it rests, or when the next move cancels it
  const done = () => {
    old.remove();
    reach.remove();
    tip.remove();
    oval.style.transformOrigin = '';
  };
  grow.addEventListener('finish', done);
  grow.addEventListener('cancel', done);
}

// Change the page as a slide to the next (1) or previous (-1) section, or at once
export function slide(direction: number, change: () => void): void {
  const main = document.querySelector('#main');
  if (!(direction && main instanceof HTMLElement && 'startViewTransition' in document) || calm()) {
    change();
    return;
  }
  const root = document.documentElement;
  root.dataset['vt'] = direction > 0 ? 'ahead' : 'back';
  main.style.viewTransitionName = 'section';
  void document.startViewTransition(change).finished.finally(() => {
    main.style.viewTransitionName = '';
    root.removeAttribute('data-vt');
  });
}
