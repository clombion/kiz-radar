// The festival card used across the site: date, place, title, styles, highlights, a few names and the flight,
// opening in place to the full line-up and practical details. Rows come from festivals.js (withDetails).
import { h, addDays, today, flightsUrl, home, dayMonth } from './ui.js';
import { money, convert, step, total } from './money.js';
import { riseNote, openPasses } from './passes.js';
import { place, styleLine } from './festivals.js';
import { TRAITS } from './icons.js';
import { cardDetails, traitItems } from './details.js';
import { artistHint } from './hints.js';
import { artistHref } from './routes.js';
import { goingLine } from './plans.js';

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
function dateBox(start, end) {
  const [dd1, mm1] = dayMonth(start).split(' '), [dd2, mm2] = dayMonth(end).split(' ');
  const yr = end.slice(0, 4) !== today().slice(0, 4) ? ' ' + end.slice(0, 4) : '';     // "Jan 2027"
  if (mm1 !== mm2) return h('div', { class: 'datebox cross' },
    h('span', { class: 'dd' }, dd1, ' ', h('small', {}, mm1)), h('span', { class: 'dd' }, '– ', dd2, ' ', h('small', {}, mm2 + yr)));
  return h('div', { class: 'datebox' }, h('span', { class: 'dd' }, start === end ? dd1 : `${dd1}–${dd2}`), h('span', { class: 'mm' }, mm1 + yr));
}

// "✈ ~5 150 kr to Brussels, then 104 km": a Fri→Mon return from home to the nearest airport with prices, and how far
// the festival is from it. The price links to Google Flights for that weekend.
const flightLink = (e, text) => h('a', { href: flightsUrl(e.airport, e.depart, addDays(e.depart, 3)), target: '_blank', rel: 'noopener',
  title: `Friday to Monday return from ${home().city}; check it on Google Flights` }, text);
const after = e => [` to ${e.airport_city}`, e.airport_km > 30 ? `, then ${e.airport_km} km` : ''];
const cheap = e => convert(e.fare.price) <= step('flight', 'cheap');
function flight(e) {
  if (e.cancelled) return h('p', { class: 'flight muted' }, 'This festival was cancelled.');
  if (!e.upcoming) return h('p', { class: 'flight muted' }, 'This festival has taken place.');
  if (!e.airport) return h('p', { class: 'flight muted' }, `✈ too far from ${home().city} for our flight prices`);
  if (e.fare?.home) return h('p', { class: 'flight easy' }, `In ${home().city}, no flight needed`);
  if (!e.fare) return h('p', { class: 'flight muted' }, '✈ flight not checked yet');
  return h('p', { class: 'flight' + (cheap(e) ? ' easy' : '') }, '✈ ', flightLink(e, money(e.fare.price, 'EUR', { approx: true })), ...after(e));
}

// The foot's prices. With a pass price and a flight, the total first:
//   Cost ~4 130 kr, without accommodation · price goes up 15 Dec
//   1 670 kr full pass + ~2 460 kr flight to Stockholm, then 37 km
// The pass opens the passes quick view; the flight opens Google Flights. With only one of the two, that one alone.
function prices(e) {
  const p = e.price;
  if (!p) return flight(e);
  const passBtn = text => h('button', { type: 'button', class: 'link pass-btn',
    onclick: ev => { ev.stopPropagation(); openPasses(e, ev.currentTarget); } }, text);
  if (p.soldOut) return [h('p', { class: 'pass-price muted' }, '🎟 ', passBtn(`${p.hotel ? 'Packages' : 'Full passes'} sold out`)), flight(e)];
  const pass = passBtn(`${p.from ? 'from ' : ''}${money(p.tier.amount, p.tier.currency)} ${p.hotel ? 'package with hotel' : 'full pass'}`);
  const rise = p.next ? ` · ${riseNote(p.next)}` : '';
  const sum = e.fare && total([[p.tier.amount, p.tier.currency], [e.fare.home ? 0 : e.fare.price, 'EUR']]);
  if (!sum) return [h('p', { class: 'pass-price' }, '🎟 ', pass, rise), flight(e)];
  return [h('p', { class: 'cost' }, 'Cost ', h('strong', {}, p.from ? 'from ' : '', sum), p.hotel ? ', hotel included' : ', without accommodation', rise),
    h('p', { class: 'cost-parts' }, pass, ' + ', e.fare.home ? `no flight, in ${home().city}`
      : [h('span', { class: cheap(e) ? 'easy' : null }, flightLink(e, `${money(e.fare.price, 'EUR', { approx: true })} flight`)), ...after(e)])];
}

// Opening a card changes the layout (on wide screens it takes the whole row). A view transition animates that: the
// card grows into place, drawn on top, and the cards on screen glide to theirs. The card shows its larger state
// clipped, never stretched: opening reveals the new content downward, closing rolls the old content up. Opening
// eases in over a longer time than closing (see site.css). With reduced motion it is a short cross-fade instead.
// Without view transitions the change is instant.
let named = 0;
function smoothly(card, change, opening) {
  if (!document.startViewTransition) return change();
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onScreen = calm ? [] : [...card.parentElement.children].filter(c => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  for (const c of onScreen) {
    c.style.viewTransitionName = c === card ? 'card-toggled' : `card-${++named}`;
    c.style.viewTransitionClass = 'card';
  }
  const root = document.documentElement;
  root.dataset.vt = calm ? 'calm' : opening ? 'open' : 'close';
  const t = document.startViewTransition(() => {
    change();
    const r = card.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight - 80) card.scrollIntoView({ block: 'nearest' });       // keep the card in view
  });
  t.finished.finally(() => { for (const c of onScreen) c.style.viewTransitionName = c.style.viewTransitionClass = ''; delete root.dataset.vt; });
}

export function eventCard(e, { hint = null, open = false, onMap = false } = {}) {
  const more = h('div', { class: 'festival-more', hidden: true });
  const toggles = [];
  const setOpen = open => {
    if (open && !more.childElementCount) more.append(cardDetails(e, traits.slice(0, 3).map(([k]) => k), toggleBtn('link less', 'Less'), { onMap }));
    more.hidden = !open; art.classList.toggle('open', open);
    for (const t of toggles) t.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Less' : 'Line-up & details';
  };
  const toggleBtn = (cls, ...kids) => { const b = h('button', { type: 'button', class: cls, 'aria-expanded': 'false',
    onclick: ev => { ev.stopPropagation(); toggle(); } }, ...kids); toggles.push(b); return b; };
  const label = h('span', {}, 'Line-up & details');
  const toggle = () => { const opening = more.hidden; smoothly(art, () => setOpen(opening), opening); };

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

  // The card opens from its title, and from its foot below the line (the prices and "Line-up & details"); the rest of
  // it holds names and links that do their own thing.
  const foot = h('div', { class: 'foot' }, prices(e), h('div', { class: 'actions' }, toggleBtn('link', label)));
  foot.addEventListener('click', ev => { if (!ev.target.closest('a, button')) toggle(); });
  const art = h('article', { class: 'festival-card' },
    h('div', { class: 'c-top' },
      dateBox(e.start_date, e.end_date),
      h('div', { class: 'c-head' },
        h('p', { class: 'where' }, place(e)),
        h('h3', {}, toggleBtn('title-btn', e.title)))),
    styleLine(e) ? h('p', { class: 'styles' }, styleLine(e)) : null,
    traitRow,
    withLine,
    withLine ? hint : null,
    goingLine(e),
    foot,
    more);
  if (open) setOpen(true);
  return art;
}
