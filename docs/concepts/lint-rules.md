# Lint rules: Biome to oxlint

Biome lints the site's TypeScript today; Phase 2 of the move to the Oxc toolchain hands that to oxlint (the refactor
plan's task 2.3). This page maps every rule Biome runs on the TypeScript to oxlint's, with the settings to carry, the
rules that have no equivalent and what the owner has yet to decide. `.oxlintrc.json` (task 2.4) is built from it, rule
by rule, with no category turned on, so a rule not listed as mapped is not enabled.

Measured on 19 November 2026, Biome 2.6.3 and oxlint 1.94.0 (the version task 2.4 pins). Pending the owner: the 22
unmapped rules, the 8 accepted losses, the rules for frameworks the site does not use and the type-aware rules new in
oxlint. Q2, the info-level rules, is answered (below).

**In oxlint since task 2.4** (`.oxlintrc.json`, `mise run lint:oxlint`): every mapped rule, with the settings and
exceptions below, as an error: those of Biome's `error` and `warn` rules, the info-level ones as Q2 decides, and the JSX
rules mapped from Biome's `error` and `warn` (the JSX ones Biome reports as `info` stay off). Off: every rule pending
the owner and the rules Biome turns off. **On since task 2.6c:** the 33 type-aware rules new in oxlint (below). Biome
still runs all of its rules beside it until task 2.7. The findings the rules' oxlint versions made on the code were
fixed, or suppressed on their line with the reason in [oxlint's suppressed findings](../lint-false-positives.md).

## Counts

|  | Rules |
| -- | -- |
| Enabled in Biome (`biome rage --linter`) | 484 |
| of which for TypeScript and JavaScript | 431 |
| for today's code (no JSX, no framework) | 291 |
| mapped | 261: 202 by Biome's source metadata, 39 "inspired by", 20 by the rules' docs |
| accepted losses | 8 of the brief's 11 (three have an equivalent) |
| unmapped, decided by the owner (19 November) | 22: 5 become house rules (task 2.6b), 17 accepted losses |
| for JSX (Phase 4's `.tsx`) | 48: 46 mapped; `noSuspiciousSemicolonInJsx` a house rule in 4.2; `noSvgWithoutTitle` held by construction |
| for frameworks the site does not use | 92: 88 accepted losses; Solid's four in 4.2 (three from `eslint-plugin-solid`, `noDuplicatedSpreadProps` a house rule) |
| for CSS, JSON, GraphQL, HTML or YAML | 53, staying with Biome |
| Off in Biome (`biome.jsonc`), staying off | 22: 19 for TypeScript, 3 for CSS; and 3 off in one folder |
| Info-level rules among today's (report, never fail) | 96, 9 of them with findings (Q2) |
| Type-aware oxlint rules with no Biome equivalent | 33, all on (task 2.6c) |

How each figure was taken:

- **Enabled**: the 484 rules `pnpm exec biome rage --linter` lists. A rule is for TypeScript when the examples of
  `biome explain <rule>` are JavaScript, TypeScript or JSX (three more by their description: `noRestrictedTypes`,
  `useFilenamingConvention`, `noEmptySource`); for JSX alone when they are JSX only; for a framework when its "Domains"
  are React, Next, Vue, Qwik, Solid, React Native, Playwright, Drizzle or Turborepo.
- **Mapped by source metadata**: Biome records each rule's ESLint-family source, and `biome migrate eslint` applies it.
  For each of oxlint's 872 rules (`oxlint --rules -f json`), a one-rule ESLint config was migrated, with
  `--include-nursery`, then with `--include-inspired`: the Biome rule it yields is that oxlint rule's equivalent. Every
  oxlint name here is in `--rules`.
- **Mapped by docs**: where Biome's metadata names no ESLint source (its own rules, Clippy's, nursery rules), the oxlint
  rule whose own documentation describes the same check, or cites the same upstream rule.
- **Findings**: `biome lint --reporter=json`, and oxlint on a copy of `site/` and `tests/site/` with `oxlint-tsgolint`
  7.0.2007 (`--type-aware`), default options.

## Settings to port

Biome's options and defaults where oxlint's differ. Without them the bare mapping fails on code that passes Biome.

| oxlint rule | Setting | Why |
| -- | -- | -- |
| `eslint/no-use-before-define` | `{"functions": false, "classes": false, "variables": false}` | `noInvalidUseBeforeDeclaration` ignores function declarations, and a use inside a function of a name declared after it (its examples); `functions: false` alone left 66 findings, each a closure reading a later `const` |
| `eslint/eqeqeq` | `["always", {"null": "ignore"}]` | `noDoubleEquals` allows `== null`; `noEqualsToNull` is off: "== null is null or undefined, both absent" |
| `eslint/max-params` | `{"max": 4}`, error | `useMaxParams`'s default; its `warn` fails under `--error-on-warnings` |
| `typescript/explicit-member-accessibility` | `{"accessibility": "no-public"}` | `useConsistentMemberAccessibility`'s default |
| `vitest/consistent-test-it` | `{"fn": "test", "withinDescribe": "it"}`, in `tests/**` | `biome.jsonc` sets `function: "test"`; Biome's `withinDescribe` default is `it`, which `tests/site/roster.test.ts` uses inside `describe` |
| `eslint/max-nested-callbacks` | `{"max": 5}` | `noExcessiveNestedCallbacks`'s default (ESLint's is 10) |
| `eslint/no-labels` | `{"allowLoop": true}` | `noConfusingLabels` allows a loop's label |
| `eslint/no-else-return` | `{"allowElseIf": false}` | `noUselessElse` reports an `else if` after a return |
| `typescript/ban-ts-comment` | `{"ts-ignore": true, "ts-nocheck": false, "ts-check": false, "ts-expect-error": false}` | `noTsIgnore` refuses `@ts-ignore` alone |
| `unicorn/filename-case` | `{"cases": {"camelCase": true, "kebabCase": true, "snakeCase": true}}` | `useFilenamingConvention`'s default cases |
| `import/extensions` | `["always", {"ignorePackages": true}]` | `useImportExtensions`: the imports name the `.ts` file |
| `eslint/no-unused-vars` | `{"args": "all", "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_", "destructuredArrayIgnorePattern": "^_"}` | `noUnusedFunctionParameters` reports any unused parameter; `noUnusedVariables` passes a name starting with `_` (the bare run found six: `for (const _ of …)`, `{ sort: _order, ...rest }`) |
| `unicorn/no-useless-undefined` | `{"checkArguments": false, "checkArrowFunctionBody": false}` | `noUselessUndefined` reports an initialiser, a default, a `return` or `yield` of `undefined`, not an argument (`isCurrency(undefined)`) or an arrow's body (`() => undefined`) |
| `oxc/no-barrel-file` | `{"threshold": 0}` | `noBarrelFile` refuses any barrel; oxlint's counts modules |

Plugins the mapping needs in `.oxlintrc.json`: `typescript`, `unicorn`, `import`, `oxc`, `vitest`, `jest` (two test
rules oxlint has only as jest's, run on Vitest files too), `node`, `promise`, `react` (`button-has-type`), and for the
JSX rules `jsx-a11y`.

## Per-folder exceptions

From `biome.jsonc`'s `overrides`, each with its reason; oxlint takes them as `overrides` too.

| Files | Rule | Setting | Reason |
| -- | -- | -- | -- |
| `site/report.ts` | `eslint/no-console` | off | "the one place the site writes to the console: what went wrong, with where" |
| `tests/**`, `vitest.config.ts` | `import/no-nodejs-modules` | off | "the tests and their config run in Node" |
| `tests/**`, `vitest.config.ts` | `vitest/consistent-test-it` | above | "a test is test() wherever it is" |
| `tests/**`, `vitest.config.ts` | `useTopLevelRegex` | (none) | "an assertion's pattern, matched once"; moot, the rule is an accepted loss |
| `tests/**`, `vitest.config.ts` | `eslint/no-await-in-loop` | off | Q2: a test drives the page step by step |
| `site/friends.ts`, `site/roster.ts`, `site/sources.ts`, `site/tables.ts` | `eslint/prefer-destructuring` | off | Q2: the findings in the site's code stay until Phase 4 rewrites these files (`tables.ts` is oxlint's alone) |
| `site/db.ts` | `eslint/max-classes-per-file` | off | Q2: the same, `SiteUpdating` and `Sql` |
| `lint/plugin.ts` | `import/no-default-export` | off | new (task 2.5): oxlint loads a JS plugin from its module's default export, as ESLint does |
| `lint/privates.ts` | `import/no-nodejs-modules` | off | new (task 2.6b): `house/privates` reads the module an import names from disk, oxlint showing a rule one file |
| `vitest.config.ts` (and `vite.config.ts`, Phase 3) | `import/no-default-export` | off (owner, 19 November: Vitest reads only a default export) | new: Biome never linted the file (not in `files.includes`); Vitest reads its default export, which the rule refuses; off in `.oxlintrc.json` since 2.4, its comment naming the pending decision |

