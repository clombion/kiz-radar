// A person's plans page, with a link to share it (the Friends tab's list is friends.ts).

import { q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { withDetails } from './festivals.ts';
import { person, togetherHref } from './plans.ts';
import { artistHref, personHref } from './routes.ts';
import { EVENT } from './rows.ts';
import { joined } from './wording.ts';

// Public: anyone sees it; keeping plans to chosen friends needs the accounts that come later.
export function personView(root: HTMLElement, key: string): void {
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
      h(
        'p',
        { class: 'share-row' },
        shareButton('Share these plans', `${p.name}’s festival plans`),
        h('a', { href: togetherHref([p.key]) }, 'Compare with friends →'),
      ),
    ],
    comingUp(
      events.map((e) => eventCard(e)),
      'No festival plans shared yet.',
    ),
  );
}

// A button that shares a link under a title, this page's (as it is when pressed) unless another is given: the
// device's share sheet, or else the link copied.
// It says what it did for a moment (SAID_MS), then its label again: "Link copied", or, when the browser has no clipboard
// or refuses it, to copy the address bar instead.
export const SAID_MS = 2500;
export function shareButton(label: string, title: string, link?: string): HTMLButtonElement {
  const say = (words: string) => {
    share.textContent = words;
    setTimeout(() => {
      share.textContent = label;
    }, SAID_MS);
  };
  const copy = (url: string): Promise<void> =>
    'clipboard' in navigator && typeof navigator.clipboard.writeText === 'function'
      ? navigator.clipboard.writeText(url).then(() => say('Link copied'))
      : Promise.reject(new Error('no clipboard'));
  const share = button(
    {
      class: 'more-btn',
      onclick: () => {
        const url = link ?? location.href;
        (typeof navigator.share === 'function' ? navigator.share({ title, url }) : copy(url)).catch((e: unknown) => {
          // the visitor closing the share sheet is no failure; anything else is said, with what to do instead
          if (!(e instanceof DOMException && e.name === 'AbortError')) say('Copy the address bar to share');
        });
      },
    },
    label,
  );
  return share;
}

// "Coming up (3)" over the cards of the festivals to come, or what to say when there are none
const comingUp = (cards: readonly HTMLElement[], none: string): HTMLElement =>
  h(
    'section',
    {},
    h('h2', {}, cards.length > 0 ? `Coming up (${cards.length})` : 'Coming up'),
    cards.length > 0 ? h('div', { class: 'festival-cards' }, cards) : h('p', { class: 'muted' }, none),
  );
// someone's name, linking to their plans page
export const personLink = (p: { key: string; name: string }): HTMLElement =>
  h('a', { href: personHref(p.key), class: 'artist' }, p.name);

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
