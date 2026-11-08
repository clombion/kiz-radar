// Who's going where: the festivals people near a place said they're going to, by date, and each person's plans page
// with a link to share it.

import { one, q, sql } from './db.ts';
import { dismissable } from './dismiss.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { withDetails } from './festivals.ts';
import { Drawing } from './icons.ts';
import { goersInline, goersOf, goingRow, person, withPlans } from './plans.ts';
import { artistHref, personHref } from './routes.ts';
import { EVENT, num, str } from './rows.ts';
import { joined } from './wording.ts';

// Public: anyone sees it; keeping plans to chosen friends needs the accounts that come later.
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

// how far from a place someone lives and is near it, in km
export const NEAR_KM = 200;
// where the people near are looked for
interface Spot {
  lat: number;
  lon: number;
}
// the kilometres between two places, on a round Earth
function kmBetween(a: Spot, b: Spot): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h2 =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h2));
}
// the site's home city (its home airport's), where the people near are looked for
const homeCity = () =>
  one(
    { city: str, lat: num, lon: num },
    sql`SELECT h.city, h.lat, h.lon FROM homes h JOIN airports a ON a.city = h.city WHERE a.home = 1`,
  );
// the people sharing plans who live within NEAR_KM of a place, by key; those who have not said where they live never
const livingNear = (at: Spot): Set<string> =>
  new Set(
    q({ key: str, lat: num, lon: num }, sql`SELECT p.key, h.lat, h.lon FROM people p JOIN homes h ON h.city = p.home`)
      .filter((p) => kmBetween(at, p) <= NEAR_KM)
      .map((p) => p.key),
  );

// The Friends tab, for a visitor without an account: the people near the site's home city, the festivals they're going
// to and who they are; then the rest of the world, which comes later.
function everyone(root: HTMLElement): void {
  const home = homeCity();
  page(
    root,
    ['Who’s going where', h('p', { class: 'lede' }, 'All the dancers in the community with public plans.')],
    h('section', { class: 'friends-near' }, nearHere(home ?? null, home?.city ?? 'home')),
    h(
      'section',
      { class: 'friends-rest' },
      h('h2', {}, 'Rest of the world'),
      h('p', { class: 'muted' }, 'Not available yet'),
    ),
  );
}

// "Near Bergen": the festivals to come the people living within NEAR_KM are going to, soonest first, each naming them,
// and who they are
function nearHere(at: Spot | null, name: string): Kid[] {
  const keys = at === null ? new Set<string>() : livingNear(at);
  const events = q(
    EVENT,
    sql`SELECT e.* FROM event_rows e WHERE e.upcoming AND e.id IN (SELECT event_id FROM plans) ORDER BY e.start_date`,
  ).flatMap((e) => {
    const goers = goersOf(e.id).filter((g) => keys.has(g.key));
    return goers.length > 0 ? [goingRow(e, goersInline(goers))] : [];
  });
  const people = withPlans().filter((p) => keys.has(p.key));
  return [
    ...about(`Near ${name}`, `Within ${NEAR_KM} km of ${name}.`),
    events.length > 0
      ? h('ul', { class: 'plan-list' }, events)
      : h('p', { class: 'muted' }, 'No one near here has shared plans yet.'),
    people.length > 0
      ? h(
          'p',
          {},
          'Sharing their plans: ',
          joined(people.map((p) => [personLink(p), h('span', { class: 'muted' }, ` (${p.upcoming})`)])),
        )
      : null,
  ];
}

// A list's heading with an (i) button after it, and the small card the button shows of what the list is, under the
// heading: on hover, on focus and on a tap (which keeps it until the next, or Escape)
function about(heading: string, said: string): [HTMLElement, HTMLElement] {
  const card = h('p', { class: 'info-card', id: 'friends-about', hidden: true }, said);
  let kept = false;
  const show = (open: boolean) => {
    card.hidden = !open;
    info.setAttribute('aria-expanded', String(open));
    if (open) dismiss.opened();
    else dismiss.closed();
  };
  const dismiss = dismissable({
    within: () => [info, card],
    close: () => {
      kept = false;
      show(false);
    },
  });
  const info = Drawing.INFO.into(
    button({
      class: 'info-btn',
      'aria-label': 'About this list',
      'aria-expanded': 'false',
      'aria-controls': card.id,
      onclick: () => {
        kept = !kept;
        show(kept);
      },
      onmouseenter: () => show(true),
      onmouseleave: () => show(kept),
      onfocus: () => show(true),
    }),
  );
  return [h('h2', {}, heading, ' ', info), card];
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
