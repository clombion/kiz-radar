// Preview of the new landing page: budget-first trip finder with counts, active-filter chips,
// "show more" suggestions and teasers for the Map & artists side.
import { q, one } from '../js/db.js';
import { h, euro, today, addDays, countryName, flag } from '../js/ui.js';
import { candidates, festivalCard } from '../js/finder.js';

const BUDGETS = [150, 250, 400, 'any'];
export const DEFAULTS = { budget: 250, months: 6, country: '', kizOnly: true, taxi: false, maxKm: 150,
  minLineup: 0, unknownFare: false, projected: true, sort: 'date' };
const LOOSE = { budget: 'any', months: 12, country: '', kizOnly: false, taxi: false, maxKm: 250, minLineup: 0 };

function readParams(qs) {
  const p = { ...DEFAULTS };
  for (const [k, v] of new URLSearchParams(qs)) {
    if (!(k in DEFAULTS)) continue;
    p[k] = k === 'budget' ? (v === 'any' ? 'any' : Number(v))
      : typeof DEFAULTS[k] === 'number' ? Number(v) : typeof DEFAULTS[k] === 'boolean' ? v === '1' : v;
  }
  return p;
}
function writeParams(p) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== DEFAULTS[k]) qs.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  const s = qs.toString();
  history.replaceState(null, '', '#finder' + (s ? '?' + s : ''));
}

const budgetLabel = b => b === 'any' ? 'Any price' : `≤ ${euro(b)}`;

