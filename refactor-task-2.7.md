# Task 2.7: Biome to CSS and JSON only

Task 2.7 of [refactor-plan.md](refactor-plan.md). Status: planned.

## Summary

Biome stops reading TypeScript. `files.includes` keeps the stylesheet and the root JSON configs only; the rules block
keeps `"preset": "all"` and the three CSS rules it turns off; the TypeScript offs, the nursery block and both overrides
go. The four `biome-ignore` comments in `.ts` files become oxlint comments, and `tests/test_suppressions.py` checks that
each tool's comments are in that tool's files. One measured gap is held first: `organizeImports`, Biome's assist that
`biome check` enforces and no mapping named.

## Design model

- **Measured on 19 November:** `biome check --verbose` lists 137 files: 129 `.ts`, plus `biome.jsonc`, `package.json`,
  `tsconfig.json`, `.jscpd.json`, `.oxfmtrc.jsonc`, `.oxlintrc.json`, `knip.jsonc` and `public/css/site.css`. The eight
  stay Biome's, and it reports nothing on them. `tests/site/tsconfig.json` and `lint/tsconfig.json` were never in its
  set and are not added.
- **Rules kept:** the enabled rules whose examples are CSS (27 on) or JSON (`noEmptyObjectKeys`, `noTopLevelLiterals`,
  the `package.json` rules such as `noDuplicateDependencies` and `useRequiredScripts`). `noHexColors`,
  `noDescendingSpecificity` and `useBaseline` stay off, with their reasons.
- **The mapping holds:** of Biome's 291 TypeScript rules, the 260 mapped are on in `.oxlintrc.json` but `no-bitwise` and
  `complexity` (off by Q2) and `unicorn/prefer-includes` (`typescript/prefer-includes` chosen); the other 31 are 5 house
  rules and 25 accepted losses. Biome's check that a suppression is used is held by
  `reportUnusedDisableDirectives: "error"`.
- **`organizeImports`**, three parts:
  - statement order: oxfmt's `sortImports` with `newlinesBetween: false` changes 0 files on `site/`, `tests/` and
    `lint/*.ts` (72 with the defaults); it sorts across a blank line as Biome does;
  - merging two imports of one module: `import/no-duplicates`, 0 findings;
  - names inside the braces: no oxfmt equivalent; `eslint/sort-imports` with `ignoreDeclarationSort` and `ignoreCase`
    holds one order, which differs from Biome's on 26 lines.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | `files.includes` | `["public/css/**", "*.json", "*.jsonc", "!pnpm-lock.yaml"]`, on one line | No `.ts` by construction; the test parses the list from that line. |
| 2 | Names inside an import's braces | `eslint/sort-imports` (`ignoreDeclarationSort`, `ignoreCase`) on, the 26 lines reordered once | One order, machine-held, drops nothing; which order matters to no reader. Accepting the loss leaves names unordered; a house rule copying Biome's order adds code for an order nothing depends on. Decided by me, 19 November, for the owner to override. |
| 3 | Statement order and merging | oxfmt `sortImports` as an override on `*.ts` with `excludeFiles: ["lint/fixtures/**"]` (seven fixtures differ, and their marked lines must not move); `import/no-duplicates` on | Cost 0. |
| 4 | `javascript` and `overrides` | No `javascript` block exists, none added; both overrides (`site/report.ts`; `tests/**` with `vitest.config.ts`) and `plugins` go | `files.includes` is the one statement of what Biome reads; oxlint holds the per-folder exceptions. |
| 5 | Formatter | Off, as it is; oxfmt formats the CSS and JSON. `.oxfmtrc.jsonc`'s comment "the files Biome checks" names its own set | The sets no longer match. |
| 6 | The four `biome-ignore` lines (`site/json.ts:36`, `site/rows.ts:58`, `site/routes.ts:164`, `site/wording.ts:112`) | Each becomes `// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- <the Biome reason>`, the trailing `oxlint-disable-line … as biome-ignore says above` removed; oxlint run to confirm each still fires | The rule fires on each line. `site.css:317` stays. |
| 7 | `community.browser.test.ts:817` (`numeric-separators-style`) | The literal written as oxlint wants, its suppression dropped, if oxlint then passes | It existed only because Biome wanted the other grouping. |
| 8 | `test_suppressions.py` | `biome_files()` keeps parsing `files.includes`; a test that Biome's files are all `.css`/`.json`/`.jsonc` and include `site.css`, `biome.jsonc`, `package.json`; the oxlint set's test as now; a `biome-ignore` read only in Biome's files, an oxlint or `@ts-` comment only in oxlint's; `OXLINT` takes `-next-line` only; the 4 `noUnsafeTypeAssertion` entries go; the docstring and the two-on-one-line test rewritten with oxlint and TypeScript comments | A stray `biome-ignore` in a `.ts` would suppress nothing. |
| 9 | `lint:site` | Name kept until 2.8 splits the tasks; description "Biome's rules on the stylesheet and the JSON configs (biome.jsonc's files.includes)"; `commands.md` regenerated | The old description becomes false here. |
| 10 | knip, jscpd | Unchanged | knip's Biome plugin reads only the config's place; jscpd does not read Biome. |

