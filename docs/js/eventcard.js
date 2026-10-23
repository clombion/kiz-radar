// The festival card used across the site: date, place, tidy title, styles, highlights, a few names and the
// flight, opening in place to the full line-up and practical details.
import { q } from './db.js';
import { h, addDays, euro, today } from './ui.js';
import { place, styleLine, d } from './festivals.js';
import { tidyTitle } from './titles.js';
import { TRAITS } from './icons.js';
import { cardDetails, traitItems } from './details.js';

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
export function dateBox(start, end, projected) {
  const [a, b] = [d(start), d(end)];
  const [dd1, mm1] = DM.format(a).split(' '), [dd2, mm2] = DM.format(b).split(' ');
  const likely = projected ? h('span', { class: 'likely' }, 'likely') : null;
  const yr = end.slice(0, 4) !== today().slice(0, 4) ? ' ' + end.slice(0, 4) : '';     // "Jan 2027"
  if (mm1 !== mm2) return h('div', { class: 'datebox cross' }, likely,
    h('span', { class: 'dd' }, dd1, ' ', h('small', {}, mm1)), h('span', { class: 'dd' }, '– ', dd2, ' ', h('small', {}, mm2 + yr)));
  return h('div', { class: 'datebox' }, likely, h('span', { class: 'dd' }, start === end ? dd1 : `${dd1}–${dd2}`), h('span', { class: 'mm' }, mm1 + yr));
}


// "✈ ~€492 to Brussels, then 104 km": a Fri→Mon return from Bergen to the nearest airport we price,
// and how far the festival is from it. The price links to Google Flights for that weekend.
let airportCity;
export const cityOf = code => (airportCity ||= Object.fromEntries(q('SELECT code, name FROM airports').map(a => [a.code, a.name.split(' ')[0]])))[code] || code;
export function flight(e, home) {
  if (!e.projected && (e.end_date || e.start_date) < today()) return h('p', { class: 'flight muted' }, 'This festival has taken place.');
  if (e.fare?.home) return h('p', { class: 'flight easy' }, 'In Bergen, no flight needed');
  if (!e.fare) return h('p', { class: 'flight muted' }, '✈ flight not checked yet');
  const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${home} to ${e.airport} on ${e.depart} through ${addDays(e.depart, 3)}`)}&curr=EUR`;
  return h('p', { class: 'flight' + (e.fare.price <= 150 ? ' easy' : '') }, '✈ ',
    h('a', { href: url, target: '_blank', rel: 'noopener', title: 'Friday to Monday return from Bergen; check it on Google Flights' }, '~' + euro(e.fare.price)),
    ` to ${cityOf(e.airport)}`, e.airport_km > 30 ? `, then ${e.airport_km} km` : '');
}

export function eventCard(e, home, { hint = null, open = false, onMap = false } = {}) {
  const start = e.projected ? e.depart : e.start_date, end = e.projected ? addDays(e.depart, 2) : (e.end_date || e.start_date);
  const title = tidyTitle(e.title);
  const more = h('div', { class: 'calm-more', hidden: true });
  const toggles = [];
  const setOpen = open => {
    if (open && !more.childElementCount) more.append(cardDetails(e, traits.slice(0, 3).map(([k]) => k), toggleBtn('link less', 'Less'), { onMap }));
    more.hidden = !open; art.classList.toggle('open', open);
    for (const t of toggles) t.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Less' : 'Line-up & details';
  };
  const toggleBtn = (cls, ...kids) => { const b = h('button', { type: 'button', class: cls, 'aria-expanded': 'false',
    onclick: ev => { ev.stopPropagation(); setOpen(more.hidden); } }, ...kids); toggles.push(b); return b; };
  const label = h('span', {}, 'Line-up & details');

  const links = e.headliners.map(a => h('a', { href: `#artist/${a.id}`, class: 'artist',
    onclick: () => { try { localStorage.setItem('kr-artist-seen', '1'); } catch {} } }, a.name));
  const rest = (e.lineup || 0) - e.headliners.length;
  const withLine = links.length ? h('p', { class: 'with' }, 'With ',
    ...links.flatMap((l, i) => i ? [i === links.length - 1 && rest <= 0 ? ' and ' : ', ', l] : [l]),
    rest > 0 ? [' and ', toggleBtn('link more-names', `${rest} more`)] : null) : null;
  // up to three features as icon + short word (icons alone are guesswork); the rest are in the details
  const feats = new Set((e.features || '').split(','));
  const traits = TRAITS.filter(([k]) => feats.has(k));
  const traitRow = traits.length ? h('ul', { class: 'traits', 'aria-label': 'Highlights' },
    traitItems(traits.slice(0, 3)),
    traits.length > 3 ? h('li', { class: 'more-traits' }, toggleBtn('link', `+${traits.length - 3}`)) : null) : null;

  const art = h('article', { class: 'calm-card' + (e.projected ? ' projected' : '') },
    h('div', { class: 'c-top' },
      dateBox(start, end, e.projected),
      h('div', { class: 'c-head' },
        h('p', { class: 'where' }, place(e)),
        h('h3', {}, toggleBtn('title-btn', title)))),
    styleLine(e) ? h('p', { class: 'styles' }, styleLine(e)) : null,
    traitRow,
    withLine,
    withLine ? hint : null,
    e.projected ? h('p', { class: 'with muted' }, 'This year’s dates aren’t out yet.') : null,
    h('div', { class: 'foot' }, flight(e, home), h('div', { class: 'actions' }, toggleBtn('link', label))),
    more);
  // the whole card opens the details, except where it already holds a link or a button
  art.addEventListener('click', ev => { if (!ev.target.closest('a, button, select, input, label, .calm-more')) setOpen(more.hidden); });
  if (open) setOpen(true);
  return art;
}

// Any event rows (map, artist pages) in the shape cards expect: the weekend's fare, best-known names, styles.
let heads, styles;
export function enrich(rows, home) {
  if (!heads) {
    heads = {}; styles = {};
    for (const r of q(`SELECT ea.event_id, a.id, a.display_name FROM event_artists ea JOIN artists a ON a.id = ea.artist_id
        JOIN artist_stats st ON st.artist_id = a.id WHERE ea.role IN ('teacher','dj') AND ea.as_couple IS NULL
        ORDER BY ea.event_id, st.bookings DESC`)) (heads[r.event_id] ||= []).length < 3 && heads[r.event_id].push({ id: r.id, name: r.display_name });
    for (const r of q(`SELECT event_id, genre FROM event_genres WHERE source = 'description'`)) (styles[r.event_id] ||= new Set()).add(r.genre);
  }
  const fares = Object.fromEntries(q('SELECT airport || depart AS k, price FROM fares').map(f => [f.k, f.price]));
  return rows.map(e => ({ ...e, depart: e.weekend_friday, headliners: heads[e.id] || [], styles: styles[e.id] || new Set(),
    fare: e.airport === home ? { price: 0, home: true } : (fares[e.airport + e.weekend_friday] != null ? { price: fares[e.airport + e.weekend_friday] } : null) }));
}
