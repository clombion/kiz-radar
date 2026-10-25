// A person's plans page: the festivals they said they're going to, with a link to share them.
import { q } from './db.js';
import { h } from './ui.js';
import { withDetails } from './festivals.js';
import { eventCard } from './eventcard.js';
import { person } from './plans.js';
import { artistHref } from './routes.js';

const list = xs => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', x]);

// Anyone with the link sees it; keeping plans to chosen friends needs the accounts that come later.
export function personView(root, [key]) {
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
