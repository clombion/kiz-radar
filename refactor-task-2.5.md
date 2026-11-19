# Task 2.5: the fixture test harness for the house rules

Task 2.5 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026, not committed. oxlint's plugin of
house rules exists with one rule, `session`, ported from `lint/session.grit` (removed with its `biome.jsonc` entry); a
node test lints the plugin's fixtures and fails on any difference from their markers, and on a rule without fixtures.

## Summary

`lint/plugin.ts` is an oxlint JS plugin (`meta.name` `house`, loaded by `.oxlintrc.json`'s `jsPlugins`), each rule a
module beside it (`lint/session.ts`). Its fixtures are under `lint/fixtures/<rule>/`, at paths the rule's scope reads.
`tests/site/rules.test.ts`, in Vitest's `node` project, runs the pinned oxlint from the repository's root with a config
of its own (written to a temporary folder: the plugin, each of its rules on, nothing else) and JSON output on
`lint/fixtures`, then compares each finding (file, line, rule) with the lines the fixtures mark. `.oxlintrc.json` keeps
the fixtures out of the tree's run.

## Design model

- **One convention, `lint/fixtures/<rule>/`, not `tests/site/lint/`**: the rules' exemptions are path tests of the shape
  `/site/<file>.ts` and `/tests/` (Grit's, kept), and a fixture under `tests/site/lint/` has `/tests/` in its path, so
  it would be exempt from every rule that exempts the tests (`storage`, `session`, `states`, `buttons`, `markup`). Under
  `lint/fixtures/session/site/` a file is site code, and `lint/fixtures/session/tests/site/` a test. The folder name is
  the rule, so the harness needs no list. `tests/site/lint/` goes when `tests.grit` is ported (2.6), its five fixtures
  moving to `lint/fixtures/tests/`.
- **Expected findings in the fixture, on their line**: the `// refused` marker that `tests/site/lint.test.ts` uses
  (Biome's era), meaning the rule of the folder; `// refused: <rule>, …` names any other house rule, since the harness
  turns every rule on for every fixture, so one rule's fixture tripping another's shows. The message is the rule's
  `meta.messages`, so comparing it would test the plugin against itself; the line and the rule are compared.
- **The rules are enumerated from the plugin**: the test imports `lint/plugin.ts` and reads `Object.keys(rules)`; the
  set of fixture folders must equal it (a rule without fixtures, or fixtures without a rule, fails), and each rule needs
  a marked line and a file with none (bad and good; exempt files are by convention, where a rule has exemptions).
- **The test's own config, not the real `.oxlintrc.json`** (the brief's review suggests the real one): the real one runs
  ~300 rules, type-aware, which would make every fixture answer to all of them and need a tsconfig for the fixtures. A
  fourth test holds what the real config must do instead: `oxlint --print-config` (JSON, comments resolved) shows each
  rule of the plugin as `deny` and nothing more of `house/`, and `lint/fixtures/` in `ignorePatterns`.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The first rule | `session` | The smallest: one name, two exemptions (`kept.ts`, `/tests/`), so all three kinds of fixture; `promises` has no exemption, `fetch` exempts no test. |
| 2 | Its reach | Any identifier named `sessionStorage` (a reference, a property, a key, a binding, a type query), a shorthand `{ sessionStorage }` once | Grit's snippet: a probe file of ten forms gave the same lines and columns under Biome and oxlint. `globalThis['sessionStorage']` passes both, as before (not widened in a port). |
| 3 | TypeScript or JavaScript | `lint/plugin.ts` and `lint/session.ts`, type-checked by `tests/site/tsconfig.json` (`../../lint`, fixtures excluded) | oxlint 1.94 loads a `.ts` plugin through Node 22.22's type stripping; tsc and type-aware oxlint (checked with a probe) cover it. |
| 4 | The rule's type | `Parameters<RuleTester['run']>[1]`, from `oxlint/plugins-dev` (`import type`) | The package exports no `Rule` type of its own name; this is the one it checks rules against. |
| 5 | The plugin's default export | `import/no-default-export` off for `lint/plugin.ts`, by an override with its reason, in `docs/concepts/lint-rules.md` | oxlint reads `(await import(url)).default` (`dist/lint.js`, `loadPlugin`). The same kind as the pending `vitest.config.ts` exception. |
| 6 | `lint/` in the tree's run | `lint:oxlint` lints `lint` too; `ignorePatterns` adds `lint/fixtures/` | The plugin is code; `tests/test_suppressions.py` reads `lint/**/*.ts` but the fixtures. |
| 7 | Exclusions | tsc (`exclude`), knip (`project` without `lint/fixtures/**`; the plugin an entry by knip's oxlint plugin, its hint), jscpd (`ignore`), Vitest (outside `tests/site/**`), Biome (outside `files.includes`); oxfmt lays them out | The brief's list; a must-fail fixture and its good twin are near-copies. |

## Fail checks

Each made, run, and undone (`vitest run --project node tests/site/rules.test.ts`):

- **A marked line not reported** (`// refused` added to `good.ts:4`): "session: its fixtures are refused on their marked
  lines, and only there" fails, 9 found against 10 expected.
- **An unmarked line reported** (the marker taken off `bad.ts:4`): the same test fails, 9 found against 8.
- **A rule without fixtures** (`storage: session` added to the plugin's `rules`): "every rule of the plugin has
  fixtures" fails (`['session']` against `['session', 'storage']`), as do "storage: a fixture it refuses", the
  `.oxlintrc.json` test (the rule is not on there) and session's own (the second rule, the same code, refuses lines
  marked for session only).

## For task 2.6

- Each rule: `lint/<rule>.ts`, its entry in `plugin.ts`'s `rules`, `house/<rule>: error`, `lint/fixtures/<rule>/`, the
  `.grit` and its `biome.jsonc` line removed, in one commit. Rules sharing a shape (an identifier outside some files:
  `storage`, `session`; a call outside one file: `fetch`, `clicks`) should share a helper in `lint/`, or jscpd (20
  tokens) will find the twins.
- `tests`: its scope was a `biome.jsonc` override on `tests/**`; oxlint's override globs are relative to the config, so
  a fixture under `lint/fixtures/tests/tests/site/` is outside any `tests/**` override, and the harness turns every rule
  on everywhere. Scope it in the rule (the path relative to `context.cwd`, which also ends Grit's residual about a
  checkout under a folder named `tests`), then drop `tests/site/lint.test.ts`, `tests/site/lint/` and their exclusions.
- The suppression at `site/artists.ts:140` (`lint/plugin/states`) becomes `oxlint-disable-line house/states -- …`.

## Impact

- **New:** `lint/plugin.ts`, `lint/session.ts`, `lint/fixtures/session/` (`site/bad.ts`, `site/good.ts`, `site/kept.ts`,
  `tests/site/storage.ts`), `tests/site/rules.test.ts`, this file.
- **Removed:** `lint/session.grit`.
- **Changed:** `.oxlintrc.json` (`jsPlugins`, the rule, `ignorePatterns`, the override), `biome.jsonc` (the plugin's
  line), `package.json` (`lint:oxlint` lints `lint`), `tests/site/tsconfig.json`, `knip.jsonc`, `.jscpd.json`,
  `.oxfmtrc.jsonc`, `tests/test_suppressions.py` (`oxlint_files`), `tests/site/states.test.ts` (its check that Biome
  runs every rule of `lint/` reads the `.grit` files only), `CONTRIBUTING.md` ("House rules", the folder table),
  `docs/concepts/lint-rules.md`.
- **`site/`:** unchanged.

## Done when

The harness runs under `test:site` and fails on each of the three defects above; `mise run check` passes.
