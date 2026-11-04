// Prices in a currency (site/currency.ts) and a festival's fare and trip (site/fares.ts), on values alone.
import { expect, test } from 'vitest';
import { isCurrency, pricesIn, written } from '../../site/currency.ts';
import { cheapestFlights, type Fare, fareKey, fareOf, flightBegun, flightEur, tripOf } from '../../site/fares.ts';

// the euro's rates: a krone is a tenth of a euro, a dollar a little less than one
const RATES: ReadonlyMap<string, number> = new Map([
  ['EUR', 1],
  ['NOK', 11.5],
  ['USD', 1.08],
  ['CHF', 0.94],
]);
const rate = (c: string) => RATES.get(c);
const nok = pricesIn('NOK', rate),
  eur = pricesIn('EUR', rate);

test('an amount is written as its currency writes it, its thousands kept on one line', () => {
  expect(written(1850, 'NOK')).toBe('1 850 kr');
  expect(written(1849.6, 'NOK')).toBe('1 850 kr'); // kroner are whole
  expect(written(160, 'EUR')).toBe('€160');
  expect(written(12.5, 'EUR')).toBe('€12.50');
  expect(written(1234, 'USD')).toBe('$1 234');
  expect(written(88.09, 'USD')).toBe('$88.09');
  expect(written(1_234_567, 'CHF')).toBe('1 234 567 CHF');
  expect(written(40.5, 'CHF')).toBe('40.50 CHF');
});

test('a currency is one the site shows', () => {
  expect(isCurrency('NOK')).toBe(true);
  expect(isCurrency('CHF')).toBe(false);
  expect(isCurrency('constructor')).toBe(false);
  expect(isCurrency(undefined)).toBe(false);
});

test('an amount converts by the euro’s rates, and not without one', () => {
  expect(nok.convert(100)).toBeCloseTo(1150);
  expect(nok.convert(108, 'USD')).toBeCloseTo(1150);
  expect(nok.convert(500, 'NOK')).toBe(500); // already in it, even with no rates at all
  expect(pricesIn('NOK', () => undefined).convert(500, 'NOK')).toBe(500);
  expect(nok.convert(100, 'GBP')).toBeNull();
  expect(pricesIn('NOK', (c) => (c === 'NOK' ? undefined : 1)).convert(100)).toBeNull();
});

test('an amount converted is approximate, rounded to the ten in kroner; one in the visitor’s currency is as it is', () => {
  expect(nok.money(160)).toBe('~1 840 kr');
  expect(nok.money(1600, 'NOK')).toBe('1 600 kr');
  expect(nok.money(1600, 'NOK', { approx: true })).toBe('~1 600 kr');
  expect(nok.money(40, 'GBP')).toBe('40 GBP'); // no rate: as the page gave it
  expect(eur.money(160)).toBe('€160');
  expect(eur.money(160, 'EUR', { approx: true })).toBe('~€160');
  expect(eur.money(100, 'CHF')).toBe('~€106');
  expect(nok.rounded(1844)).toBe(1840);
  expect(eur.rounded(105.5)).toBe(106);
  expect(nok.approximately(4130)).toBe('~4 130 kr');
});

test('a flight is within a step in the visitor’s currency, and one with no rate never is', () => {
  expect(nok.step('flight', 'cheap')).toBe(1500);
  expect(eur.step('trip', 'fair')).toBe(500);
  expect(nok.within(130, 'flight', 'cheap')).toBe(true); // 1 495 kr
  expect(nok.within(131, 'flight', 'cheap')).toBe(false); // 1 506 kr
  expect(eur.within(150, 'flight', 'cheap')).toBe(true);
  expect(eur.within(151, 'flight', 'cheap')).toBe(false);
  expect(pricesIn('USD', () => undefined).within(1, 'flight', 'cheap')).toBe(false);
});

const FARES = new Map([[fareKey('LIS', '2026-11-06'), { price: 120, back: '2026-11-09' }]]);
const HOME = 'XHM'; // the airport marked home, whichever it is

