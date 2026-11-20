// A festival's flights, over the page: every airport it can fly to (its options), each with how far it is from the
// festival, the Friday-to-Monday return found from home for its weekend and its stops each way known, when it was last
// checked, and a link to Google Flights; the one its card shows marked. A quick view (dialog.tsx peek): a dialog, the
// focus kept in it and given back to the button that opened it, closed by ×, Escape, a tap outside or the back button.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { For } from 'solid-js';
import { own } from './bits.ts';
import { type Peek, peek } from './dialog.tsx';
import { best, checkedAgo, FAR_KM, type Option, resoldSaid, stopsSaid, type Transfer, WORTH_EUR } from './fares.ts';
import type { Festival } from './festivals.ts';
import { money } from './money.ts';
import { KEY } from './states.ts';
import { away, dayMonth, flightsUrl, home } from './ui.ts';
import { text } from './wording.ts';

let view: Peek | undefined;
const flightsDialog = (): Peek => {
  view ??= peek('flights-title');
  return view;
};

// what an option says of its fare: its price, or why it has none
function fareSaid(o: Option): JSX.Element {
  if (o.fare !== null)
    return [
      <strong>{money(o.fare.price, 'EUR', { approx: true })}</strong>,
      o.fare.resold === null ? null : <span class="muted">{` · ${resoldSaid(o.fare.resold)}`}</span>,
    ];
  if (o.checked === null) return <span class="muted">not checked yet</span>;
  return <span class="muted">{noFare(o.direct)}</span>;
}

// a cheaper trip on separate tickets: "~3 400 kr · self-transfer, separate tickets · reseller’s price, likely cheaper
// from Norwegian Air Shuttle and easyJet"
const transferSaid = (t: Transfer): JSX.Element => (
  <p class={['flight-transfer', 'muted']}>
    {money(t.price, 'EUR', { approx: true })}
    {` · ${text('fare_ticket', KEY.fare_ticket.SELF_TRANSFER)} · ${resoldSaid(t.airlines)}`}
  </p>
);

// why an option checked has no fare, by whether it has a direct flight: Google lists Widerøe's with no price
function noFare(direct: boolean | null) {
  if (direct === true) return 'direct, no price on Google';
  return direct === false ? 'no direct flight that weekend' : 'no price found';
}

// one airport of the festival's: its name, the card's when it is, how far, the fare and its stops, when checked, a link,
// and a cheaper self-transfer
function optionRow(e: Festival, o: Option, chosen: boolean, today: string): JSX.Element {
  const back = o.fare?.back ?? null;
  return (
    <li class={chosen ? 'chosen' : undefined}>
      <p class="flight-where">
        <b>{o.name}</b>
        {` (${o.airport})`}
        {chosen ? [' ', <span class="plan-tag">on the card</span>] : null}
      </p>
      <p class="muted">
        {`${o.km} km from ${e.city ?? e.title}`}
        {o.fare === null ? null : ` · ${stopsSaid(o.fare.stops)}`}
        {o.checked === null ? null : ` · checked ${checkedAgo(o.checked, today)}`}
      </p>
      <p class="flight-fare">
        {fareSaid(o)}
        {e.depart === null || back === null
          ? null
          : [
              ' · ',
              <a href={flightsUrl(o.airport, e.depart, back)} target="_blank" rel="noopener">
                Google Flights
                {away()}
              </a>,
            ]}
      </p>
      {o.transfer === null ? null : transferSaid(o.transfer)}
    </li>
  );
}

// Opens over the page from the button that asked (from), for a festival that can fly to at least one airport.
function openFlights(e: Festival, today: string, from?: Element | null): void {
  const v = flightsDialog();
  const chosen = best(e.options);
  v.show({
    title: `Flights to ${e.title}`,
    sub: () =>
      e.depart === null
        ? `Return from ${home().city}`
        : `Return from ${home().city}, Friday ${dayMonth(e.depart)} to Monday`,
    body: () => (
      <ul class="peek-flights">
        <For each={e.options}>{(o) => optionRow(e, o, o.airport === chosen?.airport, today)}</For>
      </ul>
    ),
    foot: () => (
      <p class={['muted', 'small']}>
        {`The card shows the cheapest airport within ${FAR_KM} km of the festival, or one farther away when it is cheaper `}
        {`by more than ${money(WORTH_EUR, 'EUR', { approx: true })}. An airport beside the nearest is searched for `}
        direct flights alone. Check before buying.
      </p>
    ),
  });
  v.m.open(from);
}

// the card's button that opens them: "Flights · 4"
export const flightsButton = (e: Festival, today: () => string): JSX.Element => (
  <button
    type="button"
    class={['link', 'flights-btn']}
    aria-haspopup="dialog"
    aria-label={`Flights to ${e.title}: ${e.options.length} ${e.options.length === 1 ? 'airport' : 'airports'}`}
    onClick={own((b) => openFlights(e, today(), b))}
  >
    {`Flights · ${e.options.length}`}
  </button>
);
