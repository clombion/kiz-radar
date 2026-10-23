// "Next festival": upcoming events with a fare for their weekend, filtered by the user's criteria.
import { q } from './db.js';
import { h, range, where, airportNote, eventFacts, euro, today, addDays, countryName, flag, EVENT_COLS } from './ui.js';
import { fareBlock, eventDetail } from './event.js';

export const DEFAULTS = { months: 6, maxFare: 150, unknownFare: false, kizOnly: true, taxi: false, minLineup: 0,
  maxKm: 150, country: '', projected: true, sort: 'date' };

function readParams(qs) {
  const p = { ...DEFAULTS };
  for (const [k, v] of new URLSearchParams(qs)) {
    if (!(k in DEFAULTS)) continue;
    p[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : typeof DEFAULTS[k] === 'boolean' ? v === '1' : v;
  }
  return p;
}
function writeParams(p) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== DEFAULTS[k]) qs.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  const s = qs.toString();
  history.replaceState(null, '', '#finder' + (s ? '?' + s : ''));
}

// A 2026 edition that has passed suggests next year's, on the same weekend, unless it is already listed.
const titleKey = t => t.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).slice(0, 3).join(' ');
const STOP = new Set(['the', 'official', 'edition', 'event', 'festival', 'fest', 'congress', 'and', 'with', 'vol',
  'annual', 'anniversary', 'international', 'kizomba', 'urbankiz', 'urban', 'kiz', 'weekend']);

export function candidates(p, home) {
  const from = today(), to = addDays(from, Math.round(p.months * 30.4));
  const base = q(`SELECT ${EVENT_COLS} FROM events e JOIN event_stats s ON s.event_id = e.id
    WHERE e.cancelled IS NOT 1 AND e.airport IS NOT NULL`);
  const upcoming = base.filter(e => e.weekend_friday >= from);
  const listed = upcoming.map(e => ({ key: titleKey(e.title), city: e.city, f: e.weekend_friday }));
  const rows = upcoming.map(e => ({ ...e, depart: e.weekend_friday, projected: false }));
  if (p.projected) {
    for (const e of base) {
      if (e.weekend_friday >= from) continue;
      const depart = addDays(e.weekend_friday, 364);       // same weekday a year on
      if (depart < from || depart > to) continue;
      const k = titleKey(e.title);
      const dup = listed.some(l => l.city === e.city && (l.key === k || Math.abs(new Date(l.f) - new Date(depart)) < 864e5 * 10 && l.key.split(' ')[0] === k.split(' ')[0]));
      if (!dup) rows.push({ ...e, depart, projected: true });
    }
  }
  const fare = Object.fromEntries(q('SELECT airport || depart AS k, price, fetched_at FROM fares').map(r => [r.k, r]));
  return rows.filter(e => e.depart <= to)
    .map(e => ({ ...e, fare: e.airport === home ? { price: 0, home: true } : fare[e.airport + e.depart] || null }));
}

export function apply(rows, p) {
  return rows.filter(e =>
    (e.fare ? e.fare.price <= p.maxFare : p.unknownFare) &&
    (!p.kizOnly || e.kiz_only) && (!p.taxi || e.taxi_dancers) &&
    (e.lineup || 0) >= p.minLineup && e.airport_km <= p.maxKm &&
    (!p.country || e.country_code === p.country))
    .sort({
      date: (a, b) => a.depart.localeCompare(b.depart),
      fare: (a, b) => (a.fare?.price ?? 1e9) - (b.fare?.price ?? 1e9) || a.depart.localeCompare(b.depart),
      popular: (a, b) => (b.popular_artists || 0) - (a.popular_artists || 0) || a.depart.localeCompare(b.depart),
    }[p.sort]);
}

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
}

