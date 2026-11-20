// A person's plans page, with a link to share it (the Friends tab's list is friends.tsx); and what a page of plans
// shares with a community's: its frame, its Share button and a person's link.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { awhile } from './controls.tsx';
import { q, sql } from './db.ts';
import { festivalCards } from './eventcard.tsx';
import { type Festival, withDetails } from './festivals.ts';
import type { ViewProps } from './mount.tsx';
import { person as personOf, togetherHref } from './plans.tsx';
import { artistHref, personHref } from './routes.ts';
import { EVENT } from './rows.ts';
import { joined } from './wording.ts';

// Public: anyone sees it; keeping plans to chosen friends needs the accounts that come later.
export function person({ sub: [key = ''] }: ViewProps): JSX.Element {
  const p = personOf(key);
  if (!p) return <p>No one by that name has shared plans.</p>;
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT e.* FROM plan_rows pr JOIN event_rows e ON e.id = pr.event_id WHERE pr.person_id = ? AND e.upcoming
    ORDER BY e.start_date`,
      [p.id],
    ),
  );
  return page(
    `${p.name}’s festival plans`,
    <>
      {p.artists.length > 0 ? (
        <p class="lede">
          {'Also on Kiz Radar as '}
          {joined(
            p.artists.map((a) => (
              <a href={artistHref(a.id)} class="artist">
                {a.display_name}
              </a>
            )),
          )}
        </p>
      ) : null}
      <p class="share-row">
        {shareButton('Share these plans', `${p.name}’s festival plans`)}
        <a href={togetherHref([p.key])}>Compare with friends →</a>
      </p>
    </>,
    comingUp(events, 'No festival plans shared yet.'),
  );
}

// A button that shares a link under a title, this page's (as it is when pressed) unless another is given: the
// device's share sheet, or else the link copied.
// It says what it did for a moment (SAID_MS), then its label again: "Link copied", or, when the browser has no clipboard
// or refuses it, to copy the address bar instead (controls.tsx awhile).
const SAID_MS = 2500;
export function shareButton(label: string, title: string, link?: string): JSX.Element {
  const [words, say] = awhile(label, SAID_MS);
  const copy = async (url: string): Promise<void> => {
    if (!('clipboard' in navigator && typeof navigator.clipboard.writeText === 'function'))
      throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    say('Link copied');
  };
  return (
    <button
      type="button"
      class="more-btn"
      onClick={() => {
        const url = link ?? location.href;
        (typeof navigator.share === 'function' ? navigator.share({ title, url }) : copy(url)).catch((e: unknown) => {
          // the visitor closing the share sheet is no failure; anything else is said, with what to do instead
          if (!(e instanceof DOMException && e.name === 'AbortError')) say('Copy the address bar to share');
        });
      }}
    >
      {words()}
    </button>
  );
}

// "Coming up (3)" over the cards of the festivals to come, or what to say when there are none
const comingUp = (events: readonly Festival[], none: string): JSX.Element => (
  <section>
    <h2>{events.length > 0 ? `Coming up (${events.length})` : 'Coming up'}</h2>
    {events.length > 0 ? festivalCards(events) : <p class="muted">{none}</p>}
  </section>
);
// someone's name, linking to their plans page
export const personLink = (p: { readonly key: string; readonly name: string }): JSX.Element => (
  <a href={personHref(p.key)} class="artist">
    {p.name}
  </a>
);

// a page of plans (a person's, a community's): its title and what goes under it in the head, then the rest
export const page = (title: JSX.Element, head: JSX.Element, ...rest: readonly JSX.Element[]): JSX.Element => (
  <article class="artist-profile">
    <header class="profile-head">
      <h1>{title}</h1>
      {head}
    </header>
    {rest}
  </article>
);
