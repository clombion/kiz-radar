// The festival card used across the site: date, place, title, styles, highlights, a few names and the flight,
// opening in place to the full line-up and practical details. Rows come from festivals.ts (withDetails). Drawn by
// Solid: a function of the festival and the card's options, its open state a signal; an h() view holds one through
// mount.tsx's held.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createMemo, createSignal, flush, For, Show } from 'solid-js';
import { type Classes, own } from './bits.ts';
import { today } from './days.ts';
import { cardDetails, traitItems } from './details.tsx';
import { type Fare, resoldSaid } from './fares.ts';
import { type Festival, styleLine } from './festivals.ts';
import { flightsButton } from './flights.tsx';
import { artistHint } from './hints.ts';
import { TRAITS } from './icons.ts';
import { away, nowTag } from './marks.tsx';
import { approximately, money, within } from './money.ts';
import { held } from './mount.tsx';
import { passesButton, riseNote } from './passes.tsx';
import { Reported } from './placed.tsx';
import { goingLine } from './plans.tsx';
import { done } from './report.ts';
import { artistHref } from './routes.ts';
import { KEY, LINK } from './states.ts';
import { calm, dayParts, flightsUrl, home, otherYear, place, transition } from './ui.ts';
import { joined, type Key, linkOf, type Point, say, text } from './wording.ts';

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
function dateBox(start: string, end: string): JSX.Element {
  const { d1, m1, d2, m2 } = dayParts(start, end);
  const yr = otherYear(end); // "Jan 2027"
  if (m1 !== m2)
    return (
      <div class={['datebox', 'cross']}>
        <span class="dd">
          {d1} <small>{m1}</small>
        </span>
        <span class="dd">
          – {d2} <small>{`${m2}${yr}`}</small>
        </span>
      </div>
    );
  return (
    <div class="datebox">
      <span class="dd">{start === end ? d1 : `${d1}–${d2}`}</span>
      <span class="mm">{m1 + yr}</span>
    </div>
  );
}

// a festival with a fare, so with a weekend: the fare its best airport's (fares.ts best)
type Flown = Festival & { readonly depart: string; readonly fare: Extract<Fare, { readonly home: false }> };
const flown = (e: Festival): e is Flown => e.depart !== null && e.fare !== null && !e.fare.home;
const flightLink = (e: Flown, words: string) => (
  <a
    href={flightsUrl(e.fare.airport, e.depart, e.fare.back)}
    target="_blank"
    rel="noopener"
    title={`Friday to Monday return from ${home().city}${e.fare.resold === null ? '' : ` (${resoldSaid(e.fare.resold)})`}; check it on Google Flights`}
  >
    {words}
  </a>
);
// where the flight lands, and how far on the festival is: " to Aberdeen, then 199 km"
const after = (e: Flown): string[] => [` to ${e.fare.airport_city}`, e.fare.km > 30 ? `, then ${e.fare.km} km` : ''];
// every airport the festival can fly to, behind a button, while its flight is still to take
const options = (e: Festival): JSX.Element =>
  e.options.length > 0 && !e.begun && e.phase === KEY.phase.AHEAD && e.fare?.home !== true
    ? [' · ', flightsButton(e, today)]
    : null;
const cheap = (e: Flown) => within(e.fare.price, 'flight', 'cheap');
// a line of the flight, muted: why there is no price for it
const unpriced = (words: string | null, more: JSX.Element = null) => (
  <p class={['flight', 'muted']}>
    {words}
    {more}
  </p>
);
// "✈ ~5 150 kr to Brussels, then 104 km · Flights · 3": a Fri→Mon return from home to the best of the festival's
// airports (fares.ts best), and how far the festival is from it; the price links to Google Flights for that weekend,
// and Flights lists every airport it can fly to.
function flight(e: Festival): JSX.Element {
  if (e.phase === KEY.phase.GONE) return unpriced(text('listing', e.listing));
  if (e.begun) return unpriced(`✈ ${STARTED}`);
  if (e.phase !== KEY.phase.AHEAD) return unpriced(text('phase', e.phase));
  if (e.airport === null || e.airport === '') return unpriced(`✈ too far from ${home().city} for our flight prices`);
  if (e.fare?.home === true) return <p class={['flight', 'easy']}>{`In ${home().city}, no flight needed`}</p>;
  if (!flown(e)) return unpriced('✈ flight not checked yet', options(e));
  return (
    <p class={['flight', cheap(e) && 'easy']}>
      {'✈ '}
      {flightLink(e, money(e.fare.price, 'EUR', { approx: true }))}
      {after(e)}
      {options(e)}
    </p>
  );
}