The house rules (`lint/plugin.ts`, run as `house/<rule>`, each with its fixtures: [Contributing](../../CONTRIBUTING.md),
"House rules") are scoped by `.oxlintrc.json`'s overrides too, by the files' paths from the root, never by a rule
reading the path: a path tested in the rule matches the folders above the checkout as well (task 1.8: a checkout under a
folder named `tests` made the view-import rule lint the site). Each rule, where it is on and the files it spares:

| Rule | On | Off |
| -- | -- | -- |
| `asserts` | everywhere oxlint lints | (none) |
| `buttons` | `site/*.ts` | `site/dom.ts` |
| `classes` | everywhere oxlint lints | `site/dom.ts` |
| `clicks` | everywhere oxlint lints | `site/dom.ts`, `site/swipe.ts` |
| `env` | everywhere oxlint lints | (none) |
| `fetch` | everywhere oxlint lints | `site/net.ts`, `tests/site/app.ts` |
| `formats` | everywhere oxlint lints | `site/ui.ts` |
| `home` | everywhere oxlint lints | (none) |
| `json` | everywhere oxlint lints | (none) |
| `markup` | `site/**` | `site/icons.ts` |
| `privates` | everywhere oxlint lints | (none) |
| `process` | `tests/**`, `vitest.config.ts` | (none) |
| `promises` | everywhere oxlint lints | (none) |
| `routes` | everywhere oxlint lints | `site/routes.ts` |
| `session` | everywhere oxlint lints | `site/kept.ts`, `tests/**` |
| `states` | `site/*.ts` | (none) |
| `statics` | everywhere oxlint lints | (none) |
| `storage` | everywhere oxlint lints | `site/kept.ts`, `tests/**` |
| `tests` | `tests/**` | the entries (`site/main.ts`, `site/review.ts`) loaded by `tests/site/app.ts`, and four helpers (`dismiss`, `dom`, `modal`, `tabs`) imported by `tests/site/page.browser.test.ts`: the rule's options in each file's override |

The house rules moved from Grit to oxlint's plugin, `session` in task 2.5, the twelve others in task 2.6; Biome runs no
plugin.

## Accepted losses

The brief's eleven, checked against the mapping. Eight have no oxlint equivalent and are dropped knowingly, pending the
owner's approval of the final list:

- `noStringCaseMismatch` (correctness, error)
- `noVoidTypeReturn` (correctness, error)
- `noMisleadingReturnType` (nursery, error)
- `useTopLevelRegex` (performance, warn)
- `noShoutyConstants` (style, info)
- `noUnusedTemplateLiteral` (style, warn)
- `noEvolvingTypes` (suspicious, warn)
- `noImplicitAnyLet` (suspicious, error)

Three on the brief's list have an equivalent and are mapped instead: `noFlatMapIdentity` (`unicorn/prefer-array-flat`),
`noParametersOnlyUsedInRecursion` (`oxc/only-used-in-recursion`) and `noMisrefactoredShorthandAssign`
(`oxc/misrefactored-assign-op`), the last two from the same Clippy rules as Biome's.

## Unmapped, decided by the owner

Rules with no oxlint equivalent that are not on the brief's list: dropping one needs the owner's approval (brief, "Stop
and ask before"). Each with what holds the check without it, and the recommendation.

**Answered by the owner, 19 November:** `noThisInStatic`, `noPrivateImports`, `useJsonImportAttributes` and
`useNodeAssertStrict`, which nothing else holds, and `noProcessGlobal` for the tests become house rules of the oxlint
plugin, each with its fixtures, before Biome stops linting TypeScript (task 2.7); the six style rules and the ten held
by tsc, the parser, knip or a mapped rule are accepted losses.

| Biome rule | Level | What holds it |
| -- | -- | -- |
| `complexity/noEmptyTypeParameters` | warn | tsc refuses `<>` with no parameter. Accept. |
| `complexity/noRedundantDefaultExport` | warn | No default export, and `import/no-default-export` (mapped) refuses one. Accept. |
| `complexity/noThisInStatic` | warn | No static member uses `this` today (`Sql`, `Drawing`). Accept. |
| `complexity/noUselessContinue` | info | A style rule with no oxlint twin; `eslint/no-continue` refuses every `continue` (`noContinue` is off). Accept. |
| `complexity/noUselessStringRaw` | info | A style rule with no oxlint twin. Accept. |
| `complexity/useSimpleNumberKeys` | warn | A style rule with no oxlint twin. Accept. |
| `complexity/useSimplifiedLogicExpression` | info | A style rule with no oxlint twin. Accept. |
| `complexity/useWhile` | warn | A style rule (sonarjs `prefer-while`) with no oxlint twin. Accept. |
| `correctness/noPrivateImports` | warn | Keys on `@private`/`@package` JSDoc tags, which no file writes. Accept. |
| `correctness/noProcessGlobal` | info | The site has no `process` (tsconfig `types: []`); tests may use it. Accept. |
| `correctness/noUndeclaredDependencies` | error | knip reports an unlisted dependency (`mise run knip`). Accept. |
| `correctness/useJsonImportAttributes` | info | No module imports JSON: the data is fetched. Accept. |
| `correctness/useSingleJsDocAsterisk` | info | A comment-style rule. Accept. |
| `performance/noDynamicNamespaceImportAccess` | warn | No namespace import, and `import/no-namespace` (mapped) refuses one. Accept. |
| `performance/noReExportAll` | warn | No module re-exports (`export *`); `oxc/no-barrel-file` with `threshold: 0` refuses a barrel. Accept. |
| `style/noEnum` | warn | tsc's `erasableSyntaxOnly` refuses an enum. Accept. |
| `style/noInlineStyles` | info | The CSP refuses inline styles at run time; Phase 4 adds a rule refusing a string `style` (row 4.2). Accept, held by 4.2. |
| `style/useNodeAssertStrict` | warn | No file imports `node:assert`; tests assert with Vitest's `expect`. Accept. |
| `suspicious/noDuplicateParameters` | error | A syntax error in a module (every file here is one): oxc's parser and tsc refuse it. Accept. |
| `suspicious/noOctalEscape` | warn | A syntax error in strict mode, which every module is: the parser refuses it. Accept. |
| `suspicious/noRedundantUseStrict` | warn | Every file is a module, so strict already; no file says `"use strict"`. Accept. |
| `suspicious/useStrictMode` | warn | The same: modules are strict. Accept. |

## Reported as information by Biome (Q2)

`"preset": "all"` keeps each rule's default severity, and 96 of the rules above are `info`: they report and never fail
`biome check --error-on-warnings`. oxlint has no info level, so each is an error or off. Nine have findings, 43 in all
(Biome checks 134 files); the other 87 have none.

**Answered by the owner, 19 November (Q2: B):** rule by rule, each enforced or off, none left reporting without failing.
In oxlint (Biome keeps its settings until task 2.7):

- `noBitwiseOperators` (`eslint/no-bitwise`): off everywhere; every use is a deliberate hash or random number
  (`site/ink.ts`, `tests/site/roster.test.ts`).
- `noAwaitInLoops` (`eslint/no-await-in-loop`): an error in `site/` (no finding), off in `tests/**`, which drive the
  page step by step.
- `noExcessiveCognitiveComplexity` (`eslint/complexity`, another measure): off; fixing it means reworking six of the
  site's functions, and Phase 2 changes no code.
- `useDestructuring`, `useDomQuerySelector`, `useShorthandAssign`, `useNamedCaptureGroup`,
  `useConsistentBuiltinInstantiation` and `noExcessiveClassesPerFile`: errors; the findings in the tests were fixed (one
  suppressed: `Date()` in `app.browser.test.ts` is one of the forms of the clock the test reads); those in the site's
  code stay, the rule off for those files until Phase 4 (Per-folder exceptions).
- The other 87: errors, with the settings above. Their oxlint versions found what Biome's do not (16, all in task 2.4's
  fixes or suppressions): `no-useless-undefined` 9 (arguments and arrow bodies, which Biome does not check: a setting),
  `jest/no-done-callback` 4 (`test.for`, suppressed), `prefer-response-static-json` 2, `prefer-template` 1,
  `numeric-separators-style` 1, `no-process-env` 1 (`vitest.config.ts`, new to linting).

