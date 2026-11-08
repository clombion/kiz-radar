// Prices in a currency (site/currency.ts) and a festival's fare and trip (site/fares.ts), on values alone.
import { expect, test } from 'vitest';
import { isCurrency, pricesIn, written } from '../../site/currency.ts';
import {
  best,
  cheapestFlights,
  checkedAgo,
  FAR_KM,
  type Fare,
  fareOf,
  flightBegun,
  flightEur,
  type Option,
  stopsSaid,
  tripOf,
  WORTH_EUR,
} from '../../site/fares.ts';

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

const HOME = 'XHM'; // the airport marked home, whichever it is
// an airport a festival can fly to, this far from it, with a fare at this price (none: null), checked on 1 Nov
const option = (airport: string, km: number, price: number | null, stops: number | null = 0): Option => ({
  airport,
  name: `${airport} Airport`,
  city: airport,
  km,
  fare:
    price === null ? null : { price, back: '2026-11-09', stops, resold: null, fetched: '2026-11-01T06:00:00+00:00' },
  checked: '2026-11-01T06:00:00+00:00',
  direct: null,
});
const chosen = (options: readonly Option[]) => best(options)?.airport ?? null;

test('a festival at home takes no flight, and one elsewhere the best fare of its airports, or none', () => {
  expect(fareOf({ airport: HOME }, HOME, [option('LIS', 8, 120)])).toEqual({ home: true });
  expect(fareOf({ airport: 'LIS' }, HOME, [option('LIS', 8, 120, 1)])).toEqual({
    home: false,
    airport: 'LIS',
    airport_city: 'LIS',
    km: 8,
    price: 120,
    back: '2026-11-09',
    stops: 1,
    resold: null,
    fetched: '2026-11-01T06:00:00+00:00',
  });
  expect(fareOf({ airport: 'LIS' }, HOME, [option('LIS', 8, null)])).toBeNull();
  expect(fareOf({ airport: null }, HOME, [])).toBeNull();
});

test('the best airport is the cheapest within reach; one far away only when it saves more than the way costs', () => {
  expect([FAR_KM, WORTH_EUR]).toEqual([100, 40]);
  // Glasgow: GLA 12 km, EDI 55 km, ABZ 199 km
  expect(chosen([option('GLA', 12, 200), option('EDI', 55, 150), option('ABZ', 199, 120)])).toBe('EDI');
  expect(chosen([option('GLA', 12, 200), option('ABZ', 199, 160)])).toBe('GLA'); // saves 40: not more than 40
  expect(chosen([option('GLA', 12, 200), option('ABZ', 199, 159)])).toBe('ABZ'); // saves 41
  expect(chosen([option('GLA', 12, null), option('ABZ', 199, 300)])).toBe('ABZ'); // nothing near priced
  expect(chosen([option('GLA', 12, 150), option('PIK', 42, 150)])).toBe('GLA'); // one price: the nearer
  expect(chosen([option('GLA', 100, 150), option('ABZ', 101, 111)])).toBe('GLA'); // 100 km is near, 101 far: saves 39
  expect(chosen([option('GLA', 12, null)])).toBeNull();
});

test('an airport’s stops and when it was checked are said in words', () => {
  expect([0, 1, 2, null].map(stopsSaid)).toEqual(['direct', '1 stop', '2 stops', 'stops not known']);
  const day = '2026-11-08';
  expect(
    ['2026-11-08T23:00:00+00:00', '2026-11-07T01:00:00+00:00', '2026-10-27T06:00:00+00:00'].map((s) =>
      checkedAgo(s, day),
    ),
  ).toEqual(['today', 'yesterday', '12 days ago']);
});

const AWAY: Fare = {
  home: false,
  airport: 'LIS',
  airport_city: 'Lisbon',
  km: 8,
  price: 120,
  back: '2026-11-09',
  stops: 0,
  resold: null,
  fetched: '2026-11-01',
};
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
  const at = (country_code: string | null, fare: Fare | null) => ({ country_code, fare });
  const flight = (airport_city: string, price: number): Fare => ({ ...AWAY, airport_city, price });
  const cheapest = cheapestFlights([
    at('NO', { home: true }), // at home: no flight, so no fare of its country
    at('NO', flight('Oslo', 90)),
    at('PT', flight('Porto', 150)),
    at('PT', flight('Lisbon', 120)),
    at('PT', flight('Faro', 120)),
    at('PT', flight('Braga', 200)),
    at('ES', null),
    at(null, flight('Nowhere', 10)),
  ]);
  expect(Object.fromEntries(cheapest)).toEqual({
    NO: { airport_city: 'Oslo', price: 90 },
    PT: { airport_city: 'Faro', price: 120 },
  });
  expect(cheapestFlights([at('NO', { home: true })]).size).toBe(0);
});
