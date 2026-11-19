// The house rules (lint/plugin.ts) on their fixtures (lint/fixtures/<rule>/), which .oxlintrc.json keeps out of the
// tree's run: oxlint, from the root, with a config of this test's own that loads the plugin and turns each of its rules
// on, every rule on every fixture. A line a rule must refuse ends with a marker: `// refused` for the rule whose folder
// holds the file, `// refused: <rule>, …` for any other; every finding must be on a line marked for its rule, and every
// marked line found. A rule with no fixtures, or a folder with no rule, fails.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, expect, test } from 'vitest';
import plugin from '../../lint/plugin.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = 'lint/fixtures';
const sorted = (lines: readonly string[]): string[] => lines.toSorted((a, b) => a.localeCompare(b));
const RULES = sorted(Object.keys(plugin.rules));
const MARKER = /\/\/ refused(?:: (?<rules>[\w-]+(?:, [\w-]+)*))?$/u;
const HOUSE = /^house\((?<rule>[\w-]+)\)$/u;

interface Report {
  diagnostics?: { code: string; filename: string; labels: { span: { line: number } }[] }[];
}

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

// what oxlint finds on the fixtures, every rule of the plugin on and nothing else, as file:line rule (a finding of no
// house rule, such as a file that does not parse, keeps oxlint's code)
function findings(): string[] {
  const config = join(dir, 'oxlintrc.json');
  writeFileSync(
    config,
    JSON.stringify({
      plugins: [],
      categories: { correctness: 'off' },
      jsPlugins: [join(ROOT, 'lint/plugin.ts')],
      rules: Object.fromEntries(RULES.map((rule) => [`house/${rule}`, 'error'])),
    }),
  );
  const run = spawnSync(`${ROOT}node_modules/.bin/oxlint`, ['-c', config, '-f', 'json', FIXTURES], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const report: Report = JSON.parse(run.stdout.startsWith('{') ? run.stdout : '{}');
  // no report is oxlint failing to lint, which must not read as fixtures with nothing refused
  if (report.diagnostics === undefined) throw new Error(run.stderr + run.stdout);
  return report.diagnostics.map(
    (d) => `${d.filename}:${d.labels[0]?.span.line ?? 0} ${HOUSE.exec(d.code)?.groups?.['rule'] ?? d.code}`,
  );
}
const found = findings();

test('every rule of the plugin has fixtures, and every fixture folder a rule', () => {
  expect(sorted([...new Set(fixtures.map(ruleOf))])).toEqual(RULES);
});

test.each(RULES)('%s: a fixture it refuses, and one it lets through', (rule) => {
  const own = fixtures.filter((f) => ruleOf(f) === rule);
  const marked = new Set(expected.map((e) => e.split(':')[0]));
  expect(expected.filter((e) => e.startsWith(`${FIXTURES}/${rule}/`) && e.endsWith(` ${rule}`))).not.toEqual([]);
  expect(own.filter((f) => !marked.has(f))).not.toEqual([]);
});

test.each(RULES)('%s: its fixtures are refused on their marked lines, and only there', (rule) => {
  const mine = (lines: readonly string[]) => sorted(lines.filter((l) => l.startsWith(`${FIXTURES}/${rule}/`)));
  expect(mine(found)).toEqual(mine(expected));
});

test('.oxlintrc.json loads the plugin, turns each of its rules on as an error, and keeps the fixtures out', () => {
  const run = spawnSync(`${ROOT}node_modules/.bin/oxlint`, ['--print-config'], { cwd: ROOT, encoding: 'utf8' });
  const config: { rules: Record<string, unknown>; ignorePatterns: string[] } = JSON.parse(run.stdout);
  const house = Object.entries(config.rules).filter(([name]) => name.startsWith('house/'));
  expect(Object.fromEntries(house)).toEqual(Object.fromEntries(RULES.map((rule) => [`house/${rule}`, 'deny'])));
  expect(config.ignorePatterns).toContain(`${FIXTURES}/`);
});
