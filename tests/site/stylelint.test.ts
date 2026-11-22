// stylelint's rules (.stylelintrc.yaml) on their fixtures (tests/site/stylelint/), with the repository's config. A line a
// rule must refuse ends with `/* refused: <rule>, … */`; every finding must be on a line marked for its rule, and every
// marked line found, so a rule turned off, or a setting changed so that it lets its line through, fails. Each rule the
// config turns on has a refused line, or, for what no marked line can hold (an empty sheet, a string over two lines),
// CSS of its own that it refuses: a rule taken out of the config fails as one turned off does.
// The suppressions are held too: one without a reason, one not needed and one of a rule the config does not have are
// refused (disables.css). good.css, written the intended way, a suppression with its reason among it, has no finding.
// house/baseline (lint/stylelint/baseline.ts) reads today from the clock, which these tests pin: what it refuses in
// refused.css is too recent or missing from a browser on CLOCK's day, and good.css holds a feature that reached every
// browser 12 months to the day before it, what an @supports tests for, and the cursor keywords the config allows (iOS
// Safari has none), each used: an allowed key the CSS linted does not use is refused, so the CSS of a test that is not
// a fixture gives house/baseline options of its own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { expect, test, vi } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = join(ROOT, 'tests/site/stylelint');
const CONFIG = join(ROOT, '.stylelintrc.yaml');
const MARKER = /\/\* refused: (?<rules>[\w/-]+(?:, [\w/-]+)*) \*\/$/u;
const CLOCK = new Date('2026-10-14T12:00:00Z');
vi.useFakeTimers({ toFake: ['Date'], now: CLOCK });

// each warning of a fixture, or of some CSS, with the repository's config
async function warnings(source: { readonly name: string } | { readonly code: string }, baseline?: object) {
  const files = 'name' in source ? { files: [join(FIXTURES, source.name)] } : { code: source.code };
  // the repository's config, house/baseline's options replaced where a test gives its own
  const config =
    baseline === undefined
      ? { configFile: CONFIG }
      : { config: { extends: [CONFIG], rules: { 'house/baseline': [true, baseline] } } };
  const { results } = await stylelint.lint({ ...files, ...config });
  const [result] = results;
  expect(result?.parseErrors ?? []).toEqual([]);
  expect(result?.invalidOptionWarnings ?? []).toEqual([]);
  return result?.warnings ?? [];
}

// each finding of a fixture, as "line rule", once however many times its line trips the rule
async function findings(name: string, baseline?: object): Promise<string[]> {
  return [...new Set((await warnings({ name }, baseline)).map((w) => `${w.line} ${w.rule}`))].toSorted();
}

// house/baseline as the config sets it, but for its allowed keys, which CSS that is no fixture does not use
const BARE = { months: 12 };

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
  expect(await findings('disables.css', BARE)).toEqual(marked('disables.css'));
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
    expect([...new Set((await warnings({ code }, BARE)).map((w) => w.rule))].toSorted()).toEqual(rules);
  }
});

test('each rule the config turns on has a refused line, or CSS of its own it refuses', async () => {
  const config = await stylelint.resolveConfig(join(FIXTURES, 'good.css'), { configFile: CONFIG });
  const on = Object.keys(config?.rules ?? {});
  const refused = new Set([...marked('refused.css').map((found) => found.split(' ')[1]), ...Object.keys(UNMARKED)]);
  expect(on.filter((rule) => !refused.has(rule))).toEqual([]);
  expect(on.length).toBeGreaterThan(0);
});

test('house/baseline says the feature and the day it reached every browser and the latest allowed, or where it is missing', async () => {
  const said = async (code: string): Promise<string[]> => (await warnings({ code }, BARE)).map((w) => w.text);
  expect(await said('@scope (.a) {\n  .b {\n    width: 1px;\n  }\n}\n')).toEqual([
    'at-rule "@scope" (web-features\' "@scope", css.at-rules.scope) reached every declared browser on 2026-03-24, after 2025-10-14, 12 months before today (house/baseline)',
  ]);
  expect(await said('.a {\n  text-wrap: pretty;\n}\n')).toEqual([
    'keyword "pretty" of "text-wrap" (web-features\' "text-wrap: pretty", css.properties.text-wrap.pretty) is not in every declared browser: not in Firefox, Firefox for Android (house/baseline)',
  ]);
  // in every browser, but no Baseline
  expect(await said('.a {\n  clip: auto;\n}\n')).toContain(
    'property "clip" (web-features\' "clip", css.properties.clip) is in every declared browser, but web-features gives it no Baseline (discouraged) (house/baseline)',
  );
  // a keyword the data spells in two cases, and the shape of a shorthand
  expect(await said('.a {\n  text-decoration: underline currentcolor;\n}\n')).toEqual([
    'keyword "currentcolor" of "text-decoration" (web-features\' "text-decoration", css.properties.text-decoration.currentColor) reached every declared browser on 2025-12-12, after 2025-10-14, 12 months before today (house/baseline)',
    '"text-decoration" with a style or colour (web-features\' "text-decoration", css.properties.text-decoration.includes_color-and-style) reached every declared browser on 2025-12-12, after 2025-10-14, 12 months before today (house/baseline)',
  ]);
});

