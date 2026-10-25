// Who's going where: the festivals people said they're going to, by date, and each person's plans page with a link
// to share it.
import { q } from './db.js';
import { h, flag, dayMonth } from './ui.js';
import { withDetails } from './festivals.js';
import { eventCard } from './eventcard.js';
import { person, goersOf, goersInline } from './plans.js';
import { artistHref, personHref, eventOnMapHref } from './routes.js';

const list = xs => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', x]);

// Anyone with the link sees it; keeping plans to chosen friends needs the accounts that come later.
export function personView(root, [key]) {
  if (!key) return everyone(root);
  const p = person(key);
  if (!p) { root.replaceChildren(h('p', {}, 'No one by that name has shared plans.')); return; }
  const events = withDetails(q(`SELECT e.* FROM plan_rows pr JOIN event_rows e ON e.id = pr.event_id WHERE pr.person_id = ? AND e.upcoming
    ORDER BY e.start_date`, [p.id]));
  const share = h('button', { type: 'button', class: 'more-btn', onclick: () => {
    const url = location.href, title = `${p.name}’s festival plans`;
    (navigator.share ? navigator.share({ title, url }) : navigator.clipboard.writeText(url).then(() => { share.textContent = 'Link copied'; }))
      .catch(() => {});
  } }, 'Share these plans');
  root.replaceChildren(h('article', { class: 'artist-profile' },
    h('header', { class: 'profile-head' }, h('h1', {}, `${p.name}’s festival plans`),
      p.artists.length ? h('p', { class: 'lede' }, 'Also on Kiz Radar as ', list(p.artists.map(a => h('a', { href: artistHref(a.id), class: 'artist' }, a.display_name)))) : null,
      share),
    h('section', {}, h('h2', {}, events.length ? `Coming up (${events.length})` : 'Coming up'),
      events.length ? h('div', { class: 'festival-cards' }, events.map(e => eventCard(e))) : h('p', { class: 'muted' }, 'No festival plans shared yet.'))));
}

// The festivals coming up that anyone said they're going to, soonest first, then everyone who shares plans.
function everyone(root) {
  const events = q(`SELECT e.* FROM event_rows e WHERE e.upcoming AND e.id IN (SELECT event_id FROM plans) ORDER BY e.start_date`);
  const people = q(`SELECT pe.key, pe.name, sum(e.upcoming) AS n FROM people pe JOIN plans p ON p.person_id = pe.id
    JOIN event_rows e ON e.id = p.event_id GROUP BY pe.id ORDER BY pe.featured DESC, pe.name`);
  const when = e => {                          // "6–9 Nov", or "26 Nov – 1 Dec" across a month end
    const [d1, m1] = dayMonth(e.start_date).split(' '), [d2, m2] = dayMonth(e.end_date).split(' ');
    return e.start_date === e.end_date ? `${d1} ${m1}` : m1 === m2 ? `${d1}–${d2} ${m1}` : `${d1} ${m1} – ${d2} ${m2}`;
  };
  root.replaceChildren(h('article', { class: 'artist-profile people' },
    h('header', { class: 'profile-head' }, h('h1', {}, 'Who’s going where'),
      h('p', { class: 'lede' }, 'The festivals people said they’re going to, soonest first.')),
    events.length ? h('ul', { class: 'plan-list' }, events.map(e => h('li', {},
      h('span', { class: 'when' }, when(e)),
      h('span', { class: 'what' }, h('a', { href: eventOnMapHref(e.id) }, e.title), h('span', { class: 'muted' }, ' · ', flag(e.country_code), ' ', e.city)),
      h('span', { class: 'who' }, goersInline(goersOf(e.id))))))
      : h('p', { class: 'muted' }, 'Nobody has shared plans yet.'),
    people.length ? h('section', {}, h('h2', {}, 'People sharing their plans'),
      h('p', {}, list(people.map(p => [h('a', { href: personHref(p.key), class: 'artist' }, p.name), h('span', { class: 'muted' }, ` (${p.n})`)])))) : null));
}
