// A festival on now, on Friday 6 November 2026: its days, its card's tag and its cost without the flight, and the
// Festivals page's On now filter. The fixture's festivals: Glasgow, on from Friday 6 to Monday 9 November; KUOF, to
// come on 20–22 November; Paris's row pinned in Oslo on Saturday 7 and Sunday 8 November, its weekend's Friday the
// 6th, so its flight left today; Prague Kwanza, from Thursday 11 February 2027, its Friday the 12th; and Cloudkiz,
// unpriced, on 26–28 February. Every other festival is moved to 2031. Each of the first four has one full pass of
// 1 240 kr on sale and a fare for its weekend.
import { expect, test } from 'vitest';
import { festivalsHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { CLOUDKIZ, GLASGOW, KUOF, KWANZA, PARIS, pinFestival, titleOf } from './community.fixture.ts';
import { flies, movedAway, priced, type Searched, unpriced, weekend } from './planted.ts';
import { cardTitled, cardTitles, mapCardOf, said } from './seen.ts';

const AT = '2026-10-30T06:00:00+00:00';
const fare = (code: string): Searched => ({ airport: code, at: AT, direct: true, fare: { price: 120, stops: 0 } });
const SATURDAY = PARIS;
const app = await startSite({
  now: '2026-11-06',
  plant: (db) => {
    movedAway(db, [GLASGOW, KUOF, SATURDAY, KWANZA, CLOUDKIZ]);
    pinFestival(db, [SATURDAY, titleOf(SATURDAY), '2026-11-07', '2026-11-08', 'Oslo', 'NO', '2026-11-06']);
    for (const id of [GLASGOW, SATURDAY, KUOF, KWANZA]) priced(db, id, 1240, 'NOK');
    unpriced(db, CLOUDKIZ);
    flies(db, GLASGOW, [['GLA', 11]]);
    flies(db, SATURDAY, [['OSL', 37]]);
    flies(db, KUOF, [['OSL', 37]]);
    flies(db, KWANZA, [['PRG', 12]]);
    weekend(db, '2026-11-06', ['GLA', 'OSL'], [fare('GLA'), fare('OSL')]);
    weekend(db, '2026-11-20', ['OSL'], [fare('OSL')]);
    weekend(db, '2027-02-12', ['PRG'], [fare('PRG')]);
  },
});

// a festival's card opened on the map, on the day given or else the start's
const cardOf = async (id: number, day?: `${number}-${number}-${number}`) => await mapCardOf(app, id, day);
const main = () => document.querySelector('main');
// what a card says of its pass and flight, and its tag
const costOf = (card: Element) => said(card.querySelector('.cost-parts'));
const tagOf = (card: Element) => said(card.querySelector('.now-tag'));

test('a festival is on from its first day to its last, both included, and still to attend while it is', async () => {
  // Glasgow on the Festivals page of its country, on a day: its tag, untagged, or not listed
  const glasgowOn = async (day: `${number}-${number}-${number}`) => {
    await app.open(festivalsHref({ reach: 'any', country: 'GB' }), day);
    return cardTitles().includes(titleOf(GLASGOW)) ? (tagOf(cardTitled(titleOf(GLASGOW))) ?? 'untagged') : 'not listed';
  };
  expect(await glasgowOn('2026-11-05')).toBe('untagged'); // the day before
  expect(await glasgowOn('2026-11-06')).toBe('On now'); // its first day
  expect(await glasgowOn('2026-11-09')).toBe('On now'); // its last
  expect(await glasgowOn('2026-11-10')).toBe('not listed'); // the day after
  // ended, not only unlisted: opened on the map, it widens the map's When from Upcoming to All dates, as a festival
  // with no day still to come does, where on its last day it leaves it
  const whenOnMap = async (day: `${number}-${number}-${number}`) => {
    await cardOf(GLASGOW, day);
    return said(main()?.querySelector('select[aria-label="When"] option:checked'));
  };
  expect(await whenOnMap('2026-11-09')).toBe('Upcoming');
  expect(await whenOnMap('2026-11-10')).toBe('All dates');
});

test('a festival on now has an On now tag before its place on its card, and one to come none', async () => {
  const glasgow = await cardOf(GLASGOW);
  expect(said(glasgow.querySelector('.where .now-tag'))).toBe('On now');
  expect(said(glasgow.querySelector('.where'))).toMatch(/^On now /u);
  expect(tagOf(await cardOf(KUOF))).toBeUndefined();
});

test('a festival’s flight has left from its weekend’s Friday, whether it is on or not', async () => {
  const glasgow = await cardOf(GLASGOW);
  expect([tagOf(glasgow), costOf(glasgow)]).toEqual([
    'On now',
    '1 240 kr full pass · already started, no flight priced',
  ]);
  // Saturday's festival, not on yet, its Friday flight today
  const saturday = await cardOf(SATURDAY);
  expect([tagOf(saturday), costOf(saturday)]).toEqual([
    undefined,
    '1 240 kr full pass · already started, no flight priced',
  ]);
  expect(costOf(await cardOf(KUOF))).toMatch(
    /^1 240 kr full pass \+ ~1 \d{3} kr flight to Oslo, then 37 km · Flights · 1$/u,
  );
  // a festival on whose weekend's flight is still to leave (one that starts on a Thursday) keeps its flight, until
  // its Friday has gone
  const thursday = await cardOf(KWANZA, '2027-02-11');
  expect([tagOf(thursday), costOf(thursday)]).toEqual([
    'On now',
    expect.stringMatching(/^1 240 kr full pass \+ ~1 \d{3} kr flight to Prague$/u),
  ]);
  expect(costOf(await cardOf(KWANZA, '2027-02-13'))).toBe('1 240 kr full pass · already started, no flight priced');
});

test('the cost of a festival on now leaves the flight out: its weekend’s return has begun', async () => {
  const started = costOf(await cardOf(GLASGOW));
  expect(started).toMatch(/full pass · already started, no flight priced$/u);
  expect(started).not.toContain('+');
  // and with no price, the flight line says the same
  const unpricedOn = await cardOf(CLOUDKIZ, '2027-02-27');
  expect([tagOf(unpricedOn), said(unpricedOn.querySelector('.flight'))]).toEqual([
    'On now',
    '✈ already started, no flight priced',
  ]);
  // one to come adds its flight
  expect(costOf(await cardOf(KUOF))).toMatch(/full pass \+ .*flight/u);
});

// the Festivals page's On now box, its label, and the tags under the sentence
const onNow = () =>
  [...(main()?.querySelectorAll<HTMLLabelElement>('label.check') ?? [])].find(
    (l) => said(l)?.startsWith('On now only') === true,
  );
const box = () => onNow()?.querySelector('input');
const sentenceTags = () => [...(main()?.querySelectorAll('.sentence-hero .with-tag .tag') ?? [])].map((t) => said(t));
// by their weekend, the two of 6 November as listed: Saturday's, Glasgow, KUOF
const ALL = [titleOf(SATURDAY), titleOf(GLASGOW), titleOf(KUOF)];

test('the filters keep only the festivals on today, shown as an On now tag and kept in the address', async () => {
  await app.open(festivalsHref({ reach: 'any' }));
  expect(cardTitles()).toEqual(ALL);
  expect([box()?.checked, box()?.disabled]).toEqual([false, false]);
  box()?.click(); // in a panel the page shows only once opened: a click of the DOM's
  expect([cardTitles(), sentenceTags()]).toEqual([[titleOf(GLASGOW)], ['On now ×']]);
  expect(location.hash).toContain('onnow=1');
  // from the address again
  await app.open(location.hash);
  expect([box()?.checked, cardTitles(), sentenceTags()]).toEqual([true, [titleOf(GLASGOW)], ['On now ×']]);
  // the tag's × takes it off
  main()?.querySelector<HTMLButtonElement>('.sentence-hero .with-tag button[aria-label="Remove “On now”"]')?.click();
  expect([cardTitles(), sentenceTags(), location.hash.includes('onnow')]).toEqual([ALL, [], false]);
  // an address asking for what the filter is not leaves it off
  await app.open(festivalsHref({ reach: 'any', onnow: 2 }));
  expect([box()?.checked, cardTitles()]).toEqual([false, ALL]);
});

test('with no festival on today among those the other choices keep, the filter is off and says why', async () => {
  await app.open(festivalsHref({ reach: 'any', country: 'NO' }));
  expect(box()?.disabled).toBe(true);
  expect(said(onNow())).toBe('On now only (none on today)');
  expect(cardTitles()).toEqual([titleOf(SATURDAY), titleOf(KUOF)]);
});
