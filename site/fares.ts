// How a festival is reached from home, and what the flight and the trip cost: the one rule of a festival's fare, read
// by its card, the festival list, the map and the Countries view. Pure: home, the fares and the prices are arguments.
import type { Prices } from './currency.ts';

// in the home city, with no flight; or by the return flight found for its weekend from its airport, its price in
// euros and the day it flies back (fares.return)
export type Fare = { readonly home: true } | { readonly home: false; readonly price: number; readonly back: string };
type Flight = Omit<Extract<Fare, { home: false }>, 'home'>;
// what the flight costs, in euros: nothing from home, null when no fare is known
export const flightEur = (fare: Fare | null): number | null => (fare === null ? null : fare.home ? 0 : fare.price);

// the fares found, by the airport flown to and the Friday flown out on
export const fareKey = (airport: string, depart: string): string => `${airport} ${depart}`;
// the flight to a festival: none from home, else the fare found for its weekend from its airport, null when none is
export function fareOf(
  e: { readonly airport: string | null; readonly weekend_friday: string | null },
  home: string,
  fares: ReadonlyMap<string, Flight>,
): Fare | null {
  if (e.airport === home) return { home: true };
  const flown =
    e.airport === null || e.weekend_friday === null ? undefined : fares.get(fareKey(e.airport, e.weekend_friday));
  return flown === undefined ? null : { home: false, ...flown };
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

// Each country's cheapest flight, of its festivals': a festival at home takes none, so it is no fare of its country;
// of two at one price, the city first by name.
export function cheapestFlights(
  festivals: readonly {
    readonly country_code: string | null;
    readonly airport_city: string | null;
    readonly fare: Fare | null;
  }[],
): Map<string, { airport_city: string | null; price: number }> {
  const out = new Map<string, { airport_city: string | null; price: number }>();
  for (const { country_code: cc, airport_city, fare } of festivals) {
    if (cc === null || fare === null || fare.home) continue;
    const best = out.get(cc);
    if (
      best === undefined ||
      fare.price < best.price ||
      (fare.price === best.price && (airport_city ?? '').localeCompare(best.airport_city ?? '') < 0)
    )
      out.set(cc, { airport_city, price: fare.price });
  }
  return out;
}