test('a festival at home takes no flight, and one elsewhere the fare found for its weekend, or none', () => {
  expect(fareOf({ airport: HOME, weekend_friday: '2026-11-06' }, HOME, FARES)).toEqual({ home: true });
  expect(fareOf({ airport: HOME, weekend_friday: null }, HOME, FARES)).toEqual({ home: true });
  expect(fareOf({ airport: 'LIS', weekend_friday: '2026-11-06' }, HOME, FARES)).toEqual({
    home: false,
    price: 120,
    back: '2026-11-09',
  });
  expect(fareOf({ airport: 'LIS', weekend_friday: '2026-11-13' }, HOME, FARES)).toBeNull();
  expect(fareOf({ airport: 'LIS', weekend_friday: null }, HOME, FARES)).toBeNull();
  expect(fareOf({ airport: null, weekend_friday: '2026-11-06' }, HOME, FARES)).toBeNull();
});

const AWAY: Fare = { home: false, price: 120, back: '2026-11-09' };
test('a flight from home costs nothing, and one not found is not known', () => {
  expect(flightEur({ home: true })).toBe(0);
  expect(flightEur(AWAY)).toBe(120);
  expect(flightEur(null)).toBeNull();
});

test('a weekend’s flight has left from its Friday, the day included', () => {
  expect([flightBegun('2026-11-06', '2026-11-05'), flightBegun('2026-11-06', '2026-11-06')]).toEqual([false, true]);
  expect(flightBegun(null, '2026-11-06')).toBe(false); // no weekend: no flight to leave
});

test('a trip is the pass and the flight in the visitor’s currency, rounded as a card shows it, when both are known', () => {
  expect(tripOf({ amount: 1000, currency: 'NOK' }, AWAY, nok)).toBe(2380); // 1 000 kr + 1 380 kr
  expect(tripOf({ amount: 1004, currency: 'NOK' }, { home: true }, nok)).toBe(1000);
  expect(tripOf({ amount: 90, currency: 'EUR' }, AWAY, eur)).toBe(210);
  expect(tripOf(null, AWAY, nok)).toBeNull();
  expect(tripOf({ amount: 90, currency: 'EUR' }, null, nok)).toBeNull();
  expect(tripOf({ amount: 90, currency: 'GBP' }, AWAY, nok)).toBeNull();
});

test('once a festival is on, its trip is the pass alone: its weekend’s return has begun', () => {
  expect(tripOf({ amount: 1000, currency: 'NOK' }, AWAY, nok, true)).toBe(1000);
  expect(tripOf({ amount: 1000, currency: 'NOK' }, null, nok, true)).toBe(1000); // no fare needed
  expect(tripOf(null, AWAY, nok, true)).toBeNull();
});

test('a country’s cheapest flight is of its festivals flown to, the city first by name at one price', () => {
  const at = (country_code: string | null, airport_city: string | null, fare: Fare | null) => ({
    country_code,
    airport_city,
    fare,
  });
  const flight = (price: number): Fare => ({ home: false, price, back: '2026-11-09' });
  const cheapest = cheapestFlights([
    at('NO', 'Homeville', { home: true }), // at home: no flight, so no fare of its country
    at('NO', 'Oslo', flight(90)),
    at('PT', 'Porto', flight(150)),
    at('PT', 'Lisbon', flight(120)),
    at('PT', 'Faro', flight(120)),
    at('PT', 'Braga', flight(200)),
    at('ES', 'Madrid', null),
    at(null, 'Nowhere', flight(10)),
    at('FR', null, flight(80)),
    at('FR', 'Paris', flight(80)),
  ]);
  expect(Object.fromEntries(cheapest)).toEqual({
    NO: { airport_city: 'Oslo', price: 90 },
    PT: { airport_city: 'Faro', price: 120 },
    FR: { airport_city: null, price: 80 },
  });
  expect(cheapestFlights([at('NO', 'Homeville', { home: true })]).size).toBe(0);
});
