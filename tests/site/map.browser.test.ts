// The map's bubbles, one per city by its key: three festivals in Kizburg, whose listings spell it three ways, and two
// cities of one name, Springfield, one festival in each; the cities the test's own, in Germany. The page names a
// festival's city by its row of cities, so the spellings are data a visitor's page meets rather than words it shows;
// the two Springfields alone tell a city's key from its name.
import { expect, test } from 'vitest';
import { cityOnMapHref, festivalsHref, mapHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { CLOUDKIZ, GLASGOW, HOT_ICE, KUOF, KWANZA, titleOf } from './community.fixture.ts';
import { city, inCity } from './planted.ts';
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
