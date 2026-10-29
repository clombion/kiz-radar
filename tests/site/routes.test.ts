import { expect, test } from 'vitest';
import { type CityKey, cityOf, cityOnMapHref } from '../../site/routes.ts';

// the parts after map/city/ of an address, as the router splits it (main.ts)
const parts = (href: string): string[] => (href.slice(1).split('?')[0] ?? '').split('/').slice(2);

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