test('house/baseline reads today from the clock: a feature 12 months in every browser is let through', async () => {
  const code = '.a {\n  field-sizing: content;\n}\n';
  expect((await warnings({ code }, BARE)).map((w) => w.rule)).toEqual(['house/baseline']);
  vi.setSystemTime(new Date('2027-06-16T12:00:00Z'));
  try {
    expect(await warnings({ code }, BARE)).toEqual([]);
  } finally {
    vi.setSystemTime(CLOCK);
  }
});

test('house/baseline counts months back to the day, or the last day of a shorter month', async () => {
  const needless = async (months: number): Promise<string[]> =>
    (await warnings({ code: '.a {\n  width: 1px;\n}\n' }, { months, allowed: ['css.properties.display.grid'] })).map(
      (w) => w.text,
    );
  vi.setSystemTime(new Date('2027-03-31T12:00:00Z'));
  try {
    expect(await needless(1)).toEqual([
      "allowed css.properties.display.grid has been in every declared browser since 2027-02-28 or before: take it out of the rule's allowed (house/baseline)",
    ]);
  } finally {
    vi.setSystemTime(CLOCK);
  }
});

test('house/baseline reads each kind of piece by its key', async () => {
  // at 60 months, what the stylesheet's own browsers have had for 1 to 5 years is too recent
  const keys = async (code: string): Promise<string[]> =>
    (await warnings({ code }, { months: 60 }))
      .filter((w) => w.rule === 'house/baseline')
      .map((w) => /, (?<key>css\.[^)]+)\)/u.exec(w.text)?.groups?.['key'] ?? w.text);
  const cases: readonly (readonly [string, readonly string[]])[] = [
    ['.a {\n  height: 1svh;\n}\n', ['css.types.length.viewport_percentage_units_small']],
    ['.a {\n  width: revert-layer;\n}\n', ['css.types.global_keywords.revert-layer']],
    ['@media (width > 1px) {\n  .a {\n    width: 1px;\n  }\n}\n', ['css.at-rules.media.range_syntax']],
    ['.a {\n  & .b {\n    width: 1px;\n  }\n}\n', ['css.selectors.nesting']],
    ['.a {\n  color: color(display-p3 1 0 0);\n}\n', ['css.types.color.color']],
    ['.a {\n  transition-timing-function: linear(0, 1);\n}\n', ['css.types.easing-function.linear-function']],
    // a function's name is no keyword of its property (css.properties.width.anchor-size)
    ['.a {\n  width: anchor-size(width);\n}\n', ['css.types.anchor-size']],
  ];
  for (const [code, expected] of cases) expect(await keys(code)).toEqual(expected);
});

test('house/baseline leaves alone what an @supports, or an outer one, tests for', async () => {
  const code =
    '@supports (text-wrap: pretty) {\n  @supports (display: grid) {\n    .a {\n      text-wrap: pretty;\n    }\n  }\n}\n';
  expect((await warnings({ code }, BARE)).filter((w) => w.rule === 'house/baseline')).toEqual([]);
  const bare = code.replace('(text-wrap: pretty)', '(display: flex)');
  expect((await warnings({ code: bare }, BARE)).filter((w) => w.rule === 'house/baseline')).toHaveLength(1);
});

test('house/baseline lets an allowed key through, refuses it once it is not allowed, and refuses it unused', async () => {
  const code = '.a {\n  cursor: pointer;\n}\n';
  const allowed = ['css.properties.cursor.pointer'];
  expect(await warnings({ code }, { months: 12, allowed })).toEqual([]);
  expect((await warnings({ code }, BARE)).map((w) => w.text)).toEqual([
    'keyword "pointer" of "cursor" (web-features\' "Cursor styles", css.properties.cursor.pointer) is not in every declared browser: not in Safari on iOS (house/baseline)',
  ]);
  expect((await warnings({ code: '.a {\n  width: 1px;\n}\n' }, { months: 12, allowed })).map((w) => w.text)).toEqual([
    "allowed css.properties.cursor.pointer lets nothing of the stylesheet through: take it out of the rule's allowed (house/baseline)",
  ]);
});

test('house/baseline refuses an allowed key that nothing refuses, or that the data does not have', async () => {
  const allowed = ['css.properties.display.grid', 'css.properties.no-such-thing'];
  expect((await warnings({ code: '.a {\n  width: 1px;\n}\n' }, { months: 12, allowed })).map((w) => w.text)).toEqual([
    "allowed css.properties.display.grid has been in every declared browser since 2025-10-14 or before: take it out of the rule's allowed (house/baseline)",
    "allowed css.properties.no-such-thing is no CSS key of web-features: take it out of the rule's allowed (house/baseline)",
  ]);
});

test('house/baseline refuses options without months, or with allowed not a list', async () => {
  const invalid = async (options: object): Promise<string[]> => {
    const config = { extends: [CONFIG], rules: { 'house/baseline': [true, options] } };
    const { results } = await stylelint.lint({ code: '.a {\n  text-wrap: pretty;\n}\n', config });
    return (results[0]?.invalidOptionWarnings ?? []).map((w) => w.text);
  };
  expect(await invalid({ allowed: ['css.properties.cursor.pointer'] })).toEqual([
    'Expected option value for rule "house/baseline"',
  ]);
  expect(await invalid({ months: 12, allowed: 'css.properties.cursor.pointer' })).toEqual([
    'Invalid option "css.properties.cursor.pointer" for rule "house/baseline"',
  ]);
});
