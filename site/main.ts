// Router and page shell. The shell and the Festivals sentence show as soon as site.json is in; the database
// loads alongside, and views that query it wait for it. Each view gets an AbortSignal that fires when you leave
// it: listeners it adds to document or window pass it, so nothing outlives the view. The view shown follows one signal,
// the address (address.ts).

import { createEffect, createRoot, createSignal } from 'solid-js';
import { type Address, createAddress } from './address.ts';
import { artistsView } from './artists.ts';
import { onResize } from './bits.ts';
import { communityView } from './communities.ts';
import { countriesView } from './countries.ts';
import { freshDay, load, loadSite, SiteUpdating } from './db.ts';
import { button, h, toggle } from './dom.ts';
import { friendsTabs, friendsView, placeOf } from './friends.ts';
import { artistHint, exploreHint } from './hints.ts';
import { mapView } from './map.ts';
import { currencySwitch } from './money.ts';
import { mounted } from './mount.tsx';
import { personView } from './people.ts';
import { inPlaceOf } from './placed.tsx';
import { done, guarded, reportUncaught } from './report.ts';
import { EXPLORE, type Route, sectionAt, type Show, showInAddressBar, siteRoot, type Tab, TABS } from './routes.ts';
import { initSearch } from './search.ts';
import { sentenceView } from './sentence.ts';
import { sourcesView } from './sources.ts';
import { swipeBetweenSections } from './swipe.ts';
import { sqlView } from './tables.ts';
import { pill, Row, slide } from './tabs.tsx';
import { loading, scrolling } from './ui.ts';
import { updated, updatingPage } from './updating.ts';
import { Week } from './week.tsx';

// Every link and file from the site's root, whatever address the page moves to: index.html's <base> (../../ on a
// community's page, c/<key>/), made a full address once, as the page loads, with the site-wide choices of the address
// (the currency), so that moving the address bar on moves no link and every link keeps them (routes.ts siteRoot).
const base = document.querySelector('base') ?? document.head.appendChild(document.createElement('base'));
base.href = siteRoot(base.getAttribute('href') ?? './', location.href);

// the page's own parts, from index.html: one missing is a broken page
const part = (selector: string): HTMLElement => {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`index.html has no ${selector}`);
  return el;
};
const main = part('#main'),
  subnav = part('#subnav'),
  header = part('header.top');
// the header's height on this screen, which what sticks under it (the festival list's bar) reads as --header-h
const measureHeader = () =>
  document.documentElement.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
measureHeader();
onResize(measureHeader);
const siteLoaded = loadSite();
const data = load(siteLoaded); // starts now, alongside site.json
let leave: AbortController | undefined;
let at: string | null = null; // the view shown, by name

