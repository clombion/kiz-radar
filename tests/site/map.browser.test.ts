// The map's bubbles, one per city by its key: three festivals in Kizburg, whose listings spell it three ways, and two
// cities of one name, Springfield, one festival in each; the cities the test's own, in Germany. The page names a
// festival's city by its row of cities, so the spellings are data a visitor's page meets rather than words it shows;
// the two Springfields alone tell a city's key from its name. Three more cities have a festival each with no fare, for
// a reason of its own: Yetby's airport not searched for its weekend, Nulby's with no flight that weekend, and Farby's
// festival flying to no airport.
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { cityOnMapHref, festivalsHref, mapHref } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { ALBANIA, CLOUDKIZ, GLASGOW, HOT_ICE, KUOF, KWANZA, PARIS, PRAGUE_GOLD, titleOf } from './community.fixture.ts';
import { city, flies, fliesToNone, inCity, unpriced, weekend } from './planted.ts';
import { said } from './seen.ts';

const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    city(db, 'kizburg-de', { name: 'Kizburg', country: 'DE', at: [50.5, 9.5] });
    city(db, 'springfield-de', { name: 'Springfield', country: 'DE', at: [52.5, 8] });
    city(db, 'springfield-2-de', { name: 'Springfield', country: 'DE', at: [48.5, 12] });
    inCity(db, KUOF, 'kizburg-de', 'Kizburg');
    inCity(db, GLASGOW, 'kizburg-de', 'Kizbourg');
    inCity(db, HOT_ICE, 'kizburg-de', 'KIZBURG');
    inCity(db, KWANZA, 'springfield-de', 'Springfield');
    inCity(db, CLOUDKIZ, 'springfield-2-de', 'Springfield');
    for (const [id, key, name, lat] of [
      [PARIS, 'yetby-de', 'Yetby', 53.5],
      [PRAGUE_GOLD, 'nulby-de', 'Nulby', 51.5],
      [ALBANIA, 'farby-de', 'Farby', 49.5],
    ] as const) {
      city(db, key, { name, country: 'DE', at: [lat, 10.5] });
      inCity(db, id, key, name);
      unpriced(db, id);
    }
    flies(db, PARIS, [['GLA', 11]]);
    weekend(db, '2026-11-20', ['GLA'], [{ airport: 'GLA', at: null, standing: KEY.fare_standing.NOT_ASKED }]);
    flies(db, PRAGUE_GOLD, [['GLA', 11]]);
    weekend(
      db,
      '2027-01-15',
      ['GLA'],
      [{ airport: 'GLA', at: '2026-10-30T06:00:00+00:00', standing: KEY.fare_standing.NO_FLIGHT }],
    );
    fliesToNone(db, ALBANIA, 'GLA');
  },
});

// the world's outline, which the map asks once per page and keeps
const WORLD = '/countries-50m.json';
const askedWorld = () => app.asked.filter(({ url }) => url.pathname.endsWith(WORLD));

