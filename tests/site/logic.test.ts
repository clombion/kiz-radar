// The site's pure logic, on values alone: days, text folding, plurals and lists, and the words for what an artist is
// booked as.
import { expect, test, vi } from 'vitest';
import { addDays, today } from '../../site/days.ts';
import { fold, words } from '../../site/fold.ts';
import { roleLabel } from '../../site/roles.ts';
import {
  artistHref,
  artistsHref,
  communityHref,
  communityShareHref,
  countriesHref,
  festivalsHref,
  go,
  mapHref,
  parseRoute,
  personHref,
  routeOf,
  SECTIONS,
  sectionAt,
  showInAddressBar,
  siteRoot,
  sitewide,
} from '../../site/routes.ts';
import { booked, EVENT, flag, num, opt, read, state, str } from '../../site/rows.ts';
import { KEY } from '../../site/states.ts';
import { counted, hasForm, iconOf, isKey, joined, linkOf, plural, say, text } from '../../site/wording.ts';

test('a day moves by whole days across a month, a year and a clock change', () => {
  expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // Europe's clocks go forward on the 29th
  expect(addDays('2026-10-24', 7)).toBe('2026-10-31'); // and back on the 25th
  expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  expect(addDays('2026-11-06', -3)).toBe('2026-11-03');
  expect(addDays('2026-11-06T23:30:00+00:00', 0)).toBe('2026-11-06'); // a timestamp reads as its day
});

test('folding makes accents, case and the letters ASCII spells otherwise one', () => {
  expect(fold('Łódź')).toBe('lodz');
  expect(fold('Rencontrés')).toBe(fold('rencontres'));
  expect(fold('Ørsted Æble Straße Đorđe Işık')).toBe('orsted aeble strasse dorde isik');
  expect(words('Kizomba-Fusion: ÉLO & Bea')).toEqual(['kizomba', 'fusion', 'elo', 'bea']);
  expect(words('  ')).toEqual([]);
});

test('a count names its noun once or many times, in the reader’s digits', () => {
  expect(plural(1, 'festival')).toBe('1 festival');
  expect(plural(0, 'festival')).toBe('0 festivals');
  expect(plural(1204, 'artist')).toBe('1,204 artists');
  expect(plural(2, 'person', 'people')).toBe('2 people');
});

test('a list reads "A, B and C"', () => {
  expect(joined([]).join('')).toBe('');
  expect(joined(['A']).join('')).toBe('A');
  expect(joined(['A', 'B']).join('')).toBe('A and B');
  expect(joined(['A', 'B', 'C']).join('')).toBe('A, B and C');
});

const unbooked = { teacher: 0, dj: 0, performer: 0, mc: 0 } as const;
test('an artist is said by the roles they are booked in, or by their kind', () => {
  const person = { ...unbooked, kind: KEY.artist_kind.PERSON };
  expect(roleLabel({ ...person, teacher: 3 })).toBe('Teacher');
  expect(roleLabel({ ...person, teacher: 3, dj: 1 })).toBe('Teacher & DJ');
  expect(roleLabel({ ...person, dj: 1, performer: 2, mc: 1 })).toMatch(/^DJ & /u); // two at most
  expect(roleLabel(person)).toBe('Artist');
  const couple = { ...unbooked, kind: KEY.artist_kind.COUPLE };
  expect(roleLabel({ ...couple, teacher: 2 })).toBe('Teaching couple');
  expect(roleLabel(couple)).toBe('Couple');
});

test('a column of another type than its shape says is refused, naming the column', () => {
  const shape = { s: str, n: num, f: flag, o: opt(num), p: state('price'), r: booked, g: EVENT.genres } as const;
  const fine = { s: 'x', n: 1, f: 0, o: null, p: KEY.price.PRICED, r: KEY.role.DJ, g: `${KEY.genre.KIZOMBA},` };
  expect(read(shape, fine)).toEqual({ ...fine, f: false, g: [KEY.genre.KIZOMBA] });
  expect(read(shape, { ...fine, g: null }).g).toEqual([]); // no genres
  for (const [k, v, what] of [
    ['s', 1, 'text'],
    ['n', '1', 'number'],
    ['f', 2, 'flag'],
    ['o', 'x', 'number'],
    ['p', 'soon', 'price state'],
    ['r', KEY.role.ORGANISER, 'role an artist is booked in'],
    ['g', 'kizomba,waltz', 'genre state'],
  ] as const)
    expect(() => read(shape, { ...fine, [k]: v })).toThrow(new RegExp(`column ${k}: .* is no ${what}`, 'u'));
});

test('the state table answers what it has, and refuses what it hasn’t', () => {
  expect(isKey('price', KEY.price.PRICED)).toBe(true);
  expect(isKey('price', 'toString')).toBe(false); // an object's own keys only
  expect(hasForm('role', KEY.role.TEACHER, 'pair')).toBe(true);
  expect(hasForm('role', KEY.role.DJ, 'pair')).toBe(false);
  expect(iconOf('feature', KEY.feature.TAXI_DANCERS)).toMatch(/^[a-z-]+$/u);
  // a state drawn with no icon: the type allows it (an icon is per state), the table refuses it
  expect(() => iconOf('price', KEY.price.PRICED)).toThrow(/no icon/u);
  expect(linkOf('price', KEY.price.PRICED)).toBeNull();
  expect(counted('role', 'lineup')).toEqual([KEY.role.TEACHER, KEY.role.DJ]);
});

