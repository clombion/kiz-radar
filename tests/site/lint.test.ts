// lint/tests.grit, the rule that a test imports no view's values, on the files of tests/site/lint/: Biome lints them
// with that rule alone (rule.jsonc), since biome.jsonc keeps them out of the tree's run. Those under as/ stand where
// the rule's two exceptions are, by the end of their path: as/tests/site/app.ts and page.browser.test.ts.
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

// each file whose imports are refused, beside the exceptions' own (as/tests/site/other.ts): its marked lines, all of them
test.each(['refused.ts', 'as/tests/site/other.ts'])(
  'the rule refuses each marked import of %s, naming where its list is',
  (file) => {
    const marked = readFileSync(`${ROOT}tests/site/lint/${file}`, 'utf8')
      .split('\n')
      .flatMap((l, i) => (l.endsWith('// refused') ? [i + 1] : []));
    const found = refused(file);
    expect(found.map((d) => d.line).toSorted((a, b) => a - b)).toEqual(marked);
    for (const { message } of found) expect(message).toContain('lint/tests.grit');
  },
);

interface Config {
  plugins?: string[];
  overrides?: { includes?: string[]; plugins?: string[] }[];
}
// rule.jsonc loads the rule by itself, so the test would pass with the rule gone from the tree's run: biome.jsonc runs
// it in an override on tests/** alone, since a rule that matched the path would also match a checkout under tests/
test('biome.jsonc runs the rule on the tests, by its override', () => {
  // the comments out, those inside a string kept
  const text = readFileSync(`${ROOT}biome.jsonc`, 'utf8').replaceAll(
    /(?<string>"(?:\\.|[^"\\])*")|\/\/[^\n]*/gu,
    (_, string: string | undefined) => string ?? '',
  );
  const config: Config = JSON.parse(text);
  const scoped = (config.overrides ?? []).filter((o) => o.plugins?.includes('./lint/tests.grit') === true);
  expect(scoped.map((o) => o.includes)).toEqual([['tests/**']]);
  expect(config.plugins).not.toContain('./lint/tests.grit');
});

test.each(['allowed.ts', 'as/tests/site/app.ts', 'as/tests/site/page.browser.test.ts'])(
  'the rule lets %s through',
  (file) => {
    expect(refused(file)).toEqual([]);
  },
);