export function finderView(root, qs, { home }) {
  let p = readParams(qs);
  const all = candidates({ months: 12, projected: true }, home);
  const now = today(), end = m => addDays(now, Math.round(m * 30.4));

  // usual fare per airport (median of everything we have), to rate each weekend's price
  const usual = {};
  for (const r of q('SELECT airport, group_concat(price) AS ps FROM fares GROUP BY airport')) {
    const v = r.ps.split(',').map(Number).sort((a, b) => a - b); usual[r.airport] = v[Math.floor(v.length / 2)];
  }
  const rating = e => {
    if (!e.fare || e.fare.home || !usual[e.airport]) return null;
    const u = usual[e.airport], x = e.fare.price / u;
    const [cls, txt] = x <= 0.85 ? ['good', 'Cheap'] : x >= 1.15 ? ['bad', 'Pricey'] : ['mid', 'Typical'];
    return h('p', { class: `rating ${cls}` }, h('strong', {}, txt), ` for ${home}–${e.airport}: usually around ${euro(u)}`);
  };

  // everything except the budget, so budget buttons can show what each would give
  const passes = (e, o) => e.depart <= end(o.months) && (o.projected || !e.projected) && (!o.kizOnly || e.kiz_only) &&
    (!o.taxi || e.taxi_dancers) && (e.lineup || 0) >= o.minLineup && e.airport_km <= o.maxKm && (!o.country || e.country_code === o.country);
  const fits = (e, o) => e.fare ? (o.budget === 'any' || e.fare.price <= o.budget) : o.unknownFare;
  const count = o => all.filter(e => passes(e, o) && fits(e, o)).length;

  // headline numbers: the same set the results count from (next 6 months, every style, likely next editions included)
  const six = all.filter(e => e.depart <= end(6));
  const flights = six.filter(e => e.fare && !e.fare.home);
  const under = flights.filter(e => e.fare.price <= 250).length;
  const cheapest = flights.length ? Math.min(...flights.map(e => e.fare.price)) : null;
  const nEvents = one('SELECT count(*) AS n FROM events').n;
  const nArtists = one('SELECT count(*) AS n FROM artist_stats').n;
  const nCountries = one('SELECT count(DISTINCT country_code) AS n FROM events').n;

  const hero = h('header', { class: 'hero' },
    h('div', { class: 'intro' },
      h('h1', {}, 'Kizomba festivals you can fly to from Bergen'),
      h('p', { class: 'lede' }, 'Every card shows the return flight for that festival’s weekend (Friday out, Monday back). Set a budget to see what’s within reach.')),
    h('ul', { class: 'stats' },
      h('li', {}, h('strong', {}, six.length), ' festivals in the next 6 months'),
      h('li', {}, h('strong', {}, under), ' with return flights under €250'),
      cheapest != null ? h('li', {}, h('strong', {}, euro(cheapest)), ' cheapest return flight') : null),
    h('p', { class: 'also muted small' }, 'Also: ', h('a', { href: '#map' }, 'every festival on a map'), ' · ',
      h('a', { href: '#artists' }, 'who teaches where'), ' · ', h('a', { href: '#countries' }, 'which scenes book foreign artists')));

  // ----- controls -----
  const budgetBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Return flight budget' });
  const exact = h('input', { type: 'number', min: 30, max: 2000, step: 10, placeholder: 'exact €', 'aria-label': 'Exact maximum fare in euros',
    value: BUDGETS.includes(p.budget) ? '' : p.budget });
  const sel = (k, opts, label) => h('select', { 'aria-label': label, onchange: ev => { p[k] = typeof DEFAULTS[k] === 'number' ? Number(ev.target.value) : ev.target.value; sync(); } },
    opts.map(([v, t]) => h('option', { value: v, selected: String(p[k]) === String(v) }, t)));
  const chk = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: p[k], onchange: ev => { p[k] = ev.target.checked; sync(); } }), ' ', label);
  const countries = [...new Set(all.map(e => e.country_code))].filter(Boolean).sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const controls = h('section', { class: 'controls' },
    h('div', { class: 'control' }, h('span', { class: 'label' }, 'Flight budget (return)'), h('div', { class: 'budget-row' }, budgetBar, exact)),
    h('div', { class: 'row' },
      h('label', { class: 'control' }, h('span', { class: 'label' }, 'When'),
        sel('months', [[1, 'Next month'], [2, 'Next 2 months'], [3, 'Next 3 months'], [6, 'Next 6 months'], [9, 'Next 9 months'], [12, 'Next 12 months']], 'When')),
      h('label', { class: 'control' }, h('span', { class: 'label' }, 'Country'),
        sel('country', [['', 'Anywhere'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])], 'Country')),
      h('div', { class: 'control' }, h('span', { class: 'label' }, 'Style'), chk('kizOnly', 'Kizomba & Urban Kiz only'))),
    h('details', { class: 'more-filters' }, h('summary', {}, 'More filters'),
      h('div', { class: 'row' },
        h('label', { class: 'control' }, h('span', { class: 'label' }, 'Airport to festival'),
          sel('maxKm', [[30, 'Up to 30 km'], [80, 'Up to 80 km'], [150, 'Up to 150 km'], [250, 'Up to 250 km']], 'Airport to festival')),
        h('label', { class: 'control' }, h('span', { class: 'label' }, 'Line-up size'),
          sel('minLineup', [[0, 'Any'], [5, '5+ artists'], [10, '10+ artists'], [20, '20+ artists']], 'Line-up size')),
        h('div', { class: 'control' }, chk('taxi', 'Taxi dancers'), chk('unknownFare', 'Include weekends with no fare yet'),
          chk('projected', 'Include likely next editions')))));
  exact.addEventListener('change', () => { const v = Number(exact.value); p.budget = v > 0 ? v : DEFAULTS.budget; sync(); });

  const head = h('div', { class: 'results-head' });
  const chips = h('div', { class: 'chips active-filters' });
  const list = h('div', { class: 'cards' });
  const showAll = h('button', { type: 'button', class: 'secondary show-all' });
  let expanded = false;
  const FIRST = 6;        // keep "more options" and the explore cards within reach
  const relax = h('section', { class: 'relax' });
  const teasers = h('section', { class: 'teasers' },
    h('h2', {}, 'Map & artists'),
    h('div', { class: 'teaser-grid' },
      teaser('#map', '🗺️', 'Map', `All ${nEvents} festivals on a map, coloured by flight price. Tap a city to see its festivals.`),
      teaser('#artists', '💃', 'Artists', `${nArtists.toLocaleString('en')} teachers and DJs: how often they’re booked, and where they travel.`),
      teaser('#countries', '🌍', 'Countries', `${nCountries} countries compared: festivals, line-ups, imported artists, cheapest airport.`)));

  root.replaceChildren(h('section', { class: 'finder2' }, hero,
    h('div', { class: 'layout' }, h('aside', { class: 'side' }, controls),
      h('div', { class: 'results' }, head, chips, list, showAll, relax)), teasers));
  showAll.addEventListener('click', () => { expanded = true; sync(); });

  function sync() {
    writeParams(p);
    // budget buttons with counts (other filters applied)
    budgetBar.replaceChildren(...BUDGETS.map(b => {
      const n = count({ ...p, budget: b });
      return h('button', { type: 'button', class: p.budget === b ? 'on' : '', 'aria-pressed': String(p.budget === b),
        onclick: () => { p.budget = b; exact.value = ''; sync(); } }, budgetLabel(b), h('span', { class: 'n' }, n));
    }));
    exact.classList.toggle('on', !BUDGETS.includes(p.budget));

    const rows = all.filter(e => passes(e, p) && fits(e, p)).sort(p.sort === 'fare'
      ? (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || a.depart.localeCompare(b.depart)
      : (a, b) => a.depart.localeCompare(b.depart));
    const inWindow = all.filter(e => e.depart <= end(p.months) && (p.projected || !e.projected)).length;

    head.replaceChildren(
      h('p', { class: 'count' }, h('strong', {}, rows.length), ` of ${inWindow} festivals in the ${p.months === 1 ? 'next month' : `next ${p.months} months`}`),
      h('div', { class: 'sort' }, 'Sort: ',
        ...[['date', 'Soonest'], ['fare', 'Cheapest']].map(([v, t]) =>
          h('button', { type: 'button', class: 'link' + (p.sort === v ? ' on' : ''), 'aria-pressed': String(p.sort === v),
            onclick: () => { p.sort = v; sync(); } }, t))));

    // what is narrowing the list, each removable
    const active = [
      p.budget !== 'any' && [budgetLabel(p.budget) + ' flights', 'budget'],
      p.kizOnly && ['Kiz only', 'kizOnly'],
      p.country && [`${flag(p.country)} ${countryName(p.country)}`, 'country'],
      p.taxi && ['Taxi dancers', 'taxi'],
      p.minLineup && [`${p.minLineup}+ artists`, 'minLineup'],
      p.maxKm < 150 && [`Airport ≤ ${p.maxKm} km`, 'maxKm'],
    ].filter(Boolean);
    chips.replaceChildren(...active.map(([t, k]) => h('button', { type: 'button', class: 'chip removable', 'aria-label': `Remove filter ${t}`,
      onclick: () => { p[k] = k === 'maxKm' ? 150 : LOOSE[k]; if (k === 'budget') exact.value = ''; syncControls(); sync(); } }, t, ' ✕')));

    list.replaceChildren(...(expanded ? rows : rows.slice(0, FIRST)).map(e => festivalCard(e, home, rating(e))));
    showAll.hidden = expanded || rows.length <= FIRST;
    showAll.textContent = `Show all ${rows.length} festivals`;

    // ways to see more, each with what it would add
    const more = [];
    const nextBudget = p.budget === 'any' ? null : BUDGETS.find(b => b === 'any' || b > p.budget);
    const add = (label, o, apply) => { const n = count({ ...p, ...o }) - rows.length; if (n > 0) more.push([label(n), apply]); };
    if (nextBudget) add(n => `Show ${n} more with flights ${nextBudget === 'any' ? 'at any price' : `up to ${euro(nextBudget)}`}`, { budget: nextBudget }, () => { p.budget = nextBudget; exact.value = ''; });
    if (p.kizOnly) add(n => `${n} more if mixed salsa / bachata festivals count`, { kizOnly: false }, () => { p.kizOnly = false; });
    if (p.months < 12) add(n => `${n} more in the next 12 months`, { months: 12 }, () => { p.months = 12; });
    if (!p.unknownFare) add(n => `${n} more where the fare isn’t checked yet`, { unknownFare: true }, () => { p.unknownFare = true; });
    relax.replaceChildren(...(more.length ? [
      h('h2', {}, rows.length ? 'Want more options?' : 'Nothing fits yet — widen the search'),
      h('div', { class: 'relax-buttons' }, more.map(([t, f]) => h('button', { type: 'button', class: 'relax-btn',
        onclick: () => { f(); syncControls(); sync(); list.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, t, ' →')))] : []));
    relax.hidden = !more.length;
    if (!rows.length) list.replaceChildren(h('p', { class: 'empty' }, 'No festival matches all of these filters.'));
  }
  function syncControls() {
    for (const s of controls.querySelectorAll('select')) {
      const k = { 'When': 'months', 'Country': 'country', 'Airport to festival': 'maxKm', 'Line-up size': 'minLineup' }[s.getAttribute('aria-label')];
      if (k) s.value = String(p[k]);
    }
    const boxes = controls.querySelectorAll('input[type=checkbox]');
    ['kizOnly', 'taxi', 'unknownFare', 'projected'].forEach((k, i) => { boxes[i].checked = p[k]; });
  }
  sync();
}

function teaser(href, icon, title, text) {
  return h('a', { class: 'teaser', href }, h('span', { class: 'icon', 'aria-hidden': 'true' }, icon),
    h('strong', {}, title), h('span', { class: 'muted small' }, text), h('span', { class: 'go' }, 'Open →'));
}