| Biome rule | Findings: site / tests | Where | oxlint | oxlint's findings: all (site) | Options |
| -- | -- | -- | -- | -- | -- |
| `suspicious/noBitwiseOperators` | 8 / 11 | the hash and the random numbers of `site/ink.ts`, and `tests/site/roster.test.ts` | `eslint/no-bitwise` | 19 (8) | site only: 8; everywhere: 19; off |
| `performance/noAwaitInLoops` | 0 / 7 | tests that drive the page step by step | `eslint/no-await-in-loop` | 13 (0) | site only: 0; everywhere: 7; off |
| `complexity/noExcessiveCognitiveComplexity` | 6 / 0 | `site/roster.ts` 3, `site/months.ts` 2, `site/festivals.ts` 1 | `eslint/complexity` | 3 (1) | site only: 6; everywhere: 6; off |
| `style/useDestructuring` | 3 / 2 | `site/` 3, tests 2 | `eslint/prefer-destructuring` | 6 (4) | site only: 3; everywhere: 5; off |
| `style/useDomQuerySelector` | 0 / 2 | tests | `unicorn/prefer-query-selector` | 2 (0) | site only: 0; everywhere: 2; off |
| `style/useShorthandAssign` | 0 / 1 | a test | `eslint/operator-assignment` | 1 (0) | site only: 0; everywhere: 1; off |
| `style/useNamedCaptureGroup` | 0 / 1 | a test | `eslint/prefer-named-capture-group` | 1 (0) | site only: 0; everywhere: 1; off |
| `style/useConsistentBuiltinInstantiation` | 0 / 1 | `Date()` without `new` in `app.browser.test.ts:97`, which the test means (it checks the clock); oxlint's `unicorn/new-for-builtins` reports it (1) | `eslint/no-new-wrappers` | 0 (0) | site only: 0; everywhere: 1; off |
| `style/noExcessiveClassesPerFile` | 1 / 0 | `site/db.ts` (`SiteUpdating`, `Sql`) | `eslint/max-classes-per-file` | 1 (1) | site only: 1; everywhere: 1; off |

The options: enforce in `site/` only (an override turning the rule off in `tests/**`), enforce everywhere, or off; the
counts are the findings to fix or suppress first, by Biome's count. oxlint's versions count differently:
`no-await-in-loop` reports 13 where Biome reports 7, and `complexity` measures cyclomatic, not cognitive, complexity (3
findings over ESLint's default of 20; Biome's limit is 15).

## New in oxlint: type-aware rules Biome has no equivalent of

oxlint has 61 type-aware rules; 25 are mapped above. Of the rest, `dot-notation` stays off (`useLiteralKeys` is off),
and `only-throw-error` and `require-await` are the type-aware forms of mapped rules. The 33 below are new. Adding one
drops nothing, but it changes the gate. **Decided by the owner, 19 November:** all 33 on, in task 2.6c, their findings
fixed: `no-confusing-void-expression` with `ignoreArrowShorthand` (an arrow's short body is how a handler is written
here: no finding); `prefer-readonly-parameter-types` with `treatMethodsAsReadonly`, `ignoreInferredTypes` (an inferred
parameter takes its type from a declaration the rule checks) and `allow` for the DOM, Node and sql.js types the site
cannot make read-only, the site's own record types made read-only at their definitions. The earlier recommendation was
Recommended: on for the ones with no finding (they cost nothing), off for `prefer-readonly-parameter-types`, and the
others rule by rule with the findings of task 2.4.

