// Router and page shell. Each view gets an AbortSignal that fires when you leave it: listeners it adds to
// document or window pass it, so nothing outlives the view.
import { load, meta } from './db.js';
import { h, dayYear, monthYear, home } from './ui.js';
import { sentenceView } from './sentence.js';
import { mapView } from './map.js';
import { artistsView } from './artists.js';
import { sqlView } from './tables.js';
import { countriesView } from './countries.js';
import { exploreHint, artistHint } from './hints.js';
import { EXPLORE } from './routes.js';

const main = document.getElementById('main');
const status = document.getElementById('status');
let leave;

const VIEWS = {
  finder: { title: null, nav: 'finder', show: (root, sub, qs, opts) => sentenceView(root, qs, opts) },
  map: { title: 'Map', nav: 'explore', show: mapView },
  artists: { title: 'Artists', nav: 'explore', show: artistsView },
  countries: { title: 'Countries', nav: 'explore', show: (root, sub, qs) => countriesView(root, qs) },
  sql: { title: 'SQL', nav: null, show: root => sqlView(root) },
};

function route() {
  const [path, qs = ''] = (location.hash.slice(1) || 'finder').split('?');
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
  view.show(root, sub, qs, { signal: leave.signal });
  document.title = view.title ? `${view.title} · Kiz Radar` : 'Kiz Radar';
}

window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// "Back to top" once you're two screens down a long list
const toTop = h('button', { type: 'button', class: 'to-top', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, '↑ Back to top');
document.body.append(toTop);
addEventListener('scroll', () => toTop.classList.toggle('shown', scrollY > 2 * innerHeight), { passive: true });

load(s => { status.textContent = s; }).then(() => {
  const M = meta();
  const [from, to] = M.events_range.split(' – ');
  document.getElementById('freshness').textContent = `It covers ${monthYear(from)} to ${monthYear(to)} and was last updated on ${dayYear(M.built_at)}.`;
  for (const el of document.querySelectorAll('[data-home-city]')) el.textContent = home().city;
  status.remove();
  route();
}).catch(e => { status.textContent = 'Could not load the data: ' + e.message; status.classList.add('error'); });
