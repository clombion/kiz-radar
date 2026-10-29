// On a touch screen, a swipe left or right goes to the next or the previous section (routes.ts SECTIONS). Not from
// a field, anything that scrolls sideways or the screen's very edge (the phone's own back gesture), nor in a dialog;
// on a map, only from near the screen's sides, where the map leaves the touch to the swipe.
import { parseRoute, SECTIONS, sectionAt } from './routes.ts';

const SCROLLS = /auto|scroll/u;
const SWIPE = { distance: 60, steepest: 0.5, ms: 600, edge: 16, side: 56 }; // px; |dy|/|dx|; ms; px; px
const nearSide = (x: number) => x < SWIPE.side || x > innerWidth - SWIPE.side;
const offEdge = (x: number) => x > SWIPE.edge && x < innerWidth - SWIPE.edge;
const onMap = (el: Element) => el.closest('.leaflet-container') !== null;
function* ancestors(el: Element) {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) yield n;
}
const keepsSwipe = (el: Element) =>
  el.closest('input, textarea, select, dialog') !== null ||
  [...ancestors(el)].some((n) => n.scrollWidth > n.clientWidth && SCROLLS.test(getComputedStyle(n).overflowX));
const mapSide = (x: number, el: Element) => onMap(el) && nearSide(x) && offEdge(x);

// Listen for swipes on the whole page, once.
export function swipeBetweenSections(): void {
  // a touch near a map's side is the swipe's, so the map never starts a drag from it
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch' && e.target instanceof Element && mapSide(e.clientX, e.target)) e.stopPropagation();
    },
    { capture: true },
  );
  let touch: { x: number; y: number; at: number } | null = null;
  addEventListener(
    'touchstart',
    (e) => {
      const {
        touches: [t],
        target: el,
      } = e;
      touch = null;
      if (!(t && el instanceof Element)) return;
      if (mapSide(t.clientX, el)) e.stopPropagation();
      const free = onMap(el) ? mapSide(t.clientX, el) : offEdge(t.clientX) && !keepsSwipe(el);
      if (e.touches.length === 1 && free) touch = { x: t.clientX, y: t.clientY, at: e.timeStamp };
    },
    { capture: true, passive: true },
  );
  addEventListener(
    'touchend',
    (e) => {
      const from = touch,
        [t] = e.changedTouches;
      touch = null;
      if (!(from && t)) return;
      const dx = t.clientX - from.x,
        dy = t.clientY - from.y,
        quick = e.timeStamp - from.at < SWIPE.ms;
      if (!quick || Math.abs(dx) < SWIPE.distance || Math.abs(dy) > SWIPE.steepest * Math.abs(dx)) return;
      const here = sectionAt(parseRoute(location.hash).name);
      const next = here < 0 ? undefined : SECTIONS[here + (dx < 0 ? 1 : -1)];
      if (next) location.hash = next[1];
    },
    { passive: true },
  );
}
