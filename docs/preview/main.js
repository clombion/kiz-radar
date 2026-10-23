// Router and page shell.
import { load, meta } from '../js/db.js';
import { h, dayYear, ago } from '../js/ui.js';
import { finderView } from './finder.js';
import { guideView } from './guide.js';
import { seasonView } from './season.js';
import { sceneView } from './scene.js';
import { sentenceView } from './sentence.js';

const VARIANT = new URLSearchParams(location.search).get('v') || 'sentence';
for (const a of document.querySelectorAll('[data-v]')) a.classList.toggle('on', a.dataset.v === VARIANT);
const LANDING = { sentence: sentenceView, guide: guideView, season: seasonView, deals: finderView, scene: sceneView }[VARIANT] || sentenceView;
import { mapView } from '../js/map.js';
import { artistsView } from '../js/artists.js';
import { countriesView, sqlView } from '../js/tables.js';

const main = document.getElementById('main');
const status = document.getElementById('status');
let M, cleanup;

const EXPLORE = [['map', 'Map'], ['artists', 'Artists'], ['countries', 'Countries'], ['sql', 'SQL']];

function route() {
  if (!/^#?(finder|$)/.test(location.hash.slice(1) || 'finder')) { try { localStorage.setItem('kr-explore-seen', '1'); } catch {} }
  if (/^#artists?\//.test(location.hash)) { try { localStorage.setItem('kr-artist-seen', '1'); } catch {} }
  const [path, qs = ''] = (location.hash.slice(1) || 'finder').split('?');
  const [view, ...sub] = path.split('/');
  const name = view === 'artist' ? 'artists' : view;
  if (cleanup) { cleanup(); cleanup = null; }
  for (const a of document.querySelectorAll('[data-nav]')) {
    const on = a.dataset.nav === (name === 'finder' ? 'finder' : 'explore');
    a.classList.toggle('active', on);
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  }
  const subnav = document.getElementById('subnav');
  subnav.hidden = name === 'finder';
  subnav.replaceChildren(...EXPLORE.map(([k, t]) => h('a', { href: '#' + k, class: k === name ? 'active' : '',
    'aria-current': k === name ? 'page' : null }, t)));
  const view_ = h('div', { class: 'view' });
  main.replaceChildren(view_);
  const home = M.home_airport;
  if (name === 'map') cleanup = mapView(view_, sub, qs, { home });
  else if (name === 'artists') artistsView(view_, sub, qs);
  else if (name === 'countries') countriesView(view_, home);
  else if (name === 'sql') sqlView(view_);
  else cleanup = LANDING(view_, qs, { home }) || null;
  const title = { map: 'Map', artists: 'Artists', countries: 'Countries', sql: 'SQL' }[name];  // preview
  document.title = title ? `${title} · Kizomba Radar` : 'Kizomba Radar';
}

// #artist/12 is an alias for #artists/12
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#artist/')) { history.replaceState(null, '', '#artists/' + location.hash.slice(8)); }
  route(); window.scrollTo(0, 0);
});

load(s => { status.textContent = s; }).then(() => {
  M = meta();
  const fresh = document.getElementById('freshness');
  fresh.textContent = `Events ${M.events_range.replace(' – ', ' to ')} from kizomba-world · fares from ${M.home_airport} · data built ${dayYear(M.built_at)}`;
  status.remove();
  if (location.hash.startsWith('#artist/')) history.replaceState(null, '', '#artists/' + location.hash.slice(8));
  route();
}).catch(e => { status.textContent = 'Could not load the data: ' + e.message; status.classList.add('error'); });
