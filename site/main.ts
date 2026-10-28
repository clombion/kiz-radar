// Router and page shell. The shell and the Festivals sentence show as soon as site.json is in; the database
// loads alongside, and views that query it wait for it. Each view gets an AbortSignal that fires when you leave
// it: listeners it adds to document or window pass it, so nothing outlives the view.

import { artistsView } from './artists.ts';
import { countriesView } from './countries.ts';
import { load, loadSite, site } from './db.ts';
import { h } from './dom.ts';
import { artistHint, exploreHint } from './hints.ts';
import { mapView } from './map.ts';
import { currencySwitch } from './money.ts';
import { personView } from './people.ts';
import { EXPLORE, type Route, renamed, SECTIONS, type Show, TABS, type Tab } from './routes.ts';
import { initSearch } from './search.ts';
import { sentenceView } from './sentence.ts';
import { sqlView } from './tables.ts';
import { pill, slide } from './tabs.ts';
import { dayYear, home, loading, monthYear } from './ui.ts';

// the page's own parts, from index.html: one missing is a broken page
const part = (selector: string): HTMLElement => {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`index.html has no ${selector}`);
  return el;
};
const main = part('#main'),
  tabs = part('nav.tabs'),
  subnav = part('#subnav');
const data = load(); // starts now, alongside site.json
let leave: AbortController | undefined;
let at: string | null = null; // the view shown, by name

interface View {
  title: string | null;
  nav: Tab | null;
  // the view queries the database as it builds, so it shows once the database is in
  waitsForData: boolean;
  show: Show;
}
const FINDER: View = {
  title: null,
  nav: 'finder',
  waitsForData: false,
  show: (root, _, qs, opts) => sentenceView(root, qs, opts),
};
// each route's view: a route without one does not compile
const VIEWS: Readonly<Record<Route, View>> = {
  finder: FINDER,
  map: { title: 'Map', nav: 'explore', waitsForData: true, show: mapView },
  artists: { title: 'Artists', nav: 'explore', waitsForData: true, show: artistsView },
  countries: { title: 'Countries', nav: 'explore', waitsForData: true, show: (root, _, qs) => countriesView(root, qs) },
  sql: { title: 'SQL', nav: null, waitsForData: true, show: (root) => sqlView(root) },
  friends: { title: 'Friends', nav: 'friends', waitsForData: true, show: (root, sub) => personView(root, sub) },
};
const isRoute = (name: string): name is Route => Object.hasOwn(VIEWS, name);
const failed = (root: HTMLElement, e: unknown) =>
  root.replaceChildren(
    h('p', { class: 'status error' }, `Could not load the data: ${e instanceof Error ? e.message : String(e)}`),
  );

// the header's tabs and the footer's links, from routes.ts
tabs.append(...TABS.map(([nav, label, href]) => h('a', { href, 'data-nav': nav }, label)));
part('#footer-nav').append(...[...TABS.slice(0, -1), ...EXPLORE].map(([, label, href]) => h('a', { href }, label)));

const section = (name: string | null) => SECTIONS.findIndex(([k]) => k === name);
const tabRows = () => [tabs, subnav];

// Show the view the address names; toTop scrolls up to it (a new page, not the first one)
function route({ scrollUp = false } = {}): void {
  const [path = '', qs = ''] = (location.hash.slice(1) || 'finder').split('?');
  const moved = renamed(path);
  if (moved !== null) {
    location.replace(moved + (qs ? `?${qs}` : ''));
    return;
  }
  const [name = '', ...sub] = path.split('/');
  const from = section(at),
    to = section(name);
  at = name;
  slide(from >= 0 && to >= 0 && from !== to ? Math.sign(to - from) : 0, () => {
    show(name, sub, qs);
    if (scrollUp) window.scrollTo(0, 0);
  });
}

function show(name: string, sub: readonly string[], qs: string): void {
  const view = isRoute(name) ? VIEWS[name] : FINDER; // an address naming no view shows the festivals
  if (view.nav === 'explore') exploreHint.mark();
  if (name === 'artists' && sub[0]) artistHint.mark();
  leave?.abort();
  leave = new AbortController();
  for (const a of document.querySelectorAll<HTMLElement>('[data-nav]')) {
    const on = a.dataset['nav'] === view.nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  subnav.hidden = view.nav !== 'explore';
  subnav.replaceChildren(
    ...EXPLORE.map(([k, t, href]) =>
      h('a', { href, class: k === name ? 'active' : '', 'aria-current': k === name ? 'page' : null }, t),
    ),
  );
  for (const row of tabRows()) pill(row);
  const root = h('div', { class: 'view' });
  main.replaceChildren(root);
  const { signal } = leave;
  if (view.waitsForData) {
    root.append(loading('Loading the festival database…'));
    data.then(
      () => {
        if (!signal.aborted) {
          root.replaceChildren();
          view.show(root, sub, qs, { signal, data });
        }
      },
      (e: unknown) => failed(root, e),
    );
  } else view.show(root, sub, qs, { signal, data });
  document.title = view.title === null ? 'Kiz Radar' : `${view.title} · Kiz Radar`;
}

addEventListener('hashchange', () => route({ scrollUp: true }));
addEventListener('resize', () => {
  for (const row of tabRows()) pill(row, { still: true });
});
void document.fonts.ready.then(() => {
  for (const row of tabRows()) pill(row, { still: true });
});

// On a touch screen, a swipe left or right goes to the next or the previous section (routes.ts SECTIONS). Not from
// a field, anything that scrolls sideways or the screen's very edge (the phone's own back gesture), nor in a dialog;
// on a map, only from near the screen's sides, where the map leaves the touch to the swipe.
const SCROLLS = /auto|scroll/u,
  PATH_END = /[/?]/u;
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
    const here = section((location.hash.slice(1) || 'finder').split(PATH_END)[0] ?? null);
    const next = here < 0 ? undefined : SECTIONS[here + (dx < 0 ? 1 : -1)];
    if (next) location.hash = next[1];
  },
  { passive: true },
);

// "Back to top" once you're two screens down a long list
const toTop = h(
  'button',
  { type: 'button', class: 'to-top', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
  '↑ Back to top',
);
document.body.append(toTop);
addEventListener('scroll', () => toTop.classList.toggle('shown', scrollY > 2 * innerHeight), { passive: true });

void loadSite().then(
  () => {
    const {
      events_range: [from, to],
      built_at,
    } = site();
    part('#freshness').textContent =
      `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(built_at)}.`;
    for (const el of document.querySelectorAll('[data-home-city]')) el.textContent = home().city;
    part('#currency-switch').replaceWith(currencySwitch());
    initSearch(part('#search-btn'), data);
    route();
  },
  (e) => failed(main, e),
); // only a failed load is reported as one; errors in a view surface as errors
