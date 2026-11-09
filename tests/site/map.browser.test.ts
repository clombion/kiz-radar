// The map's bubbles (site/map.ts citiesOf): one per city, by its key, however its festivals' listings spell it.
import { expect, test } from 'vitest';
import { citiesOf, type Placed } from '../../site/map.ts';
import { festival } from './samples.ts';

const at = (id: number, city: string, key: string, cc: string): Placed => ({
  ...festival(id, { city, city_key: key, country_code: cc }),
  city,
  city_key: key,
  country_code: cc,
  lat: 48.1,
  lon: 11.6,
});

test('festivals of one city are one bubble, whatever their listings call it, and two cities two', () => {
  const bubbles = citiesOf([
    at(1, 'Munich', 'munich-de', 'DE'),
    at(2, 'Munich', 'munich-de', 'DE'),
    at(3, 'Munich', 'munich-de', 'DE'),
    at(4, 'Porto', 'porto-pt', 'PT'),
  ]);
  expect(bubbles.map((c) => [c.key, c.city, c.cc, c.n])).toEqual([
    ['munich-de', 'Munich', 'DE', 3],
    ['porto-pt', 'Porto', 'PT', 1],
  ]);
});

test('two cities of one name in one country are two bubbles', () => {
  const bubbles = citiesOf([
    at(1, 'Springfield', 'springfield-us', 'US'),
    at(2, 'Springfield', 'springfield-2-us', 'US'),
  ]);
  expect(bubbles.map((c) => c.key)).toEqual(['springfield-us', 'springfield-2-us']);
});
