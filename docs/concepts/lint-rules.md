# Lint rules

What lints the site's code, the rules each tool runs with their settings and reasons, the rules deliberately off or not
carried, the per-folder exceptions, and the house rules with how each is proven.

| What | Tool | Config | Task |
| -- | -- | -- | -- |
| the site's TypeScript (`site/`), its tests (`tests/`), the house rules (`lint/`), `vite.config.ts`, `vitest.config.ts` | oxlint, type-aware (`oxlint-tsgolint`), with `eslint-plugin-solid` and the house plugin | `.oxlintrc.json` | `lint:oxlint` |
| the stylesheet (`public/css/`) | stylelint, with the house rule `house/baseline` | `.stylelintrc.yaml` | `lint:stylelint` |
| the JSON configs at the root | `tests/test_configs.py` | (the test) | `lint:configs` |
| the layout of all of these, and the order of the import statements | oxfmt | `.oxfmtrc.jsonc` | `format:site` |

A warning fails each: oxlint's `denyWarnings`, stylelint's `--max-warnings 0`. tsc (strict, `erasableSyntaxOnly`) and
knip hold some checks a lint rule would otherwise hold; where a rule is off or not carried for that reason, the tables
below say so. A suppression is one line's, names its rules and gives its reason; `tests/test_suppressions.py` lists
each, and [Suppressed findings](../lint-false-positives.md) explains each.

The rule set is Biome's `preset: all`, each rule carried by its equivalent in oxlint or stylelint, or by a house rule,
or knowingly not carried; and, beyond it, the type-aware rules oxlint adds, `eslint-plugin-solid`'s rules and
stylelint's stricter ones. The tables keep the Biome rule each rule holds, in one column, so that a rule's settings and
its reach can be read against the rule it carries. An oxlint or stylelint rule is a Biome rule's equivalent when Biome's
own metadata names it as the rule's source (what `biome migrate eslint` and `biome migrate stylelint` apply, "inspired
by" included), or when the two rules' documentation describes the same check. Biome itself is not installed.

## oxlint

