// The festival card used across the site: date, place, title, styles, highlights, a few names and the flight,
// opening in place to the full line-up and practical details. Rows come from festivals.ts (withDetails).

import { cardDetails, traitItems } from './details.ts';
import type { Classes, Kid } from './dom.ts';
import { button, h, own, toggle } from './dom.ts';
import { type Fare, type Festival, styleLine } from './festivals.ts';
import { artistHint } from './hints.ts';
import { TRAITS } from './icons.ts';
import { approximately, money, within } from './money.ts';
import { openPasses, riseNote } from './passes.ts';
import { goingLine } from './plans.ts';
import { done } from './report.ts';
import { artistHref } from './routes.ts';
import { KEY, LINK } from './states.ts';
import { away, calm, dayParts, flightsUrl, home, otherYear, place } from './ui.ts';
import { type Key, linkOf, type Point, say, text } from './wording.ts';

// "23–25 Oct", or "30 Oct – 1 Nov" across a month end: the date is shown once, in the box
function dateBox(start: string, end: string): HTMLElement {
  const { d1: dd1, m1: mm1, d2: dd2, m2: mm2 } = dayParts(start, end);
  const yr = otherYear(end); // "Jan 2027"
  if (mm1 !== mm2)
    return h(
      'div',
      { class: ['datebox', 'cross'] },
      h('span', { class: 'dd' }, dd1, ' ', h('small', {}, mm1)),
      h('span', { class: 'dd' }, '– ', dd2, ' ', h('small', {}, `${mm2}${yr}`)),
    );
  return h(
    'div',
    { class: 'datebox' },
    h('span', { class: 'dd' }, start === end ? dd1 : `${dd1}–${dd2}`),
    h('span', { class: 'mm' }, mm1 + yr),
  );
}

// a festival with a fare, so with an airport and a weekend
type Flown = Festival & { airport: string; depart: string; fare: Extract<Fare, { home: false }> };
const flown = (e: Festival): e is Flown => e.airport !== null && e.depart !== null && e.fare !== null && !e.fare.home;
const flightLink = (e: Flown, words: string) =>
  h(
    'a',
    {
      href: flightsUrl(e.airport, e.depart, e.fare.back),
      target: '_blank',
      rel: 'noopener',
      title: `Friday to Monday return from ${home().city}; check it on Google Flights`,
    },
    words,
  );
const after = (e: Festival): string[] => [
  ` to ${e.airport_city}`,
  e.airport_km !== null && e.airport_km > 30 ? `, then ${e.airport_km} km` : '',
];
const cheap = (e: Flown) => within(e.fare.price, 'flight', 'cheap');
// "✈ ~5 150 kr to Brussels, then 104 km": a Fri→Mon return from home to the nearest airport with prices, and how far
// the festival is from it. The price links to Google Flights for that weekend.
function flight(e: Festival): HTMLElement {
  if (e.phase === KEY.phase.GONE) return h('p', { class: ['flight', 'muted'] }, text('listing', e.listing));
  if (e.phase !== KEY.phase.AHEAD) return h('p', { class: ['flight', 'muted'] }, text('phase', e.phase));
  if (!e.airport) return h('p', { class: ['flight', 'muted'] }, `✈ too far from ${home().city} for our flight prices`);
  if (e.fare?.home === true) return h('p', { class: ['flight', 'easy'] }, `In ${home().city}, no flight needed`);
  if (!flown(e)) return h('p', { class: ['flight', 'muted'] }, '✈ flight not checked yet');
  return h(
    'p',
    { class: ['flight', cheap(e) && 'easy'] },
    '✈ ',
    flightLink(e, money(e.fare.price, 'EUR', { approx: true })),
    ...after(e),
  );
}

// The foot's prices. With a pass price and a flight, the total first:
//   Cost ~4 130 kr, without accommodation · price goes up 15 Dec
//   1 670 kr full pass + ~2 460 kr flight to Stockholm, then 37 km
// The pass opens the passes quick view; the flight opens Google Flights. With only one of the two, that one alone.
// Without a price, why (price_status, in the words of pipeline/states.py): a link to the ticket page or to the
// passes when its state renders as one.
// a card's price is a button to the passes view, which opens over the page
const passBtn = (e: Festival, ...words: Kid[]) =>
  button({ class: ['link', 'pass-btn'], onclick: own((b) => openPasses(e, b)) }, ...words);
function linked(e: Festival, words: string | null, link: string | null): Kid {
  if (link === LINK.PAGE && e.ticket_page)
    return h('a', { href: e.ticket_page, target: '_blank', rel: 'noopener', onclick: own() }, words, away());
  if (link === LINK.PASSES) return passBtn(e, words);
  return words;
}
const note = <P extends Point>(e: Festival, point: P, key: Key<P>) =>
  h('p', { class: ['pass-price', 'muted'] }, '🎟 ', linked(e, text(point, key), linkOf(point, key)));

