// Router and page shell. The shell and the Festivals sentence show as soon as site.json is in; the database
// loads alongside, and views that query it wait for it. Each view gets an AbortSignal that fires when you leave
// it: listeners it adds to document or window pass it, so nothing outlives the view.

import { artistsView } from './artists.ts';
import { countriesView } from './countries.ts';
import { load, loadSite, site } from './db.ts';
import { button, h, onResize } from './dom.ts';
import { artistHint, exploreHint } from './hints.ts';
import { mapView } from './map.ts';
import { currencySwitch } from './money.ts';
import { personView } from './people.ts';
import { done, guarded, reportUncaught } from './report.ts';
import { EXPLORE, parseRoute, type Route, type Show, sectionAt, TABS, type Tab } from './routes.ts';
import { initSearch } from './search.ts';
import { sentenceView } from './sentence.ts';
import { swipeBetweenSections } from './swipe.ts';
import { sqlView } from './tables.ts';
import { pill, slide } from './tabs.ts';
import { dayYear, home, loading, monthYear, scrolling } from './ui.ts';

// the page's own parts, from index.html: one missing is a broken page
const part = (selector: string): HTMLElement => {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`index.html has no ${selector}`);
  return el;
};
const main = part('#main'),
  tabs = part('nav.tabs'),
  subnav = part('#subnav');
const siteLoaded = loadSite();
const data = load(siteLoaded); // starts now, alongside site.json
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

const tabRows = () => [tabs, subnav];

// Show the view the address names; scrollUp scrolls up to it (a new page, not the first one)
function route({ scrollUp = false } = {}): void {
  const { name, sub, qs } = parseRoute(location.hash);
  const from = sectionAt(at),
    to = sectionAt(name);
  at = name;
  slide(from >= 0 && to >= 0 && from !== to ? Math.sign(to - from) : 0, () => {
    show(name, sub, qs);
    if (scrollUp) {
      // a new page: its top in view, and the focus at its start, as a page load leaves them
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
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
  const build = () => guarded(root, name, () => view.show(root, sub, qs, { signal, data }));
  if (view.waitsForData) {
    root.append(loading('Loading the festival database…'));
    data
      .then(() => {
        if (!signal.aborted) {
          root.replaceChildren();
          build();
        }
      })
      .catch((e: unknown) => failed(root, e));
  } else build();
  document.title = view.title === null ? 'Kiz Radar' : `${view.title} · Kiz Radar`;
}

reportUncaught();
onResize(() => {
  for (const row of tabRows()) pill(row, { still: true });
});
done(
  document.fonts.ready.then(() => {
    for (const row of tabRows()) pill(row, { still: true });
  }),
  'laying out the tabs',
);

swipeBetweenSections();

// the first thing a keyboard reaches: past the header and the tabs, to the page itself
document.body.prepend(button({ class: 'skip', onclick: () => main.focus() }, 'Skip to the page'));

// "Back to top" once you're two screens down a long list
const toTop = button(
  { class: 'to-top', onclick: () => window.scrollTo({ top: 0, behavior: scrolling() }) },
  '↑ Back to top',
);
document.body.append(toTop);
addEventListener('scroll', () => toTop.classList.toggle('shown', scrollY > 2 * innerHeight), { passive: true });

// the page once site.json is in: what the data covers, the home city, search, and the view the address names, then
// each address it moves to; a summary that fails to load is said in the page's place
async function start(): Promise<void> {
  try {
    await siteLoaded;
  } catch (e) {
    failed(main, e);
    return;
  }
  const {
    events_range: [from, to],
    built_at,
  } = site();
  part('#freshness').textContent =
    `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(built_at)}.`;
  for (const el of document.querySelectorAll('[data-home-city]')) el.textContent = home().city;
  part('#currency-switch').replaceWith(currencySwitch());
  initSearch(part('#search-btn'), data);
  addEventListener('hashchange', () => route({ scrollUp: true }));
  route();
}
done(start(), 'starting the page');
