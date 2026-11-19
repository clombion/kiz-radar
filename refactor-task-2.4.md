# Task 2.4: oxlint with the mapped rules

Task 2.4 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026, with one exception pending the owner
(`import/no-default-export` off for `vitest.config.ts`). oxlint 1.94.0 and `oxlint-tsgolint` 7.0.2007 run type-aware on
`site/`, `tests/` and `vitest.config.ts` with zero findings and zero warnings; Biome runs unchanged beside it.

## Summary

`.oxlintrc.json` turns every category off and lists, as errors, the oxlint equivalents of the rules
[docs/concepts/lint-rules.md](docs/concepts/lint-rules.md) marks mapped: those of Biome's `error` and `warn` rules, the
info-level ones as the owner's Q2 answer decides, and the JSX ones from Biome's `error` and `warn` rules. Each finding
the bare mapping made was a missing setting (ported), a real issue (fixed, behaviour unchanged), or a misreading or a
deliberate line (suppressed on the line, listed in `docs/lint-false-positives.md` and `tests/test_suppressions.py`).
`mise run lint:oxlint` runs it in `check:fast`.

## Design model

- **Biome's rule, not oxlint's default**: where oxlint's version reports what Biome's examples allow, the setting is
  ported (`no-use-before-define`, `no-unused-vars`, `no-useless-undefined`), so a finding means what Biome's would.
- **Fix to the type, not around it**: a nullable string or count tested for truth says what absence is
  (`!== null && !== ''`, `> 0`) so the behaviour is the same, including the empty string; a value typed wider than it is
  gets its type narrowed where it is made (`text()`'s values, `withPhrase`, `say`'s parts).
- **Nothing dropped**: Biome's linter, settings and suppressions stay as they are until task 2.7.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The config's name | `.oxlintrc.json`, with comments (oxlint and Biome read them) | oxlint's default; no `-c` in the script. |
| 2 | Type-aware | `options.typeAware` in the config, and `--type-aware --deny-warnings` in the script | Either alone suffices; both say it where it is read. oxlint runs from the root, where `node_modules/oxlint-tsgolint` is (2.1, decision 6). |
| 3 | knip and `oxlint-tsgolint` | No entry: knip passes with both pinned | knip's oxlint plugin counts it once a script runs `oxlint --type-aware` (2.1, decision 4, settled). |
| 4 | Settings beyond the mapping's | `no-use-before-define` `classes`/`variables: false`; `no-unused-vars` `^_` for variables, caught errors and array destructuring; `no-useless-undefined` without arguments and arrow bodies | Biome's documented behaviour; without them 66, 6 and 9 findings on code Biome passes. |
| 5 | Q2 (owner, B) | As refactor-plan.md records; the site files with findings off per file until Phase 4 (`tables.ts` added: oxlint's `prefer-destructuring` also reports it) | The owner's answer. |
| 6 | JSX rules | The 38 of Biome's `error`/`warn` JSX rules on; the 8 `info` ones off | No JSX yet, so no finding; Q2 covered today's 96, not these. |
| 7 | `useIncludes` | `typescript/prefer-includes` only | The mapping's "one of the two". |
| 8 | A line Biome also suppresses | `oxlint-disable-line` on the code line; `test_suppressions.py` takes both forms | `biome-ignore` must come right before the line, and oxlint's next-line comment applies to the next line only. |
| 9 | `Date()` in `app.browser.test.ts` | Suppressed, not fixed | It tests the clock stub's `apply`; `String(new Date())` would test `construct` instead (weakening a test is a stop). |
| 10 | `vitest.config.ts`'s default export | `import/no-default-export` off for the file, its comment naming the owner's pending decision | Vitest reads the default export. |

## Impact

- **New:** `.oxlintrc.json`, `docs/lint-false-positives.md`, this file.
- **Changed:** `package.json`, `pnpm-lock.yaml` (the two pins, `lint:oxlint`); `tasks.toml` (`lint:oxlint` in
  `check:fast`); `docs/reference/commands.md` (generated); `tests/test_suppressions.py`; `CONTRIBUTING.md`;
  `docs/README.md`; `docs/concepts/lint-rules.md`; `refactor-plan.md` (Q2). 22 `site/` and 26 `tests/` files, and
  `vitest.config.ts` (a suppression).
- **Findings at the first run** (mapped rules on, Q2 not yet answered): 167, of which 72 settings
  (`no-use-before-define` 66, `no-unused-vars` 6), 92 type-aware and 3 others.

## Done when

`mise run lint:oxlint` passes with zero findings and zero warnings, Biome's check is unchanged, and `mise run check`
passes.
