// Moving between tabs. A row of tabs (Row: the header's, the sub-navigation's) has its oval behind the current tab, in
// a layer of its own drawn through the gooey filter of index.html: shapes in it are blurred and their edges sharpened
// again, so two that come close flow into one with a soft neck between them, like liquid. Going to another tab, the
// oval moves like a slime: it bulges toward the new tab and pushes out an arm with a drop at its tip; where the drop
// lands, the new oval swells and wobbles to rest (a damped spring), while the old one drains into the arm and the arm
// is drawn in after it. The page itself slides like a phone's: the next section comes in from the side the swipe or the
// tab is on. With reduced motion, the oval moves at once and the page only changes.
import { createEffect, flush, For } from 'solid-js';
import { asElement, onResize } from './bits.ts';
import { done } from './report.ts';
import { calm, transition } from './ui.ts';

// a box in a row of tabs, in px
type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
// a shape of the oval's layer: a span JSX draws, an element as Solid makes it
const shape = (): HTMLSpanElement => asElement(<span class="pill" />, HTMLSpanElement, 'a shape of the oval');

// The sub-navigation's oval, until it is a Row: its layer put in its row as the first move asks for it, and put back
// when the row's links are drawn again, its last box kept, so the next move starts from where the oval was.
const rows = new WeakMap<HTMLElement, { readonly goo: HTMLElement; readonly place: Placer }>();
function placerOf(nav: HTMLElement): Placer {
  const known = rows.get(nav);
  if (known) {
    if (known.goo.parentNode !== nav) nav.insertBefore(known.goo, nav.firstChild);
    return known.place;
  }
  const oval = shape();
  const goo = asElement(
    <span class="goo" aria-hidden="true">
      {oval}
    </span>,
    HTMLSpanElement,
    "the oval's layer",
  );
  nav.insertBefore(goo, nav.firstChild);
  const place = placer(nav, goo, oval);
  rows.set(nav, { goo, place });
  return place;
}
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

// A row's oval put behind tab, its current one: moving there, unless still (on a resize), there was none, or the
// row's tabs are others than before (the Explore row become the Friends tab's places), where the old box means nothing.
// No current tab, no oval. Its state, which each move changes: its box (null while hidden), the addresses of the row's
// tabs when the box was set, and the shapes of a move under way.
type Placer = (tab: HTMLElement | null, still: boolean) => void;
function placer(nav: HTMLElement, goo: HTMLElement, oval: HTMLElement): Placer {
  let at: Box | null = null,
    hrefs = '',
    moving: HTMLElement[] = [];
  return (tab, still) => {
    const links = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href')).join(' ');
    const same = hrefs === links;
    hrefs = links;
    // a move still running gives way to this one: its shapes go, and the oval starts from where it was going
    for (const s of moving.splice(0)) s.remove();
    for (const a of oval.getAnimations()) a.cancel();
    if (tab === null) {
      oval.hidden = true;
      at = null;
      return;
    }
    const was = same ? at : null,
      to = box(tab);
    at = to;
    oval.hidden = false;
    Object.assign(oval.style, px(inGoo(to)));
    if (still || !was || calm() || (was.left === to.left && was.top === to.top)) return;
    moving = absorb({ goo, oval }, inGoo(was), inGoo(to));
  };
}
const current = (nav: HTMLElement) => nav.querySelector<HTMLElement>('a.active');

// The sub-navigation's oval behind its current tab, until it is a Row: none while the row is hidden.
export function pill(nav: HTMLElement, { still = false } = {}): void {
  placerOf(nav)(nav.hidden === false ? current(nav) : null, still);
}

// a tab: its key, its words and its address (routes.ts's TABS)
type Link = readonly [key: string, label: string, href: string];
// A row of tabs: its links, the current one's key (none: null), and whether each link names its key (data-nav, the
// header's, which the stylesheet and the Festivals page's hint read).
interface RowProps {
  readonly class: 'tabs';
  readonly label: string;
  readonly links: readonly Link[];
  readonly on: string | null;
  readonly named: boolean;
}
// The row's <nav>, its oval's layer, drawn once and never again, and its links. Once Solid has drawn the links of each
// change, the oval is placed behind the current one; again, still, on each resize and once the web font is in, which
// may move the tabs.
export function Row(props: RowProps) {
  let nav!: HTMLElement, goo!: HTMLSpanElement, oval!: HTMLSpanElement;
  let place: Placer | undefined; // once the row is drawn
  const placed = (still: boolean) => {
    place ??= placer(nav, goo, oval);
    place(current(nav), still);
  };
  createEffect(
    () => [props.links, props.on],
    () => {
      placed(false);
    },
  );
  onResize(() => {
    placed(true);
  });
  const laidOut = async () => {
    await document.fonts.ready;
    placed(true);
  };
  done(laidOut(), 'laying out the tabs');
  return (
    <nav ref={nav} class={props.class} aria-label={props.label}>
      <span ref={goo} class="goo" aria-hidden="true">
        <span ref={oval} class="pill" />
      </span>
      <For each={props.links}>
        {([key, label, href]) => (
          <a
            href={href}
            data-nav={props.named ? key : undefined}
            class={props.on === key ? 'active' : undefined}
            aria-current={props.on === key ? 'page' : undefined}
          >
            {label}
          </a>
        )}
      </For>
    </nav>
  );
}

const inGoo = (b: Box): Box => ({ ...b, left: b.left + PAD, top: b.top + PAD });

// The slime's move from one tab's box to another's, in the goo layer's coordinates (see above); its shapes, which the
// next move removes if it starts before they are done
function absorb(
  { goo, oval }: { readonly goo: HTMLElement; readonly oval: HTMLElement },
  was: Box,
  to: Box,
): HTMLElement[] {
  const moving: HTMLElement[] = [];
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
    const e = shape();
    Object.assign(e.style, style);
    moving.push(e);
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
  const rest = () => {
    for (const s of moving.splice(0)) s.remove();
    oval.style.transformOrigin = '';
  };
  grow.addEventListener('finish', rest);
  grow.addEventListener('cancel', rest);
  return moving;
}

// the slides begun, the last one's number its own: a slide that ends after another began leaves that one's mark
let slides = 0;
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
  const mine = ++slides;
  done(
    // the change runs in the transition's callback, outside any effect: flushed, Solid's parts of it are drawn there,
    // so the transition's new state holds them
    transition(() => flush(change), 'changing section').finally(() => {
      if (mine !== slides) return;
      main.style.viewTransitionName = '';
      root.removeAttribute('data-vt');
    }),
    'changing section',
  );
}
