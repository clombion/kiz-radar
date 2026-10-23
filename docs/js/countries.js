// Countries: which scenes are worth a trip from Bergen. One row per country: what's coming up, what the
// flights to those festivals cost, and what the scene is like.
import { q } from './db.js';
import { h, flag, countryName, euro, today } from './ui.js';
import { cityOf } from './eventcard.js';

// sorted by: festivals coming up, the cheapest flight, the share of visiting artists
const SORTS = [['upcoming', 'Festivals coming up'], ['fare', 'Flight price'], ['open', 'Visiting artists']];

// share of teacher and DJ bookings that go to artists from elsewhere, in words
const scene = pct => pct == null ? null : pct >= 50 ? 'Mostly visiting artists' : pct >= 25 ? 'Local and visiting artists' : 'Mostly local artists';

export function countriesView(root, qs, { home }) {
  const now = today();
  const p = new URLSearchParams(qs);
  const st = { sort: p.get('sort') || 'upcoming', all: p.get('all') === '1' };
  // the cheapest Fri→Mon return to any of the country's upcoming festivals, and where it lands
  const fares = {};
  for (const r of q(`SELECT e.country_code AS cc, e.airport, min(f.price) AS price FROM events e
      JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
      WHERE e.weekend_friday >= ? AND e.cancelled IS NOT 1 AND e.airport != ? GROUP BY e.country_code, e.airport`, [now, home]))
    if (!fares[r.cc] || r.price < fares[r.cc].price) fares[r.cc] = r;
  const rows = q(`SELECT cs.*, (SELECT count(*) FROM events e WHERE e.country_code = cs.country_code AND e.weekend_friday >= ?
      AND e.cancelled IS NOT 1) AS upcoming FROM country_stats cs WHERE cs.country_code IS NOT NULL`, [now])
    .map(r => ({ ...r, name: countryName(r.country_code), fare: fares[r.country_code] || null }));

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Order' });
  const allBox = h('input', { type: 'checkbox', checked: st.all, onchange: ev => { st.all = ev.target.checked; render(); } });
  const list = h('ul', { class: 'country-list' });
  const summary = h('p', { class: 'list-summary' });
  root.replaceChildren(h('section', { class: 'countries-page' },
    h('header', { class: 'page-intro' }, h('h1', {}, 'Where the scenes are'),
      h('p', {}, 'Every country with festivals in the listings: how many are coming up, what flying there from Bergen costs, and whether the line-ups are mostly local or international.')),
    h('div', { class: 'map-bar' }, h('span', { class: 'sort-label' }, 'Sort by'), seg, h('label', { class: 'check' }, allBox, ' Include countries with nothing coming up')),
    summary, list));

  function render() {
    const params = new URLSearchParams();
    if (st.sort !== 'upcoming') params.set('sort', st.sort);
    if (st.all) params.set('all', '1');
    history.replaceState(null, '', '#countries' + (params.toString() ? '?' + params : ''));
    seg.replaceChildren(...SORTS.map(([v, t]) => h('button', { type: 'button', class: st.sort === v ? 'on' : '', 'aria-pressed': String(st.sort === v),
      onclick: () => { st.sort = v; render(); } }, t)));
    const by = {
      upcoming: (a, b) => b.upcoming - a.upcoming || b.events - a.events,
      fare: (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || b.upcoming - a.upcoming,
      open: (a, b) => (b.imported_pct ?? -1) - (a.imported_pct ?? -1) || b.upcoming - a.upcoming,
    }[st.sort];
    const shown = rows.filter(r => st.all || r.upcoming).sort(by);
    summary.textContent = `${shown.length} countries` + (st.all ? '' : ' with festivals coming up');
    list.replaceChildren(...shown.map(row));
  }
  render();
}

function row(r) {
  const line = [scene(r.imported_pct), r.avg_lineup >= 1 && `about ${Math.round(r.avg_lineup)} per festival`].filter(Boolean).join(', ');
  return h('li', { class: 'country-row' },
    h('div', { class: 'c-head' },
      h('h2', {}, h('span', { class: 'c-flag', 'aria-hidden': 'true' }, flag(r.country_code)), r.name),
      h('p', { class: 'c-num' }, h('strong', {}, r.upcoming), h('span', {}, r.upcoming === 1 ? 'festival coming up' : 'festivals coming up'))),
    h('p', { class: 'flight' + (r.fare && r.fare.price <= 150 ? ' easy' : '') }, r.fare
      ? ['✈ from ', h('strong', {}, '~' + euro(r.fare.price)), ` to ${cityOf(r.fare.airport)}`]
      : h('span', { class: 'muted' }, '✈ no flight prices yet')),
    line ? h('p', { class: 'c-fact', title: r.imported_pct != null ? `${r.imported_pct}% of teacher and DJ bookings go to artists from other countries` : null }, line) : null,
    r.taxi_dancers ? h('p', { class: 'c-fact' }, `${r.taxi_dancers} festival${r.taxi_dancers === 1 ? '' : 's'} with taxi dancers`) : null,
    h('p', { class: 'c-links' },
      r.upcoming ? [h('a', { href: `#finder?country=${r.country_code}&months=12&style=all` }, 'Festivals'), ' · '] : null,
      h('a', { href: `#map?country=${r.country_code}&when=${r.upcoming ? 'upcoming' : 'all'}` }, 'Map'), ' · ',
      h('a', { href: `#artists?country=${r.country_code}` }, 'Artists')));
}
