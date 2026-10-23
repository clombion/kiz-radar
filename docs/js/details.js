// What an opened card adds, most useful first: who's teaching and playing, what else the weekend has,
// then the practical bits (venue, organisers) that matter once you've decided to go.
import { q } from './db.js';
import { h, flag, countryName } from './ui.js';
import { TRAITS, MORE_TRAITS } from './icons.js';
import { artistHref, eventOnMapHref } from './routes.js';

const ROLES = [['teacher', 'Teachers'], ['dj', 'DJs'], ['performer', 'Performers'], ['mc', 'MCs']];
const icon = svg => { const el = h('span', { class: 'ic' }); el.innerHTML = svg; return el; };
export const traitItems = list => list.map(([, label, svg]) => h('li', {}, icon(svg), label));

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

  return h('div', { class: 'card-details' },
    ROLES.filter(([r]) => byRole[r]).map(([r, label]) => h('section', { class: 'roster' },
      h('h4', {}, label, h('span', { class: 'n' }, byRole[r].length)),
      h('ul', {}, byRole[r].map(p => h('li', {}, person(p),
        p.home_country ? h('span', { class: 'flag', title: countryName(p.home_country) }, ' ', flag(p.home_country)) : null,
        p.bookings > 1 ? h('span', { class: 'bk' }, ` · ${p.bookings} festivals`) : null))))),
    people.length ? null : h('p', { class: 'muted' }, 'No line-up announced yet.'),
    rest.length ? h('ul', { class: 'traits' }, traitItems(rest)) : null,
    venue || organisers.length ? h('p', { class: 'practical' },
      venue ? ['Venue: ', venue] : null, venue && organisers.length ? ' · ' : null,
      organisers.length ? ['Organised by ', ...organisers.flatMap((p, i) => [i ? ', ' : '', person(p)])] : null) : null,
    h('div', { class: 'links' },
      h('p', {}, onMap ? null : [h('a', { href: eventOnMapHref(e.id) }, 'See it on the map'), ' · '],
        h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Kizomba-world ↗')),
      close));
}
