// How a festival is reached from home, and what the flight and the trip cost: the one rule of a festival's fare, read
// by its card, the festival list, the map and the Countries view. Pure: home, the fares and the prices are arguments.
import type { Prices } from './currency.ts';
import { KEY } from './states.ts';
import { text } from './wording.ts';

// A festival flies to any airport within max_airport_km of its city (its options, event_airports), each with the
// Friday-to-Monday return found for its weekend from home, if one was. The card's flight is the best of them (best).

// the return flight found for a weekend: its price in euros (the return's), the day it flies back (fares.return), its
// stops each way and when it was found; resold names the airlines flying it when the price is a reseller's (Google
// listed the flights with none), likely cheaper bought from them
export interface Found {
  readonly price: number;
  readonly back: string;
  readonly stops: Stops;
  readonly fetched: string;
  readonly resold: string | null;
}
// a return's stops each way: out null when not known; back a reseller's alone, Google's page saying the way out's
export interface Stops {
  readonly out: number | null;
  readonly back: number | null;
}

// what a reseller's price is said to be (pipeline/states.py): "reseller’s price, likely cheaper from Widerøe"
export const resoldSaid = (airlines: string): string =>
  text('fare_vendor', KEY.fare_vendor.KIWI, { airlines }, 'airlines');
// an airport a festival can fly to: where, how far from the festival's city, the fare found for its weekend, and when
// it was last searched, with, for one beside the nearest, whether it has a direct flight then (false: none)
export interface Option {
  readonly airport: string;
  readonly name: string;
  readonly city: string;
  readonly km: number;
  readonly fare: Found | null;
  readonly checked: string | null;
  readonly direct: boolean | null;
}
// in the home city, with no flight; or by the flight chosen of its options: the airport, its city and how far it is
// from the festival, and the fare
export type Fare =
  | { readonly home: true }
  | ({ readonly home: false; readonly airport: string; readonly airport_city: string; readonly km: number } & Found);
// what the flight costs, in euros: nothing from home, null when no fare is known
export const flightEur = (fare: Fare | null): number | null => (fare === null ? null : fare.home ? 0 : fare.price);

// An airport farther than FAR_KM from the festival is a long way on by road or rail (two hours or so), worth it only
// for a fare lower by more than WORTH_EUR than the best of the airports within FAR_KM: about the train or bus
// there and back, and the time. Both in euros, as the fares are, so the choice is the same in every currency.
export const FAR_KM = 100;
export const WORTH_EUR = 40;
// The best of a festival's options, the one its card, trip cost, price filter and order by price read: the cheapest
// fare within FAR_KM (the nearer of two at one price), unless one farther away is cheaper by more than WORTH_EUR; with
// no fare within FAR_KM, the cheapest of the others. Null when no option has a fare.
export function best(options: readonly Option[]): (Option & { fare: Found }) | null {
  const priced = options
    .filter((o): o is Option & { fare: Found } => o.fare !== null)
    .toSorted((a, b) => a.fare.price - b.fare.price || a.km - b.km || a.airport.localeCompare(b.airport));
  const near = priced.find((o) => o.km <= FAR_KM),
    far = priced.find((o) => o.km > FAR_KM);
  if (near === undefined || far === undefined) return near ?? far ?? null;
  return far.fare.price < near.fare.price - WORTH_EUR ? far : near;
}

// the flight to a festival: none from home (its nearest airport home's), else the best of its options, null when
// none has a fare
export function fareOf(e: { readonly airport: string | null }, home: string, options: readonly Option[]): Fare | null {
  if (e.airport === home) return { home: true };
  const b = best(options);
  return b === null ? null : { home: false, airport: b.airport, airport_city: b.city, km: b.km, ...b.fare };
}

// the pass and the flight together, in the visitor's currency and rounded as the card shows it (so that a price limit
// keeps what the card says is within it), when both have a price
// Whether a festival's weekend flight has left on a day: the Friday-to-Monday return priced is the one of its weekend
// (weekend_friday, the fare's depart), so a festival that starts on a Thursday can still be flown to on that day. A trip
// whose flight has left is the pass alone; the card says so.
export const flightBegun = (depart: string | null, day: string): boolean => depart !== null && depart <= day;

export function tripOf(
  pass: { readonly amount: number; readonly currency: string } | null,
  fare: Fare | null,
  { convert, rounded }: Pick<Prices, 'convert' | 'rounded'>,
  started = false,
): number | null {
  const passed = pass === null ? null : convert(pass.amount, pass.currency),
    eur = flightEur(fare),
    flight = started ? 0 : eur === null ? null : convert(eur);
  return passed === null || flight === null ? null : rounded(passed + flight);
}

// Each country's cheapest flight, of its festivals' (each its best, the city it lands in): a festival at home takes
// none, so it is no fare of its country; of two at one price, the city first by name.
export function cheapestFlights(
  festivals: readonly { readonly country_code: string | null; readonly fare: Fare | null }[],
): Map<string, { airport_city: string; price: number }> {
  const out = new Map<string, { airport_city: string; price: number }>();
  for (const { country_code: cc, fare } of festivals) {
    if (cc === null || fare === null || fare.home) continue;
    const was = out.get(cc);
    if (
      was === undefined ||
      fare.price < was.price ||
      (fare.price === was.price && fare.airport_city.localeCompare(was.airport_city) < 0)
    )
      out.set(cc, { airport_city: fare.airport_city, price: fare.price });
  }
  return out;
}

// how many stops a return makes, each way it is known: "direct out", "1 stop out, direct back", or "stops not known"
const stopping = (n: number): string => (n === 0 ? 'direct' : `${n} ${n === 1 ? 'stop' : 'stops'}`);
export const stopsSaid = ({ out, back }: Stops): string =>
  out === null ? 'stops not known' : `${stopping(out)} out${back === null ? '' : `, ${stopping(back)} back`}`;
// when a search ran, said from today: "today", "yesterday", "12 days ago"
export function checkedAgo(stamp: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T12:00Z`) - Date.parse(`${stamp.slice(0, 10)}T12:00Z`)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
