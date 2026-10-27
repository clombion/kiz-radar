// Router and page shell. The shell and the Festivals sentence show as soon as site.json is in; the database
// loads alongside, and views that query it wait for it. Each view gets an AbortSignal that fires when you leave
// it: listeners it adds to document or window pass it, so nothing outlives the view.
import { load, loadSite, site } from './db.js';
import { h, dayYear, monthYear, home, loading } from './ui.js';
import { sentenceView } from './sentence.js';
import { mapView } from './map.js';
import { artistsView } from './artists.js';
import { sqlView } from './tables.js';
import { countriesView } from './countries.js';
import { personView } from './people.js';
import { exploreHint, artistHint } from './hints.js';
import { EXPLORE, TABS, SECTIONS, renamed } from './routes.js';
import { initSearch } from './search.js';
import { currencySwitch } from './money.js';

const main = document.getElementById('main');
const data = load();          // starts now, alongside site.json
let leave;

// waitsForData: the view queries the database as it builds, so it shows once the database is in
const VIEWS = {
  finder: { title: null, nav: 'finder', show: (root, sub, qs, opts) => sentenceView(root, qs, opts) },
  map: { title: 'Map', nav: 'explore', waitsForData: true, show: mapView },
  artists: { title: 'Artists', nav: 'explore', waitsForData: true, show: artistsView },
  countries: { title: 'Countries', nav: 'explore', waitsForData: true, show: (root, sub, qs) => countriesView(root, qs) },
  sql: { title: 'SQL', nav: null, waitsForData: true, show: root => sqlView(root) },
  friends: { title: 'Friends', nav: 'friends', waitsForData: true, show: (root, sub) => personView(root, sub) },
};
const failed = (root, e) => root.replaceChildren(h('p', { class: 'status error' }, 'Could not load the data: ' + e.message));

// the header's tabs and the footer's links, from routes.js
document.querySelector('nav.tabs').append(...TABS.map(([nav, label, href]) => h('a', { href, 'data-nav': nav }, label)));
document.getElementById('footer-nav').append(...[...TABS.slice(0, -1), ...EXPLORE].map(([, label, href]) => h('a', { href }, label)));

function route() {
  const [path, qs = ''] = (location.hash.slice(1) || 'finder').split('?');
  const moved = renamed(path);
  if (moved) { location.replace(moved + (qs ? '?' + qs : '')); return; }
  const [name, ...sub] = path.split('/');
  const view = VIEWS[name] || VIEWS.finder;
  if (view.nav === 'explore') exploreHint.mark();
  if (name === 'artists' && sub[0]) artistHint.mark();
  leave?.abort();
  leave = new AbortController();
  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === view.nav;
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  const subnav = document.getElementById('subnav');
  subnav.hidden = view.nav !== 'explore';
  subnav.replaceChildren(...EXPLORE.map(([k, t, href]) => h('a', { href, class: k === name ? 'active' : '',
    'aria-current': k === name ? 'page' : null }, t)));
  const root = h('div', { class: 'view' });
  main.replaceChildren(root);
  const { signal } = leave;
  if (!view.waitsForData) view.show(root, sub, qs, { signal, data });
  else {
    root.append(loading('Loading the festival database…'));
    data.then(() => { if (!signal.aborted) { root.replaceChildren(); view.show(root, sub, qs, { signal }); } }, e => failed(root, e));
  }
  document.title = view.title ? `${view.title} · Kiz Radar` : 'Kiz Radar';
}

window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// On a touch screen, a swipe left or right goes to the next or the previous section (routes.js SECTIONS). Not from
// a map, a field, anything that scrolls sideways or a screen's edge (the browser's own back gesture), nor in a dialog.
const SWIPE = { distance: 60, steepest: 0.5, ms: 600, edge: 24 };   // px; |dy|/|dx|; the longest a swipe takes; px
const keepsSwipe = el => el.closest('input, textarea, select, dialog, .leaflet-container') ||
  [...ancestors(el)].some(n => n.scrollWidth > n.clientWidth && /auto|scroll/.test(getComputedStyle(n).overflowX));
function* ancestors(el) { for (let n = el; n && n !== document.body; n = n.parentElement) yield n; }
let touch = null;
addEventListener('touchstart', e => {
  const t = e.touches[0];
  touch = e.touches.length === 1 && t.clientX > SWIPE.edge && t.clientX < innerWidth - SWIPE.edge && !keepsSwipe(e.target)
    ? { x: t.clientX, y: t.clientY, at: e.timeStamp } : null;
}, { passive: true });
addEventListener('touchend', e => {
  if (!touch) return;
  const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y, quick = e.timeStamp - touch.at < SWIPE.ms;
  touch = null;
  if (!quick || Math.abs(dx) < SWIPE.distance || Math.abs(dy) > SWIPE.steepest * Math.abs(dx)) return;
  const name = (location.hash.slice(1) || 'finder').split(/[/?]/)[0];
  const at = SECTIONS.findIndex(([k]) => k === name);
  const next = at < 0 ? null : SECTIONS[at + (dx < 0 ? 1 : -1)];
  if (next) location.hash = next[1];
}, { passive: true });

// "Back to top" once you're two screens down a long list
const toTop = h('button', { type: 'button', class: 'to-top', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, '↑ Back to top');
document.body.append(toTop);
addEventListener('scroll', () => toTop.classList.toggle('shown', scrollY > 2 * innerHeight), { passive: true });

loadSite().then(() => {
  const { events_range: [from, to], built_at } = site();
  document.getElementById('freshness').textContent = `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(built_at)}.`;
  for (const el of document.querySelectorAll('[data-home-city]')) el.textContent = home().city;
  document.getElementById('currency-switch').replaceWith(currencySwitch());
  initSearch(document.getElementById('search-btn'), data);
  route();
}, e => failed(main, e));          // only a failed load is reported as one; errors in a view surface as errors
