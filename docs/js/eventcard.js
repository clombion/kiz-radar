// The festival card used across the site: date, place, title, styles, highlights, a few names and the flight,
// opening in place to the full line-up and practical details. Rows come from festivals.js (withDetails).
import { h, addDays, euro, today, flightsUrl, home, dayMonth } from './ui.js';
import { place, styleLine } from './festivals.js';
import { TRAITS } from './icons.js';
import { cardDetails, traitItems } from './details.js';
import { artistHint } from './hints.js';
import { artistHref } from './routes.js';

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
function dateBox(start, end, projected) {
  const [dd1, mm1] = dayMonth(start).split(' '), [dd2, mm2] = dayMonth(end).split(' ');
  const likely = projected ? h('span', { class: 'likely' }, 'likely') : null;
  const yr = end.slice(0, 4) !== today().slice(0, 4) ? ' ' + end.slice(0, 4) : '';     // "Jan 2027"
  if (mm1 !== mm2) return h('div', { class: 'datebox cross' }, likely,
    h('span', { class: 'dd' }, dd1, ' ', h('small', {}, mm1)), h('span', { class: 'dd' }, '– ', dd2, ' ', h('small', {}, mm2 + yr)));
  return h('div', { class: 'datebox' }, likely, h('span', { class: 'dd' }, start === end ? dd1 : `${dd1}–${dd2}`), h('span', { class: 'mm' }, mm1 + yr));
}

// "✈ ~€492 to Brussels, then 104 km": a Fri→Mon return from home to the nearest airport with prices, and how far
// the festival is from it. The price links to Google Flights for that weekend.
function flight(e) {
  if (e.cancelled) return h('p', { class: 'flight muted' }, 'This festival was cancelled.');
  if (!e.projected && !e.upcoming) return h('p', { class: 'flight muted' }, 'This festival has taken place.');
  if (!e.airport) return h('p', { class: 'flight muted' }, `✈ too far from ${home().city} for our flight prices`);
  if (e.fare?.home) return h('p', { class: 'flight easy' }, `In ${home().city}, no flight needed`);
  if (!e.fare) return h('p', { class: 'flight muted' }, '✈ flight not checked yet');
  return h('p', { class: 'flight' + (e.fare.price <= 150 ? ' easy' : '') }, '✈ ',
    h('a', { href: flightsUrl(e.airport, e.depart, addDays(e.depart, 3)), target: '_blank', rel: 'noopener',
      title: `Friday to Monday return from ${home().city}; check it on Google Flights` }, '~' + euro(e.fare.price)),
    ` to ${e.airport_city}`, e.airport_km > 30 ? `, then ${e.airport_km} km` : '');
}

export function eventCard(e, { hint = null, open = false, onMap = false } = {}) {
  const start = e.projected ? e.depart : e.start_date, end = e.projected ? addDays(e.depart, 2) : e.end_date;
  const more = h('div', { class: 'festival-more', hidden: true });
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

  const links = e.headliners.map(a => h('a', { href: artistHref(a.id), class: 'artist', onclick: artistHint.mark }, a.name));
  const rest = e.lineup - e.headliners.length;
  const withLine = links.length ? h('p', { class: 'with' }, 'With ',
    ...links.flatMap((l, i) => i ? [i === links.length - 1 && rest <= 0 ? ' and ' : ', ', l] : [l]),
    rest > 0 ? [' and ', toggleBtn('link more-names', `${rest} more`)] : null) : null;
  // up to three features as icon + short word (icons alone are guesswork); the rest are in the details
  const traits = TRAITS.filter(([k]) => e.features.has(k));
  const traitRow = traits.length ? h('ul', { class: 'traits', 'aria-label': 'Highlights' },
    traitItems(traits.slice(0, 3)),
    traits.length > 3 ? h('li', { class: 'more-traits' }, toggleBtn('link', `+${traits.length - 3}`)) : null) : null;

  const art = h('article', { class: 'festival-card' + (e.projected ? ' projected' : '') },
    h('div', { class: 'c-top' },
      dateBox(start, end, e.projected),
      h('div', { class: 'c-head' },
        h('p', { class: 'where' }, place(e)),
        h('h3', {}, toggleBtn('title-btn', e.title)))),
    styleLine(e) ? h('p', { class: 'styles' }, styleLine(e)) : null,
    traitRow,
    withLine,
    withLine ? hint : null,
    e.projected ? h('p', { class: 'with muted' }, 'This year’s dates aren’t out yet.') : null,
    h('div', { class: 'foot' }, flight(e), h('div', { class: 'actions' }, toggleBtn('link', label))),
    more);
  // the whole card opens the details, except where it already holds a link or a button
  art.addEventListener('click', ev => { if (!ev.target.closest('a, button, select, input, label, .festival-more')) setOpen(more.hidden); });
  if (open) setOpen(true);
  return art;
}