test('the map left before its world outline arrives says nothing went wrong', async () => {
  // first of the file: the outline not asked yet, so this map asks it, and it is held until the map is left
  expect(askedWorld()).toEqual([]);
  const letGo = app.hold(WORLD);
  await app.open(mapHref());
  await app.open(festivalsHref());
  letGo();
  // the map asked the outline once, given up as the map was left
  const [world, ...again] = askedWorld();
  expect([world?.init.signal?.aborted, again]).toEqual([true, []]);
  // and nothing said of it, once the giving up has run its course
  await new Promise((settled) => {
    setTimeout(settled, 100);
  });
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

// a city's panel beside the map, opened by its link: its heading after its flag, how many festivals it says, and the
// titles of its cards
async function panelOf(key: string): Promise<{
  city: string | undefined;
  count: string | undefined;
  cards: (string | undefined)[];
}> {
  await app.open(cityOnMapHref(key));
  const head = document.querySelector('main .panel-head');
  return {
    city: said(head?.querySelector('h2'))?.replace(/^\S+ /u, ''),
    count: said(head?.querySelector('p'))?.split(' · ')[0],
    cards: [...document.querySelectorAll('main .panel-cards .festival-card h3')].map((h) => said(h)),
  };
}

test('the map is one region a screen reader names, Leaflet drawn in it', async () => {
  await app.open(mapHref());
  const regions = page.getByRole('region', { name: 'Map of festivals by city' }).elements();
  expect(regions.map((r) => r.matches('.map.leaflet-container'))).toEqual([true]);
});

// a day the map is opened on
type Day = NonNullable<Parameters<typeof app.open>[1]>;
// the map searched by these words, its bubbles drawn for them
async function searched(words: string): Promise<void> {
  const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
  if (search == null) throw new Error('the map has no search');
  search.value = words;
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await expect.poll(() => document.querySelectorAll('main .leaflet-overlay-pane path').length).toBe(1);
}
// what the legend says of a city's bubble, the map searched by its name: the band of the bubble's colour
async function legendOf(name: string, day: Day): Promise<(string | undefined)[]> {
  await app.open(mapHref(), day);
  await searched(name);
  const bubble = document.querySelector('main .leaflet-overlay-pane path');
  if (bubble === null) throw new Error(`no bubble for ${name}`);
  const colour = getComputedStyle(bubble).fill;
  return [...document.querySelectorAll('.map-legend span:not(.size)')]
    .filter((s) => {
      const swatch = s.querySelector('i');
      return swatch !== null && getComputedStyle(swatch).backgroundColor === colour;
    })
    .map((s) => said(s));
}
// why a city's card has no fare, as its flight line says it, from its panel
async function whyNoFare(key: string, day: Day): Promise<string | undefined> {
  await app.open(cityOnMapHref(key), day);
  return said(document.querySelector('main .panel-cards .festival-card .flight'))
    ?.replace(/^✈ /u, '')
    .replace(/ · Flights · \d+$/u, '');
}

test('the legend of fares names each bubble with none the way its card says why', async () => {
  await app.open(mapHref());
  // the home city, as the legend's title names it
  const home = said(document.querySelector('.map-legend strong'))?.replace(/^Cheapest flight from /u, '');
  const FAR = `too far from ${home ?? ''} for our flight prices`;
  const bands = [...document.querySelectorAll('.map-legend span:not(.size)')].map((s) => said(s));
  expect(bands.slice(-4)).toEqual(['no flight price yet', 'no flight that weekend', FAR, 'already started']);
  for (const [key, name, day, why, band] of [
    ['yetby-de', 'Yetby', '2026-11-01', 'no flight price yet', 'no flight price yet'],
    ['nulby-de', 'Nulby', '2026-11-01', 'no flight that weekend', 'no flight that weekend'],
    ['farby-de', 'Farby', '2026-11-01', FAR, FAR],
    ['yetby-de', 'Yetby', '2026-11-21', 'already started, no flight priced', 'already started'], // its flight left
  ] as const) {
    expect(await whyNoFare(key, day)).toBe(why);
    expect(await legendOf(name, day)).toEqual([band]);
  }
});

test('festivals of one city are one bubble, whatever their listings call it, and two cities two', async () => {
  expect(await panelOf('kizburg-de')).toEqual({
    city: 'Kizburg',
    count: '3 festivals',
    cards: [GLASGOW, KUOF, HOT_ICE].map(titleOf),
  });
});

test('two cities of one name in one country are two bubbles', async () => {
  expect(await panelOf('springfield-de')).toEqual({
    city: 'Springfield',
    count: '1 festival',
    cards: [titleOf(KWANZA)],
  });
  expect(await panelOf('springfield-2-de')).toEqual({
    city: 'Springfield',
    count: '1 festival',
    cards: [titleOf(CLOUDKIZ)],
  });
  // the bubbles as drawn, the map searched by the name: Leaflet's, each a path in its overlay pane
  await app.open(mapHref());
  const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
  if (search == null) throw new Error('the map has no search');
  search.value = 'Springfield';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await expect.poll(() => document.querySelectorAll('main .leaflet-overlay-pane path').length).toBe(2);
});

// A zoom Leaflet starts on the frame after it is asked, and ends 250 ms later reading the map's panes. A zoom asked in
// a frame starts in the next; the map left before that frame for a page slow to draw (100 ms of work, as a busy
// machine gives) has the zoom start after it was left, and must be done with it before the map is taken away.
test('a map left as it starts to zoom, for a page slow to draw, says nothing went wrong', async () => {
  await app.open(cityOnMapHref('springfield-de'));
  // the city's own zoom, which the map opens with, over: a zoom asked during one is not a zoom of its own
  await expect.poll(() => document.querySelector('main .leaflet-zoom-anim')).toBeNull();
  const zoomIn = document.querySelector<HTMLElement>('main .leaflet-control-zoom-in');
  if (zoomIn == null) throw new Error('the map has no zoom button');
  addEventListener(
    'hashchange',
    () => {
      const until = performance.now() + 100;
      while (performance.now() < until);
    },
    { once: true },
  );
  await new Promise<void>((asked) => {
    requestAnimationFrame(() => {
      zoomIn.click();
      asked();
    });
  });
  await app.open(cityOnMapHref('springfield-2-de'));
  // past the zoom's end, and the map's removal
  await new Promise((settled) => {
    setTimeout(settled, 500);
  });
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
