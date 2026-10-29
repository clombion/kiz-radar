// What an opened card adds, most useful first: who's teaching and playing, what else the weekend has,
// then the practical bits (venue, organisers) that matter once you've decided to go.
import { q, sql } from './db.ts';
import type { Kid } from './dom.ts';
import { button, h, own } from './dom.ts';
import type { Festival } from './festivals.ts';
import { icon as featureIcon, MORE_TRAITS, TRAITS, type Trait } from './icons.ts';
import { openPasses } from './passes.ts';
import { whoIsGoing } from './plans.ts';
import { done } from './report.ts';
import { artistHref, eventOnMapHref } from './routes.ts';
import { flag as flagCol, num, opt, type RowOf, state, str } from './rows.ts';
import { KEY, LINK } from './states.ts';
import { away, countryName, flag } from './ui.ts';
import { type Key, linkOf, text, where } from './wording.ts';

// the line-up by role, in the order pipeline/states.py lists them; organisers have a line of their own
const ROLES = where('role', 'view').filter((r) => r !== KEY.role.ORGANISER);
const icon = (svg: string) => {
  const el = h('span', { class: 'ic' });
  el.innerHTML = svg;
  return el;
};
// a highlight with prices behind it (couple & group deals) opens the passes over the page
export const traitItems = (list: readonly Trait[], e?: Festival): HTMLElement[] =>
  list.map(([key, label, svg]) =>
    h(
      'li',
      {},
      icon(svg),
      linkOf('feature', key) === LINK.PASSES && e
        ? button({ class: 'link trait-link', onclick: own((b) => openPasses(e, b)) }, label)
        : label,
    ),
  );

// the line-up, by role: each artist with their flag and how often they are booked
const LINEUP = {
  id: num,
  display_name: str,
  role: state('role'),
  bookings: opt(num),
  popular: opt(flagCol),
  home_country: opt(str),
} as const;
type Person = RowOf<typeof LINEUP>;
const artistLink = (p: Person) => h('a', { href: artistHref(p.id), class: 'artist' }, p.display_name);
const roster = (r: Key<'role'>, listed: readonly Person[]) =>
  h(
    'section',
    { class: 'roster' },
    h('h4', {}, text('role', r), h('span', { class: 'n' }, listed.length)),
    h(
      'ul',
      {},
      listed.map((p) =>
        h(
          'li',
          {},
          artistLink(p),
          p.home_country === null
            ? null
            : h('span', { class: 'flag', title: countryName(p.home_country) }, ' ', flag(p.home_country)),
          p.bookings !== null && p.bookings > 1 ? h('span', { class: 'bk' }, ` · ${p.bookings} festivals`) : null,
        ),
      ),
    ),
  );

// the code first: it's ours to give, and it's what someone opening the card for it wants
function promoLine({ code, offer }: NonNullable<Festival['promo']>): HTMLElement {
  const copy = button(
    {
      class: 'link copy',
      onclick: () =>
        done(
          navigator.clipboard.writeText(code).then(() => {
            copy.textContent = 'Copied';
            setTimeout(() => {
              copy.textContent = 'Copy';
            }, 2000);
          }),
          'copying the code',
        ),
    },
    'Copy',
  );
  return h(
    'p',
    { class: 'promo' },
    icon(featureIcon(KEY.feature.PROMO_CODE)),
    text('feature', KEY.feature.PROMO_CODE),
    ' ',
    h('code', {}, code),
    offer === null ? null : ` · ${offer}`,
    ' ',
    copy,
  );
}

// where it is and who organises it
function practical(venue: string | null, organisers: readonly Person[]): HTMLElement | null {
  if (venue === null && organisers.length === 0) return null;
  return h(
    'p',
    { class: 'practical' },
    venue === null ? null : ['Venue: ', venue],
    venue !== null && organisers.length > 0 ? ' · ' : null,
    organisers.length > 0
      ? [text('role', KEY.role.ORGANISER), ' ', ...organisers.flatMap((p, i) => [i ? ', ' : '', artistLink(p)])]
      : null,
  );
}

export function cardDetails(
  e: Festival,
  shownTraits: readonly Key<'feature'>[],
  close: Kid,
  { onMap = false } = {},
): HTMLElement {
  const people = q(
    LINEUP,
    sql`SELECT a.id, a.display_name, ea.role, st.bookings, st.popular, st.home_country
    FROM event_artists ea JOIN artists a ON a.id = ea.artist_id LEFT JOIN artist_stats st ON st.artist_id = a.id
    WHERE ea.event_id = ? AND ea.as_couple IS NULL ORDER BY st.bookings DESC, a.display_name`,
    [e.id],
  );
  const byRole = new Map<Key<'role'>, Person[]>();
  for (const p of people) byRole.set(p.role, [...(byRole.get(p.role) ?? []), p]);
  const rest = [...TRAITS, ...MORE_TRAITS].filter(([k]) => e.features.has(k) && !shownTraits.includes(k));
  return h(
    'div',
    { class: 'card-details' },
    e.promo ? promoLine(e.promo) : null,
    whoIsGoing(e),
    ROLES.flatMap((r) => {
      const listed = byRole.get(r);
      return listed ? [roster(r, listed)] : [];
    }),
    people.length > 0 ? null : h('p', { class: 'muted' }, 'No line-up announced yet.'),
    rest.length > 0 ? h('ul', { class: 'traits' }, traitItems(rest, e)) : null,
    practical(e.venue, byRole.get(KEY.role.ORGANISER) ?? []),
    h(
      'div',
      { class: 'links' },
      h(
        'p',
        {},
        onMap ? null : [h('a', { href: eventOnMapHref(e.id) }, 'See it on the map'), ' · '],
        h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Kizomba-world', away()),
      ),
      close,
    ),
  );
}
