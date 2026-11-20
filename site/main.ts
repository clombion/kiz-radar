// Router and page shell. The shell and the Festivals sentence show as soon as site.json is in; the database loads
// alongside, and views that query it wait for it. The shell's parts are Solid's, each drawn once through placed.tsx
// into index.html, which holds the rest: the header's tabs and the second row (tabs.tsx), the footer's links and its
// currency switch, the skip link and Back to top (shell.tsx), and the search (search.tsx); the line that says something
// went wrong is report.ts's, the page mid-update updating.tsx's. Each view is a Solid view (mount.tsx), given an
// AbortSignal that fires when you leave it and disposes it, its listeners on the document or the window going with its
// owner (mount.tsx disposal), so nothing outlives the view. The view shown follows one signal, the address
// (address.ts), and sets the tabs' current one.

import { createEffect, createRoot, createSignal } from 'solid-js';
import { type Address, createAddress } from './address.ts';
import { artists } from './artists.tsx';
import { onResize } from './bits.ts';
import { community } from './communities.tsx';
import { countries } from './countries.tsx';
import { freshDay, load, loadSite, SiteUpdating } from './db.ts';
import { friends, friendsTabs, placeOf } from './friends.tsx';
import { artistHint, exploreHint } from './hints.ts';
import { map } from './map.tsx';
import { loadFailed, loadingMark } from './marks.tsx';
import { mounted, viewRoot } from './mount.tsx';
import { person } from './people.tsx';
import { atEnd, atStart, inPlaceOf, inside, instead } from './placed.tsx';
import { done, reportUncaught } from './report.ts';
import { EXPLORE, type Route, sectionAt, type Show, showInAddressBar, siteRoot, type Tab, TABS } from './routes.ts';
import { initSearch } from './search.tsx';
import { sentence } from './sentence.tsx';
import { CurrencySwitch, FooterLinks, Skip, ToTop } from './shell.tsx';
import { sources } from './sources.tsx';
import { swipeBetweenSections } from './swipe.ts';
import { sqlPage } from './tables.tsx';
import { type Link, Row, slide } from './tabs.tsx';
import { updated, updatingPage } from './updating.tsx';
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
  show: mounted(sentence),
};
// each route's view: a route without one does not compile
const VIEWS: Readonly<Record<Route, View>> = {
  finder: FINDER,
  week: { title: 'This week', nav: 'explore', waitsForData: true, show: mounted(Week) },
  map: { title: 'Map', nav: 'explore', waitsForData: true, show: mounted(map) },
  artists: { title: 'Artists', nav: 'explore', waitsForData: true, show: mounted(artists) },
  countries: { title: 'Countries', nav: 'explore', waitsForData: true, show: mounted(countries) },
  sql: { title: 'SQL', nav: null, waitsForData: true, show: mounted(sqlPage) },
  sources: { title: 'Sources', nav: null, waitsForData: false, show: mounted(sources) },
  friends: {
    title: 'Friends',
    nav: 'friends',
    waitsForData: true,
    show: mounted((address) => (address.sub[0] === undefined ? friends(address) : person(address))),
  },
  community: {
    title: 'Community',
    nav: 'friends',
    waitsForData: true,
    show: mounted(community),
  },
};
const isRoute = (name: string): name is Route => Object.hasOwn(VIEWS, name);
// A load that failed: the whole page says the site is mid-update when it is (updating.tsx), else root says why
// (marks.tsx), until the view is left (gone, its signal; the page's start has none, and goes no further).
function failed(root: HTMLElement, e: unknown, gone?: AbortSignal): void {
  if (e instanceof SiteUpdating) updatingPage(main);
  else if (gone?.aborted !== true) {
    const unshown = instead(root, 'the line of a load that failed', () => loadFailed(e));
    gone?.addEventListener('abort', unshown, { once: true });
  }
}

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
// The second row under the header: Explore's pages, or the places of the Friends tab's list (not a person's page), the
// view's own current among them; hidden while it has none. Set by each view shown, as the header's tab is.
interface Subnav {
  readonly label: 'Explore' | 'Whose plans';
  readonly links: readonly Link[];
  readonly on: string | null;
}
const [subnavShown, showSubnav] = createRoot(() =>
  createSignal<Subnav>({ label: 'Explore', links: [], on: null }, { equals: false }),
);
inPlaceOf(part('#subnav'), 'the second row of tabs', () =>
  Row({
    class: 'subnav',
    id: 'subnav',
    named: false,
    get label() {
      return subnavShown().label;
    },
    get links() {
      return subnavShown().links;
    },
    get on() {
      return subnavShown().on;
    },
  }),
);
inside(part('#footer-nav'), "the footer's links", FooterLinks);

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

// the second row's tabs for a view
const subnavOf = (view: View, name: string, sub: readonly string[], qs: string): Subnav => ({
  label: view.nav === 'explore' ? 'Explore' : 'Whose plans',
  links: view.nav === 'explore' ? EXPLORE : name === 'friends' && sub[0] === undefined ? friendsTabs() : [],
  on: view.nav === 'explore' ? name : placeOf(qs),
});

function show(name: string, sub: readonly string[], qs: string): void {
  const view = isRoute(name) ? VIEWS[name] : FINDER; // an address naming no view shows the festivals
  if (view.nav === 'explore') exploreHint.mark();
  if (name === 'artists' && sub[0] !== undefined && sub[0] !== '') artistHint.mark();
  leave?.abort();
  leave = new AbortController();
  showTab(view.nav);
  showSubnav(subnavOf(view, name, sub, qs));
  const root = viewRoot();
  main.replaceChildren(root);
  const { signal } = leave;
  const build = () => {
    view.show(root, sub, qs, { signal, data, name });
  };
  if (view.waitsForData) {
    // the loading mark, taken away once the data is in or failed, or the view is left
    const loaded = new AbortController();
    const unloaded = instead(root, 'the loading mark', () => loadingMark('Loading the festival database…'));
    AbortSignal.any([signal, loaded.signal]).addEventListener('abort', unloaded, { once: true });
    data
      .then(() => {
        loaded.abort();
        if (!signal.aborted) {
          root.replaceChildren();
          build();
        }
      })
      .catch((e: unknown) => {
        loaded.abort();
        failed(root, e, signal);
      });
  } else build();
  document.title = view.title === null ? 'Kiz Radar' : `${view.title} · Kiz Radar`;
}

reportUncaught();
// the web font may change the header's height (each row of tabs places its oval again itself)
done(document.fonts.ready.then(measureHeader), 'measuring the header');

swipeBetweenSections();

atStart('the skip link', () => Skip({ main }));
atEnd('Back to top', ToTop);

// the page once site.json is in: the currency switch, search, and the view the address names, then
// each address it moves to; a summary that fails to load is said in the page's place
async function start(): Promise<void> {
  try {
    await siteLoaded;
  } catch (e) {
    failed(main, e);
    return;
  }
  inPlaceOf(part('#currency-switch'), 'the currency switch', CurrencySwitch);
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