function prices(e: Festival): HTMLElement[] {
  const p = e.price;
  if (p.point === 'price') return [note(e, 'price', p.key), flight(e)];
  if (p.key === KEY.card_price.ENDED) return [note(e, 'card_price', p.key), flight(e)];
  if (p.key === KEY.card_price.SOLD_OUT)
    return [
      h(
        'p',
        { class: ['pass-price', 'muted'] },
        '🎟 ',
        passBtn(e, text('card_price', p.key, { pass: text('pass_kind', p.pass.kind) })),
      ),
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
  if (sum === null) return [h('p', { class: 'pass-price' }, '🎟 ', pass, rise), flight(e)];
  return [
    h(
      'p',
      { class: 'cost' },
      say('card_price', key, { sum: h('strong', {}, say('tier_today', now.state, { price: sum })) }, 'cost'),
      rise,
    ),
    h(
      'p',
      { class: 'cost-parts' },
      pass,
      ' + ',
      e.fare?.home === true || !flown(e)
        ? `no flight, in ${home().city}`
        : [
            h(
              'span',
              { class: cheap(e) ? 'easy' : null },
              flightLink(e, `${money(e.fare.price, 'EUR', { approx: true })} flight`),
            ),
            ...after(e),
          ],
    ),
  ];
}

// Opening a card changes the layout (on wide screens it takes the whole row). A view transition animates that: the
// card grows into place, drawn on top, and the cards on screen glide to theirs. The card shows its larger state
// clipped, never stretched: opening reveals the new content downward, closing rolls the old content up. Opening
// eases in over a longer time than closing (see site.css). With reduced motion it is a short cross-fade instead.
// Without view transitions the change is instant.
let named = 0;
function smoothly(card: HTMLElement, change: () => void, opening: boolean): void {
  if (!('startViewTransition' in document)) {
    change();
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
  const t = document.startViewTransition(() => {
    change();
    const r = card.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight - 80) card.scrollIntoView({ block: 'nearest' }); // keep the card in view
  });
  done(
    t.finished.finally(() => {
      for (const c of onScreen) {
        c.style.viewTransitionName = '';
        c.style.removeProperty('view-transition-class');
      }
      root.removeAttribute('data-vt');
    }),
    'opening a card',
  );
}

export function eventCard(
  e: Festival,
  { hint = null, open = false, onMap = false }: { hint?: Kid; open?: boolean; onMap?: boolean } = {},
): HTMLElement {
  const more = h('div', { class: 'festival-more', hidden: true });
  const toggles: HTMLElement[] = [];
  const setOpen = (shown: boolean) => {
    if (shown && !more.childElementCount)
      more.append(
        cardDetails(
          e,
          traits.slice(0, 3).map(([k]) => k),
          toggleBtn(['link', 'less'], 'Less'),
          { onMap },
        ),
      );
    more.hidden = !shown;
    toggle(art, 'open', shown);
    for (const t of toggles) t.setAttribute('aria-expanded', String(shown));
    label.textContent = shown ? 'Less' : 'Line-up & details';
  };
  const toggleBtn = (cls: Classes, ...kids: Kid[]) => {
    const b = button(
      {
        class: cls,
        'aria-expanded': 'false',
        onclick: own(openOrClose),
      },
      ...kids,
    );
    toggles.push(b);
    return b;
  };
  const label = h('span', {}, 'Line-up & details');
  const openOrClose = () => {
    const opening = more.hidden === true;
    smoothly(art, () => setOpen(opening), opening);
  };

  const links = e.headliners.map((a) =>
    h('a', { href: artistHref(a.id), class: 'artist', onclick: artistHint.mark }, a.name),
  );
  const rest = (e.lineup ?? 0) - e.headliners.length;
  const withLine =
    links.length > 0
      ? h(
          'p',
          { class: 'with' },
          'With ',
          ...links.flatMap((l, i) => (i ? [i === links.length - 1 && rest <= 0 ? ' and ' : ', ', l] : [l])),
          rest > 0 ? [' and ', toggleBtn(['link', 'more-names'], `${rest} more`)] : null,
        )
      : null;
  // up to three features as icon + short word (icons alone are guesswork); the rest are in the details
  const traits = TRAITS.filter(([k]) => e.features.has(k));
  const traitRow =
    traits.length > 0
      ? h(
          'ul',
          { class: 'traits', 'aria-label': 'Highlights' },
          traitItems(traits.slice(0, 3), e),
          traits.length > 3 ? h('li', {}, toggleBtn('link', `+${traits.length - 3}`)) : null,
        )
      : null;

  // The card opens from its title, and from its foot below the line (the prices and "Line-up & details"); the rest of
  // it holds names and links that do their own thing.
  const foot = h('div', { class: 'foot' }, prices(e), h('div', { class: 'actions' }, toggleBtn('link', label)));
  foot.addEventListener('click', (ev) => {
    if (!(ev.target instanceof Element && ev.target.closest('a, button'))) openOrClose();
  });
  const art = h(
    'article',
    { class: 'festival-card' },
    h(
      'div',
      { class: 'c-top' },
      dateBox(e.start_date, e.end_date),
      h('div', { class: 'c-head' }, h('p', { class: 'where' }, place(e)), h('h3', {}, toggleBtn('title-btn', e.title))),
    ),
    styleLine(e) ? h('p', { class: 'styles' }, styleLine(e)) : null,
    traitRow,
    withLine,
    withLine ? hint : null,
    goingLine(e),
    foot,
    more,
  );
  if (open === true) setOpen(true);
  return art;
}
