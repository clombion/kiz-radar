// The closed world of states (docs/concepts/states.md): the site holds no words or keys of its own, and asking the table
// for something it doesn't have fails.
import { expect, test } from 'vitest';
import { Drawing, MORE_TRAITS, TRAITS } from '../../site/icons.ts';
import { KEY, type StateRow, STATES } from '../../site/states.ts';
import { say, where } from '../../site/wording.ts';
import { code } from './sources.ts';

// words that mean something else where they are written; each must still be found, so none outlives its use. A key
// is oxlint's house/states' (lint/states.ts, with its fixtures): it is refused where a state is compared or passed,
// whatever its name means elsewhere, so it needs no list.
const HOMONYMS = new Set<string>([]);

// every words of the table, and each form of them, as the fragments a page could compose: whole words in quotes, and
// the runs between {names} long enough to be words of their own
const VALUE = /\{\w+\}/u;
const TABLE: Readonly<Record<string, Readonly<Record<string, StateRow>>>> = STATES;
const forms = Object.values(TABLE)
  .flatMap((p) => Object.values(p).flatMap((s): (string | null)[] => [s.wording, ...Object.values(s.forms)]))
  .filter((w): w is string => Boolean(w));
const quotedWords = forms.filter((w) => !w.includes('{') && w.length > 3);
const fragments = forms
  .filter((w) => w.includes('{'))
  .flatMap((w) => w.split(VALUE))
  .map((f) => f.trim())
  .filter((f) => f.includes(' ') && f.length >= 8);

test('no state’s words are written outside the state table', () => {
  const found = [...code].flatMap(([f, src]) =>
    [
      ...quotedWords.filter((w) => [`'${w}'`, `"${w}"`, `\`${w}\``].some((q) => src.includes(q))),
      ...fragments.filter((w) => src.includes(w)),
    ].map((w) => `${f}: ${w}`),
  );
  expect(found.filter((w) => !HOMONYMS.has(w))).toEqual([]);
});

test('every homonym still occurs where it is said to', () => {
  const gone = [...HOMONYMS].filter((entry) => {
    const [f = '', w = ''] = entry.split(': ');
    return !(code.get(f) ?? '').includes(w);
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
  expect([...TRAITS, ...MORE_TRAITS].every(([, , drawn]) => drawn instanceof Drawing)).toBe(true);
});
