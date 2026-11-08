// A festival's flights, over the page: every airport it can fly to (its options), each with how far it is from the
// festival, the Friday-to-Monday return found from home for its weekend and its stops, when it was last checked, and a
// link to Google Flights; the one its card shows marked. A quick view (modal.ts peek): a dialog, the focus kept in it
// and given back to the button that opened it, closed by ×, Escape, a tap outside or the back button.
import { button, h, type Kid, own } from './dom.ts';
import { best, checkedAgo, FAR_KM, type Option, resoldSaid, stopsSaid, WORTH_EUR } from './fares.ts';
import type { Festival } from './festivals.ts';
import { type Peek, peek } from './modal.ts';
import { money } from './money.ts';
import { away, dayMonth, flightsUrl, home } from './ui.ts';

let view: Peek | undefined;
const flightsDialog = (): Peek => {
  view ??= peek('flights-title');
  return view;
};

// what an option says of its fare: its price, or why it has none
function fareSaid(o: Option): Kid {
  if (o.fare !== null)
    return [
      h('strong', {}, money(o.fare.price, 'EUR', { approx: true })),
      o.fare.resold === null ? null : h('span', { class: 'muted' }, ` · ${resoldSaid(o.fare.resold)}`),
    ];
  if (o.checked === null) return h('span', { class: 'muted' }, 'not checked yet');
  return h('span', { class: 'muted' }, noFare(o.direct));
}

// why an option checked has no fare, by whether it has a direct flight: Google lists Widerøe's with no price
function noFare(direct: boolean | null) {
  if (direct === true) return 'direct, no price on Google';
  return direct === false ? 'no direct flight that weekend' : 'no price found';
}

// one airport of the festival's: its name, the card's when it is, how far, the fare and its stops, when checked, a link
function optionRow(e: Festival, o: Option, chosen: boolean, today: string): HTMLElement {
  const back = o.fare?.back ?? null;
  return h(
    'li',
    { class: chosen ? 'chosen' : null },
    h(
      'p',
      { class: 'flight-where' },
      h('b', {}, o.name),
      ` (${o.airport})`,
      chosen ? [' ', h('span', { class: 'plan-tag' }, 'on the card')] : null,
    ),
    h(
      'p',
      { class: 'muted' },
      `${o.km} km from ${e.city ?? e.title}`,
      o.fare === null ? null : ` · ${stopsSaid(o.fare.stops)}`,
      o.checked === null ? null : ` · checked ${checkedAgo(o.checked, today)}`,
    ),
    h(
      'p',
      { class: 'flight-fare' },
      fareSaid(o),
      e.depart === null || back === null
        ? null
        : [
            ' · ',
            h(
              'a',
              { href: flightsUrl(o.airport, e.depart, back), target: '_blank', rel: 'noopener' },
              'Google Flights',
              away(),
            ),
          ],
    ),
  );
}

// Opens over the page from the button that asked (from), for a festival that can fly to at least one airport.
function openFlights(e: Festival, today: string, from?: Element | null): void {
  const v = flightsDialog();
  const chosen = best(e.options);
  v.lead.replaceChildren();
  v.title.textContent = `Flights to ${e.title}`;
  v.sub.textContent =
    e.depart === null
      ? `Return from ${home().city}`
      : `Return from ${home().city}, Friday ${dayMonth(e.depart)} to Monday`;
  v.body.replaceChildren(
    h(
      'ul',
      { class: 'peek-flights' },
      e.options.map((o) => optionRow(e, o, o.airport === chosen?.airport, today)),
    ),
  );
  v.foot.replaceChildren(
    h(
      'p',
      { class: ['muted', 'small'] },
      `The card shows the cheapest airport within ${FAR_KM} km of the festival, or one farther away when it is cheaper `,
      `by more than ${money(WORTH_EUR, 'EUR', { approx: true })}. An airport beside the nearest is searched for `,
      'direct flights alone. Check before buying.',
    ),
  );
  v.m.open(from);
}

// the card's button that opens them: "Flights · 4"
export const flightsButton = (e: Festival, today: () => string): HTMLButtonElement =>
  button(
    {
      class: ['link', 'flights-btn'],
      'aria-haspopup': 'dialog',
      'aria-label': `Flights to ${e.title}: ${e.options.length} ${e.options.length === 1 ? 'airport' : 'airports'}`,
      onclick: own((b) => openFlights(e, today(), b)),
    },
    `Flights · ${e.options.length}`,
  );
