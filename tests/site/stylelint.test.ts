// stylelint's rules (.stylelintrc.yaml) on their fixtures (tests/site/stylelint/), with the repository's config. A line a
// rule must refuse ends with `/* refused: <rule>, … */`; every finding must be on a line marked for its rule, and every
// marked line found, so a rule turned off, or a setting changed so that it lets its line through, fails. Each rule the
// config turns on has a refused line, or, for what no marked line can hold (an empty sheet, a string over two lines),
// CSS of its own that it refuses: a rule taken out of the config fails as one turned off does.
// The suppressions are held too: one without a reason, one not needed and one of a rule the config does not have are
// refused (disables.css). good.css, written the intended way, a suppression with its reason among it, has no finding.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(ROOT, 'tests/site/stylelint');
const CONFIG = join(ROOT, '.stylelintrc.yaml');
const MARKER = /\/\* refused: (?<rules>[\w-]+(?:, [\w-]+)*) \*\/$/u;

// each finding of a fixture, as "line rule", once however many times its line trips the rule
async function findings(name: string): Promise<string[]> {
  const { results } = await stylelint.lint({ files: [join(FIXTURES, name)], configFile: CONFIG });
  const [result] = results;
  expect(result?.parseErrors ?? []).toEqual([]);
  expect(result?.invalidOptionWarnings ?? []).toEqual([]);
  return [...new Set((result?.warnings ?? []).map((w) => `${w.line} ${w.rule}`))].toSorted();
}

// each marked line of a fixture, as "line rule", for each rule its marker names
function marked(name: string): string[] {
  return readFileSync(join(FIXTURES, name), 'utf8')
    .split('\n')
    .flatMap((line, i) => {
      const rules = MARKER.exec(line)?.groups?.['rules'];
      return rules === undefined ? [] : rules.split(', ').map((rule) => `${i + 1} ${rule}`);
    })
    .toSorted();
}

test('each refused line is found by its rule, and nothing else is', async () => {
  expect(await findings('refused.css')).toEqual(marked('refused.css'));
});

test('a suppression without a reason, not needed, or of a rule the config does not have is refused', async () => {
  expect(await findings('disables.css')).toEqual(marked('disables.css'));
});

test('the stylesheet written the intended way has no finding', async () => {
  expect(await findings('good.css')).toEqual([]);
});

// the rules no marked line can hold, each with the CSS it refuses and every rule that refuses it
const UNMARKED: Readonly<Record<string, { readonly code: string; readonly rules: readonly string[] }>> = {
  'no-empty-source': { code: '', rules: ['no-empty-source'] },
  'string-no-newline': { code: '.a {\n  content: "a\nb";\n}\n', rules: ['string-no-newline', 'value-no-invalid'] },
};

test('a rule no marked line can hold refuses its own CSS', async () => {
  for (const { code, rules } of Object.values(UNMARKED)) {
    const { results } = await stylelint.lint({ code, configFile: CONFIG });
    expect([...new Set((results[0]?.warnings ?? []).map((w) => w.rule))].toSorted()).toEqual(rules);
  }
});

test('each rule the config turns on has a refused line, or CSS of its own it refuses', async () => {
  const config = await stylelint.resolveConfig(join(FIXTURES, 'good.css'), { configFile: CONFIG });
  const on = Object.keys(config?.rules ?? {});
  const refused = new Set([...marked('refused.css').map((found) => found.split(' ')[1]), ...Object.keys(UNMARKED)]);
  expect(on.filter((rule) => !refused.has(rule))).toEqual([]);
  expect(on.length).toBeGreaterThan(0);
});