**State: on since task 2.6c**, each as an error, with zero findings
([refactor-task-2.6c.md](../../refactor-task-2.6c.md)). Beyond the settings above, `prefer-readonly-parameter-types`'s
`allow` also names Leaflet's `LayerGroup`, GeoJSON's `Feature` and the syntax-tree types of oxlint's plugin API the
house rules take (none of them the site's own), and `return-await` is `error-handling-correctness-only`: a function made
async that hands a promise on awaits it, as Biome's `useAwait` and `require-await` want an await in it, which the
default `in-try-catch` refuses. One line keeps a suppression (`tests/site/main.browser.test.ts`,
[oxlint's suppressed findings](../lint-false-positives.md)).

| oxlint rule | Findings: all (site / tests) |  |
| -- | -- | -- |
| `typescript/prefer-readonly-parameter-types` | 1151 (736 / 415) | nearly every parameter |
| `typescript/no-confusing-void-expression` | 82 (60 / 22) | each an arrow's short body that returns a `void` call |
| `typescript/promise-function-async` | 41 (8 / 33) | a function that returns a promise without `async` (`site/net.ts`, `site/db.ts`, `tests/site/app.ts`) |
| `typescript/no-unsafe-assignment` | 21 (0 / 21) | 16 of them in `recipes.browser.test.ts` |
| `typescript/strict-void-return` | 9 (2 / 7) |  |
| `typescript/consistent-return` | 4 (2 / 2) |  |
| `typescript/no-redundant-type-constituents` | 2 (1 / 1) |  |
| `typescript/no-unsafe-argument` | 2 (1 / 1) |  |
| `typescript/no-unsafe-member-access` | 2 (0 / 2) |  |
| `typescript/prefer-promise-reject-errors` | 2 (0 / 2) |  |
| `typescript/restrict-template-expressions` | 2 (2 / 0) |  |
| `typescript/no-misused-spread` | 1 (1 / 0) |  |
| `typescript/no-unnecessary-boolean-literal-compare` | 1 (1 / 0) |  |
| `typescript/no-unsafe-call` | 1 (0 / 1) |  |

No finding today (19): `no-array-delete`, `no-duplicate-type-constituents`, `no-generated-empty-object-type`,
`no-implied-eval`, `no-meaningless-void-operator`, `no-unnecessary-qualifier`, `no-unnecessary-type-arguments`,
`no-unnecessary-type-assertion`, `no-unnecessary-type-parameters`, `no-unsafe-enum-assignment`,
`no-unsafe-enum-comparison`, `no-unsafe-unary-minus`, `no-useless-default-assignment`,
`non-nullable-type-assertion-style`, `prefer-return-this-type`, `related-getter-setter-pairs`, `return-await`,
`unbound-method`, `use-unknown-in-catch-callback-variable`.

**Stricter than Biome's.** Mapped rules whose oxlint versions find what Biome's pass (task 2.4 fixed each or suppressed
it with its reason; at 2.4's first run with the settings above, 92 of them, `no-unsafe-return` 2 not 3):
`strict-boolean-expressions` 47, `no-unnecessary-condition` 23, `no-base-to-string` 10, `no-unnecessary-type-conversion`
4, `no-unsafe-type-assertion` 4, `no-unsafe-return` 3, `no-misused-promises` 1, `prefer-nullish-coalescing` 1, 93 in
all. The four of `no-unsafe-type-assertion` are the lines Biome's suppressions cover. These are not new rules:
`strict-boolean-expressions`, `no-unnecessary-condition` and `no-base-to-string` are Biome's nursery
`useStrictBooleanExpressions`, `noUnnecessaryConditions` and `noBaseToString`.

## Off in Biome, staying off

`biome.jsonc` turns these off, each with its reason; the reason carries over, and none is enabled in oxlint.

| Biome rule | oxlint equivalent | Reason |
| -- | -- | -- |
| `style/noTernary` | `eslint/no-ternary` | a conditional value is a ternary here, not a statement |
| `style/noNestedTernary` | `eslint/no-nested-ternary` | the same, for a choice between more than two values |
| `style/useNamingConvention` | (none) | a row's keys are its database columns (start_date, card_pass) |
| `style/noMagicNumbers` | `eslint/no-magic-numbers` | geometry, timings and limits are named where they mean something |
| `style/useBlockStatements` | `eslint/curly` | a guard is one line: if (!x) return; |
| `style/useSingleVarDeclarator` | `eslint/one-var` | values computed together are declared together |
| `style/noIncrementDecrement` | `eslint/no-plusplus` | (no reason given in `biome.jsonc`) |
| `style/noContinue` | `eslint/no-continue` | (no reason given in `biome.jsonc`) |
| `style/useExportsLast` | `import/exports-last` | an export sits beside the code it belongs to |
| `style/noHexColors` | (CSS: stays with Biome) | the design tokens are hex colours |
| `style/noExcessiveLinesPerFile` | `eslint/max-lines` | a module is one concern however long; states.ts is generated |
| `style/noDescendingSpecificity` | (CSS: stays with Biome) | site.css is ordered by component; specificity decides between weights |
| `style/useDefaultSwitchClause` | `eslint/default-case` | a switch over a union names every case (useExhaustiveSwitchCases) |
| `style/useConsistentTypeDefinitions` | `typescript/consistent-type-definitions` | a shape that must fit a Record is a type: an interface has no index signature |
| `complexity/useLiteralKeys` | `eslint/no-useless-computed-key`<br>`typescript/dot-notation` | tsconfig's noPropertyAccessFromIndexSignature wants dataset['nav'] |
| `complexity/noExcessiveLinesPerFunction` | `eslint/max-lines-per-function` | a view is one closure over its state; complexity is bounded instead |
| `suspicious/noEqualsToNull` | `eslint/no-eq-null` | == null is null or undefined, both absent |
| `suspicious/useBaseline` | (CSS: stays with Biome) | newer CSS is progressive enhancement: backdrop-filter, @starting-style |
| `correctness/noUndeclaredVariables` | `eslint/no-undef` | tsc rejects an undeclared name, and knows globals.d.ts's |
| `correctness/noUnresolvedImports` | `import/named` | tsc resolves every import, against the types as well |
| `correctness/useQwikValidLexicalScope` | (none) | no Qwik here |
| `security/noSecrets` | (none) | the site holds no secret; its long strings are SVG and selectors |

## The mapping

Every rule for today's TypeScript. **Level** is Biome's: `error` and `warn` fail the check, `info` only reports (Q2).
**Fit**: `source`, Biome's metadata names the oxlint rule's upstream as its source; `inspired`, Biome's metadata says
"inspired by" (the note says how they differ, where they do); `docs`, matched by the two rules' documentation.

### a11y

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noPositiveTabindex` | error | `jsx_a11y/tabindex-no-positive` | source | mapped |
| `useButtonType` | error | `react/button-has-type` | source | mapped: `createElement` only; a button made by `h()` is held by `house/buttons` (`lint/buttons.ts`) |

### complexity

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noAdjacentSpacesInRegex` | warn | `eslint/no-regex-spaces` | source | mapped |
| `noArguments` | warn | `eslint/prefer-rest-params` | source | mapped |
| `noBannedTypes` | warn | `typescript/ban-types` | source | mapped |
| `noCommaOperator` | warn | `eslint/no-sequences` | source | mapped |
| `noDivRegex` | info | `eslint/no-div-regex` | source | mapped |
| `noEmptyTypeParameters` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noExcessiveCognitiveComplexity` | info | `eslint/complexity` | inspired | mapped: another measure: cyclomatic, not cognitive (Q2) |
| `noExcessiveNestedCallbacks` | info | `eslint/max-nested-callbacks` | source | mapped: `{"max": 5}`, Biome's default (ESLint's is 10) |
| `noExcessiveNestedTestSuites` | info | `vitest/max-nested-describe` | source | mapped |
| `noExtraBooleanCast` | info | `eslint/no-extra-boolean-cast` | source | mapped |
| `noFlatMapIdentity` | info | `unicorn/prefer-array-flat` | docs | mapped: broader: also `reduce`/`concat` flattening; on the brief's loss list, but mappable |
| `noForEach` | warn | `unicorn/no-array-for-each` | source | mapped |
| `noImplicitCoercions` | info | `eslint/no-implicit-coercion` | source | mapped |
| `noRedundantDefaultExport` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noStaticOnlyClass` | warn | `typescript/no-extraneous-class`<br>`unicorn/no-static-only-class` | source | mapped |
| `noThisInStatic` | warn | (none) |  | house rule `house/statics` |
| `noUnnecessaryTemplateExpression` | info | `typescript/no-unnecessary-template-expression` | inspired | mapped: type-aware |
| `noUselessCatch` | info | `eslint/no-useless-catch` | source | mapped |
| `noUselessCatchBinding` | info | `unicorn/prefer-optional-catch-binding` | docs | mapped |
| `noUselessConstructor` | info | `eslint/no-useless-constructor` | source | mapped |
| `noUselessContinue` | info | (none) |  | accepted loss (owner, 19 November) |
| `noUselessEmptyExport` | info | `typescript/no-useless-empty-export` | source | mapped |
| `noUselessEscapeInRegex` | info | `eslint/no-useless-escape` | source | mapped |
| `noUselessLabel` | info | `eslint/no-extra-label` | source | mapped |
| `noUselessLoneBlockStatements` | info | `eslint/no-lone-blocks` | source | mapped |
| `noUselessRename` | info | `eslint/no-useless-rename` | source | mapped |
| `noUselessReturn` | info | `eslint/no-useless-return` | inspired | mapped |
| `noUselessStringConcat` | info | `eslint/no-useless-concat` | source | mapped |
| `noUselessStringRaw` | info | (none) |  | accepted loss (owner, 19 November) |
| `noUselessSwitchCase` | info | `unicorn/no-useless-switch-case` | source | mapped |
| `noUselessTernary` | info | `eslint/no-unneeded-ternary` | source | mapped |
| `noUselessThisAlias` | info | `typescript/no-this-alias` | inspired | mapped |
| `noUselessTypeConstraint` | info | `typescript/no-unnecessary-type-constraint` | source | mapped |
| `noUselessUndefined` | info | `unicorn/no-useless-undefined` | source | mapped |
| `noUselessUndefinedInitialization` | info | `unicorn/no-useless-undefined` | docs | mapped: broader (also `return undefined`, arguments); the same oxlint rule as `noUselessUndefined` |
| `noVoid` | warn | `eslint/no-void` | source | mapped |
| `useArrayFind` | info | `typescript/prefer-find` | source | mapped: type-aware |
| `useArraySome` | info | `unicorn/prefer-array-some` | inspired | mapped |
| `useArrowFunction` | warn | `eslint/prefer-arrow-callback` | inspired | mapped: narrower: callbacks only |
| `useDateNow` | warn | `unicorn/prefer-date-now` | source | mapped |
| `useFlatMap` | info | `unicorn/prefer-array-flat-map` | source | mapped |
| `useIndexOf` | info | `unicorn/prefer-array-index-of` | source | mapped |
| `useMathMinMax` | warn | `unicorn/prefer-math-min-max` | source | mapped |
| `useMaxParams` | warn | `eslint/max-params` | source | mapped: `{"max": 4}`, Biome's default; `warn` in Biome, an error under `--error-on-warnings` |
| `useNumericLiterals` | warn | `eslint/prefer-numeric-literals` | source | mapped |
| `useOptionalChain` | warn | `typescript/prefer-optional-chain` | source | mapped: type-aware |
| `useRegexLiterals` | warn | `eslint/prefer-regex-literals` | source | mapped |
| `useRegexpTest` | info | `unicorn/prefer-regexp-test` | source | mapped |
| `useSimpleNumberKeys` | warn | (none) |  | accepted loss (owner, 19 November) |
| `useSimplifiedLogicExpression` | info | (none) |  | accepted loss (owner, 19 November) |
| `useWhile` | warn | (none) |  | accepted loss (owner, 19 November) |

### correctness

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noConstantCondition` | error | `eslint/no-constant-condition` | source | mapped |
| `noConstantMathMinMaxClamp` | error | `oxc/bad-min-max-func` | docs | mapped: Clippy's `min_max`: the same clamp check |
| `noConstAssign` | error | `eslint/no-const-assign` | source | mapped |
| `noConstructorReturn` | error | `eslint/no-constructor-return` | source | mapped |
| `noEmptyCharacterClassInRegex` | error | `eslint/no-empty-character-class` | source | mapped |
| `noEmptyPattern` | error | `eslint/no-empty-pattern` | source | mapped |
| `noGlobalDirnameFilename` | info | `unicorn/prefer-module` | inspired | mapped: broader: all CommonJS forms and `"use strict"` |
| `noGlobalObjectCalls` | error | `eslint/no-obj-calls` | source | mapped |
| `noInnerDeclarations` | error | `eslint/no-inner-declarations` | source | mapped |
| `noInvalidBuiltinInstantiation` | error | `eslint/no-new-native-nonconstructor`<br>`unicorn/new-for-builtins` | source | mapped |
| `noInvalidConstructorSuper` | error | `eslint/constructor-super` | source | mapped |
| `noInvalidUseBeforeDeclaration` | error | `eslint/no-use-before-define` | source | mapped: `{"functions": false}`: Biome ignores function declarations |
| `noNodejsModules` | warn | `import/no-nodejs-modules` | source | mapped: off in `tests/**` and `vitest.config.ts` |
| `noNonoctalDecimalEscape` | error | `eslint/no-nonoctal-decimal-escape` | source | mapped |
| `noPrecisionLoss` | error | `eslint/no-loss-of-precision` | source | mapped |
| `noPrivateImports` | warn | (none) |  | house rule `house/privates` |
| `noProcessGlobal` | info | (none) |  | house rule `house/process` |
| `noSelfAssign` | error | `eslint/no-self-assign` | source | mapped |
| `noSetterReturn` | error | `eslint/no-setter-return` | source | mapped |
| `noStringCaseMismatch` | error | (none) |  | accepted loss |
| `noSwitchDeclarations` | error | `eslint/no-case-declarations` | source | mapped |
| `noUndeclaredDependencies` | error | (none) |  | accepted loss (owner, 19 November) |
| `noUnreachable` | error | `eslint/no-unreachable` | source | mapped |
| `noUnreachableSuper` | error | `eslint/no-this-before-super` | source | mapped |
| `noUnsafeFinally` | error | `eslint/no-unsafe-finally` | source | mapped |
| `noUnsafeOptionalChaining` | error | `eslint/no-unsafe-optional-chaining` | source | mapped |
| `noUnusedFunctionParameters` | warn | `eslint/no-unused-vars` | docs | mapped: `args: "all"`, `argsIgnorePattern: "^_"`, checked against a bare run in 2.4; tsc's `noUnusedParameters` holds it too |
| `noUnusedImports` | warn | `eslint/no-unused-vars` | docs | mapped: imports are variables to it; tsc's `noUnusedLocals` holds it too |
| `noUnusedInstantiation` | error | `eslint/no-new` | source | mapped |
| `noUnusedLabels` | warn | `eslint/no-unused-labels` | source | mapped |
| `noUnusedPrivateClassMembers` | warn | `eslint/no-unused-private-class-members` | inspired | mapped: narrower: `#private` only, not TypeScript's `private` |
| `noUnusedVariables` | warn | `eslint/no-unused-vars` | source | mapped |
| `noVoidElementsWithChildren` | error | `react/void-dom-elements-no-children` | source | mapped |
| `noVoidTypeReturn` | error | (none) |  | accepted loss |
| `useImportExtensions` | warn | `import/extensions` | inspired | mapped: the imports name `.ts` files (`rewriteRelativeImportExtensions`): `["always", {"ignorePackages": true}]` |
| `useIsNan` | error | `eslint/use-isnan` | source | mapped |
| `useJsonImportAttributes` | info | (none) |  | house rule `house/json` |
| `useParseIntRadix` | info | `eslint/radix` | source | mapped |
| `useSingleJsDocAsterisk` | info | (none) |  | accepted loss (owner, 19 November) |
| `useValidForDirection` | error | `eslint/for-direction` | source | mapped |
| `useValidTypeof` | error | `eslint/valid-typeof` | source | mapped |
| `useYield` | error | `eslint/require-yield` | source | mapped |

### nursery

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noBaseToString` | error | `typescript/no-base-to-string` | source | mapped: type-aware; stricter than Biome's (below) |
| `noFloatingPromises` | error | `typescript/no-floating-promises` | source | mapped: type-aware |
| `noMisleadingReturnType` | error | (none) |  | accepted loss |
| `noMisusedPromises` | error | `typescript/no-misused-promises` | source | mapped: type-aware |
| `noObjectConstructor` | error | `eslint/no-object-constructor` | source | mapped |
| `noUnmodifiedLoopCondition` | error | `eslint/no-unmodified-loop-condition` | source | mapped |
| `noUnsafePlusOperands` | error | `typescript/restrict-plus-operands` | source | mapped: type-aware |
| `noUnsafeReturn` | error | `typescript/no-unsafe-return` | source | mapped: type-aware |
| `noUnsafeTypeAssertion` | error | `typescript/no-unsafe-type-assertion` | docs | mapped: type-aware |
| `noUselessAssignment` | error | `eslint/no-useless-assignment` | source | mapped |
| `noUselessCall` | error | `eslint/no-useless-call` | source | mapped |
| `noUselessTypeConversion` | error | `typescript/no-unnecessary-type-conversion` | source | mapped: type-aware |
| `useAwaitThenable` | error | `typescript/await-thenable` | docs | mapped: type-aware |
| `useExhaustiveSwitchCases` | error | `typescript/switch-exhaustiveness-check` | source | mapped: type-aware |
| `useIncludes` | error | `typescript/prefer-includes`<br>`unicorn/prefer-includes` | inspired | mapped: one of the two (`unicorn/prefer-includes` is not type-aware) |
| `useNullishCoalescing` | error | `typescript/prefer-nullish-coalescing` | inspired | mapped: type-aware |
| `useRegexpExec` | error | `typescript/prefer-regexp-exec` | source | mapped: type-aware |
| `useStrictBooleanExpressions` | error | `typescript/strict-boolean-expressions` | inspired | mapped: type-aware; stricter than Biome's (below) |
| `useStringStartsEndsWith` | error | `typescript/prefer-string-starts-ends-with` | inspired | mapped: type-aware |

### performance

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noAccumulatingSpread` | warn | `oxc/no-accumulating-spread` | docs | mapped |
| `noAwaitInLoops` | info | `eslint/no-await-in-loop` | source | mapped: Q2 |
| `noBarrelFile` | warn | `oxc/no-barrel-file` | docs | mapped: oxlint counts modules: set `threshold: 0` to refuse any barrel, as Biome does |
| `noDelete` | warn | `eslint/no-delete-var` | source | mapped |
| `noDynamicNamespaceImportAccess` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noNamespaceImport` | warn | `import/no-namespace` | docs | mapped: both from eslint-plugin-barrel-files' `avoid-namespace-import` |
| `noReExportAll` | warn | (none) |  | accepted loss (owner, 19 November) |
| `useDomNodeTextContent` | warn | `unicorn/prefer-dom-node-text-content` | source | mapped |
| `useTopLevelRegex` | warn | (none) |  | accepted loss |

### security

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noGlobalEval` | error | `eslint/no-eval` | source | mapped |
| `noScriptUrl` | error | `eslint/no-script-url`<br>`react/jsx-no-script-url` | source | mapped |

### style

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noCommonJs` | warn | `import/no-commonjs`<br>`typescript/no-require-imports`<br>`typescript/no-var-requires` | source | mapped |
| `noDefaultExport` | warn | `import/no-default-export` | source | mapped |
| `noDoneCallback` | info | `jest/no-done-callback` | source | mapped |
| `noEnum` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noExcessiveClassesPerFile` | info | `eslint/max-classes-per-file` | source | mapped: Q2; `{"max": 1}`, both defaults |
| `noExportedImports` | info | `unicorn/prefer-export-from` | docs | mapped |
| `noInferrableTypes` | info | `typescript/no-inferrable-types` | source | mapped |
| `noInlineStyles` | info | (none) |  | accepted loss (owner, 19 November) |
| `noMultiAssign` | info | `eslint/no-multi-assign` | inspired | mapped |
| `noMultilineString` | info | `eslint/no-multi-str` | source | mapped |
| `noNamespace` | warn | `typescript/no-namespace` | source | mapped |
| `noNegationElse` | info | `eslint/no-negated-condition`<br>`unicorn/no-negated-condition` | source | mapped |
| `noNonNullAssertion` | warn | `typescript/no-non-null-assertion` | source | mapped |
| `noParameterAssign` | warn | `eslint/no-param-reassign` | source | mapped |
| `noParameterProperties` | warn | `typescript/parameter-properties` | inspired | mapped |
| `noProcessEnv` | info | `node/no-process-env` | source | mapped: `node/no-process-env` reads the global `process` alone; `house/env` refuses `process.env` through a `process` imported from `node:process` (as `house/process` has the tests do), so the two read both, as Biome's does |
| `noRestrictedGlobals` | warn | `eslint/no-restricted-globals` | source | mapped: restricts nothing without options, in both |
| `noRestrictedImports` | warn | `eslint/no-restricted-imports` | source | mapped: restricts nothing without options, in both |
| `noRestrictedTypes` | warn | `typescript/no-restricted-types` | source | mapped: restricts nothing without options, in both |
| `noShoutyConstants` | info | (none) |  | accepted loss |
| `noSubstr` | info | `unicorn/prefer-string-slice` | source | mapped |
| `noUnusedTemplateLiteral` | warn | (none) |  | accepted loss |
| `noUselessElse` | info | `eslint/no-else-return` | inspired | mapped: `allowElseIf: false`, as Biome reports an `else if` after a return |
| `noYodaExpression` | info | `eslint/yoda` | source | mapped |
| `useArrayLiterals` | info | `eslint/no-array-constructor` | source | mapped |
| `useAsConstAssertion` | info | `typescript/prefer-as-const` | source | mapped |
| `useAtIndex` | info | `unicorn/prefer-at` | inspired | mapped |
| `useCollapsedElseIf` | info | `eslint/no-lonely-if` | source | mapped |
| `useCollapsedIf` | info | `unicorn/no-lonely-if` | source | mapped |
| `useConsistentArrayType` | info | `typescript/array-type` | source | mapped |
| `useConsistentArrowReturn` | info | `eslint/arrow-body-style` | source | mapped |
| `useConsistentBuiltinInstantiation` | info | `eslint/no-new-wrappers` | source | mapped: Q2; Biome also wants `new Date()` for `Date()`, which oxlint's `unicorn/new-for-builtins` (mapped from `noInvalidBuiltinInstantiation`) reports |
| `useConsistentEnumValueType` | info | `typescript/no-mixed-enums` | source | mapped: type-aware |
| `useConsistentMemberAccessibility` | info | `typescript/explicit-member-accessibility` | source | mapped: `{"accessibility": "no-public"}`, Biome's default |
| `useConsistentMethodSignatures` | info | `typescript/method-signature-style` | source | mapped |
| `useConsistentObjectDefinitions` | warn | `eslint/object-shorthand` | inspired | mapped |
| `useConsistentTestIt` | error (tests) | `vitest/consistent-test-it` | inspired | mapped: in `tests/**`: `{"fn": "test", "withinDescribe": "it"}` (Biome's `withinDescribe` default; `roster.test.ts` uses `it` inside `describe`) |
| `useConst` | warn | `eslint/prefer-const` | source | mapped |
| `useDefaultParameterLast` | warn | `eslint/default-param-last` | source | mapped |
| `useDestructuring` | info | `eslint/prefer-destructuring` | inspired | mapped: Q2 |
| `useDomQuerySelector` | info | `unicorn/prefer-query-selector` | inspired | mapped: Q2 |
| `useEnumInitializers` | warn | `typescript/prefer-enum-initializers` | source | mapped |
| `useErrorCause` | info | `eslint/preserve-caught-error` | source | mapped |
| `useExplicitLengthCheck` | info | `unicorn/explicit-length-check` | inspired | mapped |
| `useExponentiationOperator` | info | `eslint/prefer-exponentiation-operator` | source | mapped |
| `useExportType` | warn | `typescript/consistent-type-exports` | inspired | mapped: type-aware |
| `useFilenamingConvention` | info | `unicorn/filename-case` | inspired | mapped: Biome allows camelCase, kebab-case, snake_case or the export's name: `{"cases": {"camelCase": true, "kebabCase": true, "snakeCase": true}}` |
| `useForOf` | info | `typescript/prefer-for-of` | source | mapped |
| `useGlobalThis` | warn | `unicorn/prefer-global-this` | source | mapped |
| `useGroupedAccessorPairs` | info | `eslint/grouped-accessor-pairs` | source | mapped |
| `useImportsFirst` | info | `import/first` | source | mapped |
| `useImportType` | warn | `typescript/consistent-type-imports` | inspired | mapped |
| `useLiteralEnumMembers` | warn | `typescript/prefer-literal-enum-member` | source | mapped |
| `useNamedCaptureGroup` | info | `eslint/prefer-named-capture-group` | source | mapped: Q2 |
| `useNodeAssertStrict` | warn | (none) |  | house rule `house/asserts` |
| `useNodejsImportProtocol` | info | `unicorn/prefer-node-protocol` | source | mapped |
| `useNumberNamespace` | info | `unicorn/prefer-number-properties` | source | mapped |
| `useNumericSeparators` | info | `unicorn/numeric-separators-style` | source | mapped |
| `useObjectSpread` | info | `eslint/prefer-object-spread` | source | mapped |
| `useReadonlyClassProperties` | info | `typescript/prefer-readonly` | source | mapped: type-aware |
| `useReduceTypeParameter` | info | `typescript/prefer-reduce-type-parameter` | inspired | mapped: type-aware |
| `useShorthandAssign` | info | `eslint/operator-assignment` | source | mapped: Q2 |
| `useShorthandFunctionType` | info | `typescript/prefer-function-type` | source | mapped |
| `useSpreadOverApply` | info | `eslint/prefer-spread` | source | mapped |
| `useSymbolDescription` | info | `eslint/symbol-description` | source | mapped |
| `useTemplate` | info | `eslint/prefer-template` | source | mapped |
| `useTestHooksInOrder` | info | `vitest/prefer-hooks-in-order` | source | mapped |
| `useTestHooksOnTop` | info | `vitest/prefer-hooks-on-top` | source | mapped |
| `useThisInClassMethods` | info | `eslint/class-methods-use-this` | source | mapped |
| `useThrowNewError` | info | `unicorn/throw-new-error` | source | mapped |
| `useThrowOnlyError` | warn | `eslint/no-throw-literal` | inspired | mapped: `eslint/no-throw-literal`; `typescript/only-throw-error` is its type-aware form |
| `useTrimStartEnd` | info | `unicorn/prefer-string-trim-start-end` | source | mapped |
| `useUnicodeRegex` | info | `eslint/require-unicode-regexp` | source | mapped |
| `useUnifiedTypeSignatures` | info | `typescript/unified-signatures` | source | mapped |
| `useVarsOnTop` | info | `eslint/vars-on-top` | source | mapped |

### suspicious

| Biome rule | Level | oxlint | Fit | Status, note |
| -- | -- | -- | -- | -- |
| `noAlert` | info | `eslint/no-alert` | source | mapped |
| `noApproximativeNumericConstant` | warn | `oxc/approx-constant` | docs | mapped: both from Clippy's `approx_constant` |
| `noAssignInExpressions` | error | `eslint/no-cond-assign` | inspired | mapped: narrower: conditions only (`eslint/no-return-assign` is mapped from `noReturnAssign`) |
| `noAsyncPromiseExecutor` | error | `eslint/no-async-promise-executor` | source | mapped |
| `noBitwiseOperators` | info | `eslint/no-bitwise` | source | mapped: Q2 |
| `noCatchAssign` | warn | `eslint/no-ex-assign` | source | mapped |
| `noClassAssign` | error | `eslint/no-class-assign` | source | mapped |
| `noCompareNegZero` | error | `eslint/no-compare-neg-zero` | source | mapped |
| `noConditionalExpect` | warn | `vitest/no-conditional-expect` | source | mapped |
| `noConfusingLabels` | warn | `eslint/no-labels` | inspired | mapped: broader: every label; Biome allows labels on loops, so `{"allowLoop": true}` |
| `noConfusingVoidType` | warn | `typescript/no-invalid-void-type` | source | mapped |
| `noConsole` | warn | `eslint/no-console` | source | mapped: off in `site/report.ts` |
| `noConstantBinaryExpressions` | info | `eslint/no-constant-binary-expression` | source | mapped |
| `noConstEnum` | warn | `oxc/no-const-enum` | docs | mapped: tsc's `erasableSyntaxOnly` refuses it too |
| `noControlCharactersInRegex` | error | `eslint/no-control-regex` | source | mapped |
| `noDebugger` | error | `eslint/no-debugger` | source | mapped |
| `noDeprecatedImports` | warn | `typescript/no-deprecated` | inspired | mapped: type-aware; broader (every use of a deprecated name) |
| `noDocumentCookie` | warn | `unicorn/no-document-cookie` | source | mapped |
| `noDoubleEquals` | error | `eslint/eqeqeq` | source | mapped: `["always", {"null": "ignore"}]`: `== null` stays (`noEqualsToNull` is off) |
| `noDuplicateCase` | error | `eslint/no-duplicate-case` | source | mapped |
| `noDuplicateClassMembers` | error | `eslint/no-dupe-class-members` | source | mapped |
| `noDuplicateElseIf` | error | `eslint/no-dupe-else-if` | source | mapped |
| `noDuplicateEnumValues` | warn | `typescript/no-duplicate-enum-values` | source | mapped |
| `noDuplicateObjectKeys` | error | `eslint/no-dupe-keys` | source | mapped |
| `noDuplicateParameters` | error | (none) |  | accepted loss (owner, 19 November) |
| `noDuplicateTestHooks` | error | `vitest/no-duplicate-hooks` | inspired | mapped |
| `noEmptyBlockStatements` | warn | `eslint/no-empty`<br>`eslint/no-empty-function`<br>`eslint/no-empty-static-block` | source | mapped |
| `noEmptyInterface` | error | `typescript/no-empty-interface` | inspired | mapped |
| `noEmptySource` | warn | `unicorn/no-empty-file` | source | mapped |
| `noEvolvingTypes` | warn | (none) |  | accepted loss |
| `noExplicitAny` | warn | `typescript/no-explicit-any` | source | mapped |
| `noExportsInTest` | error | `jest/no-export` | inspired | mapped: a jest rule; oxlint runs its jest rules on Vitest files |
| `noExtraNonNullAssertion` | warn | `typescript/no-extra-non-null-assertion` | source | mapped |
| `noFallthroughSwitchClause` | error | `eslint/no-fallthrough` | source | mapped |
| `noFocusedTests` | warn | `vitest/no-focused-tests` | inspired | mapped |
| `noForIn` | warn | `typescript/no-for-in-array` | inspired | mapped: type-aware; narrower: `for…in` over arrays only (`eslint/guard-for-in` is mapped from `useGuardForIn`) |
| `noFunctionAssign` | error | `eslint/no-func-assign` | source | mapped |
| `noGlobalAssign` | error | `eslint/no-global-assign` | source | mapped |
| `noGlobalIsFinite` | warn | `unicorn/prefer-number-properties` | docs | mapped: broader (also `parseInt`, `NaN`, `Infinity`); the same oxlint rule as `useNumberNamespace` |
| `noGlobalIsNan` | warn | `unicorn/prefer-number-properties` | docs | mapped: the same |
| `noIdenticalTestTitle` | warn | `vitest/no-identical-title` | source | mapped |
| `noImplicitAnyLet` | error | (none) |  | accepted loss |
| `noImportAssign` | error | `eslint/no-import-assign` | source | mapped |
| `noImportCycles` | warn | `import/no-cycle` | source | mapped |
| `noIrregularWhitespace` | warn | `eslint/no-irregular-whitespace` | source | mapped |
| `noLabelVar` | error | `eslint/no-label-var` | source | mapped |
| `noLoopFunc` | warn | `eslint/no-loop-func` | source | mapped |
| `noMisleadingCharacterClass` | error | `eslint/no-misleading-character-class` | source | mapped |
| `noMisleadingInstantiator` | error | `typescript/no-misused-new` | source | mapped |
| `noMisplacedAssertion` | warn | `vitest/no-standalone-expect` | inspired | mapped |
| `noMisrefactoredShorthandAssign` | error | `oxc/misrefactored-assign-op` | docs | mapped: both from Clippy's `misrefactored_assign_op`; on the brief's loss list, but mappable |
| `noNestedPromises` | warn | `promise/no-nesting` | source | mapped |
| `noNonNullAssertedOptionalChain` | error | `typescript/no-non-null-asserted-optional-chain` | source | mapped |
| `noOctalEscape` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noParametersOnlyUsedInRecursion` | warn | `oxc/only-used-in-recursion` | docs | mapped: both from Clippy's `only_used_in_recursion`; on the brief's loss list, but mappable |
| `noProto` | warn | `eslint/no-proto` | source | mapped |
| `noPrototypeBuiltins` | warn | `eslint/no-prototype-builtins`<br>`eslint/prefer-object-has-own` | source | mapped |
| `noRedeclare` | error | `eslint/no-redeclare` | source | mapped |
| `noRedundantUseStrict` | warn | (none) |  | accepted loss (owner, 19 November) |
| `noReturnAssign` | error | `eslint/no-return-assign` | source | mapped |
| `noSelfCompare` | error | `eslint/no-self-compare` | source | mapped |
| `noShadow` | warn | `eslint/no-shadow` | source | mapped |
| `noShadowRestrictedNames` | error | `eslint/no-shadow-restricted-names` | source | mapped |
| `noSkippedTests` | warn | `vitest/no-disabled-tests` | inspired | mapped |
| `noSparseArray` | error | `eslint/no-sparse-arrays` | source | mapped |
| `noTemplateCurlyInString` | warn | `eslint/no-template-curly-in-string` | source | mapped |
| `noThenProperty` | error | `unicorn/no-thenable` | source | mapped |
| `noTsIgnore` | warn | `typescript/ban-ts-comment` | inspired | mapped: broader: `{"ts-ignore": true, "ts-nocheck": false, "ts-check": false, "ts-expect-error": false}` to match |
| `noUnassignedVariables` | info | `eslint/no-unassigned-vars` | source | mapped |
| `noUnnecessaryConditions` | warn | `typescript/no-unnecessary-condition` | inspired | mapped: type-aware; stricter than Biome's (below) |
| `noUnsafeDeclarationMerging` | error | `typescript/no-unsafe-declaration-merging` | source | mapped |
| `noUnsafeNegation` | error | `eslint/no-unsafe-negation` | source | mapped |
| `noUnusedExpressions` | warn | `eslint/no-unused-expressions` | source | mapped |
| `noUselessEscapeInString` | warn | `eslint/no-useless-escape` | docs | mapped: it checks strings and regexes: the same oxlint rule as `noUselessEscapeInRegex` |
| `noUselessRegexBackrefs` | warn | `eslint/no-useless-backreference` | source | mapped |
| `noVar` | warn | `eslint/no-var` | source | mapped |
| `noWith` | error | `eslint/no-with` | source | mapped |
| `useAdjacentOverloadSignatures` | warn | `typescript/adjacent-overload-signatures` | source | mapped |
| `useArraySortCompare` | warn | `typescript/require-array-sort-compare` | source | mapped: type-aware |
| `useAwait` | warn | `eslint/require-await` | source | mapped: `eslint/require-await`; `typescript/require-await` is its type-aware form |
| `useDefaultSwitchClauseLast` | warn | `eslint/default-case-last` | source | mapped |
| `useErrorMessage` | warn | `unicorn/error-message` | source | mapped |
| `useExpect` | warn | `vitest/expect-expect` | source | mapped |
| `useGetterReturn` | error | `eslint/getter-return` | source | mapped |
| `useGuardForIn` | warn | `eslint/guard-for-in` | source | mapped |
| `useIsArray` | warn | `unicorn/no-instanceof-array` | source | mapped |
| `useIterableCallbackReturn` | error | `eslint/array-callback-return` | source | mapped |
| `useNamespaceKeyword` | error | `typescript/prefer-namespace-keyword` | source | mapped |
| `useNumberToFixedDigitsArgument` | warn | `unicorn/require-number-to-fixed-digits-argument` | source | mapped |
| `useStaticResponseMethods` | info | `unicorn/prefer-response-static-json` | docs | mapped: narrower: `Response.json()` only, not `Response.redirect()` |
| `useStrictMode` | warn | (none) |  | accepted loss (owner, 19 November) |

## Rules for JSX

They report on JSX, which no file has until Phase 4's `.tsx`. Mapped now so the first `.tsx` file is held from the
start; the two unmapped ones are decided below.

**Decided by the owner, 19 November:** `noSuspiciousSemicolonInJsx` becomes a house rule in task 4.2, when the first
`.tsx` exists. `noSvgWithoutTitle` is held by construction instead: `Drawing` (`site/icons.ts`), the one maker of an
SVG, takes only the drawings `pipeline/drawings.py` writes (`site/drawings.ts`), each hidden from assistive technology,
and a house rule of 4.2 refuses `<svg>` in JSX outside it.

| Biome rule | oxlint | Fit |
| -- | -- | -- |
| `a11y/noAccessKey` | `jsx_a11y/no-access-key` | source |
| `a11y/noAmbiguousAnchorText` | `jsx_a11y/anchor-ambiguous-text` | source |
| `a11y/noAriaHiddenOnFocusable` | `jsx_a11y/no-aria-hidden-on-focusable` | source |
| `a11y/noAriaUnsupportedElements` | `jsx_a11y/aria-unsupported-elements` | source |
| `a11y/noAutofocus` | `jsx_a11y/no-autofocus` | source |
| `a11y/noDistractingElements` | `jsx_a11y/no-distracting-elements` | source |
| `a11y/noHeaderScope` | `jsx_a11y/scope` | source |
| `a11y/noInteractiveElementToNoninteractiveRole` | `jsx_a11y/no-interactive-element-to-noninteractive-role` | source |
| `a11y/noLabelWithoutControl` | `jsx_a11y/label-has-associated-control` | source |
| `a11y/noNoninteractiveElementInteractions` | `jsx_a11y/no-noninteractive-element-interactions` | source |
| `a11y/noNoninteractiveElementToInteractiveRole` | `jsx_a11y/no-noninteractive-element-to-interactive-role` | source |
| `a11y/noNoninteractiveTabindex` | `jsx_a11y/no-noninteractive-tabindex` | source |
| `a11y/noRedundantAlt` | `jsx_a11y/img-redundant-alt` | source |
| `a11y/noRedundantRoles` | `jsx_a11y/no-redundant-roles` | source |
| `a11y/noStaticElementInteractions` | `jsx_a11y/no-static-element-interactions` | source |
| `a11y/noSvgWithoutTitle` | (none): held by construction (`Drawing`, task 2.6d; 4.2's rule on `<svg>`) |  |
| `a11y/useAltText` | `jsx_a11y/alt-text` | source |
| `a11y/useAnchorContent` | `jsx_a11y/anchor-has-content` | source |
| `a11y/useAriaActivedescendantWithTabindex` | `jsx_a11y/aria-activedescendant-has-tabindex` | source |
| `a11y/useAriaPropsForRole` | `jsx_a11y/role-has-required-aria-props` | source |
| `a11y/useAriaPropsSupportedByRole` | `jsx_a11y/role-supports-aria-props` | source |
| `a11y/useFocusableInteractive` | `jsx_a11y/interactive-supports-focus` | source |
| `a11y/useHeadingContent` | `jsx_a11y/heading-has-content` | source |
| `a11y/useHtmlLang` | `jsx_a11y/html-has-lang` | source |
| `a11y/useIframeTitle` | `jsx_a11y/iframe-has-title` | source |
| `a11y/useKeyWithClickEvents` | `jsx_a11y/click-events-have-key-events` | source |
| `a11y/useKeyWithMouseEvents` | `jsx_a11y/mouse-events-have-key-events` | source |
| `a11y/useMediaCaption` | `jsx_a11y/media-has-caption` | source |
| `a11y/useSemanticElements` | `jsx_a11y/prefer-tag-over-role` | source |
| `a11y/useValidAnchor` | `jsx_a11y/anchor-is-valid` | source |
| `a11y/useValidAriaProps` | `jsx_a11y/aria-props` | source |
| `a11y/useValidAriaRole` | `jsx_a11y/aria-role` | source |
| `a11y/useValidAriaValues` | `jsx_a11y/aria-proptypes` | source |
| `a11y/useValidAutocomplete` | `jsx_a11y/autocomplete-valid` | source |
| `a11y/useValidLang` | `jsx_a11y/lang` | source |
| `complexity/noUselessFragments` | `react/jsx-no-useless-fragment` | source |
| `correctness/noRestrictedElements` | `react/forbid-elements` | source |
| `security/noBlankTarget` | `react/jsx-no-target-blank` | inspired |
| `security/useIframeSandbox` | `react/iframe-missing-sandbox` | source |
| `style/noImplicitBoolean` | `react/jsx-boolean-value` | inspired |
| `style/noJsxLiterals` | `react/jsx-no-literals` | source |
| `style/useConsistentCurlyBraces` | `react/jsx-curly-brace-presence` | inspired |
| `style/useFragmentSyntax` | `react/jsx-fragments` | source |
| `style/useSelfClosingElements` | `react/self-closing-comp` | source |
| `suspicious/noCommentText` | `react/jsx-no-comment-textnodes` | source |
| `suspicious/noDuplicateJsxProps` | `react/jsx-no-duplicate-props` | source |
| `suspicious/noSuspiciousSemicolonInJsx` | (none): a house rule in 4.2 |  |
| `suspicious/useGoogleFontDisplay` | `nextjs/google-font-display` | source |

## Rules for frameworks the site does not use

92 rules that `"preset": "all"` enables but that report only on React, Next, Vue, Qwik, React Native, Drizzle, Turborepo
or Playwright code (the tests drive the page through Vitest's browser API, not Playwright's), and four of Solid's
domain. None reports today and none is ported. **Decided by the owner, 19 November:** the 88 of other frameworks are
accepted losses (no code of theirs exists; adding a framework is a decision of its own). Solid's four are task 4.2's:
three have an `eslint-plugin-solid` 0.20.0 rule (`solid/no-destructure`, `solid/prefer-for`,
`solid/no-react-specific-props`), which oxlint loads as a JS plugin, not in `--rules`; `noDuplicatedSpreadProps` has
none and becomes a house rule in 4.2.

The 92: `noPlaywrightUselessAwait`, `noBeforeInteractiveScriptOutsideDocument`, `noChildrenProp`,
`noComponentHookFactories`, `noJsxNamespace`, `noNestedComponentDefinitions`, `noNextAsyncClientComponent`,
`noPlaywrightMissingAwait`, `noQwikUseVisibleTask`, `noReactNativeRawText`, `noReactPropAssignments`,
`noRenderReturnValue`, `noSolidDestructuredProps`, `noVueDataObjectDeclaration`, `noVueDuplicateKeys`,
`noVueImportCompilerMacros`, `noVueRefAsOperand`, `noVueReservedKeys`, `noVueReservedProps`,
`noVueSetupPropsReactivityLoss`, `noVueVIfWithVFor`, `noVueVOnNumberValues`, `useExhaustiveDependencies`,
`useHookAtTopLevel`, `useImageSize`, `useInlineScriptId`, `useJsxKeyInIterable`, `usePlaywrightValidDescribeCallback`,
`useQwikClasslist`, `useQwikLoaderLocation`, `useQwikMethodUsage`, `useReactAsyncServerFunction`,
`useReactNativePlatformComponents`, `useUniqueElementIds`, `useVueValidTemplateRoot`, `useVueValidVBind`,
`useVueValidVCloak`, `useVueValidVElse`, `useVueValidVElseIf`, `useVueValidVFor`, `useVueValidVHtml`, `useVueValidVIf`,
`useVueValidVOn`, `useVueValidVOnce`, `useVueValidVPre`, `useVueValidVText`, `useVueVForKey`, `noImgElement`,
`noJsxPropsBind`, `noSyncScripts`, `noUnwantedPolyfillio`, `useGoogleFontPreconnect`, `useSolidForComponent`,
`useVueVapor`, `noDangerouslySetInnerHtml`, `noDangerouslySetInnerHtmlWithChildren`, `noHeadElement`,
`noPlaywrightElementHandle`, `noPlaywrightEval`, `noPlaywrightWaitForSelector`, `noReactNativeLiteralColors`,
`noVueOptionsApi`, `useComponentExportOnlyModules`, `useReactFunctionComponents`,
`useVueConsistentDefinePropsDeclaration`, `useVueConsistentVBindStyle`, `useVueConsistentVOnStyle`,
`useVueDefineMacrosOrder`, `useVueHyphenatedAttributes`, `useVueMultiWordComponentNames`, `useVueNextTickPromise`,
`noArrayIndexKey`, `noDocumentImportInPage`, `noDrizzleDeleteWithoutWhere`, `noDrizzleUpdateWithoutWhere`,
`noDuplicatedSpreadProps`, `noHeadImportInDocument`, `noJsxLeakedDollar`, `noLeakedRender`, `noPlaywrightForceOption`,
`noPlaywrightNetworkidle`, `noPlaywrightPagePause`, `noPlaywrightWaitForNavigation`, `noPlaywrightWaitForTimeout`,
`noReactForwardRef`, `noReactNativeDeepImports`, `noReactSpecificProps`, `noReactStringRefs`, `noUndeclaredEnvVars`,
`noUnknownAttribute`, `noVueArrowFuncInWatch`, `useScopedStyles`.

## Other languages

53 enabled rules lint CSS, JSON, GraphQL, HTML or YAML; Biome keeps CSS and JSON (task 2.7). One of them is among
`biome.jsonc`'s twenty nursery rules: `noDuplicateMapKeys` checks YAML maps, not JavaScript, and Biome is given no YAML,
so it has never reported.
