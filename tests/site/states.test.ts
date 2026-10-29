// The closed world of states (pipeline/STATES.md): the site holds no words or keys of its own, and asking the table
// for something it doesn't have fails.
import { expect, test } from 'vitest';
import { MORE_TRAITS, TRAITS } from '../../site/icons.ts';
import { KEY, STATES } from '../../site/states.ts';
import { say, where } from '../../site/wording.ts';
import { code } from './sources.ts';

// words and keys that mean something else where they are written; each must still be found, so none outlives its use
const HOMONYMS = new Set([
  "artists.ts: 'next'", // a sort order
  "artists.ts: 'group'", // ARIA's role="group"
  "countries.ts: 'group'",
  "search.ts: 'group'", // a search group
  "search.ts: 'person'", // a kind of result
  "plans.ts: 'person'",
  "main.ts: 'page'", // aria-current="page"
  "map.ts: 'none'", // no filter
  "sentence.ts: 'none'", // no transition
  "icons.ts: 'none'", // an SVG's fill="none"
  "search.ts: 'none'",
  'sentence.ts: full pass', // the price limit's own sum: pass and flight
  "tables.ts: 'now'", // SQL's date('now')
  "festivals.ts: 'now'", // a price line with today's tier ('now' in price)
  "pricing.ts: 'door'", // pass_tiers' door column
]);

// every words of the table, and each form of them, as the fragments a page could compose: whole words in quotes, and
// the runs between {names} long enough to be words of their own
const VALUE = /\{\w+\}/u;
const forms = Object.values(STATES)
  .flatMap((p) => Object.values(p).flatMap((s): (string | null)[] => [s.wording, ...Object.values(s.forms)]))
  .filter((w): w is string => Boolean(w));
const quotedWords = forms.filter((w) => !w.includes('{') && w.length > 3);
const fragments = forms
  .filter((w) => w.includes('{'))
  .flatMap((w) => w.split(VALUE))
  .map((f) => f.trim())
  .filter((f) => f.includes(' ') && f.length >= 8);
const quoted = (k: string) => new RegExp(`['"\`]${k}['"\`]`, 'u');

test('no state’s words are written outside the state table', () => {
  const found = [...code].flatMap(([f, src]) =>
    [
      ...quotedWords.filter((w) => [`'${w}'`, `"${w}"`, `\`${w}\``].some((q) => src.includes(q))),
      ...fragments.filter((w) => src.includes(w)),
    ].map((w) => `${f}: ${w}`),
  );
  expect(found.filter((w) => !HOMONYMS.has(w))).toEqual([]);
});

test('no state’s key is written outside the state table', () => {
  const keys = new Set(Object.values(STATES).flatMap((p) => Object.keys(p)));
  const found = [...code].flatMap(([f, src]) =>
    [...keys].filter((k) => quoted(k).test(src)).map((k) => `${f}: '${k}'`),
  );
  expect(found.filter((k) => !HOMONYMS.has(k))).toEqual([]);
});

test('every homonym still occurs where it is said to', () => {
  const gone = [...HOMONYMS].filter((entry) => {
    const [f = '', w = ''] = entry.split(': ');
    const src = code.get(f) ?? '';
    const key = /^'(?<key>.*)'$/u.exec(w)?.groups?.['key'];
    return !(key === undefined ? src.includes(w) : quoted(key).test(src));
  });
  expect(gone).toEqual([]);
});

test('a state or a form the table doesn’t have, or words without their values, fail', () => {
  // the types refuse these; the table refuses them too, for a value that comes from the data
  // @ts-expect-error: soon is no state of price
  expect(() => say('price', 'soon')).toThrow(/no state/u);
  expect(() => say('people', KEY.people.GROUP)).toThrow(/\{n\}/u);
  // @ts-expect-error: a DJ has no pair form
  expect(() => say('role', KEY.role.DJ, {}, 'pair')).toThrow(/no form pair/u);
});

test('every feature a card or a view shows has an icon icons.ts draws', () => {
  expect([...TRAITS, ...MORE_TRAITS].map(([k]) => k)).toEqual([
    ...where('feature', 'card'),
    ...where('feature', 'view'),
  ]);
  expect([...TRAITS, ...MORE_TRAITS].every(([, , svg]) => svg.startsWith('<svg'))).toBe(true);
});
