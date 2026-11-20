// What an opened card adds, most useful first: who's teaching and playing, what else the weekend has, then the
// practical bits (venue, organisers) that matter once you've decided to go. Drawn by Solid, in the card's boundary
// (eventcard.tsx), since it reads the line-up from the database as the card opens.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createSignal, For, onCleanup } from 'solid-js';
import { q, sql } from './db.ts';
import type { Festival } from './festivals.ts';
import { type Drawing, icon as featureIcon, MORE_TRAITS, type Trait, TRAITS } from './icons.ts';
import { passesButton } from './passes.tsx';
import { whoIsGoing } from './plans.ts';
import { done } from './report.ts';
import { artistHref, eventOnMapHref } from './routes.ts';
import { flag as flagCol, num, opt, type RowOf, state, str } from './rows.ts';
import { KEY, LINK } from './states.ts';
import { away, countryName, flag } from './ui.ts';
import { type Key, linkOf, text, where } from './wording.ts';

// the line-up by role, in the order pipeline/states.py lists them; organisers have a line of their own
const ROLES = where('role', 'view').filter((r) => r !== KEY.role.ORGANISER);
const icon = (drawn: Drawing) => (
  <span
    class="ic"
    ref={(el) => {
      drawn.into(el);
    }}
  />
);
// a highlight with prices behind it (couple & group deals) opens the passes over the page
export const traitItems = (list: readonly Trait[], e?: Festival): JSX.Element[] =>
  list.map(([key, label, svg]) => (
    <li>
      {icon(svg)}
      {linkOf('feature', key) === LINK.PASSES && e ? passesButton(e, 'trait-link', label) : label}
    </li>
  ));

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
const artistLink = (p: Person) => (
  <a href={artistHref(p.id)} class="artist">
    {p.display_name}
  </a>
);
const roster = (r: Key<'role'>, listed: readonly Person[]) => (
  <section class="roster">
    <h4>
      {text('role', r)}
      <span class="n">{listed.length}</span>
    </h4>
    <ul>
      <For each={listed}>
        {(p) => (
          <li>
            {artistLink(p)}
            {p.home_country === null ? null : (
              <span class="flag" title={countryName(p.home_country)}>
                {' '}
                {flag(p.home_country)}
              </span>
            )}
            {p.bookings !== null && p.bookings > 1 ? <span class="bk">{` · ${p.bookings} festivals`}</span> : null}
          </li>
        )}
      </For>
    </ul>
  </section>
);

// the code first: it's ours to give, and it's what someone opening the card for it wants. Copy says Copied for a
// while once it has copied it; its timers are the line's, cleared with it.
const SAID_MS = 2000;
function promoLine({ code, offer }: NonNullable<Festival['promo']>): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => {
    for (const t of timers) clearTimeout(t);
  });
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    const t = setTimeout(() => {
      timers.delete(t);
      setCopied(false);
    }, SAID_MS);
    timers.add(t);
  };
  return (
    <p class="promo">
      {icon(featureIcon(KEY.feature.PROMO_CODE))}
      {text('feature', KEY.feature.PROMO_CODE)} <code>{code}</code>
      {offer === null ? null : ` · ${offer}`}{' '}
      <button type="button" class={['link', 'copy']} onClick={() => done(copy(), 'copying the code')}>
        {copied() ? 'Copied' : 'Copy'}
      </button>
    </p>
  );
}

// where it is and who organises it
function practical(venue: string | null, organisers: readonly Person[]): JSX.Element {
  if (venue === null && organisers.length === 0) return null;
  return (
    <p class="practical">
      {venue === null ? null : ['Venue: ', venue]}
      {venue !== null && organisers.length > 0 ? ' · ' : null}
      {organisers.length > 0
        ? [text('role', KEY.role.ORGANISER), ' ', ...organisers.flatMap((p, i) => [i ? ', ' : '', artistLink(p)])]
        : null}
    </p>
  );
}

export function cardDetails(
  e: Festival,
  shownTraits: readonly Key<'feature'>[],
  close: JSX.Element,
  { onMap = false } = {},
): JSX.Element {
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
  return (
    <div class="card-details">
      {e.promo ? promoLine(e.promo) : null}
      {whoIsGoing(e)}
      {ROLES.flatMap((r) => {
        const listed = byRole.get(r);
        return listed ? [roster(r, listed)] : [];
      })}
      {people.length > 0 ? null : <p class="muted">No line-up announced yet.</p>}
      {rest.length > 0 ? <ul class="traits">{traitItems(rest, e)}</ul> : null}
      {practical(e.venue, byRole.get(KEY.role.ORGANISER) ?? [])}
      <div class="links">
        <p>
          {onMap ? null : [<a href={eventOnMapHref(e.id)}>See it on the map</a>, ' · ']}
          <a href={e.url} target="_blank" rel="noopener">
            Kizomba-world
            {away()}
          </a>
        </p>
        {close}
      </div>
    </div>
  );
}
