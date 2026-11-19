// lint/tests.grit, the rule that a test imports no view's values, on the two files of tests/site/lint/: Biome lints them
// with that rule alone (rule.jsonc), since biome.jsonc keeps them out of the tree's run.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
interface Report {
  diagnostics?: { category: string; message: string; location: { start: { line: number } } }[];
}

// each diagnostic of the rule on a file of tests/site/lint/: its line and its message
function refused(file: string): { line: number; message: string }[] {
  const run = spawnSync(
    `${ROOT}node_modules/.bin/biome`,
    ['lint', '--reporter=json', '--config-path=tests/site/lint/rule.jsonc', `tests/site/lint/${file}`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const report: Report = JSON.parse(run.stdout.split('\n').find((l) => l.startsWith('{')) ?? '{}');
  // no report is Biome failing to lint the file, which must not read as a file with nothing refused
  if (report.diagnostics === undefined) throw new Error(run.stderr);
  return report.diagnostics
    .filter((d) => d.category === 'plugin')
    .map((d) => ({ line: d.location.start.line, message: d.message }));
}

test('the rule refuses each marked import of refused.ts, naming where its list is', () => {
  const marked = readFileSync(`${ROOT}tests/site/lint/refused.ts`, 'utf8')
    .split('\n')
    .flatMap((l, i) => (l.endsWith('// refused') ? [i + 1] : []));
  const found = refused('refused.ts');
  expect(found.map((d) => d.line).toSorted((a, b) => a - b)).toEqual(marked);
  for (const { message } of found) expect(message).toContain('lint/tests.grit');
});

// rule.jsonc loads the rule by itself, so the test would pass with the rule gone from the tree's run
test('biome.jsonc runs the rule on the tree', () => {
  const config = readFileSync(`${ROOT}biome.jsonc`, 'utf8').replaceAll(/^\s*\/\/.*$/gmu, '');
  expect(/"plugins":\s*\[[^\]]*"\.\/lint\/tests\.grit"/u.test(config)).toBe(true);
});

test('the rule lets allowed.ts through', () => {
  expect(refused('allowed.ts')).toEqual([]);
});