`.oxlintrc.json` turns no category on: each rule is named, so a rule not listed is off. Its options: `typeAware` (the
type-aware rules, through `oxlint-tsgolint` in `node_modules`, so oxlint runs from the repository's root),
`denyWarnings`, and `reportUnusedDisableDirectives: "error"`, so a suppression with nothing to suppress fails. Every
rule on is an error.

The plugins: `typescript`, `unicorn`, `import`, `oxc`, `vitest`, `jest` (two test rules oxlint has only as jest's, which
it runs on Vitest files too), `node`, `promise`, `react` (its JSX rules and `button-has-type`), `jsx-a11y` and `nextjs`
(`google-font-display`); and two JS plugins (`jsPlugins`), `eslint-plugin-solid` and the house rules' `lint/plugin.ts`.
The files the house rules' test lints with a config of its own, `lint/fixtures/`, are ignored (`ignorePatterns`), since
some break a rule on purpose.

### Settings

Where a rule's defaults differ from the Biome rule it holds, the setting keeps Biome's reach; without it the rule would
refuse code the rule set allows.

| oxlint rule | Setting | Why |
| -- | -- | -- |
| `eslint/no-use-before-define` | `{"functions": false, "classes": false, "variables": false}` | a use the code reaches before the declaration is refused, not a function declaration used before it, nor a closure reading a later `const` |
| `eslint/eqeqeq` | `["always", {"null": "ignore"}]` | `== null` is null or undefined, both absent (`eslint/no-eq-null` is off) |
| `eslint/max-params` | `{"max": 4}` | Biome's `useMaxParams` default |
| `typescript/explicit-member-accessibility` | `{"accessibility": "no-public"}` | Biome's `useConsistentMemberAccessibility` default |
| `vitest/consistent-test-it` | `{"fn": "test", "withinDescribe": "it"}`, in `tests/**` and `vitest.config.ts` | a test is `test()`; inside a `describe`, `it`, as `tests/site/roster.test.ts` writes it |
| `eslint/max-nested-callbacks` | `{"max": 5}` | Biome's `noExcessiveNestedCallbacks` default (ESLint's is 10) |
| `eslint/no-labels` | `{"allowLoop": true}` | a loop's label is allowed, as Biome's `noConfusingLabels` allows it |
| `eslint/no-else-return` | `{"allowElseIf": false}` | an `else if` after a return is refused too, as Biome's `noUselessElse` refuses it |
| `typescript/ban-ts-comment` | `{"ts-ignore": true, "ts-nocheck": false, "ts-check": false, "ts-expect-error": false}` | `@ts-ignore` alone is refused (Biome's `noTsIgnore`); a `@ts-expect-error` gives its reason (`tests/test_suppressions.py`) |
| `unicorn/filename-case` | `{"cases": {"camelCase": true, "kebabCase": true, "snakeCase": true}}` | Biome's `useFilenamingConvention` default cases |
| `import/extensions` | `["always", {"ignorePackages": true}]` | the imports name the `.ts` file (`allowImportingTsExtensions`; Vite resolves them) |
| `eslint/no-unused-vars` | `{"args": "all", "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_", "destructuredArrayIgnorePattern": "^_"}` | any unused parameter is refused (Biome's `noUnusedFunctionParameters`), and a name starting with `_` is meant unused (`for (const _ of …)`, `{ sort: _order, ...rest }`) |
| `unicorn/no-useless-undefined` | `{"checkArguments": false, "checkArrowFunctionBody": false}` | an initialiser, a default, a `return` or a `yield` of `undefined` is refused, not an argument (`isCurrency(undefined)`) or an arrow's body (`() => undefined`), as Biome's `noUselessUndefined` reads it |
| `oxc/no-barrel-file` | `{"threshold": 0}` | any barrel is refused, as Biome's `noBarrelFile` refuses it; oxlint's counts modules |
| `eslint/sort-imports` | `{"ignoreDeclarationSort": true, "ignoreCase": true}` | the names inside an import's braces in one order; the statements are oxfmt's ([Import order](#import-order)) |
| `typescript/no-confusing-void-expression`, `typescript/prefer-readonly-parameter-types`, `typescript/return-await` | (below) | [Type-aware rules](#type-aware-rules) |

### Per-folder exceptions

`.oxlintrc.json`'s `overrides`, by globs from the repository's root:

| Files | Rule | Setting | Reason |
| -- | -- | -- | -- |
| `site/report.ts` | `eslint/no-console` | off | the one place the site writes to the console: what went wrong, with where |
| `**/*.tsx` | `eslint/no-unassigned-vars`, `solid/no-unassigned-vars` | off, on | Solid's counts `ref={el}` as an assignment, as `v2-strict` has it ([Solid's rules](#solids-rules)) |
| `tests/**`, `vitest.config.ts` | `import/no-nodejs-modules` | off | the tests and their config run in Node |
| `tests/**`, `vitest.config.ts` | `vitest/consistent-test-it` | on, [Settings](#settings) | a test is `test()` wherever it is |
| `tests/**`, `vitest.config.ts` | `eslint/no-await-in-loop` | off | a test drives the page step by step; in the site's code the rule holds |
| `site/roster.ts` | `eslint/prefer-destructuring` | off | the rule's one finding in the site's code, written as it is |
| `site/db.ts` | `eslint/max-classes-per-file` | off | the module's two classes, `SiteUpdating` and `Sql` |
| `lint/plugin.ts` | `import/no-default-export` | off | oxlint loads a JS plugin from its module's default export, as ESLint does |
| `lint/privates.ts` | `import/no-nodejs-modules` | off | `house/privates` reads the module an import names from disk, since oxlint shows a rule one file |
| `lint/stylelint/*.ts` | `import/no-nodejs-modules` | off | the house's stylelint rules run in Node: `house/baseline` reads `package.json`'s `browserslist` |
| `vite.config.ts`, `vitest.config.ts` | `import/no-default-export` | off | Vite and Vitest read their configs from the default export |

The house rules' own overrides are in the next section's table.

### The house rules

`lint/plugin.ts` is one oxlint JS plugin, each rule a module beside it (`lint/<rule>.ts`, ESLint's rule API), run as
`house/<rule>`. A rule is scoped by `.oxlintrc.json`'s overrides, by the files' paths from the root, never by reading
the path itself: a path tested in the rule would match the folders above the checkout as well, so that a checkout under
a folder named `tests` would change what a rule sees. Where each rule is on and the files it spares
(`tests/site/rules.test.ts` holds this table to `.oxlintrc.json`):

| Rule | On | Off |
| -- | -- | -- |
| `asserts` | everywhere oxlint lints | (none) |
| `buttons` | `site/*.ts`, `site/*.tsx` | (none) |
| `classes` | everywhere oxlint lints | (none) |
| `clicks` | everywhere oxlint lints | `site/bits.ts`, `site/swipe.ts` |
| `env` | everywhere oxlint lints | (none) |
| `fetch` | everywhere oxlint lints | `site/net.ts`, `tests/site/app.ts` |
| `flags` | `*.tsx` | (none) |
| `focuses` | `*.tsx` | (none) |
| `formats` | everywhere oxlint lints | `site/ui.ts` |
| `home` | everywhere oxlint lints | (none) |
| `json` | everywhere oxlint lints | (none) |
| `legacy` | `*.tsx` | (none) |
| `markup` | `site/**` | `site/icons.ts` |
| `mirrors` | `*.tsx` | (none) |
| `privates` | everywhere oxlint lints | (none) |
| `process` | `tests/**`, `vitest.config.ts` | (none) |
| `promises` | everywhere oxlint lints | (none) |
| `routes` | everywhere oxlint lints | `site/routes.ts` |
| `semicolons` | everywhere oxlint lints | (none) |
| `session` | everywhere oxlint lints | `site/kept.ts`, `tests/**` |
| `spreads` | everywhere oxlint lints | (none) |
| `states` | `site/*.ts`, `site/*.tsx` | (none) |
| `statics` | everywhere oxlint lints | (none) |
| `storage` | everywhere oxlint lints | `site/kept.ts`, `tests/**` |
| `styles` | everywhere oxlint lints | (none) |
| `svgs` | everywhere oxlint lints | (none) |
| `tests` | `tests/**` | the entries (`site/main.ts`, `site/review.ts`) loaded by `tests/site/app.ts`, and the shell's seam (`placed`) imported by `tests/site/placed.browser.test.tsx`: the rule's options in each file's override |
| `thens` | `*.tsx` | (none) |

What each refuses, and what it lets through (each module's header says it in full):

| Rule | Refuses | Lets through |
| -- | -- | -- |
| `house/asserts` | `node:assert` named as a module anywhere (an import, a type's, an export from it, `import()`, `require()`, `import = require()`): assertions come from `node:assert/strict`, whose `equal()` and `deepEqual()` compare strictly (Biome's `useNodeAssertStrict`) | the bare `'assert'`, which is `unicorn/prefer-node-protocol`'s |
| `house/buttons` | a JSX `<button>` whose `type` is not the string `button`, is given twice, or may be given again by a spread after it; a button built by a call of `h()` with the tag `'button'` | (`react/button-has-type`, even told to refuse `submit` and `reset`, lets a spread after the type through) |
| `house/classes` | an element's `classList` or `className`, read anywhere, a test's too: classes are set by JSX's `class`, which tsc holds to the stylesheet's (`ClassName`, `site/jsx-runtime.d.ts`) |  |
| `house/clicks` | `stopPropagation()`: a control inside a card keeps its click from the card with `bits.ts`'s `own()`, and `swipe.ts` alone keeps a swipe from the map |  |
| `house/env` | `env` read from a `process` imported from `node:process`: a default or namespace binding's `.env`, written or destructured, and `env` imported by name (Biome's `noProcessEnv`, which reads both forms) | the global's, which is `node/no-process-env`'s; a type's `typeof process.env` |
| `house/fetch` | the global `fetch`, called or not, and `window`'s, `globalThis`'s or `self`'s: every request goes through `net.ts`'s `get()` (a deadline, the view's signal, a failure for an answer that is no success) |  |
| `house/flags` | a component's own loading or failure state: a name `loading`, `pending`, `busy`, `fetching`, `error` or `failed` (any case, with or without `is`, and its setter's) declared as a variable, a function or a class's field; a component shows them with `<Loading>`, `isPending` and `<Errored>` | an import, a parameter, a property, a store's key, a loop's variable |
| `house/focuses` | `autofocus` in JSX in any spelling (`autofocus`, `autoFocus`, `prop:autofocus`, `attr:autofocus`) and as a key of an object spread: focus moves when the visitor moves it |  |
| `house/formats` | `Intl.DateTimeFormat` named, `toLocaleDateString()` or `toLocaleTimeString()` called, and a string holding `google.com/travel`: dates are worded, and flight searches linked, by `ui.ts` alone |  |
| `house/home` | a string or a template's text naming Bergen or BGO: the home city is the data's (`site.json`'s `home`) |  |
| `house/json` | an import or an export of a module ending in `.json` without `{ type: 'json' }` (Biome's `useJsonImportAttributes`) | a type's import or export, which is erased |
| `house/legacy` | `replaceChildren`, `createElement` and `createElementNS` wherever read, and an import of a relative `dom` module (hand-built elements' helpers): a Solid file renders with JSX alone | a package's `dom` (`@testing-library/dom`) |
| `house/markup` | `innerHTML` or `outerHTML` read or written however, a call of a method that parses markup, and the `innerHTML` or `outerHTML` prop in JSX, bare, in a namespace or spread: the site's code puts markup in an element through `icons.ts`'s `Drawing.into` alone | Solid's own templates, which hold no value of the data's (`solid/no-innerhtml` refuses only a bare prop given an expression or nothing) |
| `house/mirrors` | an effect whose apply half is a setter, or only calls setters given what the effect read: a derived value is a `createMemo` | a setter given anything else (a reaction), an apply half that does other work |
| `house/privates` | an import of a name its JSDoc marks `@private` from outside its module, or `@package` from outside its folder (Biome's `noPrivateImports`); the imported module is read from disk, and one found but not read is refused | an export from, an `import()`, a package |
| `house/process` | a value read of the global `process`, or `globalThis`'s: the code that runs in Node imports it from `node:process` (Biome's `noProcessGlobal`) | a type's `typeof process`, a binding of that name |
| `house/promises` | `.then` with two arguments, however called: a failure goes to `.catch` (or `report.ts`'s `done`) |  |
| `house/routes` | a string or a template's text starting with the hash of a route the site writes (`routes.ts`'s `HASH_ROUTES`): links are built by `routes.ts` |  |
| `house/semicolons` | JSX text that starts with a semicolon and then the line's end (`<div />;`), which shows as text (Biome's `noSuspiciousSemicolonInJsx`) | a semicolon on a line of its own, after spaces, or followed by more text on its line |
| `house/session` | `sessionStorage` named anywhere, as a property, a binding or a type's query: what the site remembers for the tab is `kept.ts`'s |  |
| `house/spreads` | an element spreading the same name or member of names twice (`{...props}`, `{...props.a}`), each repeat (Biome's `noDuplicatedSpreadProps`) | a call (`{...f()}`), which may give another object each time |
| `house/states` | a key of the states the site shows (`lint/state-keys.ts`, generated) in quotes where a value is compared or passed, a component's prop included: a state is `KEY.<point>.<NAME>` (`site/states.ts`), which the compiler holds to the table | an element's attribute; `plural()`'s words |
| `house/statics` | `this` or `super` in a static method, accessor or block, arrow functions and nested classes' fields included: there they are the class itself (Biome's `noThisInStatic`) | a static field's initializer; a function of another kind, which has a `this` of its own |
| `house/storage` | `localStorage` named anywhere: what the site remembers on the device is `kept.ts`'s |  |
| `house/styles` | the `style` prop in JSX, whatever it is given, and a `style:` prop: Solid's compiler writes a constant style as a `style` attribute, which the page's Content-Security-Policy refuses; a style is a class of the stylesheet, or `bits.ts`'s `styled` ref |  |
| `house/svgs` | a JSX `<svg>`, `<Dynamic component="svg">` and `dynamic(() => 'svg')`: an SVG is a drawing of `pipeline/drawings.py`'s, put in by `icons.ts`'s `Drawing`, which hides each from assistive technology (Biome's `noSvgWithoutTitle`, held by construction) |  |
| `house/tests` | a test's import of a value from a site module `lint/tests.ts` does not list (the pure modules, those that use a browser API but draw nothing, `icons`, `media`, `owner`), a new module too: a test reaches a view through the page | a type from any module, with `import type` |
| `house/thens` | a promise's `then`, called, handed on or destructured, in a `.tsx` file: a component reads async data from a memo under `<Loading>` | the modules that draw nothing (`site/net.ts` among them), which are `.ts` |

`thens`, `flags`, `mirrors` and `legacy` hold the views to Solid's way, and are on in `.tsx` files alone. No rule of
oxlint's or Solid's refuses what `classes` and `clicks` refuse.

**How they are proven.** Each rule ships with fixtures in `lint/fixtures/<rule>/`, at the paths from the root the
overrides read: a file it refuses, each refused line ending `// refused` (`// refused: <rule>` for another house rule's
finding; in JSX's text, `{/* refused */}`), a `good.ts` (or `good.tsx`) written the intended way, in a file it is on for
with no exemption, and, where it has exemptions, the forbidden form in an exempt file. `tests/site/rules.test.ts` lints
the fixtures with the house rules as `.oxlintrc.json` sets them and fails on a finding on an unmarked line, a marked
line not found, a rule without fixtures or a folder without a rule; it also checks that `.oxlintrc.json` turns each rule
of the plugin on and no other `house/` name, and that the table above matches the overrides.
[Contributing](../../CONTRIBUTING.md), "House rules", says how to add one.

### Solid's rules

`eslint-plugin-solid` 0.20.0, loaded through `.oxlintrc.json`'s `jsPlugins` (ESLint is not installed: its peer is
optional). oxlint loads a plugin's rules, not its configs, so its `v2-strict` config is written out rule by rule,
everywhere oxlint lints: its errors and its warnings as errors, the rules it turns off as off, and its setting of
Solid's version (`settings.solid.version: 2`), which nine of its rules read. In a `.tsx` file ESLint's
`no-unassigned-vars` gives way to Solid's, as `v2-strict` has it: Solid's counts `ref={el}` as an assignment.
`tests/site/rules.test.ts` holds the config to the plugin's own preset. Where a Solid rule and another refuse the same
thing (`jsx-no-duplicate-props`, `jsx-no-script-url`), both are on.

Biome's four Solid rules are held by `solid/no-destructure`, `solid/prefer-for`, `solid/no-react-specific-props` and the
house rule `spreads`.

`jsx-a11y` reads Solid's `for` as a label's control (`settings["jsx-a11y"].attributes`); its `no-autofocus` reads
`autoFocus` alone, not Solid's `autofocus`, which its `attributes` setting does not reach: `house/focuses` refuses
autofocus in any spelling. The click rules (`click-events-have-key-events`, `no-static-element-interactions`) read
`onClick` and its kin; Solid 2's compiler refuses the `on:` and `oncapture:` namespaces, so no handler escapes them that
way and no rule is added for it.

### Rules for JSX

The JSX rules are on everywhere oxlint lints, and report on the `.tsx` views. Two of Biome's have no oxlint equivalent:
`noSuspiciousSemicolonInJsx` is the house rule `semicolons`, and `noSvgWithoutTitle` is held by construction: `Drawing`
(`site/icons.ts`), the one maker of an SVG, takes only the drawings `pipeline/drawings.py` writes (`site/drawings.ts`),
each hidden from assistive technology, and `house/svgs` refuses `<svg>` in JSX.

`react/jsx-no-target-blank` asks for `noreferrer` on a link to a new tab only where it reads the address: an external
literal one or a bare name (`href={x}`), not a member, a call or a template (`href={e.url}`). So it does not hold the
review page's convention, each of its links to a new tab `noopener noreferrer`:
`tests/site/review-links.browser.test.ts` holds it for the three links it draws. The site's links out (a festival's
page, its tickets, Google Flights) are `noopener` alone, which the rule does not see.

Off: the JSX rules Biome reports as information only, never failing, which the rule set carries as off:
`react/jsx-no-useless-fragment`, `react/forbid-elements`, `react/jsx-boolean-value`, `react/jsx-no-literals`,
`react/jsx-curly-brace-presence`, `react/jsx-fragments`, `react/self-closing-comp` (`solid/self-closing-comp` is on) and
`jsx-a11y/no-noninteractive-element-interactions`.

### Type-aware rules

oxlint's type-aware rules are on, those that hold a Biome rule and the 33 that have no Biome equivalent (the tables
below, Biome's "(none)"), each an error. Three have settings:

- `no-confusing-void-expression`, with `ignoreArrowShorthand`: an arrow's short body is how a handler is written here,
  whatever its call returns.
- `prefer-readonly-parameter-types`, with `treatMethodsAsReadonly`, `ignoreInferredTypes` (an inferred parameter takes
  its type from a declaration the rule checks) and `allow`: the site's own record types are read-only where they are
  defined, and `allow` names the types that cannot be: the DOM's, Node's, sql.js's `BindParams`, Leaflet's `LayerGroup`,
  GeoJSON's `Feature`, JSX's list of elements (`ArrayElement`, `solid-js`'s and `@solidjs/web`'s), which a Solid
  component's `children` may be, PostCSS's nodes, which `house/baseline` reads, and the syntax-tree types of oxlint's
  plugin API the house rules take.
- `return-await`, `error-handling-correctness-only`: a function made async (`promise-function-async`) that hands a
  promise on awaits it, as `eslint/require-await` wants an await in it; the default, `in-try-catch`, would refuse that
  await.

`typescript/dot-notation` is off (`eslint/no-useless-computed-key`'s row in [Rules off](#rules-off)).
`typescript/only-throw-error` and `typescript/require-await` are the type-aware forms of `eslint/no-throw-literal` and
`eslint/require-await`, which are on in their place.

Some of oxlint's versions are stricter than Biome's: `strict-boolean-expressions`, `no-unnecessary-condition` and
`no-base-to-string` (Biome's `useStrictBooleanExpressions`, `noUnnecessaryConditions`, `noBaseToString`),
`no-unnecessary-type-conversion`, `no-unsafe-type-assertion`, `no-unsafe-return`, `no-misused-promises` and
`prefer-nullish-coalescing` refuse code Biome's pass.

### Import order

Biome's `organizeImports` assist has three holders:

- **The order of import statements:** oxfmt's `sortImports`, on every `.ts` and `.tsx` it lays out (`.oxfmtrc.jsonc`'s
  override), with `newlinesBetween: false`: it sorts across a blank line and adds none between groups. The house rules'
  fixtures are left out (`excludeFiles`): their refused lines are marked where they stand.
- **Two imports of one module merged:** `import/no-duplicates`.
- **The names inside an import's braces:** no oxfmt option sorts them; `eslint/sort-imports`, with
  `ignoreDeclarationSort` (the statements are oxfmt's) and `ignoreCase`, holds one order (`type Trait, TRAITS`), which
  differs from Biome's in places; which order matters to no reader.

### Rules off

Each with its reason; none is enabled.

| oxlint rule | Biome's | Reason |
| -- | -- | -- |
| `eslint/no-ternary` | `noTernary` | a conditional value is a ternary here, not a statement |
| `eslint/no-nested-ternary` | `noNestedTernary` | the same, for a choice between more than two values |
| (none) | `useNamingConvention` | a row's keys are its database columns (`start_date`, `card_pass`) |
| `eslint/no-magic-numbers` | `noMagicNumbers` | geometry, timings and limits are named where they mean something |
| `eslint/curly` | `useBlockStatements` | a guard is one line: `if (!x) return;` |
| `eslint/one-var` | `useSingleVarDeclarator` | values computed together are declared together |
| `eslint/no-plusplus` | `noIncrementDecrement` | (no reason recorded) |
| `eslint/no-continue` | `noContinue` | (no reason recorded) |
| `import/exports-last` | `useExportsLast` | an export sits beside the code it belongs to |
| `eslint/max-lines` | `noExcessiveLinesPerFile` | a module is one concern however long; `site/states.ts` is generated |
| `eslint/default-case` | `useDefaultSwitchClause` | a switch over a union names every case (`typescript/switch-exhaustiveness-check`) |
| `typescript/consistent-type-definitions` | `useConsistentTypeDefinitions` | a shape that must fit a `Record` is a type: an interface has no index signature |
| `eslint/no-useless-computed-key`, `typescript/dot-notation` | `useLiteralKeys` | tsconfig's `noPropertyAccessFromIndexSignature` wants `dataset['nav']` |
| `eslint/max-lines-per-function` | `noExcessiveLinesPerFunction` | a view is one closure over its state |
| `eslint/no-eq-null` | `noEqualsToNull` | `== null` is null or undefined, both absent |
| `eslint/no-undef` | `noUndeclaredVariables` | tsc rejects an undeclared name, and knows `globals.d.ts`'s |
| `import/named` | `noUnresolvedImports` | tsc resolves every import, against the types as well |
| (none) | `useQwikValidLexicalScope` | no Qwik here |
| (none) | `noSecrets` | the site holds no secret; its long strings are SVG and selectors |
| `eslint/no-bitwise` | `noBitwiseOperators` | every use is a deliberate hash or random number (`site/ink.ts`, `tests/site/roster.test.ts`) |
| `eslint/complexity` | `noExcessiveCognitiveComplexity` | another measure (cyclomatic, where Biome's is cognitive), which the site's functions are not held to |

The JSX rules off are under [Rules for JSX](#rules-for-jsx); the stylesheet's under [The stylesheet](#the-stylesheet).

### Rules not carried

Biome rules with no oxlint equivalent, and no house rule: each with what holds the check without it, where something
does.

| Biome rule | What holds it |
| -- | -- |
| `noStringCaseMismatch`, `noVoidTypeReturn`, `noMisleadingReturnType`, `useTopLevelRegex`, `noShoutyConstants`, `noUnusedTemplateLiteral`, `noEvolvingTypes`, `noImplicitAnyLet` | nothing: no equivalent |
| `noEmptyTypeParameters` | tsc refuses `<>` with no parameter |
| `noRedundantDefaultExport` | `import/no-default-export` refuses a default export |
| `noUselessContinue` | nothing (`eslint/no-continue`, which would refuse every `continue`, is off) |
| `noUselessStringRaw`, `useSimpleNumberKeys`, `useSimplifiedLogicExpression`, `useWhile` | nothing: style rules with no equivalent |
| `noUndeclaredDependencies` | knip reports an unlisted dependency (`mise run knip`) |
| `useSingleJsDocAsterisk` | nothing: a comment-style rule |
| `noDynamicNamespaceImportAccess` | `import/no-namespace` refuses a namespace import |
| `noReExportAll` | `oxc/no-barrel-file` with `threshold: 0` refuses a barrel; no module re-exports with `export *` |
| `noEnum` | tsc's `erasableSyntaxOnly` refuses an enum |
| `noInlineStyles` | the Content-Security-Policy refuses inline styles at run time, and `house/styles` the `style` prop in JSX |
| `noDuplicateParameters`, `noOctalEscape` | a syntax error in a module, which every file is: oxc's parser and tsc refuse it |
| `noRedundantUseStrict`, `useStrictMode` | every file is a module, so strict already |

The rules Biome has for React, Next, Vue, Qwik, React Native, Drizzle, Turborepo and Playwright (the tests drive the
page through Vitest's browser API, not Playwright's) are not carried: the site has no code of theirs, and adding a
framework is a decision of its own, with its rules.

## Every rule on, with the Biome rule it holds

By plugin; a note says where the two differ. "(none)" is a rule with no Biome equivalent. Solid's rules are its
`v2-strict` config's ([Solid's rules](#solids-rules)), the house rules [above](#the-house-rules).

### eslint

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `eslint/array-callback-return` | `useIterableCallbackReturn` |  |
| `eslint/arrow-body-style` | `useConsistentArrowReturn` |  |
| `eslint/class-methods-use-this` | `useThisInClassMethods` |  |
| `eslint/constructor-super` | `noInvalidConstructorSuper` |  |
| `eslint/default-case-last` | `useDefaultSwitchClauseLast` |  |
| `eslint/default-param-last` | `useDefaultParameterLast` |  |
| `eslint/eqeqeq` | `noDoubleEquals` | `== null` allowed ([Settings](#settings)) |
| `eslint/for-direction` | `useValidForDirection` |  |
| `eslint/getter-return` | `useGetterReturn` |  |
| `eslint/grouped-accessor-pairs` | `useGroupedAccessorPairs` |  |
| `eslint/guard-for-in` | `useGuardForIn` |  |
| `eslint/max-classes-per-file` | `noExcessiveClassesPerFile` | one class a module, the default of both; off in `site/db.ts` |
| `eslint/max-nested-callbacks` | `noExcessiveNestedCallbacks` | [Settings](#settings) |
| `eslint/max-params` | `useMaxParams` | [Settings](#settings) |
| `eslint/no-alert` | `noAlert` |  |
| `eslint/no-array-constructor` | `useArrayLiterals` |  |
| `eslint/no-async-promise-executor` | `noAsyncPromiseExecutor` |  |
| `eslint/no-await-in-loop` | `noAwaitInLoops` |  |
| `eslint/no-case-declarations` | `noSwitchDeclarations` |  |
| `eslint/no-class-assign` | `noClassAssign` |  |
| `eslint/no-compare-neg-zero` | `noCompareNegZero` |  |
| `eslint/no-cond-assign` | `noAssignInExpressions` | narrower: conditions only; `eslint/no-return-assign` holds Biome's `noReturnAssign` |
| `eslint/no-console` | `noConsole` | off in `site/report.ts` |
| `eslint/no-const-assign` | `noConstAssign` |  |
| `eslint/no-constant-binary-expression` | `noConstantBinaryExpressions` |  |
| `eslint/no-constant-condition` | `noConstantCondition` |  |
| `eslint/no-constructor-return` | `noConstructorReturn` |  |
| `eslint/no-control-regex` | `noControlCharactersInRegex` |  |
| `eslint/no-debugger` | `noDebugger` |  |
| `eslint/no-delete-var` | `noDelete` |  |
| `eslint/no-div-regex` | `noDivRegex` |  |
| `eslint/no-dupe-class-members` | `noDuplicateClassMembers` |  |
| `eslint/no-dupe-else-if` | `noDuplicateElseIf` |  |
| `eslint/no-dupe-keys` | `noDuplicateObjectKeys` |  |
| `eslint/no-duplicate-case` | `noDuplicateCase` |  |
| `eslint/no-else-return` | `noUselessElse` | [Settings](#settings) |
| `eslint/no-empty-character-class` | `noEmptyCharacterClassInRegex` |  |
| `eslint/no-empty-function` | `noEmptyBlockStatements` |  |
| `eslint/no-empty-pattern` | `noEmptyPattern` |  |
| `eslint/no-empty-static-block` | `noEmptyBlockStatements` |  |
| `eslint/no-empty` | `noEmptyBlockStatements` |  |
| `eslint/no-eval` | `noGlobalEval` |  |
| `eslint/no-ex-assign` | `noCatchAssign` |  |
| `eslint/no-extra-boolean-cast` | `noExtraBooleanCast` |  |
| `eslint/no-extra-label` | `noUselessLabel` |  |
| `eslint/no-fallthrough` | `noFallthroughSwitchClause` |  |
| `eslint/no-func-assign` | `noFunctionAssign` |  |
| `eslint/no-global-assign` | `noGlobalAssign` |  |
| `eslint/no-implicit-coercion` | `noImplicitCoercions` |  |
| `eslint/no-import-assign` | `noImportAssign` |  |
| `eslint/no-inner-declarations` | `noInnerDeclarations` |  |
| `eslint/no-irregular-whitespace` | `noIrregularWhitespace` |  |
| `eslint/no-label-var` | `noLabelVar` |  |
| `eslint/no-labels` | `noConfusingLabels` | [Settings](#settings) |
| `eslint/no-lone-blocks` | `noUselessLoneBlockStatements` |  |
| `eslint/no-lonely-if` | `useCollapsedElseIf` |  |
| `eslint/no-loop-func` | `noLoopFunc` |  |
| `eslint/no-loss-of-precision` | `noPrecisionLoss` |  |
| `eslint/no-misleading-character-class` | `noMisleadingCharacterClass` |  |
| `eslint/no-multi-assign` | `noMultiAssign` |  |
| `eslint/no-multi-str` | `noMultilineString` |  |
| `eslint/no-negated-condition` | `noNegationElse` |  |
| `eslint/no-new-native-nonconstructor` | `noInvalidBuiltinInstantiation` |  |
| `eslint/no-new-wrappers` | `useConsistentBuiltinInstantiation` | `Date()` without `new`, which Biome's also reports, is `unicorn/new-for-builtins`'s |
| `eslint/no-new` | `noUnusedInstantiation` |  |
| `eslint/no-nonoctal-decimal-escape` | `noNonoctalDecimalEscape` |  |
| `eslint/no-obj-calls` | `noGlobalObjectCalls` |  |
| `eslint/no-object-constructor` | `noObjectConstructor` |  |
| `eslint/no-param-reassign` | `noParameterAssign` |  |
| `eslint/no-proto` | `noProto` |  |
| `eslint/no-prototype-builtins` | `noPrototypeBuiltins` |  |
| `eslint/no-redeclare` | `noRedeclare` |  |
| `eslint/no-regex-spaces` | `noAdjacentSpacesInRegex` |  |
| `eslint/no-restricted-globals` | `noRestrictedGlobals` | restricts nothing without options, as Biome's |
| `eslint/no-restricted-imports` | `noRestrictedImports` | restricts nothing without options, as Biome's |
| `eslint/no-return-assign` | `noReturnAssign` |  |
| `eslint/no-script-url` | `noScriptUrl` |  |
| `eslint/no-self-assign` | `noSelfAssign` |  |
| `eslint/no-self-compare` | `noSelfCompare` |  |
| `eslint/no-sequences` | `noCommaOperator` |  |
| `eslint/no-setter-return` | `noSetterReturn` |  |
| `eslint/no-shadow-restricted-names` | `noShadowRestrictedNames` |  |
| `eslint/no-shadow` | `noShadow` |  |
| `eslint/no-sparse-arrays` | `noSparseArray` |  |
| `eslint/no-template-curly-in-string` | `noTemplateCurlyInString` |  |
| `eslint/no-this-before-super` | `noUnreachableSuper` |  |
| `eslint/no-throw-literal` | `useThrowOnlyError` | `typescript/only-throw-error`, its type-aware form, is not on |
| `eslint/no-unassigned-vars` | `noUnassignedVariables` |  |
| `eslint/no-unmodified-loop-condition` | `noUnmodifiedLoopCondition` |  |
| `eslint/no-unneeded-ternary` | `noUselessTernary` |  |
| `eslint/no-unreachable` | `noUnreachable` |  |
| `eslint/no-unsafe-finally` | `noUnsafeFinally` |  |
| `eslint/no-unsafe-negation` | `noUnsafeNegation` |  |
| `eslint/no-unsafe-optional-chaining` | `noUnsafeOptionalChaining` |  |
| `eslint/no-unused-expressions` | `noUnusedExpressions` |  |
| `eslint/no-unused-labels` | `noUnusedLabels` |  |
| `eslint/no-unused-private-class-members` | `noUnusedPrivateClassMembers` | narrower: `#private` only, not TypeScript's `private` |
| `eslint/no-unused-vars` | `noUnusedFunctionParameters`, `noUnusedImports`, `noUnusedVariables` | [Settings](#settings); tsc's `noUnusedLocals` and `noUnusedParameters` hold the same |
| `eslint/no-use-before-define` | `noInvalidUseBeforeDeclaration` | [Settings](#settings) |
| `eslint/no-useless-assignment` | `noUselessAssignment` |  |
| `eslint/no-useless-backreference` | `noUselessRegexBackrefs` |  |
| `eslint/no-useless-call` | `noUselessCall` |  |
| `eslint/no-useless-catch` | `noUselessCatch` |  |
| `eslint/no-useless-concat` | `noUselessStringConcat` |  |
| `eslint/no-useless-constructor` | `noUselessConstructor` |  |
| `eslint/no-useless-escape` | `noUselessEscapeInRegex`, `noUselessEscapeInString` | strings and regular expressions |
| `eslint/no-useless-rename` | `noUselessRename` |  |
| `eslint/no-useless-return` | `noUselessReturn` |  |
| `eslint/no-var` | `noVar` |  |
| `eslint/no-void` | `noVoid` |  |
| `eslint/no-with` | `noWith` |  |
| `eslint/object-shorthand` | `useConsistentObjectDefinitions` |  |
| `eslint/operator-assignment` | `useShorthandAssign` |  |
| `eslint/prefer-arrow-callback` | `useArrowFunction` | narrower: callbacks only |
| `eslint/prefer-const` | `useConst` |  |
| `eslint/prefer-destructuring` | `useDestructuring` |  |
| `eslint/prefer-exponentiation-operator` | `useExponentiationOperator` |  |
| `eslint/prefer-named-capture-group` | `useNamedCaptureGroup` |  |
| `eslint/prefer-numeric-literals` | `useNumericLiterals` |  |
| `eslint/prefer-object-has-own` | `noPrototypeBuiltins` |  |
| `eslint/prefer-object-spread` | `useObjectSpread` |  |
| `eslint/prefer-regex-literals` | `useRegexLiterals` |  |
| `eslint/prefer-rest-params` | `noArguments` |  |
| `eslint/prefer-spread` | `useSpreadOverApply` |  |
| `eslint/prefer-template` | `useTemplate` |  |
| `eslint/preserve-caught-error` | `useErrorCause` |  |
| `eslint/radix` | `useParseIntRadix` |  |
| `eslint/require-await` | `useAwait` | `typescript/require-await`, its type-aware form, is not on |
| `eslint/require-unicode-regexp` | `useUnicodeRegex` |  |
| `eslint/require-yield` | `useYield` |  |
| `eslint/sort-imports` | `organizeImports` (an assist) | the names inside an import's braces ([Import order](#import-order)) |
| `eslint/symbol-description` | `useSymbolDescription` |  |
| `eslint/use-isnan` | `useIsNan` |  |
| `eslint/valid-typeof` | `useValidTypeof` |  |
| `eslint/vars-on-top` | `useVarsOnTop` |  |
| `eslint/yoda` | `noYodaExpression` |  |

### typescript

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `typescript/adjacent-overload-signatures` | `useAdjacentOverloadSignatures` |  |
| `typescript/array-type` | `useConsistentArrayType` |  |
| `typescript/await-thenable` | `useAwaitThenable` | type-aware |
| `typescript/ban-ts-comment` | `noTsIgnore` | `@ts-ignore` alone ([Settings](#settings)) |
| `typescript/ban-types` | `noBannedTypes` |  |
| `typescript/consistent-return` | (none) | type-aware |
| `typescript/consistent-type-exports` | `useExportType` | type-aware |
| `typescript/consistent-type-imports` | `useImportType` |  |
| `typescript/explicit-member-accessibility` | `useConsistentMemberAccessibility` | [Settings](#settings) |
| `typescript/method-signature-style` | `useConsistentMethodSignatures` |  |
| `typescript/no-array-delete` | (none) | type-aware |
| `typescript/no-base-to-string` | `noBaseToString` | type-aware; stricter than Biome's |
| `typescript/no-confusing-void-expression` | (none) | type-aware ([Type-aware rules](#type-aware-rules)) |
| `typescript/no-deprecated` | `noDeprecatedImports` | type-aware; broader (every use of a deprecated name) |
| `typescript/no-duplicate-enum-values` | `noDuplicateEnumValues` |  |
| `typescript/no-duplicate-type-constituents` | (none) | type-aware |
| `typescript/no-empty-interface` | `noEmptyInterface` |  |
| `typescript/no-explicit-any` | `noExplicitAny` |  |
| `typescript/no-extra-non-null-assertion` | `noExtraNonNullAssertion` |  |
| `typescript/no-extraneous-class` | `noStaticOnlyClass` |  |
| `typescript/no-floating-promises` | `noFloatingPromises` | type-aware |
| `typescript/no-for-in-array` | `noForIn` | type-aware; narrower: `for…in` over arrays only (`eslint/guard-for-in` holds Biome's `useGuardForIn`) |
| `typescript/no-generated-empty-object-type` | (none) | type-aware |
| `typescript/no-implied-eval` | (none) | type-aware |
| `typescript/no-inferrable-types` | `noInferrableTypes` |  |
| `typescript/no-invalid-void-type` | `noConfusingVoidType` |  |
| `typescript/no-meaningless-void-operator` | (none) | type-aware |
| `typescript/no-misused-new` | `noMisleadingInstantiator` |  |
| `typescript/no-misused-promises` | `noMisusedPromises` | type-aware |
| `typescript/no-misused-spread` | (none) | type-aware |
| `typescript/no-mixed-enums` | `useConsistentEnumValueType` | type-aware |
| `typescript/no-namespace` | `noNamespace` |  |
| `typescript/no-non-null-asserted-optional-chain` | `noNonNullAssertedOptionalChain` |  |
| `typescript/no-non-null-assertion` | `noNonNullAssertion` |  |
| `typescript/no-redundant-type-constituents` | (none) | type-aware |
| `typescript/no-require-imports` | `noCommonJs` |  |
| `typescript/no-restricted-types` | `noRestrictedTypes` | restricts nothing without options, in both |
| `typescript/no-this-alias` | `noUselessThisAlias` |  |
| `typescript/no-unnecessary-boolean-literal-compare` | (none) | type-aware |
| `typescript/no-unnecessary-condition` | `noUnnecessaryConditions` | type-aware; stricter than Biome's |
| `typescript/no-unnecessary-qualifier` | (none) | type-aware |
| `typescript/no-unnecessary-template-expression` | `noUnnecessaryTemplateExpression` | type-aware |
| `typescript/no-unnecessary-type-arguments` | (none) | type-aware |
| `typescript/no-unnecessary-type-assertion` | (none) | type-aware |
| `typescript/no-unnecessary-type-constraint` | `noUselessTypeConstraint` |  |
| `typescript/no-unnecessary-type-conversion` | `noUselessTypeConversion` | type-aware |
| `typescript/no-unnecessary-type-parameters` | (none) | type-aware |
| `typescript/no-unsafe-argument` | (none) | type-aware |
| `typescript/no-unsafe-assignment` | (none) | type-aware |
| `typescript/no-unsafe-call` | (none) | type-aware |
| `typescript/no-unsafe-declaration-merging` | `noUnsafeDeclarationMerging` |  |
| `typescript/no-unsafe-enum-assignment` | (none) | type-aware |
| `typescript/no-unsafe-enum-comparison` | (none) | type-aware |
| `typescript/no-unsafe-member-access` | (none) | type-aware |
| `typescript/no-unsafe-return` | `noUnsafeReturn` | type-aware |
| `typescript/no-unsafe-type-assertion` | `noUnsafeTypeAssertion` | type-aware |
| `typescript/no-unsafe-unary-minus` | (none) | type-aware |
| `typescript/no-useless-default-assignment` | (none) | type-aware |
| `typescript/no-useless-empty-export` | `noUselessEmptyExport` |  |
| `typescript/no-var-requires` | `noCommonJs` |  |
| `typescript/non-nullable-type-assertion-style` | (none) | type-aware |
| `typescript/parameter-properties` | `noParameterProperties` |  |
| `typescript/prefer-as-const` | `useAsConstAssertion` |  |
| `typescript/prefer-enum-initializers` | `useEnumInitializers` |  |
| `typescript/prefer-find` | `useArrayFind` | type-aware |
| `typescript/prefer-for-of` | `useForOf` |  |
| `typescript/prefer-function-type` | `useShorthandFunctionType` |  |
| `typescript/prefer-includes` | `useIncludes` | type-aware; `unicorn/prefer-includes`, the other equivalent, is not on |
| `typescript/prefer-literal-enum-member` | `useLiteralEnumMembers` |  |
| `typescript/prefer-namespace-keyword` | `useNamespaceKeyword` |  |
| `typescript/prefer-nullish-coalescing` | `useNullishCoalescing` | type-aware |
| `typescript/prefer-optional-chain` | `useOptionalChain` | type-aware |
| `typescript/prefer-promise-reject-errors` | (none) | type-aware |
| `typescript/prefer-readonly-parameter-types` | (none) | type-aware ([Type-aware rules](#type-aware-rules)) |
| `typescript/prefer-readonly` | `useReadonlyClassProperties` | type-aware |
| `typescript/prefer-reduce-type-parameter` | `useReduceTypeParameter` | type-aware |
| `typescript/prefer-regexp-exec` | `useRegexpExec` | type-aware |
| `typescript/prefer-return-this-type` | (none) | type-aware |
| `typescript/prefer-string-starts-ends-with` | `useStringStartsEndsWith` | type-aware |
| `typescript/promise-function-async` | (none) | type-aware |
| `typescript/related-getter-setter-pairs` | (none) | type-aware |
| `typescript/require-array-sort-compare` | `useArraySortCompare` | type-aware |
| `typescript/restrict-plus-operands` | `noUnsafePlusOperands` | type-aware |
| `typescript/restrict-template-expressions` | (none) | type-aware |
| `typescript/return-await` | (none) | type-aware ([Type-aware rules](#type-aware-rules)) |
| `typescript/strict-boolean-expressions` | `useStrictBooleanExpressions` | type-aware; stricter than Biome's |
| `typescript/strict-void-return` | (none) | type-aware |
| `typescript/switch-exhaustiveness-check` | `useExhaustiveSwitchCases` | type-aware |
| `typescript/unbound-method` | (none) | type-aware |
| `typescript/unified-signatures` | `useUnifiedTypeSignatures` |  |
| `typescript/use-unknown-in-catch-callback-variable` | (none) | type-aware |

### unicorn

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `unicorn/error-message` | `useErrorMessage` |  |
| `unicorn/explicit-length-check` | `useExplicitLengthCheck` |  |
| `unicorn/filename-case` | `useFilenamingConvention` | [Settings](#settings) |
| `unicorn/new-for-builtins` | `noInvalidBuiltinInstantiation` |  |
| `unicorn/no-array-for-each` | `noForEach` |  |
| `unicorn/no-document-cookie` | `noDocumentCookie` |  |
| `unicorn/no-empty-file` | `noEmptySource` |  |
| `unicorn/no-instanceof-array` | `useIsArray` |  |
| `unicorn/no-lonely-if` | `useCollapsedIf` |  |
| `unicorn/no-negated-condition` | `noNegationElse` |  |
| `unicorn/no-static-only-class` | `noStaticOnlyClass` |  |
| `unicorn/no-thenable` | `noThenProperty` |  |
| `unicorn/no-useless-switch-case` | `noUselessSwitchCase` |  |
| `unicorn/no-useless-undefined` | `noUselessUndefined`, `noUselessUndefinedInitialization` | not an argument or an arrow's body ([Settings](#settings)) |
| `unicorn/numeric-separators-style` | `useNumericSeparators` |  |
| `unicorn/prefer-array-flat-map` | `useFlatMap` |  |
| `unicorn/prefer-array-flat` | `noFlatMapIdentity` | broader: also `reduce` and `concat` flattening |
| `unicorn/prefer-array-index-of` | `useIndexOf` |  |
| `unicorn/prefer-array-some` | `useArraySome` |  |
| `unicorn/prefer-at` | `useAtIndex` |  |
| `unicorn/prefer-date-now` | `useDateNow` |  |
| `unicorn/prefer-dom-node-text-content` | `useDomNodeTextContent` |  |
| `unicorn/prefer-export-from` | `noExportedImports` |  |
| `unicorn/prefer-global-this` | `useGlobalThis` |  |
| `unicorn/prefer-math-min-max` | `useMathMinMax` |  |
| `unicorn/prefer-module` | `noGlobalDirnameFilename` | broader: all CommonJS forms and `"use strict"` |
| `unicorn/prefer-node-protocol` | `useNodejsImportProtocol` |  |
| `unicorn/prefer-number-properties` | `useNumberNamespace`, `noGlobalIsFinite`, `noGlobalIsNan` | broader: also `parseInt`, `NaN` and `Infinity` |
| `unicorn/prefer-optional-catch-binding` | `noUselessCatchBinding` |  |
| `unicorn/prefer-query-selector` | `useDomQuerySelector` |  |
| `unicorn/prefer-regexp-test` | `useRegexpTest` |  |
| `unicorn/prefer-response-static-json` | `useStaticResponseMethods` | narrower: `Response.json()` only, not `Response.redirect()` |
| `unicorn/prefer-string-slice` | `noSubstr` |  |
| `unicorn/prefer-string-trim-start-end` | `useTrimStartEnd` |  |
| `unicorn/require-number-to-fixed-digits-argument` | `useNumberToFixedDigitsArgument` |  |
| `unicorn/throw-new-error` | `useThrowNewError` |  |

### import

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `import/extensions` | `useImportExtensions` | [Settings](#settings) |
| `import/first` | `useImportsFirst` |  |
| `import/no-commonjs` | `noCommonJs` |  |
| `import/no-cycle` | `noImportCycles` |  |
| `import/no-default-export` | `noDefaultExport` |  |
| `import/no-duplicates` | `organizeImports` (an assist) | two imports of one module merged ([Import order](#import-order)) |
| `import/no-namespace` | `noNamespaceImport` | both from eslint-plugin-barrel-files' `avoid-namespace-import` |
| `import/no-nodejs-modules` | `noNodejsModules` | off in `tests/**`, `vitest.config.ts`, `lint/privates.ts` and `lint/stylelint/*.ts` |

### oxc

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `oxc/approx-constant` | `noApproximativeNumericConstant` | both from Clippy's `approx_constant` |
| `oxc/bad-min-max-func` | `noConstantMathMinMaxClamp` | Clippy's `min_max`: the same clamp check |
| `oxc/misrefactored-assign-op` | `noMisrefactoredShorthandAssign` | both from Clippy's `misrefactored_assign_op` |
| `oxc/no-accumulating-spread` | `noAccumulatingSpread` |  |
| `oxc/no-barrel-file` | `noBarrelFile` | [Settings](#settings) |
| `oxc/no-const-enum` | `noConstEnum` | tsc's `erasableSyntaxOnly` refuses it too |
| `oxc/only-used-in-recursion` | `noParametersOnlyUsedInRecursion` | both from Clippy's `only_used_in_recursion` |

### node

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `node/no-process-env` | `noProcessEnv` | the global `process` alone; `house/env` reads a `process` imported from `node:process` |

### promise

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `promise/no-nesting` | `noNestedPromises` |  |

### vitest

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `vitest/consistent-test-it` | `useConsistentTestIt` | in `tests/**` and `vitest.config.ts` ([Settings](#settings)) |
| `vitest/expect-expect` | `useExpect` |  |
| `vitest/max-nested-describe` | `noExcessiveNestedTestSuites` |  |
| `vitest/no-conditional-expect` | `noConditionalExpect` |  |
| `vitest/no-disabled-tests` | `noSkippedTests` |  |
| `vitest/no-duplicate-hooks` | `noDuplicateTestHooks` |  |
| `vitest/no-focused-tests` | `noFocusedTests` |  |
| `vitest/no-identical-title` | `noIdenticalTestTitle` |  |
| `vitest/no-standalone-expect` | `noMisplacedAssertion` |  |
| `vitest/prefer-hooks-in-order` | `useTestHooksInOrder` |  |
| `vitest/prefer-hooks-on-top` | `useTestHooksOnTop` |  |

### jest

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `jest/no-done-callback` | `noDoneCallback` | a jest rule, which oxlint runs on Vitest files |
| `jest/no-export` | `noExportsInTest` | a jest rule, which oxlint runs on Vitest files |

### jsx-a11y

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `jsx-a11y/alt-text` | `useAltText` |  |
| `jsx-a11y/anchor-ambiguous-text` | `noAmbiguousAnchorText` |  |
| `jsx-a11y/anchor-has-content` | `useAnchorContent` |  |
| `jsx-a11y/anchor-is-valid` | `useValidAnchor` |  |
| `jsx-a11y/aria-activedescendant-has-tabindex` | `useAriaActivedescendantWithTabindex` |  |
| `jsx-a11y/aria-props` | `useValidAriaProps` |  |
| `jsx-a11y/aria-proptypes` | `useValidAriaValues` |  |
| `jsx-a11y/aria-role` | `useValidAriaRole` |  |
| `jsx-a11y/aria-unsupported-elements` | `noAriaUnsupportedElements` |  |
| `jsx-a11y/autocomplete-valid` | `useValidAutocomplete` |  |
| `jsx-a11y/click-events-have-key-events` | `useKeyWithClickEvents` |  |
| `jsx-a11y/heading-has-content` | `useHeadingContent` |  |
| `jsx-a11y/html-has-lang` | `useHtmlLang` |  |
| `jsx-a11y/iframe-has-title` | `useIframeTitle` |  |
| `jsx-a11y/img-redundant-alt` | `noRedundantAlt` |  |
| `jsx-a11y/interactive-supports-focus` | `useFocusableInteractive` |  |
| `jsx-a11y/label-has-associated-control` | `noLabelWithoutControl` |  |
| `jsx-a11y/lang` | `useValidLang` |  |
| `jsx-a11y/media-has-caption` | `useMediaCaption` |  |
| `jsx-a11y/mouse-events-have-key-events` | `useKeyWithMouseEvents` |  |
| `jsx-a11y/no-access-key` | `noAccessKey` |  |
| `jsx-a11y/no-aria-hidden-on-focusable` | `noAriaHiddenOnFocusable` |  |
| `jsx-a11y/no-autofocus` | `noAutofocus` | reads React's `autoFocus` alone; `house/focuses` refuses Solid's `autofocus` |
| `jsx-a11y/no-distracting-elements` | `noDistractingElements` |  |
| `jsx-a11y/no-interactive-element-to-noninteractive-role` | `noInteractiveElementToNoninteractiveRole` |  |
| `jsx-a11y/no-noninteractive-element-to-interactive-role` | `noNoninteractiveElementToInteractiveRole` |  |
| `jsx-a11y/no-noninteractive-tabindex` | `noNoninteractiveTabindex` |  |
| `jsx-a11y/no-redundant-roles` | `noRedundantRoles` |  |
| `jsx-a11y/no-static-element-interactions` | `noStaticElementInteractions` |  |
| `jsx-a11y/prefer-tag-over-role` | `useSemanticElements` |  |
| `jsx-a11y/role-has-required-aria-props` | `useAriaPropsForRole` |  |
| `jsx-a11y/role-supports-aria-props` | `useAriaPropsSupportedByRole` |  |
| `jsx-a11y/scope` | `noHeaderScope` |  |
| `jsx-a11y/tabindex-no-positive` | `noPositiveTabindex` |  |

### react

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `react/button-has-type` | `useButtonType` | lets a spread after the type through, which `house/buttons` refuses |
| `react/iframe-missing-sandbox` | `useIframeSandbox` |  |
| `react/jsx-no-comment-textnodes` | `noCommentText` |  |
| `react/jsx-no-duplicate-props` | `noDuplicateJsxProps` |  |
| `react/jsx-no-script-url` | `noScriptUrl` |  |
| `react/jsx-no-target-blank` | `noBlankTarget` | reads the address only when it is a literal or a bare name ([Rules for JSX](#rules-for-jsx)) |
| `react/void-dom-elements-no-children` | `noVoidElementsWithChildren` |  |

### nextjs

| oxlint rule | Biome's | Note |
| -- | -- | -- |
| `nextjs/google-font-display` | `useGoogleFontDisplay` |  |

## The stylesheet

stylelint 18.0.0 lints the stylesheet (`public/css/`, `mise run lint:stylelint`, `.stylelintrc.yaml`), a warning failing
the check. Each rule is turned on by name, with no shared config extended (`stylelint-config-standard` or
`-recommended`), so a rule not named in `.stylelintrc.yaml` is off; each of stylelint's core rules and the candidate
plugins was considered, and is on or off with its reason below. The config's `reportDescriptionlessDisables`,
`reportNeedlessDisables` and `reportInvalidScopeDisables` make a suppression give its reason, be needed and name a rule
that is on; `tests/test_suppressions.py` counts each.

**How they are proven.** `tests/site/stylelint.test.ts` lints the fixtures in `tests/site/stylelint/` with the
repository's config: each rule on refuses a line written for it (an empty sheet and a string over two lines, which no
marked line holds, are CSS of the test's own), the suppressions' settings refuse a disable with no reason, one not
needed and one of a rule not on, and a sheet written the intended way passes.

### Biome's CSS rules

Each of Biome's CSS rules has its stylelint equivalent, by Biome's own metadata (`biome migrate stylelint`); the
`*-no-unknown` rules of both read the same data (CSSTree's).

| stylelint rule | Biome's |
| -- | -- |
| `font-family-no-missing-generic-family-keyword` | `useGenericFontNames` |
| `declaration-no-important` | `noImportantStyles` (the `[hidden]` rule is suppressed, [suppressed findings](../lint-false-positives.md)) |
| `selector-max-class` | `noExcessiveSelectorClasses`, given the limit it has no default for: 4 ([below](#the-stricter-rules)) |
| `function-linear-gradient-no-nonstandard-direction` | `noInvalidDirectionInLinearGradient` |
| `named-grid-areas-no-invalid` | `noInvalidGridAreas` |
| `no-invalid-position-at-import-rule` | `noInvalidPositionAtImportRule` |
| `custom-property-no-missing-var-function` | `noMissingVarFunction` |
| `function-no-unknown` | `noUnknownFunction` |
| `media-feature-name-no-unknown` | `noUnknownMediaFeatureName` |
| `property-no-unknown` | `noUnknownProperty` |
| `selector-pseudo-class-no-unknown` | `noUnknownPseudoClass` |
| `selector-pseudo-element-no-unknown` | `noUnknownPseudoElement` |
| `selector-type-no-unknown` | `noUnknownTypeSelector` |
| `unit-no-unknown` | `noUnknownUnit` |
| `selector-anb-no-unmatchable` | `noUnmatchableAnbSelector` |
| `at-rule-no-unknown` | `noUnknownAtRules`, and `noValueAtRule` (CSS Modules' `@value`, which is no CSS at-rule) |
| `media-type-no-deprecated` | `noDeprecatedMediaType` |
| `no-duplicate-at-import-rules` | `noDuplicateAtImportRules` |
| `declaration-block-no-duplicate-custom-properties` | `noDuplicateCustomProperties` |
| `font-family-no-duplicate-names` | `noDuplicateFontNames` |
| `declaration-block-no-duplicate-properties` | `noDuplicateProperties` |
| `no-duplicate-selectors` | `noDuplicateSelectors` |
| `keyframe-block-no-duplicate-selectors` | `noDuplicateSelectorsKeyframeBlock` |
| `block-no-empty` | `noEmptyBlock` |
| `no-empty-source` | `noEmptySource` |
| `keyframe-declaration-no-important` | `noImportantInKeyframe` |
| `no-irregular-whitespace` | `noIrregularWhitespace` |
| `declaration-block-no-shorthand-property-overrides` | `noShorthandPropertyOverrides` |
| stylelint's own parser: a `CssSyntaxError` fails the run; oxfmt (`format:site`) parses the file too | Biome's CSS parser |

### The stricter rules

| Rule (setting) | On or off | Reason |
| -- | -- | -- |
| The validity rules with no Biome twin: `annotation-no-unknown`, `at-charset-rule-no-invalid`, `at-rule-descriptor-no-unknown`, `at-rule-descriptor-value-no-unknown`, `at-rule-no-deprecated`, `at-rule-prelude-no-invalid`, `block-no-redundant-nested-style-rules`, `color-no-invalid-hex`, `comment-no-empty`, `declaration-property-value-keyword-no-deprecated`, `declaration-property-value-no-unknown`, `function-calc-no-unspaced-operator`, `media-feature-name-value-no-unknown`, `media-query-no-invalid`, `nesting-selector-no-missing-scoping-root`, `no-invalid-double-slash-comments`, `no-invalid-position-declaration`, `no-unknown-animations`, `no-unknown-custom-media`, `property-no-deprecated`, `selector-no-deprecated`, `selector-no-invalid`, `selector-no-unmatchable`, `string-no-newline`, `syntax-string-no-invalid`, `value-no-invalid` | on | each refuses CSS a browser drops or misreads: a value a property cannot take, an invalid prelude, an animation name no `@keyframes` defines |
| `selector-max-compound-selectors` (4) | on | the stylesheet's deepest is 4 (`.sentence-hero .live .friends b`); it stops descendant chains growing |
| `selector-max-class` (4) | on | the stylesheet's most is 4 |
| `max-nesting-depth` (0) | on | the stylesheet is flat, and `styles.test.ts`'s rules and `pipeline/generate.py`'s class reader read flat rules |
| `color-named` (`never`, `mask*` properties exempt) | on | a named colour would pass `styles.test.ts`, whose colours are hex and colour functions; `black` in a `mask-image` gradient is an opacity, not a colour |
| `color-hex-length` (`short`), `font-weight-notation` (`numeric`) | on | one spelling |
| Notations: `alpha-value-notation` (number), `color-function-notation` (modern), `color-function-alias-notation` (without-alpha), `hue-degree-notation` (angle), `lightness-notation` (percentage), `import-notation` (string), `selector-not-notation` (complex), `selector-pseudo-element-colon-notation` (double), `selector-attribute-quotes` (always), `display-notation` (short), `keyframe-selector-notation`, `length-zero-no-unit`, `number-max-precision` (4), `selector-type-case` (lower), `function-name-case` (lower), `comment-whitespace-inside` (always), `function-url-quotes` (never) | on | one spelling each, as the stylesheet writes it |
| `media-feature-range-notation` (`prefix`) | on | `media.ts`'s queries must be the stylesheet's own spelling (`styles.test.ts`), and prefix is the stylesheet's |
| `declaration-block-no-redundant-longhand-properties`, `shorthand-property-no-redundant-values` | on | a shorthand where it says the same (`flex-flow: row wrap`, `0.5rem` for `0.5rem 0.5rem`) |
| `selector-class-pattern` (kebab case: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) | on | `site/classes.ts` is generated from these names (`pipeline/generate.py` reads any `[\w-]`): the rule holds them to the form JSX's `class` is written in; Leaflet's are kebab case too |
| `custom-property-pattern`, `keyframes-name-pattern` (kebab case) | on | the tokens and the animations, in the same form |
| `function-url-scheme-allowed-list` (`data`) | on | the page's Content-Security-Policy refuses a remote `url()` as the page runs; this refuses it as it is written |
| `time-min-milliseconds` (100) | on | a duration under 100 ms is a typo for seconds; reduced motion's `0ms` is the rule's own exception |
| `at-rule-no-vendor-prefix`, `media-feature-name-no-vendor-prefix`, `property-no-vendor-prefix`, `selector-no-vendor-prefix`, `value-no-vendor-prefix` | on | the supported browsers are the latest; `-webkit-text-size-adjust`, iOS Safari's only form, is suppressed with its reason |
| `no-descending-specificity` | off | the stylesheet is ordered by component; specificity decides between weights (Biome's `noDescendingSpecificity` is off for the same reason) |
| `color-no-hex` | off | the design tokens are hex colours (Biome's `noHexColors`, off) |
| `selector-max-specificity` | off | a ceiling fitted to the stylesheet's worst selector holds nothing; with descending specificity off, specificity is how the stylesheet weighs rules |
| `selector-max-id` (0) | off | the one id is `#main:focus`, the skip link's target: a cap of 0 would suppress it for nothing gained |
| `selector-no-qualifying-type` | off | `button.link`, `dialog.search`, `input[type]` qualify on purpose: a class styles one kind of element |
| `selector-max-type`, `-universal`, `-attribute`, `-pseudo-class`, `-combinators` | off | a cap would only fit the stylesheet as it is; the compound and class caps bound a selector already |
| `unit-allowed-list` | off | each unit in use is meant (`fr`, `dvh`, `svh`, `deg`, `ms`); a list of the units in use refuses nothing wrong |
| `declaration-property-unit-allowed-list` | off | fluid type is `clamp(rem, vw, rem)` by design; Leaflet's attribution is `10px`; one `line-height` is in rem |
| `selector-id-pattern`, `container-name-pattern`, `layer-name-pattern`, `custom-media-pattern` | off | nothing to hold (no id but `#main`, no container name, no layer or custom media); to turn on with the first |
| `no-unknown-custom-properties` | off | `--w` (`artists.tsx`'s `styled`) and `--header-h` (`main.ts`) are set by the code, which stylelint cannot see; `styles.test.ts` checks each token read is defined by a rule or the code |
| `value-keyword-case` (`lower`) | off | case only, and it misreads `Roboto` inside `--font` and `currentColor` |
| `font-family-name-quotes` | off | quotes only; it skips `--font`, which quotes the same names, so the sheet would spell one font two ways |
| `declaration-property-value-disallowed-list`, as a copy of `styles.test.ts`'s token rule | off | it would state `styles.test.ts`'s token rule (hex and colour functions outside the tokens, `cubic-bezier`, literal durations and `z-index`) twice; moving that rule to stylelint is a change of its own |
| `property-layout-mappings`, `unit-layout-mappings`, `value-keyword-layout-mappings` (`flow-relative`: logical properties) | off | the site has no right-to-left or vertical text: some 350 rewrites for no visitor. Core rules, so no plugin is needed if that changes |
| Layout: `rule-empty-line-before`, `comment-empty-line-before`, `at-rule-empty-line-before`, `declaration-empty-line-before`, `custom-property-empty-line-before` | off | layout is oxfmt's (`format:site`) |
| The list rules (each `*-allowed-list` and `*-disallowed-list` but those above, `comment-word-disallowed-list`, `rule-selector-property-disallowed-list`, `declaration-property-max-values`, `rule-nesting-at-rule-required-list`, `at-rule-property-required-list`, `declaration-property-custom-property-allowed-list`, `value-type-custom-property-required-list`) | off | each needs a list the house has no rule for |

Biome's `noExcessiveLinesPerFile` has no stylelint equivalent, and is not needed: the stylesheet is one file, ordered by
component. Its `useBaseline` is the house rule `house/baseline` ([below](#the-browser-check-housebaseline)).

The plugins considered, each a new dependency; none is used:

| Plugin | Why not |
| -- | -- |
| `stylelint-browser-compat` (MDN's browser-compat-data, reads `browserslist`) | a perpetual beta from one maintainer, whose MDN data lags a year and which needs a `packageExtensions` entry to load under pnpm; the browser check is `house/baseline`, on `web-features` |
| `stylelint-no-unsupported-browser-features` (doiuse, caniuse) | blind to the CSS the site uses (`@starting-style`, view transitions, `@scope`, `text-wrap`, anchor positioning, `field-sizing`, …), even against older browsers |
| `stylelint-plugin-use-baseline` | Baseline, not the declared browsers, and no stylelint 18 support |
| `@double-great/stylelint-a11y` | its two main rules misread the design: reduced motion zeroes the duration tokens in `:root`, and colour schemes swap tokens, so each animated or coloured rule is reported; the rest is noise or meant (`#main:focus`'s outline, Leaflet's attribution) |
| `stylelint-declaration-strict-value` | it lets any function through (`rgb()`, `oklch()`, `cubic-bezier()`), which `styles.test.ts` catches; core `declaration-property-value-disallowed-list` would do it with no dependency |
| `stylelint-use-logical`, `stylelint-plugin-logical-css`, `stylelint-use-logical-spec` | logical properties are off, and the core layout-mapping rules would hold them |
| `stylelint-high-performance-animation` | its main finding misreads `display` transitions, the `@starting-style` pattern |

### The browser check: house/baseline

`house/baseline` (`lint/stylelint/baseline.ts`, `.stylelintrc.yaml`'s `plugins`, set `months: 12` and an `allowed` list)
refuses a CSS feature of the stylesheet that has not been in every declared browser for at least 12 months. It is the
house's own stylelint plugin: TypeScript, which stylelint loads by `import()` and Node 22 runs by stripping its types
(the house writes erasable syntax only, `tsconfig.json`'s `erasableSyntaxOnly`); tsc checks it with the house rules
(`tests/site/tsconfig.json` includes `lint/`) and oxlint lints it, with one override of its own, Node's modules allowed
(`.oxlintrc.json`), and PostCSS's nodes in `prefer-readonly-parameter-types`' `allow`. It exports `ruleName` and `rule`,
which stylelint takes for the plugin of a module with no default export.

- **Data:** `web-features` 3.45.0, the WebDX group's Baseline data, one dev dependency pinned exactly; each piece of CSS
  is looked up by its BCD key in `status.by_compat_key`, the status of that key (a keyword can be newer than its
  property).
- **Browsers:** `package.json`'s `browserslist`, the one place they are declared: `last 1 <browser> version` of Chrome,
  Edge, Firefox, Safari, iOS Safari, Chrome Android and Firefox Android (`chrome`, `edge`, `firefox`, `safari`,
  `ios_saf`, `and_chr`, `and_ff`), which is Baseline's core browser set. The rule reads the list (a query in any case,
  as browserslist reads it) and fails on a query of another form, a browser outside that set, which `web-features` has
  no support for, or a browser named twice. Nothing else reads the field: Vite's bundle is byte for byte the same with
  it.
- **The date:** the day a feature reached every declared browser is the latest of the releases its support names in each
  (`status.support` and `browsers.<browser>.releases`); for the core set that is `web-features`' own
  `baseline_low_date`, the same for each of the data's keys. A feature passes when that day is at least `months` (12)
  months before today, the clock's: the tests pin the clock (`tests/site/stylelint.test.ts`, 14 October 2026). A feature
  missing from a declared browser, or which the data gives no Baseline (`baseline: false`, a discouraged feature among
  them), is refused whatever its date.
- **The message** names the CSS as written, the feature and its key, and either the day it reached every browser and the
  latest day allowed
  (`at-rule "@scope" (web-features' "@scope", css.at-rules.scope) reached every declared browser on 2026-03-24, after 2025-10-14, 12 months before today`),
  the browsers it is missing from, or, for one in every declared browser that the data gives no Baseline, that it has
  none (`discouraged` where it is). It stands at the start of its declaration, rule or at-rule, the line a suppression
  on the line before covers however a value or a list of selectors is laid out.
- **`allowed`:** BCD keys the rule lets through wherever they are used, each with its reason as a comment beside it in
  `.stylelintrc.yaml`, for a lack no visitor meets: `css.properties.cursor.pointer` and `css.properties.cursor.default`,
  since a touch screen draws no cursor, so iOS Safari's lack of cursor keywords is harmless. The list cannot rot: a key
  the data does not have, one nothing would refuse (in every declared browser for `months` months), and one that let
  nothing of the stylesheet through (its CSS gone) are each refused on their own, as `reportNeedlessDisables` refuses a
  suppression with nothing to suppress. The last is sound because `lint:stylelint` lints one stylesheet,
  `public/css/site.css`; a second would need its keys of its own. The options are validated: `months` is required, and
  `allowed` is a list.

What it reads, ported from `@eslint/css`'s `use-baseline` (2.0.1, read from its package, not a dependency):

| CSS | Key |
| -- | -- |
| a property | `css.properties.<property>` |
| a keyword of a property's value, its functions left out with their arguments | `css.properties.<property>.<keyword>`, else a longhand's for the shorthands `font`, `text-decoration`, `background`, `transition`, `animation`, `list-style`, `text-wrap` and `white-space` (`font`'s `ui-monospace` is `css.properties.font-family.ui-monospace`), else a global keyword's `css.types.global_keywords.<keyword>` |
| `text-decoration` with a style or colour, with a thickness | `css.properties.text-decoration.includes_color-and-style`, `css.properties.text-decoration.includes_thickness` |
| a function | the property's own, `css.properties.<property>.<function>_function` (`fit-content()`, `palette-mix()`), else `css.types.<type>.<function>` for the types that hold functions (colours, gradients, images, filters, easings, basic shapes, transforms; `linear()` is `css.types.easing-function.linear-function`), else `css.types.<function>` (`calc()`, `clamp()`, `var()`; `attr()`'s `type()` is `css.types.attr.type_function`); a custom one, `--name()`, `css.types.dashed-function` |
| a unit | `css.types.length.<unit>`, the angles' and resolutions'; the viewport and container units by their group's key |
| an at-rule, a descriptor of one that holds them (`@font-face`, `@property`, `@counter-style`, `@page`, `@font-palette-values`, `@font-feature-values`, `@view-transition`, `@position-try`) | `css.at-rules.<at-rule>`, `css.at-rules.<at-rule>.<descriptor>`; a declaration in `@media`, `@supports`, `@container`, `@layer`, `@scope` or `@starting-style` is a property's |
| a media feature, the range syntax | `css.at-rules.media.<feature>`, `css.at-rules.media.range_syntax` |
| a pseudo-class or pseudo-element, `&` | `css.selectors.<name>`, `css.selectors.nesting` |

A key is matched in any case (the data's `currentColor`, `scaleX`). What an `@supports` tests for is not checked under
it, per property as in `use-baseline`: the property, and the keywords, units and functions of the value tested for it
(`@supports (width: 1rcap)` lets `width: 1rcap` through, and `@supports (text-wrap: balance)` does not let
`text-wrap: pretty`); a `selector()`'s pseudo-classes and elements; an outer `@supports`'s too. A test under `not`
guards nothing, `not selector()` among them, as `use-baseline` skips what follows a `not`; unlike `use-baseline`, which
takes each test of a condition, an `or` guards only what each of its sides tests, since a browser that has one side only
applies the block. A property refused has its keywords left alone, as in `use-baseline`. It differs in the threshold (a
feature's day in the declared browsers, not Baseline's widely or newly available, nor a year), in reading each key's own
status rather than its feature's, in adding descriptors and the range syntax, and in its exceptions: one list of keys,
each with its reason and refused once it is needless, in place of `use-baseline`'s allow-lists by kind of syntax; any
other exception is a suppression on its line.

It does not see, and lets through: what the data has no key named for, such as a vendor-prefixed property or keyword
(the `*-no-vendor-prefix` rules refuse them), a subfeature keyed by what it does rather than how it is written
(`transition: display … allow-discrete`, `css.properties.transition-behavior.transitionable_display`; `rgb(from …)`'s
relative syntax; `font-face`'s `src` formats), the shape of a shorthand's value but `text-decoration`'s (`overflow`'s
two keywords, `background`'s layers, `border-radius`'s four values: each long in every browser today), a keyword of a
shorthand the table does not list that the data keys under its longhand alone, a property named inside a value
(`overlay` in a transition list, Chrome's alone), an identifier that is no keyword of its property (a font family, an
animation's name), a custom property's name and value keywords (its functions and units are read), the conditions of
`@container` and `@supports`, and a selector's combinators and attribute forms. Unknown syntax is let through rather
than refused: the validity rules refuse what no browser knows, and this rule refuses only what the data dates.

On the stylesheet, what it would refuse is each in a browser's fallback by design. `cursor: pointer` and
`cursor: default`, not in iOS Safari, are let through by `allowed`; eight lines are suppressed with their reason
([suppressed findings](../lint-false-positives.md)): `overscroll-behavior: contain` (4), which Safari applies only to a
panel that overflows, a partial support this data counts as none; `ui-monospace` (2, a `font-family` and a `font`),
Safari's alone, first in a font stack; `text-wrap: pretty` (1), not in Firefox; `forced-color-adjust: none` (1), not in
Safari, inside `@media (forced-colors: active)`. A dotted underline is written as its longhands, `text-decoration-line`,
`-style` and `-color`, each in every browser for years: the `text-decoration` shorthand with a style or colour reached
every declared browser on 12 December 2025 (Safari 26.2). The newest features it passes are view transitions (14 October
2025), `backdrop-filter` (16 September 2024) and `@starting-style` (6 August 2024).

Because `reportNeedlessDisables` refuses a suppression with nothing to suppress, an upgrade of `web-features` that puts
one of these in every browser for 12 months fails the check until its suppression is deleted; a suppression of a feature
only too recent would fail it on the day the feature turns 12 months, with no change to the repository.

Its fixtures are `tests/site/stylelint/`'s: a refused line for a property, a keyword (a shorthand's among them), a
value's shape, an at-rule, a selector, a function (a property's own, a custom one), a unit, a media feature, a
descriptor, a property nested in `@media`, and what an `@supports` does not guard (an untested keyword of a tested
property, a `not` test, `not selector()`, one side of an `or`), each too recent on the tests' day or missing from a
browser; in `good.css` a feature of each kind it passes, one 12 months to the day, what an `@supports` tests for (a
keyword, a function, a unit, a selector, both sides of an `and`), a string's words, and the allowed cursor keywords;
`stylelint.test.ts` also reads the messages, a key of each kind at 60 months, a nested `@supports`, the month's end, an
allowed key refused once not allowed and once unused, one nothing would refuse, one the data lacks, and options without
`months` or with `allowed` not a list.

## The JSON configs

The JSON configs at the root (`.jscpd.json`, `.oxfmtrc.jsonc`, `.oxlintrc.json`, `knip.jsonc`, `package.json`,
`tsconfig.json`) have no linter: `tests/test_configs.py` holds what one would, and runs in `check:fast`, before each
commit, through `lint:configs`, and in `test:py`.

| Check | Held by | Biome's |
| -- | -- | -- |
| the file parses | oxfmt (`format:site`) refuses a config that does not, as each tool reading it does (pnpm, tsc, oxlint, knip, jscpd) | its JSON parser |
| no key written twice in one object | `tests/test_configs.py`, comments skipped as the tools skip them (oxfmt lays a duplicate out without a word, and every reader takes the last value) | `noDuplicateObjectKeys` |
| no empty key | `tests/test_configs.py` | `noEmptyObjectKeys` |
| no package written twice in one group of dependencies, nor in both `dependencies` and `devDependencies` | `tests/test_configs.py` | `noDuplicateDependencies` |
| no empty file | the readers: an empty `.json` is a parse error to pnpm, tsc and oxlint | `noEmptySource` |

Not held: a config whose top level is not an object (Biome's `noTopLevelLiterals`, information only; each reader wants
an object, and the test reads each as one), and `package.json`'s required scripts (`useRequiredScripts`, which checks
nothing without a list of them).
