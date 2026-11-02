// What the search answers (site/find.ts), on items made here: how each matches, their order, and the answer when only
// what has nothing coming up matches, or nothing does.
import { expect, test } from 'vitest';
import { answer, type Base, before, type Item, nearest, score } from '../../site/find.ts';
import { words } from '../../site/fold.ts';
import { KEY } from '../../site/states.ts';

type Made = Item extends infer I ? (I extends Item ? Omit<I, keyof Base> : never) : never;
const item = (
  what: Made,
  name: string,
  { past = false, rank = 0, also = [] }: { past?: boolean; rank?: number; also?: readonly string[] } = {},
): Item => ({
  ...what,
  name,
  words: words([name, ...also].join(' ')),
  nameWords: words(name),
  past,
  rank,
});
const country = (code: string, name: string, n: number) =>
  item({ kind: 'country', country: { code, name }, n }, name, { past: n === 0, rank: n, also: [code] });
const city = (name: string, upcoming: number) =>
  item({ kind: 'city', city: { city: name, cc: 'FI', upcoming, all: 3 } }, name, { past: upcoming === 0 });
const festival = (id: number, title: string, upcoming: boolean, rank: number) =>
  item(
    {
      kind: 'festival',
      e: {
        id,
        title,
        listed_title: title,
        venue: null,
        city: 'Lisbon',
        country_code: 'PT',
        start_date: '2026-11-06',
        end_date: '2026-11-08',
        upcoming,
        cancelled: null,
        listing: KEY.listing.LISTED,
        lat: null,
        url: 'https://kizomba-world.com/',
        code: null,
      },
    },
    title,
    { past: !upcoming, rank },
  );
const artist = (id: number, name: string, bookings: number) =>
  item(
    {
      kind: 'artist',
      a: {
        id,
        display_name: name,
        kind: KEY.artist_kind.PERSON,
        bookings,
        teacher: bookings,
        dj: 0,
        performer: 0,
        mc: 0,
        home_country: null,
      },
      shares: false,
    },
    name,
    { rank: bookings },
  );

const ITEMS: readonly Item[] = [
  country('FI', 'Finland', 0), // nothing coming up
  city('Helsinki', 0),
  country('PT', 'Portugal', 5),
  city('Lisbon', 2),
  festival(1, 'Lisbon Kizomba Festival', true, 10),
  festival(2, 'Lisbon Kizomba Weekend', false, 1),
  festival(3, 'Kizomba Lisboa', true, 20),
  artist(7, 'Adil & Élo', 40),
  artist(8, 'Elodie', 3),
];
const names = (a: ReturnType<typeof answer>) =>
  a.kind === 'found' ? a.groups.map(([kind, , found]) => [kind, found.map((i) => i.name)]) : a.kind;

test('a query that matches only what has nothing coming up says so, and how many, of whatever kind', () => {
  expect(answer(ITEMS, 'finland', false)).toEqual({ kind: 'past', hidden: 1 });
  expect(answer(ITEMS, 'helsinki', false)).toEqual({ kind: 'past', hidden: 1 });
  expect(answer(ITEMS, 'finland', true)).toMatchObject({ kind: 'found', count: 1, hidden: 0 });
});

test('what has nothing coming up is left out of the matches and counted, until asked for', () => {
  const a = answer(ITEMS, 'lisbon kiz', false);
  expect(names(a)).toEqual([['festival', ['Lisbon Kizomba Festival']]]);
  expect(a).toMatchObject({ count: 1, hidden: 1, tokens: ['lisbon', 'kiz'] });
  expect(names(answer(ITEMS, 'lisbon kiz', true))).toEqual([
    ['festival', ['Lisbon Kizomba Festival', 'Lisbon Kizomba Weekend']],
  ]);
});

test('the matches come by group, the best match first and then the highest rank, folded as typed', () => {
  expect(names(answer(ITEMS, 'LISB', false))).toEqual([
    ['festival', ['Lisbon Kizomba Festival', 'Kizomba Lisboa']],
    ['place', ['Lisbon']],
  ]);
  expect(names(answer(ITEMS, 'élo', false))).toEqual([['artist', ['Elodie', 'Adil & Élo']]]);
  expect(names(answer(ITEMS, 'pt', false))).toEqual([['place', ['Portugal']]]); // by its code
  expect(answer(ITEMS, '  ', false)).toEqual({ kind: 'suggest' });
});

test('a query that matches nothing names the name a typo away, of what is shown', () => {
  expect(answer(ITEMS, 'portugl', false)).toMatchObject({ kind: 'nothing', near: { name: 'Portugal' } });
  expect(answer(ITEMS, 'finlnd', false)).toEqual({ kind: 'nothing', near: null }); // nothing coming up there
  expect(answer(ITEMS, 'finlnd', true)).toMatchObject({ kind: 'nothing', near: { name: 'Finland' } });
  expect(answer(ITEMS, 'xyzzy', false)).toEqual({ kind: 'nothing', near: null });
});

test('a match scores by how much of the name it is', () => {
  const [fest] = ITEMS.filter((i) => i.name === 'Lisbon Kizomba Festival');
  if (!fest) throw new Error('no festival');
  expect(score(fest, ['lisbon', 'kizomba', 'festival'], 'lisbon kizomba festival')).toBe(4);
  expect(score(fest, ['lisbon', 'kiz'], 'lisbon kiz')).toBe(3);
  expect(score(fest, ['kizomba', 'festival'], 'kizomba festival')).toBe(2);
  expect(score(fest, ['tango'], 'tango')).toBe(0);
  const coded = country('PT', 'Portugal', 5);
  expect(score(coded, ['pt'], 'pt')).toBe(1); // a word it is found by, not one of its name
});

test('of two items, the kind comes first, then the rank within it', () => {
  const [fi, , pt, lisbon] = ITEMS;
  if (!(fi && pt && lisbon)) throw new Error('no places');
  expect(before(pt, fi)).toBeLessThan(0);
  expect(before(lisbon, fi)).toBeGreaterThan(0); // a city after every country
});

test('the nearest name is one or two typos away by its length, and the first in order among equals', () => {
  expect(nearest(ITEMS, 'eld')).toBeNull(); // too short to guess
  expect(nearest(ITEMS, 'elodi')?.name).toBe('Elodie');
  expect(nearest(ITEMS, 'portgual')?.name).toBe('Portugal'); // two letters swapped: two typos
  expect(nearest(ITEMS, 'prtgl')).toBeNull();
  const twins = [city('Lisbon', 1), country('LB', 'Lisbon', 1)];
  expect(nearest(twins, 'lisbo')?.kind).toBe('country');
});