// what a card says of the flight once its weekend's Friday-to-Monday return has left (Festival begun)
const STARTED = 'already started, no flight priced';

// The foot's prices. With a pass price and a flight, the total first:
//   Cost ~4 130 kr, without accommodation · price goes up 15 Dec
//   1 670 kr full pass + ~2 460 kr flight to Stockholm, then 37 km
// and once the festival is on, the pass alone: "1 240 kr full pass · already started, no flight priced".
// The pass opens the passes quick view; the flight opens Google Flights. With only one of the two, that one alone.
// Without a price, why (price_status, in the words of pipeline/states.py): a link to the ticket page or to the
// passes when its state renders as one.
// a card's price is a button to the passes view, which opens over the page
const passBtn = (e: Festival, words: string | null) => passesButton(e, 'pass-btn', words);
function linked(e: Festival, words: string | null, link: string | null): JSX.Element {
  if (link === LINK.PAGE && e.ticket_page !== null && e.ticket_page !== '')
    return (
      <a href={e.ticket_page} target="_blank" rel="noopener" onClick={own()}>
        {words}
        {away()}
      </a>
    );
  if (link === LINK.PASSES) return passBtn(e, words);
  return words;
}
const note = <P extends Point>(e: Festival, point: P, key: Key<P>) => (
  <p class={['pass-price', 'muted']}>
    {'🎟 '}
    {linked(e, text(point, key), linkOf(point, key))}
  </p>
);

function prices(e: Festival): JSX.Element {
  const p = e.price;
  if (p.point === 'price') return [note(e, 'price', p.key), flight(e)];
  if (p.key === KEY.card_price.ENDED) return [note(e, 'card_price', p.key), flight(e)];
  if (p.key === KEY.card_price.SOLD_OUT)
    return [
      <p class={['pass-price', 'muted']}>
        {'🎟 '}
        {passBtn(e, text('card_price', p.key, { pass: text('pass_kind', p.pass.kind) }))}
      </p>,
      flight(e),
    ];
  const { now, key } = p;
  const pass = passBtn(
    e,
    text('card_price', key, {
      price: text('tier_today', now.state, { price: money(now.tier.amount, now.tier.currency) }),
    }),
  );
  const rise = now.next ? ` · ${riseNote(now.next)}` : '';
  const sum = e.trip === null ? null : approximately(e.trip);
  if (sum === null)
    return [
      <p class="pass-price">
        {'🎟 '}
        {pass}
        {rise}
      </p>,
      flight(e),
    ];
  return [
    <p class="cost">
      {say('card_price', key, { sum: <strong>{say('tier_today', now.state, { price: sum })}</strong> }, 'cost')}
      {rise}
    </p>,
    <p class="cost-parts">
      {pass}
      {e.begun ? ` · ${STARTED}` : ' + '}
      {e.begun ? null : e.fare?.home === true || !flown(e) ? (
        `no flight, in ${home().city}`
      ) : (
        <>
          <span class={cheap(e) ? 'easy' : undefined}>
            {flightLink(e, `${money(e.fare.price, 'EUR', { approx: true })} flight`)}
          </span>
          {after(e)}
        </>
      )}
      {options(e)}
    </p>,
  ];
}

// Opening a card changes the layout (on wide screens it takes the whole row). A view transition animates that: the
// card grows into place, drawn on top, and the cards on screen glide to theirs. The card shows its larger state
// clipped, never stretched: opening reveals the new content downward, closing rolls the old content up. Opening
// eases in over a longer time than closing (see site.css). With reduced motion it is a short cross-fade instead.
// Without view transitions the change is instant. The change is flushed where it is made, so the transition's new
// state holds it, and the card is measured changed.
let named = 0;
function smoothly(card: HTMLElement, change: () => void, opening: boolean): void {
  if (!('startViewTransition' in document)) {
    flush(change);
    return;
  }
  const still = calm();
  const onScreen = still
    ? []
    : [...(card.parentElement?.children ?? [])]
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .filter((c) => {
          const r = c.getBoundingClientRect();
          return r.bottom > 0 && r.top < innerHeight;
        });
  for (const c of onScreen) {
    c.style.viewTransitionName = c === card ? 'card-toggled' : `card-${++named}`;
    c.style.setProperty('view-transition-class', 'card');
  }
  const root = document.documentElement;
  root.dataset['vt'] = still ? 'calm' : opening ? 'open' : 'close';
  const shown = transition(() => {
    flush(change);
    const r = card.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight - 80) card.scrollIntoView({ block: 'nearest' }); // keep the card in view
  });
  done(
    shown.finally(() => {
      for (const c of onScreen) {
        c.style.viewTransitionName = '';
        c.style.removeProperty('view-transition-class');
      }
      root.removeAttribute('data-vt');
    }),
    'opening a card',
  );
}

