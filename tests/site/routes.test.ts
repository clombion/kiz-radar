import { expect, test } from 'vitest';
import {
  artistHref,
  type CityKey,
  changed,
  cityOf,
  cityOnMapHref,
  eventOnMapHref,
  festivalsHref,
  parseRoute,
  readState,
  sourcesHref,
  sqlHref,
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
  expect([sqlHref(), sourcesHref()].map((href) => parseRoute(href).name)).toEqual(['sql', 'sources']);
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

// a view's choices, as the Countries view has them
const DEFAULTS: { sort: 'upcoming' | 'fare'; all: number; q: string } = { sort: 'upcoming', all: 0, q: '' };
const ALLOWED = { sort: ['upcoming', 'fare'] as const, all: [0, 1] };

test('a state read from an address keeps each value of its default’s type, and names what it drops', () => {
  expect(readState('sort=fare&all=1&q=élo', DEFAULTS, ALLOWED)).toEqual({
    state: { sort: 'fare', all: 1, q: 'élo' },
    dropped: [],
  });
  expect(readState('sort=price&all=2', DEFAULTS, ALLOWED)).toEqual({
    state: DEFAULTS,
    dropped: ['sort=price', 'all=2'],
  });
  // a number with no list of its own is any finite one
  expect(readState('all=3', DEFAULTS).state.all).toBe(3);
  expect(readState('all=x', DEFAULTS)).toEqual({ state: DEFAULTS, dropped: ['all=x'] });
});

test('a key the defaults don’t have is no state, not even one every object inherits', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'other']) {
    const { state, dropped } = readState(`${key}=1`, DEFAULTS, ALLOWED);
    expect(state).toEqual(DEFAULTS);
    expect(Object.hasOwn(state, key)).toBe(false);
    expect(dropped).toEqual([]);
  }
});

test('the part of a state the address keeps is what differs from the defaults', () => {
  expect(changed({ ...DEFAULTS, sort: 'fare' }, DEFAULTS)).toEqual({ sort: 'fare' });
  expect(changed(DEFAULTS, DEFAULTS)).toEqual({});
});
