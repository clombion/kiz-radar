// Who's going where: the festivals people said they're going to, by date, and each person's plans page with a link
// to share it.
import { q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { withDetails } from './festivals.ts';
import { goersInline, goersOf, person, withPlans } from './plans.ts';
import { artistHref, eventOnMapHref, personHref } from './routes.ts';
import { EVENT } from './rows.ts';
import { dayRange, place } from './ui.ts';
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
  const share = button(
    {
      class: 'more-btn',
      onclick: () => {
        const url = location.href,
          title = `${p.name}’s festival plans`;
        (Reflect.has(navigator, 'share')
          ? navigator.share({ title, url })
          : navigator.clipboard.writeText(url).then(() => {
              share.textContent = 'Link copied';
            })
        ).catch(() => {
          /* the visitor closed the share sheet, or the browser refused the clipboard */
        });
      },
    },
    'Share these plans',
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
      share,
    ],
    h(
      'section',
      {},
      h('h2', {}, events.length > 0 ? `Coming up (${events.length})` : 'Coming up'),

      events.length > 0
        ? h(
            'div',
            { class: 'festival-cards' },
            events.map((e) => eventCard(e)),
          )
        : h('p', { class: 'muted' }, 'No festival plans shared yet.'),
    ),
  );
}

// The festivals coming up that anyone said they're going to, soonest first, then everyone who shares plans.
function everyone(root: HTMLElement): void {
  const events = q(
    EVENT,
    sql`SELECT e.* FROM event_rows e WHERE e.upcoming AND e.id IN (SELECT event_id FROM plans) ORDER BY e.start_date`,
  );
  const people = withPlans();
  const when = (e: { start_date: string; end_date: string }) => dayRange(e.start_date, e.end_date);
  page(
    root,
    ['Who’s going where', h('p', { class: 'lede' }, 'The festivals friends said they’re going to.')],

    events.length > 0
      ? h(
          'ul',
          { class: 'plan-list' },
          events.map((e) =>
            h(
              'li',
              {},
              h('span', { class: 'when' }, when(e)),
              h(
                'span',
                { class: 'what' },
                h('a', { href: eventOnMapHref(e.id) }, e.title),
                h('span', { class: 'muted' }, ' · ', place(e)),
              ),
              h('span', { class: 'who' }, goersInline(goersOf(e.id))),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Nobody has shared plans yet.'),

    people.length > 0
      ? h(
          'section',
          {},
          h('h2', {}, 'Friends sharing their plans'),
          h(
            'p',
            {},
            joined(
              people.map((p) => [
                h('a', { href: personHref(p.key), class: 'artist' }, p.name),
                h('span', { class: 'muted' }, ` (${p.upcoming})`),
              ]),
            ),
          ),
        )
      : null,
  );
}

// a page of plans: its title and what goes under it in the head, then the rest
function page(root: HTMLElement, [title, ...head]: readonly [Kid, ...Kid[]], ...rest: Kid[]): void {
  root.replaceChildren(
    h(
      'article',
      { class: 'artist-profile' },
      h('header', { class: 'profile-head' }, h('h1', {}, title), ...head),
      ...rest,
    ),
  );
}
