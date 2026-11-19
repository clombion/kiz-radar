// The house rules (lint/plugin.ts) on their fixtures (lint/fixtures/<rule>/), which .oxlintrc.json keeps out of the
// tree's run: oxlint, on a copy of the fixtures, with the house rules as .oxlintrc.json sets them and nothing else, on
// and off everywhere and in each override, an override's files found in each rule's folder (site/kept.ts there is
// lint/fixtures/<rule>/site/kept.ts here). A line a rule must refuse ends with a marker: `// refused` for the rule whose
// folder holds the file, `// refused: <rule>, …` for any other; every finding must be on a line marked for its rule,
// and every marked line found. A rule with no fixtures, or a folder with no rule, fails, as does a folder without a
// good.ts that the rule is on for, with no options, and that holds no marked line: what the rule lets through, written
// in a file no override exempts.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import plugin from '../../lint/plugin.ts';
import { int, list, nullable, type Reader, record, text } from '../../site/json.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = 'lint/fixtures';
const sorted = (lines: readonly string[]): string[] => lines.toSorted((a, b) => a.localeCompare(b));
const RULES = sorted(Object.keys(plugin.rules));
const OXLINT = `${ROOT}node_modules/.bin/oxlint`;
const MARKER = /\/\/ refused(?:: (?<rules>[\w-]+(?:, [\w-]+)*))?$/u;
const HOUSE = /^house\((?<rule>[\w-]+)\)$/u;

type Rules = Readonly<Record<string, unknown>>;
// a config's rules, each setting as it is
const settings: Reader<Rules> = (v, at) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new TypeError(`${at}: no object of rules`);
  return Object.fromEntries(
    Object.keys(v).map((name): [string, unknown] => {
      const setting: unknown = Reflect.get(v, name);
      return [name, setting];
    }),
  );
};
const CONFIG = record({
  rules: settings,
  overrides: list(record({ files: list(text), rules: nullable(settings) })),
  ignorePatterns: list(text),
});
// oxlint's findings, each by its rule's code, its file and the line of its first label
const DIAGNOSTICS = list(record({ code: text, filename: text, labels: list(record({ span: record({ line: int }) })) }));

// .oxlintrc.json as oxlint reads it, and its house rules alone
const printed: unknown = JSON.parse(spawnSync(OXLINT, ['--print-config'], { cwd: ROOT, encoding: 'utf8' }).stdout);
const real = CONFIG(printed, 'oxlint --print-config');
const house = (rules: Rules | null): Rules =>
  Object.fromEntries(Object.entries(rules ?? {}).filter(([name]) => name.startsWith('house/')));

const dir = mkdtempSync(join(tmpdir(), 'house-rules-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// each fixture, by its path from the root
const fixtures = readdirSync(join(ROOT, FIXTURES), { recursive: true, withFileTypes: true })
  .filter((f) => f.isFile())
  .map((f) => join(f.parentPath, f.name).slice(ROOT.length));
// the rule a fixture is for: its folder's name
const ruleOf = (file: string): string => file.slice(FIXTURES.length + 1).split('/')[0] ?? '';

// what each fixture's markers expect, as file:line rule
const expected = fixtures.flatMap((file) =>
  readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .flatMap((l, i) => {
      const marker = MARKER.exec(l);
      if (marker === null) return [];
      return (marker.groups?.['rules']?.split(', ') ?? [ruleOf(file)]).map((rule) => `${file}:${i + 1} ${rule}`);
    }),
);

// what oxlint finds on the fixtures, the house rules on as .oxlintrc.json has them and nothing else, as file:line rule
// (a finding of no house rule, such as a file that does not parse, keeps oxlint's code). An override's globs are read
// from its config's folder, which holds the copy, a folder per rule: each glob is found under any of them.
function findings(): string[] {
  cpSync(join(ROOT, FIXTURES), dir, { recursive: true });
  const config = join(dir, 'oxlintrc.json');
  writeFileSync(
    config,
    JSON.stringify({
      plugins: [],
      categories: { correctness: 'off' },
      jsPlugins: [join(ROOT, 'lint/plugin.ts')],
      rules: house(real.rules),
      overrides: real.overrides
        .map((o) => ({ files: o.files.map((glob) => `*/${glob}`), rules: house(o.rules) }))
        .filter((o) => Object.keys(o.rules).length > 0),
    }),
  );
  const run = spawnSync(OXLINT, ['-c', config, '-f', 'json', '.'], { cwd: dir, encoding: 'utf8' });
  const report: unknown = JSON.parse(run.stdout.startsWith('{') ? run.stdout : '{}');
  // no report is oxlint failing to lint, which must not read as fixtures with nothing refused
  if (typeof report !== 'object' || report === null || !('diagnostics' in report))
    throw new Error(run.stderr + run.stdout);
  return DIAGNOSTICS(report.diagnostics, 'diagnostics').map(
    (d) => `${FIXTURES}/${d.filename}:${d.labels[0]?.span.line ?? 0} ${HOUSE.exec(d.code)?.groups?.['rule'] ?? d.code}`,
  );
}
const found = findings();

// a rule's setting for a file, from the root: the config's, then each override naming the file, the last deciding
function settingFor(rule: string, file: string): unknown {
  const name = `house/${rule}`;
  let setting = real.rules[name];
  for (const o of real.overrides)
    if (o.files.some((glob) => matchesGlob(file, glob)) && o.rules !== null && name in o.rules) setting = o.rules[name];
  return setting;
}

test('every rule of the plugin has fixtures, and every fixture folder a rule', () => {
  expect(sorted([...new Set(fixtures.map(ruleOf))])).toEqual(RULES);
});

test.each(RULES)('%s: a fixture it refuses, and one it lets through', (rule) => {
  const own = fixtures.filter((f) => ruleOf(f) === rule);
  const marked = new Set(expected.map((e) => e.split(':')[0]));
  expect(expected.filter((e) => e.startsWith(`${FIXTURES}/${rule}/`) && e.endsWith(` ${rule}`))).not.toEqual([]);
  expect(own.filter((f) => !marked.has(f))).not.toEqual([]);
});

test.each(RULES)('%s: its good.ts is linted by it, with no exemption, and lets everything through', (rule) => {
  const good = `${FIXTURES}/${rule}/`;
  const file = fixtures.find((f) => f.startsWith(good) && f.endsWith('/good.ts'));
  expect(file).toBeDefined();
  const marked = expected.filter((e) => e.startsWith(`${file ?? ''}:`));
  expect([settingFor(rule, file?.slice(good.length) ?? ''), marked]).toEqual(['deny', []]);
});

test.each(RULES)('%s: its fixtures are refused on their marked lines, and only there', (rule) => {
  const mine = (lines: readonly string[]) => sorted(lines.filter((l) => l.startsWith(`${FIXTURES}/${rule}/`)));
  expect(mine(found)).toEqual(mine(expected));
});

test('.oxlintrc.json turns each rule of the plugin on, and no other of house/, and keeps the fixtures out', () => {
  const sets = [real.rules, ...real.overrides.map((o) => o.rules)].flatMap((rules) => Object.entries(house(rules)));
  const on = sets.filter(([, level]) => (Array.isArray(level) ? level[0] : level) === 'deny').map(([name]) => name);
  expect(sorted([...new Set(on)])).toEqual(RULES.map((rule) => `house/${rule}`));
  expect(sorted([...new Set(sets.map(([name]) => name))])).toEqual(RULES.map((rule) => `house/${rule}`));
  expect(real.ignorePatterns).toContain(`${FIXTURES}/`);
});
