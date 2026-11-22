// stylelint's rules (.stylelintrc.yaml) on their fixtures (tests/site/stylelint/), with the repository's config. A line a
// rule must refuse ends with `/* refused: <rule>, … */`; every finding must be on a line marked for its rule, and every
// marked line found, so a rule turned off, or a setting changed so that it lets its line through, fails. Each rule the
// config gives a setting of its own (a notation, a pattern, a cap, a list), the house's choices, has a refused line.
// The suppressions are held too: one without a reason, one not needed and one of a rule the config does not have are
// refused (disables.css). good.css, written the intended way, a suppression with its reason among it, has no finding.
// house/baseline (lint/stylelint/baseline.ts) reads today from the clock, which these tests pin: what it refuses in
// refused.css is too recent or missing from a browser on CLOCK's day, and good.css holds a feature that reached every
// browser 12 months to the day before it, and a cursor keyword the config allows (iOS Safari has none).
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
async function findings(name: string): Promise<string[]> {
  return [...new Set((await warnings({ name })).map((w) => `${w.line} ${w.rule}`))].toSorted();
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

test('each rule the config gives a setting of its own has a refused line', async () => {
  const config = await stylelint.resolveConfig(join(FIXTURES, 'good.css'), { configFile: CONFIG });
  const chosen = Object.entries(config?.rules ?? {})
    .filter(([, setting]) => !(Array.isArray(setting) && setting.length === 1 && setting[0] === true))
    .map(([rule]) => rule);
  const refused = new Set(marked('refused.css').map((found) => found.split(' ')[1]));
  expect(chosen.filter((rule) => !refused.has(rule))).toEqual([]);
  expect(chosen.length).toBeGreaterThan(0);
});

test('house/baseline says the feature and the day it reached every browser and the latest allowed, or where it is missing', async () => {
  const said = async (code: string): Promise<string[]> => (await warnings({ code })).map((w) => w.text);
  expect(await said('@scope (.a) {\n  .b {\n    width: 1px;\n  }\n}\n')).toEqual([
    'at-rule "@scope" (web-features\' "@scope", css.at-rules.scope) reached every declared browser on 2026-03-24, after 2025-10-14, 12 months before today (house/baseline)',
  ]);
  expect(await said('.a {\n  text-wrap: pretty;\n}\n')).toEqual([
    'keyword "pretty" of "text-wrap" (web-features\' "text-wrap: pretty", css.properties.text-wrap.pretty) is not in every declared browser: not in Firefox, Firefox for Android (house/baseline)',
  ]);
  expect(await said('.a {\n  clip: auto;\n}\n')).toContain(
    'property "clip" (web-features\' "clip", css.properties.clip) is not in every declared browser: web-features gives it no Baseline, discouraged (house/baseline)',
  );
});

test('house/baseline reads today from the clock: a feature 12 months in every browser is let through', async () => {
  const code = '.a {\n  field-sizing: content;\n}\n';
  expect((await warnings({ code })).map((w) => w.rule)).toEqual(['house/baseline']);
  vi.setSystemTime(new Date('2027-06-16T12:00:00Z'));
  try {
    expect(await warnings({ code })).toEqual([]);
  } finally {
    vi.setSystemTime(CLOCK);
  }
});

test('house/baseline lets an allowed key through, which it refuses once it is not allowed', async () => {
  const code = '.a {\n  cursor: pointer;\n}\n';
  expect(await warnings({ code })).toEqual([]);
  expect((await warnings({ code }, { months: 12 })).map((w) => w.text)).toEqual([
    'keyword "pointer" of "cursor" (web-features\' "Cursor styles", css.properties.cursor.pointer) is not in every declared browser: not in Safari on iOS (house/baseline)',
  ]);
});

test('house/baseline refuses an allowed key that nothing refuses, or that the data does not have', async () => {
  const allowed = ['css.properties.cursor.pointer', 'css.properties.display.grid', 'css.properties.no-such-thing'];
  expect((await warnings({ code: '.a {\n  width: 1px;\n}\n' }, { months: 12, allowed })).map((w) => w.text)).toEqual([
    "allowed css.properties.display.grid has been in every declared browser since 2025-10-14 or before: take it out of the rule's allowed (house/baseline)",
    "allowed css.properties.no-such-thing is no CSS key of web-features: take it out of the rule's allowed (house/baseline)",
  ]);
});