// what a card is drawn with besides its festival: a line under its names (a hint), open from the start, and whether it
// is on the map's page, whose link to the map it leaves out
interface CardOptions {
  readonly hint?: JSX.Element;
  readonly open?: boolean;
  readonly onMap?: boolean;
}
export function eventCard(e: Festival, { hint = null, open = false, onMap = false }: CardOptions = {}): JSX.Element {
  const [shown, setShown] = createSignal(open);
  // its details, read the first time it opens and kept, hidden, when it closes
  const read = createMemo((was) => was === true || shown());
  let art: HTMLElement | undefined;
  const openOrClose = () => {
    if (art === undefined) throw new Error(`the card of ${e.title} was opened before it was drawn`);
    const opening = !shown();
    smoothly(
      art,
      () => {
        setShown(opening);
      },
      opening,
    );
  };
  // a control that opens and closes the card, saying whether it is open
  const toggleBtn = (cls: Classes, words: JSX.Element) => (
    <button type="button" class={cls} aria-expanded={shown() ? 'true' : 'false'} onClick={own(openOrClose)}>
      {words}
    </button>
  );

  const links = e.headliners.map((a) => (
    <a href={artistHref(a.id)} class="artist" onClick={artistHint.mark}>
      {a.name}
    </a>
  ));
  const rest = e.lineup - e.headliners.length;
  const withLine =
    links.length > 0 ? (
      <p class="with">
        {'With '}
        {joined(rest > 0 ? [...links, toggleBtn(['link', 'more-names'], `${rest} more`)] : links)}
      </p>
    ) : null;
  // up to three features as icon + short word (icons alone are guesswork); the rest are in the details
  const traits = TRAITS.filter(([k]) => e.features.has(k));
  const traitRow =
    traits.length > 0 ? (
      <ul class="traits" aria-label="Highlights">
        {traitItems(traits.slice(0, 3), e)}
        {traits.length > 3 ? <li>{toggleBtn('link', `+${traits.length - 3}`)}</li> : null}
      </ul>
    ) : null;

  // The card opens from its title, and from its foot below the line (the prices and "Line-up & details"); the rest of
  // it holds names and links that do their own thing.
  return (
    <article
      ref={(el) => {
        art = el;
      }}
      class={['festival-card', shown() && 'open']}
    >
      <div class="c-top">
        {dateBox(e.start_date, e.end_date)}
        <div class="c-head">
          {/* a festival on now says so before its place, as a community's trip on now does */}
          <p class="where">
            {nowTag(e)}
            {place(e)}
          </p>
          <h3>{toggleBtn('title-btn', e.title)}</h3>
        </div>
      </div>
      {styleLine(e) ? <p class="styles">{styleLine(e)}</p> : null}
      {traitRow}
      {withLine}
      {links.length > 0 ? hint : null}
      {goingLine(e)}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a tap on the foot outside its links and buttons opens the card, a shortcut: its Line-up & details button does the same from the keyboard */}
      <div
        class="foot"
        onClick={(ev) => {
          if (!(ev.target instanceof Element && ev.target.closest('a, button'))) openOrClose();
        }}
      >
        {prices(e)}
        <div class="actions">{toggleBtn('link', <span>{shown() ? 'Less' : 'Line-up & details'}</span>)}</div>
      </div>
      <div class="festival-more" hidden={!shown()}>
        <Show when={read()}>
          <Reported where="opening a card">
            {cardDetails(
              e,
              traits.slice(0, 3).map(([k]) => k),
              toggleBtn(['link', 'less'], 'Less'),
              { onMap },
            )}
          </Reported>
        </Show>
      </div>
    </article>
  );
}

// the cards of festivals, in their order, as a view lists them
export const festivalCards = (list: readonly Festival[]): JSX.Element => (
  <div class="festival-cards">
    <For each={list}>{(e) => eventCard(e)}</For>
  </div>
);

// a card an h() view holds (mount.tsx held), until the view is Solid's
export const heldCard = (signal: AbortSignal, e: Festival, drawn?: CardOptions): HTMLElement =>
  held(signal, HTMLElement, `the card of ${e.title}`, () => eventCard(e, drawn));
