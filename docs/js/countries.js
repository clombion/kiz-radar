// Countries: which scenes are worth a trip from home. One row per country: what's coming up, what the
// flights to those festivals cost, and what the scene is like.
import { q } from './db.js';
import { h, flag, countryName, euro, home } from './ui.js';
import { readState, changed } from './festivals.js';
import { countriesHref, festivalsHref, mapHref, artistsHref, showInAddressBar } from './routes.js';

// sorted by: festivals coming up, the cheapest flight, the share of visiting artists
const SORTS = [['upcoming', 'Festivals coming up'], ['fare', 'Flight price'], ['open', 'Visiting artists']];

// share of teacher and DJ bookings that go to artists from elsewhere, in words
const scene = pct => pct == null ? null : pct >= 50 ? 'Mostly visiting artists' : pct >= 25 ? 'Local and visiting artists' : 'Mostly local artists';

const DEFAULTS = { sort: 'upcoming', all: 0 };

export function countriesView(root, qs) {
  const st = readState(qs, DEFAULTS, { sort: SORTS.map(([v]) => v), all: [0, 1] });
  // the cheapest Fri→Mon return to any of the country's upcoming festivals, and the city it lands in
  const fares = Object.fromEntries(q(`SELECT e.country_code, e.airport_city, min(f.price) AS price FROM event_rows e
      JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday
      WHERE e.upcoming AND e.airport != ? GROUP BY e.country_code`, [home().code]).map(r => [r.country_code, r]));
  const rows = q(`SELECT cs.*, u.upcoming, u.reachable FROM country_stats cs
      LEFT JOIN (SELECT country_code, sum(upcoming) AS upcoming, sum(upcoming AND airport IS NOT NULL) AS reachable
        FROM event_rows GROUP BY country_code) u ON u.country_code = cs.country_code
      WHERE cs.country_code IS NOT NULL`)
    .map(r => ({ ...r, name: countryName(r.country_code), fare: fares[r.country_code] || null }));

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Order' });
  const allBox = h('input', { type: 'checkbox', checked: !!st.all, onchange: ev => { st.all = ev.target.checked ? 1 : 0; render(); } });
  const list = h('ul', { class: 'country-list' });
  const summary = h('p', { class: 'list-summary' });
  root.replaceChildren(h('section', { class: 'countries-page' },
    h('header', { class: 'page-intro' }, h('h1', {}, 'Where the scenes are'),
      h('p', {}, `Every country with festivals in the listings: how many are coming up, what flying there from ${home().city} costs, and whether the line-ups are mostly local or international.`)),
    h('div', { class: 'map-bar' }, h('span', { class: 'sort-label' }, 'Sort by'), seg, h('label', { class: 'check' }, allBox, ' Include countries with nothing coming up')),
    summary, list));

  function render() {
    showInAddressBar(countriesHref(changed(st, DEFAULTS)));
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
      ? ['✈ from ', h('strong', {}, '~' + euro(r.fare.price)), ` to ${r.fare.airport_city}`]
      : h('span', { class: 'muted' }, r.upcoming && !r.reachable ? `✈ too far from ${home().city} for our flight prices` : '✈ no flight prices yet')),
    line ? h('p', { class: 'c-fact', title: r.imported_pct != null ? `${r.imported_pct}% of teacher and DJ bookings go to artists from other countries` : null }, line) : null,
    r.taxi_dancers ? h('p', { class: 'c-fact' }, `${r.taxi_dancers} of its ${r.events} listed festivals with taxi dancers`) : null,
    h('p', { class: 'c-links' },
      r.upcoming ? [h('a', { href: festivalsHref({ country: r.country_code, months: 12, style: 'all' }) }, 'Festivals'), ' · '] : null,
      h('a', { href: mapHref({ country: r.country_code, when: r.upcoming ? 'upcoming' : 'all' }) }, 'Map'), ' · ',
      h('a', { href: artistsHref({ country: r.country_code }) }, 'Artists')));
}