interface View {
  readonly title: string | null;
  readonly nav: Tab | null;
  // the view queries the database as it builds, so it shows once the database is in
  readonly waitsForData: boolean;
  readonly show: Show;
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
  week: { title: 'This week', nav: 'explore', waitsForData: true, show: mounted(Week) },
  map: { title: 'Map', nav: 'explore', waitsForData: true, show: mapView },
  artists: { title: 'Artists', nav: 'explore', waitsForData: true, show: artistsView },
  countries: { title: 'Countries', nav: 'explore', waitsForData: true, show: (root, _, qs) => countriesView(root, qs) },
  sql: { title: 'SQL', nav: null, waitsForData: true, show: (root) => sqlView(root) },
  sources: { title: 'Sources', nav: null, waitsForData: false, show: (root) => sourcesView(root) },
  friends: {
    title: 'Friends',
    nav: 'friends',
    waitsForData: true,
    show: (root, [key], qs, { signal }) => (key === undefined ? friendsView(root, qs, signal) : personView(root, key)),
  },
  community: {
    title: 'Community',
    nav: 'friends',
    waitsForData: true,
    show: (root, sub, qs, { signal }) => communityView(root, sub, qs, signal),
  },
};
const isRoute = (name: string): name is Route => Object.hasOwn(VIEWS, name);
// a load that failed: the whole page says the site is mid-update when it is (updating.ts), else the view says why
const failed = (root: HTMLElement, e: unknown) =>
  e instanceof SiteUpdating
    ? updatingPage(main)
    : root.replaceChildren(
        h(
          'p',
          { class: ['status', 'error'] },
          `Could not load the data: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );

// The header's tabs, from routes.ts, the view's own current (none on a page of no tab's). Each view shown sets it, the
// same tab again too, so the oval is put behind it each time, as a move cut short by the next one is. Shown for the
// page's life, in a root never disposed.
const [tabShown, showTab] = createRoot(() => createSignal<Tab | null>(null, { equals: false }));
inPlaceOf(part('nav.tabs'), "the header's tabs", () =>
  Row({
    class: 'tabs',
    label: 'Main',
    links: TABS,
    named: true,
    get on() {
      return tabShown();
    },
  }),
);
// the footer's links, from routes.ts
part('#footer-nav').append(...[...TABS.slice(0, -1), ...EXPLORE].map(([, label, href]) => h('a', { href }, label)));

// Show the view the address names; scrollUp scrolls up to it (a new page, not the first one)
function route({ name, sub, qs, moved }: Address, { scrollUp = false } = {}): void {
  freshDay(); // the visitor's day, which may have moved on since the page loaded
  if (moved !== null) showInAddressBar(moved); // an older link's #community/<key>: the community's own address
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

// the second row under the header: Explore's pages, or the places of the Friends tab's list (not a person's page)
function drawSubnav(view: View, name: string, sub: readonly string[], qs: string): void {
  const row: readonly (readonly [string, string, string])[] =
    view.nav === 'explore' ? EXPLORE : name === 'friends' && sub[0] === undefined ? friendsTabs() : [];
  const on = view.nav === 'explore' ? name : placeOf(qs);
  subnav.hidden = row.length === 0;
  subnav.setAttribute('aria-label', view.nav === 'explore' ? 'Explore' : 'Whose plans');
  subnav.replaceChildren(
    ...row.map(([k, t, href]) =>
      h('a', { href, class: k === on && 'active', 'aria-current': k === on ? 'page' : null }, t),
    ),
  );
}

function show(name: string, sub: readonly string[], qs: string): void {
  const view = isRoute(name) ? VIEWS[name] : FINDER; // an address naming no view shows the festivals
  if (view.nav === 'explore') exploreHint.mark();
  if (name === 'artists' && sub[0] !== undefined && sub[0] !== '') artistHint.mark();
  leave?.abort();
  leave = new AbortController();
  showTab(view.nav);
  drawSubnav(view, name, sub, qs);
  pill(subnav);
  const root = h('div', {});
  main.replaceChildren(root);
  const { signal } = leave;
  const build = () => guarded(root, name, () => view.show(root, sub, qs, { signal, data, name }));
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
  pill(subnav, { still: true });
});
done(
  document.fonts.ready.then(() => {
    measureHeader(); // the web font may change its height
    pill(subnav, { still: true });
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
addEventListener('scroll', () => toggle(toTop, 'shown', scrollY > 2 * innerHeight), { passive: true });

// the page once site.json is in: the currency switch, search, and the view the address names, then
// each address it moves to; a summary that fails to load is said in the page's place
async function start(): Promise<void> {
  try {
    await siteLoaded;
  } catch (e) {
    failed(main, e);
    return;
  }
  part('#currency-switch').replaceWith(currencySwitch());
  initSearch(part('#search-btn'), data);
  // mid-update, whatever view shows, even one that does not wait for the database (the festivals' sentence)
  data.then(updated).catch((e: unknown) => {
    if (e instanceof SiteUpdating) updatingPage(main);
  });
  // the view of the address the page starts at, then of each it moves to, for the page's life (a root never disposed).
  // What escapes route() is the window's, as it was from a hashchange listener (report.ts reportUncaught), and never
  // Solid's, whose uncaught error would halt every signal of the page, this one with it.
  createRoot(() => {
    createEffect(createAddress(), (address, before) => {
      try {
        route(address, { scrollUp: before !== undefined });
      } catch (e) {
        reportError(e);
      }
    });
  });
}
done(start(), 'starting the page');
