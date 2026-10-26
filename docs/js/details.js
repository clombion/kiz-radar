// What an opened card adds, most useful first: who's teaching and playing, what else the weekend has,
// then the practical bits (venue, organisers) that matter once you've decided to go.
import { q } from './db.js';
import { h, flag, countryName } from './ui.js';
import { TRAITS, MORE_TRAITS } from './icons.js';
import { artistHref, eventOnMapHref } from './routes.js';
import { whoIsGoing } from './plans.js';
import { openPasses } from './passes.js';

const ROLES = [['teacher', 'Teachers'], ['dj', 'DJs'], ['performer', 'Performers'], ['mc', 'MCs']];
const icon = svg => { const el = h('span', { class: 'ic' }); el.innerHTML = svg; return el; };
// a highlight with prices behind it (couple & group deals) opens the passes over the page
export const traitItems = (list, e) => list.map(([key, label, svg]) => h('li', {}, icon(svg), key === 'group_deals' && e
  ? h('button', { type: 'button', class: 'link trait-link', onclick: ev => { ev.stopPropagation(); openPasses(e, ev.currentTarget); } }, label)
  : label));

export function cardDetails(e, shownTraits, close, { onMap = false } = {}) {
  const people = q(`SELECT a.id, a.display_name, ea.role, st.bookings, st.popular, st.home_country
    FROM event_artists ea JOIN artists a ON a.id = ea.artist_id LEFT JOIN artist_stats st ON st.artist_id = a.id
    WHERE ea.event_id = ? AND ea.as_couple IS NULL ORDER BY st.bookings DESC, a.display_name`, [e.id]);
  const byRole = {};
  for (const p of people) (byRole[p.role] ||= []).push(p);
  const rest = [...TRAITS, ...MORE_TRAITS].filter(([k]) => e.features.has(k) && !shownTraits.includes(k));
  const venue = e.venue;
  const organisers = byRole.organiser || [];
  const person = p => h('a', { href: artistHref(p.id), class: 'artist' }, p.display_name);

  // the code first: it's ours to give, and it's what someone opening the card for it wants
  const copy = h('button', { type: 'button', class: 'link copy', onclick: () => navigator.clipboard?.writeText(e.promo.code)
    .then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 2000); }) }, 'Copy');
  return h('div', { class: 'card-details' },
    e.promo ? h('p', { class: 'promo' }, icon(TRAITS.find(([k]) => k === 'promo_code')[2]), 'Promo code ', h('code', {}, e.promo.code),
      e.promo.offer ? ` · ${e.promo.offer}` : null, ' ', copy) : null,
    whoIsGoing(e),
    ROLES.filter(([r]) => byRole[r]).map(([r, label]) => h('section', { class: 'roster' },
      h('h4', {}, label, h('span', { class: 'n' }, byRole[r].length)),
      h('ul', {}, byRole[r].map(p => h('li', {}, person(p),
        p.home_country ? h('span', { class: 'flag', title: countryName(p.home_country) }, ' ', flag(p.home_country)) : null,
        p.bookings > 1 ? h('span', { class: 'bk' }, ` · ${p.bookings} festivals`) : null))))),
    people.length ? null : h('p', { class: 'muted' }, 'No line-up announced yet.'),
    rest.length ? h('ul', { class: 'traits' }, traitItems(rest, e)) : null,
    venue || organisers.length ? h('p', { class: 'practical' },
      venue ? ['Venue: ', venue] : null, venue && organisers.length ? ' · ' : null,
      organisers.length ? ['Organised by ', ...organisers.flatMap((p, i) => [i ? ', ' : '', person(p)])] : null) : null,
    h('div', { class: 'links' },
      h('p', {}, onMap ? null : [h('a', { href: eventOnMapHref(e.id) }, 'See it on the map'), ' · '],
        h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Kizomba-world ↗')),
      close));
}
