// Who's going where: the festivals people said they're going to, by date, and each person's plans page with a link
// to share it.
import { q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { withDetails } from './festivals.ts';
import { goersInline, goersOf, goingRow, person, withPlans } from './plans.ts';
import { artistHref, personHref } from './routes.ts';
import { EVENT } from './rows.ts';
import { joined } from './wording.ts';

// Anyone with the link sees it; keeping plans to chosen friends needs the accounts that come later.
export function personView(root: HTMLElement, [key]: readonly string[]): void {
  if (!key) {
    everyone(root);
    return;
  }
  const p = person(key);
  if (!p) {
    root.replaceChildren(h('p', {}, 'No one by that name has shared plans.'));
    return;
  }
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT e.* FROM plan_rows pr JOIN event_rows e ON e.id = pr.event_id WHERE pr.person_id = ? AND e.upcoming
    ORDER BY e.start_date`,
      [p.id],
    ),
  );
  page(
    root,
    [
      `${p.name}’s festival plans`,

      p.artists.length > 0
        ? h(
            'p',
            { class: 'lede' },
            'Also on Kiz Radar as ',
            joined(p.artists.map((a) => h('a', { href: artistHref(a.id), class: 'artist' }, a.display_name))),
          )
        : null,
      shareButton('Share these plans', `${p.name}’s festival plans`),
    ],
    comingUp(
      events.map((e) => eventCard(e)),
      'No festival plans shared yet.',
    ),
  );
}

// A button that shares this page's link under a title: the device's share sheet, or else the link copied.
export function shareButton(label: string, title: string): HTMLButtonElement {
  const share = button(
    {
      class: 'more-btn',
      onclick: () => {
        const url = location.href;
        (typeof navigator.share === 'function'
          ? navigator.share({ title, url })
          : navigator.clipboard.writeText(url).then(() => {
              share.textContent = 'Link copied';
            })
        ).catch(() => {
          /* the visitor closed the share sheet, or the browser refused the clipboard */
        });
      },
    },
    label,
  );
  return share;
}

// "Coming up (3)" (or another heading) over the cards of the festivals to come, or what to say when there are none
export const comingUp = (cards: readonly HTMLElement[], none: string, heading = 'Coming up'): HTMLElement =>
  h(
    'section',
    {},
    h('h2', {}, cards.length > 0 ? `${heading} (${cards.length})` : heading),
    cards.length > 0 ? h('div', { class: 'festival-cards' }, cards) : h('p', { class: 'muted' }, none),
  );
// someone's name, linking to their plans page
export const personLink = (p: { key: string; name: string }): HTMLElement =>
  h('a', { href: personHref(p.key), class: 'artist' }, p.name);

// The festivals coming up that anyone said they're going to, soonest first, then everyone who shares plans.
function everyone(root: HTMLElement): void {
  const events = q(
    EVENT,
    sql`SELECT e.* FROM event_rows e WHERE e.upcoming AND e.id IN (SELECT event_id FROM plans) ORDER BY e.start_date`,
  );
  const people = withPlans();
  page(
    root,
    ['Who’s going where', h('p', { class: 'lede' }, 'The festivals friends said they’re going to.')],

    events.length > 0
      ? h(
          'ul',
          { class: 'plan-list' },
          events.map((e) => goingRow(e, goersInline(goersOf(e.id)))),
        )
      : h('p', { class: 'muted' }, 'Nobody has shared plans yet.'),

    people.length > 0
      ? h(
          'section',
          {},
          h('h2', {}, 'Friends sharing their plans'),
          h('p', {}, joined(people.map((p) => [personLink(p), h('span', { class: 'muted' }, ` (${p.upcoming})`)]))),
        )
      : null,
  );
}

// a page of plans (a person's, everyone's, a community's): its title and what goes under it in the head, then the rest
export function page(root: HTMLElement, [title, ...head]: readonly [Kid, ...Kid[]], ...rest: Kid[]): void {
  root.replaceChildren(
    h(
      'article',
      { class: 'artist-profile' },
      h('header', { class: 'profile-head' }, h('h1', {}, title), ...head),
      ...rest,
    ),
  );
}
