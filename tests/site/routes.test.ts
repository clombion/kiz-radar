import { expect, test } from 'vitest';
import {
  artistHref,
  type CityKey,
  cityOf,
  cityOnMapHref,
  eventOnMapHref,
  festivalsHref,
  parseRoute,
} from '../../site/routes.ts';

// the parts after map/city/ of an address, as the router reads it
const parts = (href: string): string[] => parseRoute(href).sub.slice(1);

test('an address is read as its view, the parts after it and its query', () => {
  expect(parseRoute('')).toEqual({ name: 'finder', sub: [], qs: '' });
  expect(parseRoute('#')).toEqual({ name: 'finder', sub: [], qs: '' });
  expect(parseRoute(artistHref(12))).toEqual({ name: 'artists', sub: ['12'], qs: '' });
  expect(parseRoute(eventOnMapHref(7, { when: 'all', color: 'popular' }))).toEqual({
    name: 'map',
    sub: ['event', '7'],
    qs: 'when=all&color=popular',
  });
  expect(parseRoute(festivalsHref({ reach: 'fair' }))).toEqual({ name: 'finder', sub: [], qs: 'reach=fair' });
});

test('a city read back from its address is the city it was written from', () => {
  const cities: CityKey[] = [
    { city: 'Lisbon', cc: 'PT' },
    { city: 'Sarajevo', cc: null }, // no country in the export
    { city: 'Saint-Denis / La Réunion', cc: 'RE' }, // a '/' in its name
    { city: '50% off? #1 & more', cc: 'FR' },
    { city: 'São Tomé', cc: 'ST' },
    { city: '-', cc: null },
  ];
  for (const k of cities) expect(cityOf(parts(cityOnMapHref(k, { when: 'all' })))).toEqual(k);
});

test('parts that are no city are none', () => {
  expect(cityOf([])).toBeNull();
  expect(cityOf(['PT'])).toBeNull();
  expect(cityOf(['PT', 'Lisbon', 'more'])).toBeNull();
  expect(cityOf(['PT', '%'])).toBeNull();
});