export function finderView(root, qs, { home }) {
  let p = readParams(qs);
  const all = candidates({ ...p, months: 12, projected: true }, home);   // widest set, filtered below
  const countries = [...new Set(all.map(e => e.country_code))].filter(Boolean)
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));

  const list = h('div', { class: 'cards' });
  const summary = h('p', { class: 'summary', 'aria-live': 'polite' });
  const form = h('form', { class: 'filters', onsubmit: ev => ev.preventDefault() });

  const ctl = {};
  const num = (k, attrs) => (ctl[k] = h('input', { type: 'number', value: p[k], ...attrs }));
  const check = k => (ctl[k] = h('input', { type: 'checkbox', checked: p[k] }));
  const select = (k, opts) => (ctl[k] = h('select', {}, opts.map(([v, t]) => h('option', { value: v, selected: String(p[k]) === String(v) }, t))));
  const fareOut = h('output', {}, euro(p.maxFare));
  ctl.maxFare = h('input', { type: 'range', min: 40, max: 600, step: 10, value: p.maxFare,
    oninput: () => { fareOut.textContent = euro(ctl.maxFare.value); } });

  form.append(
    field('Within', select('months', [[1, '1 month'], [2, '2 months'], [3, '3 months'], [6, '6 months'], [9, '9 months'], [12, '12 months']])),
    h('label', { class: 'field' }, h('span', {}, 'Max return fare ', fareOut), ctl.maxFare),
    field('Country', select('country', [['', 'Any country'], ...countries.map(c => [c, `${flag(c)} ${countryName(c)}`])])),
    field('Max km airport → city', select('maxKm', [[30, '30 km'], [80, '80 km'], [150, '150 km'], [250, '250 km']])),
    field('Min line-up', num('minLineup', { min: 0, max: 100, step: 1 }), 'teachers + DJs'),
    field('Sort by', select('sort', [['date', 'Date'], ['fare', 'Fare'], ['popular', 'Popular artists']])),
    h('div', { class: 'checks' },
      h('label', {}, check('kizOnly'), ' Kiz only (no salsa/bachata)'),
      h('label', {}, check('taxi'), ' Taxi dancers'),
      h('label', {}, check('unknownFare'), ' Include weekends with no fare yet'),
      h('label', {}, check('projected'), ' Include likely next editions')),
    h('button', { type: 'button', class: 'secondary', onclick: () => { p = { ...DEFAULTS }; sync(true); } }, 'Reset to defaults'));

  function sync(fromDefaults) {
    if (fromDefaults) {
      for (const [k, el] of Object.entries(ctl)) el.type === 'checkbox' ? (el.checked = p[k]) : (el.value = p[k]);
      fareOut.textContent = euro(p.maxFare);
    } else {
      for (const [k, el] of Object.entries(ctl)) p[k] = el.type === 'checkbox' ? el.checked : typeof DEFAULTS[k] === 'number' ? Number(el.value) : el.value;
    }
    writeParams(p);
    const to = addDays(today(), Math.round(p.months * 30.4));
    const rows = apply(all.filter(e => e.depart <= to && (p.projected || !e.projected)), p);
    const priced = rows.filter(r => r.fare);
    summary.replaceChildren(rows.length
      ? `${rows.length} festival${rows.length > 1 ? 's' : ''} match` + (priced.some(r => !r.fare.home) ? ` · cheapest flight ${euro(Math.min(...priced.filter(r => !r.fare.home).map(r => r.fare.price)))}` : '')
      : 'Nothing matches. Try a higher fare, a longer window, or untick “Kiz only”.');
    list.replaceChildren(...rows.map(e => festivalCard(e, home)));
  }

  form.addEventListener('change', () => sync(false));
  ctl.maxFare.addEventListener('change', () => sync(false));
  root.replaceChildren(h('section', { class: 'finder' },
    h('div', { class: 'intro' }, h('h2', {}, 'Next festival'),
      h('p', { class: 'muted' }, `Return fares from ${home}, Friday out and Monday back, for each festival’s weekend.`)),
    form, summary, list));
  sync(false);
}

export function festivalCard(e, home, extra) {
  const more = h('div', { class: 'more', hidden: true });
  const toggle = h('button', { class: 'link', 'aria-expanded': 'false', onclick: () => {
    const open = more.hidden;
    if (open && !more.childElementCount) more.append(eventDetail(e.id, home, { compact: true }));
    more.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide details' : 'Line-up & details';
  } }, 'Line-up & details');
  return h('article', { class: 'card' + (e.projected ? ' projected' : '') },
    h('div', { class: 'card-head' },
      h('div', {},
        h('p', { class: 'when' }, e.projected ? `Likely ${range(e.depart, addDays(e.depart, 2))}` : range(e.start_date, e.end_date)),
        h('h3', {}, e.title),
        h('p', { class: 'muted' }, where(e), ' · ', airportNote(e, home))),
      fareBlock(e, home, e.depart)),
    e.projected ? h('p', { class: 'note' }, `Projected from the ${range(e.start_date, e.end_date)} edition — next dates not listed yet.`) : null,
    extra || null,
    eventFacts(e),
    h('div', { class: 'card-actions' }, toggle, h('a', { href: `#map/event/${e.id}` }, 'Show on map')),
    more);
}
