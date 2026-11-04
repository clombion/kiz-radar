// Who's going where: the festivals people near a place said they're going to, by date, and each person's plans page
// with a link to share it.
import { one, q, sql } from './db.ts';
import { button, h, type Kid, nodes } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { withDetails } from './festivals.ts';
import { goersInline, goersOf, goingRow, person, withPlans } from './plans.ts';
import { artistHref, personHref } from './routes.ts';
import { EVENT, num, str } from './rows.ts';
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

// A button that shares a link under a title, this page's (as it is when pressed) unless another is given: the
// device's share sheet, or else the link copied.
export function shareButton(label: string, title: string, link?: string): HTMLButtonElement {
  const share = button(
    {
      class: 'more-btn',
      onclick: () => {
        const url = link ?? location.href;
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
export const NEAR_KM = 150;
// where the people near are looked for: the site's home city, or the visitor where they are
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
// the site's home city (its home airport's), where the people near are looked for until the visitor shares where they
// are
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

// The Friends tab, for a visitor without an account: the people near a place (the site's home city, or the visitor
// where they are, when they share it), the festivals they're going to and who they are; then the rest of the world and
// the visitor's communities, which come later.
function everyone(root: HTMLElement): void {
  const home = homeCity() ?? null;
  const near = h('section', { class: 'friends-near', 'aria-labelledby': 'friends-near' });
  // the people near a place, with a note when the visitor's place could not be had; where the visitor is is used for
  // this and dropped: never in the address, never kept
  const show = (at: Spot | null, you: boolean, note: string | null) =>
    near.replaceChildren(...nodes(nearHere(at, you ? 'you' : (home?.city ?? 'home'), note, you ? null : locate)));
  const refused = () => show(home, false, `Your location wasn’t shared, so this stays on ${home?.city ?? 'home'}.`);
  const locate = () => {
    if ('geolocation' in navigator)
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => show({ lat: coords.latitude, lon: coords.longitude }, true, null),
        refused,
        { maximumAge: 0, timeout: 15_000 },
      );
    else refused();
  };
  show(home, false, null);
  page(
    root,
    ['Who’s going where', h('p', { class: 'lede' }, 'The festivals dancers sharing their plans are going to.')],
    near,
    h(
      'section',
      { class: 'friends-rest' },
      h('h2', {}, 'Rest of the world'),
      h('p', { class: 'muted' }, 'Not available yet'),
    ),
    h(
      'section',
      { class: 'friends-communities' },
      h('h2', {}, 'Your communities'),
      h('p', { class: 'muted' }, 'Not available yet — communities will show here once you can sign in'),
    ),
  );
}

// "Near Bergen" or "Near you": the festivals to come the people living within NEAR_KM are going to, soonest first,
// each naming them, and who they are; the button that looks where the visitor is, and a note when it could not
function nearHere(at: Spot | null, name: string, note: string | null, locate: (() => void) | null): Kid[] {
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
    h('h2', { id: 'friends-near' }, `Near ${name}`),
    h('p', { class: 'muted' }, `Dancers living within ${NEAR_KM} km who share their plans.`),
    locate === null
      ? null
      : button(
          { class: ['more-btn', 'friends-locate'], onclick: locate },
          'Use my location — it’s used on this page only and never stored or sent',
        ),
    h('p', { class: 'friends-note', role: 'status' }, note ?? ''),
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
