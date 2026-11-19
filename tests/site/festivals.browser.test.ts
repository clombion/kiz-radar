// Who a festival's card names, on the map and on the Festivals page, and where a festival stands for a page left open
// past midnight, on the fixture's community: Siân, in Glasgow's line-up, only may go there.
import { expect, test } from 'vitest';
import { festivalsHref, friendsHref } from '../../site/routes.ts';
import { KEY } from '../../site/states.ts';
import { startSite } from './app.ts';
import { GLASGOW, KUOF, KWANZA, titleOf } from './community.fixture.ts';
import { aloneInItsCountry, planned } from './planted.ts';
import { cardTitles, listOf, mapCardOf, rowOf, said, tags } from './seen.ts';

const main = () => document.querySelector('main');
const app = await startSite({
  now: '2026-11-01',
  plant: (db) => {
    planned(db, 'sian', GLASGOW, KEY.plan.MAYBE);
    // Prague Kwanza and Glasgow each the one festival of its weekend in its country, whatever else the build lists
    // there
    aloneInItsCountry(db, KWANZA);
    aloneInItsCountry(db, GLASGOW);
  },
});

// a festival's card, opened on the map (its map read no further): who's going, under its count
const whoAt = async (id: number): Promise<Element | null> => (await mapCardOf(app, id)).querySelector('.who');
// the names on a card's list of who's going, each with its tag
const goers = (who: Element | null | undefined) =>
  [...(who?.querySelectorAll('li') ?? [])].map((li) => [
    said(li.querySelector('.goer-name')),
    said(li.querySelector('.plan-tag')),
  ]);

test('the people a manager added are named on the community’s page only, never on a festival’s card elsewhere', async () => {
  const who = await whoAt(KUOF);
  expect(said(who?.querySelector('h4'))).toBe('Who’s going2');
  expect(goers(who)).toEqual([['Cédric & Christina', 'teaching']]);
  expect(said(who)).not.toMatch(/Tonje|Ragnhild|Maja/u);
});

test('a page left open past midnight reads where each festival stands by the new day', async () => {
  const kuof = () => rowOf('KUOF');
  await app.open(friendsHref(), new Date(2026, 10, 21, 23, 59));
  expect(kuof()).toBeDefined();
  expect(listOf().rows.find((r) => r.now)?.name).toMatch(/^KUOF/u);
  await app.open(friendsHref(), new Date(2026, 10, 23, 0, 1)); // the festival ended on the 22nd
  expect(listOf().rows.length).toBeGreaterThan(0);
  expect(kuof()).toBeUndefined();
});

test('a festival’s card and the Friends tab say who may go apart from who is going', async () => {
  const who = await whoAt(KWANZA);
  expect(said(main()?.querySelector('.festival-card .going-line > span:last-child'))).toBe('Siân may go');
  expect(said(who?.querySelector('h4'))).toBe('Who’s going0 · 1 maybe');
  expect(tags(who)).toEqual(['maybe']);
  // the Festivals page holding Prague Kwanza alone, its weekend's in its country: no friends going, as Siân only may
  await app.open(festivalsHref({ country: 'CZ', when: 'weekend', reach: 'any' }), '2027-02-12');
  expect(cardTitles()).toEqual([titleOf(KWANZA)]);
  expect(main()?.querySelector('.friends')).toBeNull();
  expect(said(main())).not.toMatch(/ going to /u);
  // against it, the page holding Glasgow alone, where Christina and Siân teach: the line says who is going
  await app.open(festivalsHref({ country: 'GB', when: 'weekend', reach: 'any' }), '2026-11-06');
  expect(said(main()?.querySelector('.friends > span:last-child'))).toBe('Christina and Siân are going to this one.');
  await app.open(friendsHref());
  expect(rowOf('Prague Kwanza')?.lines).toEqual(['maybe: Siân']);
});

test('someone in the line-up teaches there whatever their plan says, and is counted as going', async () => {
  // Siân only may go to Glasgow, where she teaches: counted with the going, tagged teaching, never maybe
  const who = await whoAt(GLASGOW);
  expect(said(who?.querySelector('h4'))).toBe('Who’s going2');
  expect(tags(who)).toEqual(['teaching', 'teaching']);
  expect(goers(who).map(([name]) => name)).toContain('Siân');
});
