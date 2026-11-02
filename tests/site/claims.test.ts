// The dashboard's claims are the files pipeline/claims.py reads: every committed claim is the text claimText gives of
// it, and its file is named by digest of that text, so a claim the dashboard writes is one the pipeline takes, under
// the name claims.write would give it. The builders put the fields in their record's order, as a committed claim of
// each field has them. review.json, as the build writes it, is what the page reads.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, test } from 'vitest';
import { claimText, digest, homeClaim, mergeClaim, stamp } from '../../site/claims.ts';
import { int, list, nullable, pair, type Reader, record, text } from '../../site/json.ts';
import { reviewOf } from '../../site/pending.ts';

const ROOT = new URL('../../', import.meta.url);
const CLAIMS = new URL('claims/', ROOT);
const committed = readdirSync(CLAIMS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ name: f, text: readFileSync(new URL(f, CLAIMS), 'utf8') }));
const FIELD: Reader<{ field: string }> = record({ field: text });
const parsed = (t: string): object => {
  const v: unknown = JSON.parse(t);
  if (typeof v !== 'object' || v === null) throw new TypeError('a claim is an object');
  return v;
};
const fieldOf = (t: string): string => FIELD(parsed(t), 'a claim').field;
const AT = new Date('2026-10-29T18:01:23.456Z');

test('there are committed claims of both fields the dashboard writes', () => {
  const fields = new Set(committed.map((c) => fieldOf(c.text)));
  expect(fields).toContain('home');
  expect(fields).toContain('merge');
});

test('every committed claim is its text and named by its digest', async () => {
  const named = await Promise.all(committed.map(async (c) => `${await digest(c.text)}.json`));
  const wrong = committed.flatMap((c, i) => [
    ...(claimText(parsed(c.text)) === c.text ? [] : [`${c.name}: another text`]),
    ...(named[i] === c.name ? [] : [`${c.name}: another digest`]),
  ]);
  expect(wrong).toEqual([]);
});

describe('a claim built here', () => {
  const keysOf = (field: string) => {
    const c = committed.find((x) => fieldOf(x.text) === field);
    return c === undefined ? [] : Object.keys(parsed(c.text));
  };
  it('has its record’s fields in their order', () => {
    expect(Object.keys(homeClaim('p:x', 'PT', 'why', AT))).toEqual(keysOf('home'));
    expect(Object.keys(mergeClaim({ keys: ['p:a', 'p:b'], decision: 'merge', note: 'why', at: AT }))).toEqual(
      keysOf('merge'),
    );
  });
  it('is stamped to the second, in UTC', () => {
    expect(stamp(AT)).toBe('2026-10-29T18:01:23+00:00');
  });
  it('writes a pair in key order', () => {
    expect(mergeClaim({ keys: ['p:b', 'p:a'], decision: 'separate', note: 'why', at: AT }).keys).toEqual([
      'p:a',
      'p:b',
    ]);
  });
  it('says why, trimmed, or is none', () => {
    expect(homeClaim('p:x', 'PT', '  from Porto  ', AT).note).toBe('from Porto');
    expect(() => homeClaim('p:x', 'PT', '   ', AT)).toThrow('its note is empty');
  });
  it('has the text and name the pipeline gives it', async () => {
    const c = homeClaim('p:ricardo', 'PT', 'Ricardo: “de Portugal”, ł', AT);
    expect(claimText(c)).toBe(
      '{\n "field": "home",\n "key": "p:ricardo",\n "country": "PT",\n "made_at": "2026-10-29T18:01:23+00:00",\n' +
        ' "note": "Ricardo: “de Portugal”, ł"\n}\n',
    );
    expect(await digest(claimText(c))).toMatch(/^[0-9a-f]{16}$/u);
  });
});

describe('a JSON reader', () => {
  const shape = record({ n: int, s: nullable(text), xs: list(text) });
  it('reads what its shape says', () => {
    expect(shape({ n: 1, s: null, xs: ['a'] }, 'v')).toEqual({ n: 1, s: null, xs: ['a'] });
    expect(pair(int)([1, 2], 'v')).toEqual([1, 2]);
  });
  it('fails naming where and what', () => {
    expect(() => shape({ n: 1.5, s: null, xs: [] }, 'v')).toThrow('v.n: 1.5 is no whole number');
    expect(() => shape({ n: 1, s: 2, xs: [] }, 'v')).toThrow('v.s: 2 is no text');
    expect(() => shape({ n: 1, s: null, xs: [3] }, 'v')).toThrow('v.xs[0]: 3 is no text');
    expect(() => shape({ n: 1, s: null, xs: 'a' }, 'v')).toThrow('v.xs: "a" is no list');
    expect(() => shape({ n: 1, s: null }, 'v')).toThrow('v.xs: nothing is no field it has');
    expect(() => shape([], 'v')).toThrow('v: [] is no object');
    expect(() => pair(int)([1, 2, 3], 'v')).toThrow('v: [1,2,3] is no pair');
    expect(() => pair(int)([1, 'b'], 'v')).toThrow('v[1]: "b" is no whole number');
  });
});

test('the review the build writes is the one the page reads', () => {
  const r = reviewOf(JSON.parse(readFileSync(new URL('public/data/review.json', ROOT), 'utf8')));
  expect(r.repository).toBe('clombion/kiz-radar-claims');
  expect(r.countries.length).toBeGreaterThan(100);
});