test('an address leaves out a choice with no value, and a section is found by its name', () => {
  expect(parseRoute(festivalsHref({ reach: '', friends: false, with: null, months: 12, x: undefined }))).toEqual({
    name: 'finder',
    sub: [],
    qs: 'months=12',
  });
  expect(parseRoute(mapHref())).toEqual({ name: 'map', sub: [], qs: '' });
  expect(parseRoute(personHref('cedric'))).toEqual({ name: 'friends', sub: ['cedric'], qs: '' });
  expect(parseRoute(countriesHref({ sort: 'name' }))).toEqual({ name: 'countries', sub: [], qs: 'sort=name' });
  expect(SECTIONS[sectionAt('artists')]?.[1]).toBe(artistsHref());
  expect(sectionAt('sql')).toBe(-1);
  expect(sectionAt('community')).toBe(-1); // no tab of its own, nor a swipe to it
  expect(sectionAt(null)).toBe(-1);
  const replaceState = vi.fn();
  vi.stubGlobal('history', { replaceState });
  showInAddressBar(artistHref(3));
  expect(replaceState).toHaveBeenCalledWith(null, '', artistHref(3));
  vi.unstubAllGlobals();
});

test('a community’s page is its own address from the site’s root, which an older #community link moves to', () => {
  const root = 'https://clombion.github.io/kiz-radar/';
  const key = 'frost-lantern-river-maple';
  expect(communityHref(key)).toBe(`c/${key}/`);
  expect(communityHref(key, { from: '2027-03' })).toBe(`c/${key}/?from=2027-03`);
  const at = (address: string, base = root) => routeOf(new URL(address, root).href, base);
  expect(at(`c/${key}/`)).toEqual({ name: 'community', sub: [key], qs: '', moved: null });
  expect(at(`c/${key}/index.html?from=2027-03`)).toEqual({
    name: 'community',
    sub: [key],
    qs: 'from=2027-03',
    moved: null,
  });
  // the root's base names its page too, index.html
  expect(at(`c/${key}/`, `${root}index.html`).name).toBe('community');
  // an older link: the community's page, and its own address for the address bar
  expect(at(`#community/${key}?from=2027-03`)).toEqual({
    name: 'community',
    sub: [key],
    qs: 'from=2027-03',
    moved: `c/${key}/?from=2027-03`,
  });
  // every other view by its hash, whatever the path; a path outside the root's names no community
  expect(at(mapHref())).toEqual({ name: 'map', sub: [], qs: '', moved: null });
  expect(at('#community')).toEqual({ name: 'community', sub: [], qs: '', moved: null });
  expect(routeOf(`https://x/elsewhere/c/${key}/${mapHref()}`, root).name).toBe('map');
  expect(at('c/a/b/').name).toBe('finder');
  // the full address the Share button gives, and a link gone to from the root
  vi.stubGlobal('document', { baseURI: root });
  const assign = vi.fn();
  vi.stubGlobal('location', { assign });
  expect(communityShareHref(key)).toBe(`${root}c/${key}/`);
  go(mapHref());
  expect(assign).toHaveBeenCalledWith(`${root}${mapHref()}`);
  vi.unstubAllGlobals();
});

test('the site-wide choices (the currency) go with every address the site builds', () => {
  const root = 'https://clombion.github.io/kiz-radar/';
  expect(`${sitewide('?cur=eur&months=3')}`).toBe('cur=eur');
  expect(`${sitewide('')}`).toBe('');
  // the base: the root's folder, the page's own file when it is that folder's, the currency of the address
  expect(siteRoot('./', `${root}?cur=eur#finder`)).toBe(`${root}?cur=eur`);
  expect(siteRoot('./', `${root}index.html?cur=usd&x=1`)).toBe(`${root}index.html?cur=usd`);
  expect(siteRoot('../../', `${root}c/k/?from=2027-03&cur=eur`)).toBe(`${root}?cur=eur`);
  expect(siteRoot('../../', `${root}c/k/`)).toBe(root);
  // a hash link resolves with the base's currency; a community's path link adds it to its own query
  expect(new URL(mapHref(), `${root}?cur=eur`).href).toBe(`${root}?cur=eur${mapHref()}`);
  vi.stubGlobal('document', { baseURI: `${root}?cur=eur` });
  expect(communityHref('k', { from: '2027-03' })).toBe('c/k/?cur=eur&from=2027-03');
  expect(communityShareHref('k')).toBe(`${root}c/k/?cur=eur`);
  vi.unstubAllGlobals();
});

test('the visitor’s day is their own, not UTC’s', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 6, 0, 30)); // half past midnight, local time
  expect(today()).toBe('2026-11-06');
  vi.useRealTimers();
});

test('a state’s words come with their values, in the form asked, or none for a state that shows none', () => {
  expect(say('people', KEY.people.GROUP, { n: 4 })?.join('')).toMatch(/4/u);
  expect(text('role', KEY.role.TEACHER, {}, 'pair')).toBe('Teaching couple');
  expect(say('ticket', KEY.ticket.IN_TIER)).toBeNull();
});