## Impact

- **Changed:** `biome.jsonc`; `.oxfmtrc.jsonc`; `.oxlintrc.json` (`import/no-duplicates`, `eslint/sort-imports`, the
  comment citing `biome.jsonc`); `site/json.ts`, `rows.ts`, `routes.ts`, `wording.ts`; the 26 reordered import lines;
  `tests/site/community.browser.test.ts`; `tests/test_suppressions.py`; `tasks.toml`; `docs/reference/commands.md`.
- **Docs:** `docs/concepts/lint-rules.md` (its "until task 2.7" lines; a section on `organizeImports`);
  `docs/lint-false-positives.md`; `CONTRIBUTING.md`'s "Site:" bullet.
- **Out of scope:** the task split, `the-site.md`, `README` (2.8).

## Commits (each passes `mise run check`)

1. **Import order held by oxfmt and oxlint:** `sortImports`, `import/no-duplicates`, `eslint/sort-imports` with the 26
   lines reordered, and lint-rules.md's section.
2. **Biome on CSS and JSON only:** `biome.jsonc`, the four suppressions, `test_suppressions.py`, the `lint:site`
   description and `commands.md`, the docs, the comments in `.oxfmtrc.jsonc` and `.oxlintrc.json`. One commit: removing
   a `biome-ignore` fails Biome while it reads `.ts`, and the new test fails before `biome.jsonc` changes.
3. **The numeric-separator suppression dropped** (decision 7), if oxlint passes without it.

## Done when

`biome check --verbose` lists the eight files and no `.ts`; Biome reports nothing; oxlint and `oxfmt --check` pass;
`tests/test_suppressions.py` holds the new file sets; `mise run check` passes at each commit.

## Reconcile (after the plan's review)

- **Commit order:** Biome's `organizeImports` and `eslint/sort-imports` want opposite orders (`WEEKDAYS, weekday`,
  `TRAITS, type Trait`, `type RowOf, read`), so the reorder fails Biome while it reads `.ts`. Commit 1 adds only
  `sortImports` and `import/no-duplicates`; `eslint/sort-imports` and the reorder go in commit 2, where Biome stops
  reading `.ts`. No temporary Biome setting that a later commit removes.
- **The count:** 25 imports, 26 lines, in linted files (a 26th finding is in an ignored fixture); `--fix` reorders only
  the names inside braces, inline `type` names included.
- **Decision 4:** `biome.jsonc` has no `plugins` key; nothing to remove there.
- **Done when** also: the seven `lint/fixtures` files that `sortImports` would move are unchanged by `oxfmt`
  (`excludeFiles` resolves from the config's folder).
- **Docs:** `docs/concepts/lint-rules.md` lines 17, 150, 185 and 733 ("until task 2.7").
