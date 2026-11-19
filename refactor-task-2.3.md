# Task 2.3: the rule mapping

Task 2.3 of [refactor-plan.md](refactor-plan.md). Status: the mapping is written, 19 November 2026; the task is done
when the owner has approved the losses. The mapping is [docs/concepts/lint-rules.md](docs/concepts/lint-rules.md),
linked from `docs/README.md`. Nothing else in the tree changes: `.oxlintrc.json` and the pins are task 2.4's.

## Summary

Every rule Biome enables on the TypeScript, with its oxlint 1.94.0 equivalent (each checked in `oxlint --rules`), the
settings and per-folder exceptions to port, and a status: mapped, accepted loss, pending the owner, or off. Of the 291
rules that report on today's code, 261 are mapped, 8 are accepted losses and 22 wait for the owner; 22 rules are off in
`biome.jsonc` and stay off. The info-level rules (Q2), the rules for JSX and for frameworks the site does not use, and
the type-aware rules oxlint adds have sections of their own, each pending the owner.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | What an equivalent is | Biome's own source metadata, read through `biome migrate eslint`: each of oxlint's 872 rules migrated alone, with `--include-nursery`, then also `--include-inspired`; where it names no ESLint source, the oxlint rule whose docs describe the same check or cite the same upstream (marked `docs`) | `biome explain` 2.6.3 prints no "Source"; the migration reads the same metadata. Clippy-derived and nursery rules have no ESLint source in it. |
| 2 | Which rules are "for TypeScript" | By the language of `biome explain`'s examples, then split: today's code (291), JSX (48), frameworks the site does not use (92, by Biome's "Domains"; Playwright's too, since the tests drive Vitest's API) | The counts the owner approves should be the rules that can report on this code. |
| 3 | `inspired` mappings | Mapped, with the difference noted (narrower, broader, another measure) | Biome's metadata pairs them; task 2.4's bare run shows what each finds. |
| 4 | Accepted losses on the list that have an equivalent | Mapped: `noFlatMapIdentity`, `noParametersOnlyUsedInRecursion`, `noMisrefactoredShorthandAssign` | Keeping a rule needs no approval; dropping one does. |
| 5 | Unmapped rules beyond the list | 22, each with what holds the check without it (the parser, tsc, knip, another mapped rule, no such code) and a recommendation; one question to the owner | The brief: stop and ask once, with the full list. |
| 6 | Info-level rules (Q2) | The nine with findings: options site only / everywhere / off, with Biome's and oxlint's counts; `off` until the owner answers. The 87 with none: mapped as errors | No info level in oxlint; the plan's recommendation is rule by rule, none reporting without failing. |
| 7 | Type-aware rules new in oxlint | Listed with their findings on the tree, pending the owner; not the mapped ones that are stricter than Biome's (93 findings, task 2.4's to fix or suppress) | The coordinator's list named `strict-boolean-expressions` as new; it maps to Biome's nursery `useStrictBooleanExpressions`. |
| 8 | `vitest.config.ts` | `import/no-default-export` off for it (and for `vite.config.ts`), pending the owner | Biome never linted it; its default export is what Vitest reads. |

## Evidence

Biome 2.6.3 at `7abe7362` with task 2.2's changes in the tree; oxlint 1.94.0 and `oxlint-tsgolint` 7.0.2007 from the 2.1
scratch install, on a fresh copy of `site/`, `tests/site/`, `typings/`, `tsconfig.json`, `vitest.config.ts`.

- `pnpm exec biome rage --linter`: 484 enabled rules (a11y 38, complexity 55, correctness 109, nursery 20, performance
  16, security 6, style 103, suspicious 137). By `biome explain`'s examples: 431 for TypeScript (291 today's, 48 JSX, 92
  framework), 53 for CSS, JSON, GraphQL, HTML or YAML.
- `biome migrate eslint`, 2,118 one-rule runs (an oxlint rule under each ESLint prefix it may have, two modes): 202 of
  the 291 map as the same rule, 39 as inspired. The rules' docs (oxc.rs, and Biome's "rules sources" page for the Clippy
  and barrel-files names) give 20 more. 30 have none.
- `noDuplicateMapKeys` (nursery, set to `error`): `biome explain` shows YAML; in a scratch folder with only that rule
  on, `new Map([["a", 1], ["a", 2]])` and `{ a: 1, a: 2 }` in a `.ts` file report nothing, while `noEmptySource` reports
  an empty `.ts` file.
- Severity: in a scratch folder with `"preset": "all"`, `s.substr(1)` reports `noSubstr` as an info and
  `biome lint --error-on-warnings` exits 0. 96 of the 291 rules are `info` by default and not raised by `biome.jsonc`.
- `biome lint --reporter=json`: 43 infos of 9 rules, as in 2.1; `biome check`: "Checked 134 files".
- oxlint, every one of its 61 type-aware rules on: 1,414 findings in 127 files; 1,151 of them
  `prefer-readonly-parameter-types`. The mapped ones: 93 (2.1's four rules: 47, 23, 10, 4).
- `biome.jsonc`: 22 rules off in `linter.rules` (style 14, complexity 2, suspicious 2, correctness 3, security 1), three
  of them CSS; three more off in the overrides.

**Brief errors** (also in refactor-plan.md, "Phase 2"): 291 rules for today's TypeScript, not 279; 261 mapped (241 by
Biome's metadata, which reproduces the brief's figure), not 241; 8 accepted losses, not 11 (three have equivalents); 22
unmapped beyond them, not "27 or so"; the twenty nursery rules include a YAML one, so 18 of 19 mapped; 22 rules off, not
23; 96 info-level rules, not 9; the stricter type-aware findings are 93 now, and from Biome's own rules;
`vitest.config.ts` needs `import/no-default-export` off; Biome checks 134 files.

## Done when

The mapping is in `docs/concepts/` and linked from `docs/README.md` (done), and the owner has approved the eight losses,
the 22 unmapped rules, the framework group and the two JSX rules, and answered Q2 and the new type-aware rules.
