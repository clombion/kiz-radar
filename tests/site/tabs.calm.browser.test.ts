// The tabs for a visitor who asked for less motion (the browser-calm project, vitest.config.ts): the oval under each
// row's current tab, moved at once, and the page changed with no slide, on the fixture's data alone.
import { expect, test } from 'vitest';
import { MEDIA } from '../../site/media.ts';
import { EXPLORE, festivalsHref, friendsHref, sourcesHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { header, mostOvals, offBy, ovalsOf, shownOnChange, shownOvals, subnav, tabOf } from './seen.ts';

const app = await startSite({ now: '2026-11-01' });
const [WEEK = '', MAP = ''] = EXPLORE.map(([, , href]) => href);

test('the visitor asked for less motion: the page and its stylesheet both know it', () => {
  expect(matchMedia(MEDIA.REDUCED_MOTION).matches).toBe(true);
  expect(getComputedStyle(document.documentElement).getPropertyValue('--dur-short')).toBe('0ms');
});

test('each row’s oval sits under its current tab, in a layer that reaches past the row', async () => {
  await app.open(WEEK);
  await app.open(MAP);
  const [oval] = shownOvals(header());
  expect(shownOvals(header())).toHaveLength(1);
  expect(offBy(oval, tabOf(header(), 'Explore'))).toBeLessThanOrEqual(1);
  const layer = oval?.parentElement?.getBoundingClientRect();
  const row = header()?.getBoundingClientRect();
  expect(
    layer !== undefined &&
      row !== undefined &&
      layer.left < row.left &&
      layer.top < row.top &&
      layer.right > row.right &&
      layer.bottom > row.bottom,
  ).toBe(true);
  // the Explore row, drawn again for each of its pages, keeps an oval of its own, under Map
  const [own] = shownOvals(subnav());
  expect(shownOvals(subnav())).toHaveLength(1);
  expect(offBy(own, tabOf(subnav(), 'Map'))).toBeLessThanOrEqual(1);
});

test('with no current tab there is no oval, and the next tab has one at once', async () => {
  await app.open(sourcesHref());
  expect(ovalsOf(header()).length).toBeGreaterThan(0);
  expect(shownOvals(header())).toEqual([]);
  expect(subnav()?.hidden).toBe(true);
  expect(shownOvals(subnav())).toEqual([]);
  await app.open(WEEK);
  expect(shownOvals(header())).toHaveLength(1);
  expect(offBy(shownOvals(header())[0], tabOf(header(), 'Explore'))).toBeLessThanOrEqual(1);
});

test('the oval moves at once, with no arm or drop', async () => {
  await app.open(festivalsHref());
  expect(await mostOvals(header(), () => app.open(friendsHref()))).toBe(1);
  expect(offBy(shownOvals(header())[0], tabOf(header(), 'Friends'))).toBeLessThanOrEqual(1);
});

test('the page changes at once, with no slide', async () => {
  await app.open(festivalsHref());
  expect(await shownOnChange(() => app.open(friendsHref()))).toEqual(['Friends · Kiz Radar', undefined]);
});
