// The closed world of states (docs/concepts/states.md): the site holds no words or keys of its own, and asking the table
// for something it doesn't have fails.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { Drawing, MORE_TRAITS, TRAITS } from '../../site/icons.ts';
import { KEY, STATES } from '../../site/states.ts';
import { say, where } from '../../site/wording.ts';
import { code } from './sources.ts';

// words that mean something else where they are written; each must still be found, so none outlives its use. A key
// is the Grit rule's (lint/states.grit, below): it is refused where a state is compared or passed, whatever its name
// means elsewhere, so it needs no list.
const HOMONYMS = new Set<string>([]);

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

// a module of the site with a state's key in quotes where each kind of use reads one, and uses that are no state's;
// the lines Biome's rule (lint/states.grit) must refuse end with: refused
const PLANTED = [
  'declare const e: { phase: string; kind: string };',
  "declare const KEY: { phase: { ENDED: 'ended' } };",
  'declare function say(point: string, key: string): void;',
  'declare function plural(n: number, word: string): string;',
  "export const compared = e.phase === 'ended'; // refused",
  "export const reversed = 'ended' !== e.phase; // refused",
  'export const loose = e.phase == `ended`; // refused',
  "say('price', 'priced'); // refused",
  "export const listed = ['x'].includes('teacher'); // refused",
  'switch (e.kind) {',
  "  case 'couple': // refused",
  '    break;',
  '  default:',
  '}',
  'export const named = e.phase === KEY.phase.ENDED;',
  "export const word = plural(2, 'day');",
  "export const other = e.kind === 'tag';",
  "export const attribute = { role: 'group' };",
];
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
interface Report {
  diagnostics?: { category: string; location: { start: { line: number } } }[];
}

test('Biome’s rule refuses a state’s key in quotes where one is compared or passed, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'states-grit-'));
  try {
    mkdirSync(join(dir, 'site'));
    writeFileSync(join(dir, 'site', 'planted.ts'), PLANTED.join('\n'));
    writeFileSync(join(dir, 'biome.json'), JSON.stringify({ plugins: [`${ROOT}lint/states.grit`] }));
    const run = spawnSync(`${ROOT}node_modules/.bin/biome`, ['lint', '--reporter=json', 'site/planted.ts'], {
      cwd: dir,
      encoding: 'utf8',
    });
    const report: Report = JSON.parse(run.stdout.split('\n').find((l) => l.startsWith('{')) ?? '{}');
    const refused = (report.diagnostics ?? []).filter((d) => d.category === 'plugin').map((d) => d.location.start.line);
    const marked = PLANTED.flatMap((l, i) => (l.endsWith('// refused') ? [i + 1] : []));
    expect(refused.toSorted((a, b) => a - b)).toEqual(marked);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('every rule in lint/ is one Biome runs', () => {
  const config = readFileSync(`${ROOT}biome.jsonc`, 'utf8');
  const unread = readdirSync(`${ROOT}lint`).filter((f) => !config.includes(`"./lint/${f}"`));
  expect(unread).toEqual([]);
});
