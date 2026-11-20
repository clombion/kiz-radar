# Refactor plan: Solid 2.0 and the Oxc toolchain

The brief, reviewed against the repository on 18 November 2026, is [refactor-brief.md](refactor-brief.md). It holds the
decisions, the repo facts each task relies on (`file:line`), and the open questions; where it disagrees with this plan
or a task plan, the newer document holds. This plan orders the work; each task gets its own implementation plan before
its first commit; task 1.1's is [refactor-task-1.1.md](refactor-task-1.1.md). Each task is one commit series; every
commit passes `mise run check` (the push hook enforces it). A phase starts only when the previous one's "done when"
holds and its report is written ("Phase reports", at the end).

Legend: **Q*n*** = blocked on the owner's answer to that open question (brief, "Open questions for the owner"). **Stop**
= on the brief's stop-and-ask list.

## Phase 1: tests that survive a rewrite

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 1.1 | Baseline and the app-test helper | (a) record the tests per project and file, their full names, coverage over `site/**` and Biome's output; (b) the test server answers `/data/` from the fixture only; (c) `tests/site/app.ts`: `startSite` and `startReview` start the page on planted data (a function over the database, before start), a stated day, seeded storage and given answers for other hosts, owning `fetch` and `Date` for the file (one start per file); `open(href, on?)` opens a route as a new page, on another day if given; (d) its own tests, one per option, each failing if the option is ignored, and the server rule's own (`server.browser.test.ts`); (e) port `main.browser.test.ts`, its "view that throws" test moved to `broken.browser.test.ts` | no test page can read the real build's data; the helper and its tests pass; `main.browser.test.ts` uses it with no view import (its `done` reached through the page in 1.2); the other browser files pass unchanged; baseline in the Phase 1 report |
| 1.2 | What tests need from `site/`, out of the view modules (Q1: yes) | each export a test reads is either moved, one move per commit with no behaviour change, or replaced by what the page shows when its file moves onto the helper (1.3 to 1.6); [refactor-task-1.2.md](refactor-task-1.2.md) decides each: `WIDE` moves to `site/media.ts` (a node test binds it to the stylesheet), `icons.ts` stays and counts as a data module (its one write, `Drawing.into`, takes only its own SVG), `main.browser.test.ts` reaches `done` through the page; the other ten (`festivals()`, `withDetails`, `friendsIn`, `togetherHref`, `NEAR_KM`, `NAMED_UP_TO`, `citiesOf`, `cityEntries`, `PAD`, `SAID_MS`) are replaced by visible outcomes, listed there | every value a test that stays needs from `site/` lives in a module that draws nothing (or `icons.ts`); the rest are listed with what replaces them |
| 1.3 | `views.browser.test.ts` through the app, by view and by planted data | each assertion becomes what the route shows; every change to the live database (25 calls of `withTrips`, `withAdded` and `withStays`, and the direct writes) becomes rows planted before start; a variant of a community's added people is another community in the same file, a variant of a festival, a trip or who lives where a file of its own ([refactor-task-1.3.md](refactor-task-1.3.md)) | the file is gone; no test imports a view but those 1.4 to 1.6 port; each old test is in the ledger |
| 1.4 | `onnow`, `flights`, `map`, `updating` browser tests through the app | plant crafted rows before start; give the day per page (`open(href, on)`); a file of its own only for data that contradicts another file's; `updating.ts`'s stored time across a reload as the same two-file pair as 1.5; `shipped.ts` goes with its last user | same |
| 1.5 | `review.browser.test.ts` through `review.html` | start the review page with its fixture, drive it; "kept across a reload" as two files joined by one shared constant: the first drives the page and asserts the storage entry equals it, the second starts with the entry seeded from it and asserts what the page shows (owner, 19 November) | same |
| 1.6 | `page.browser.test.ts`: the helpers' tests | user-visible ones (tab oval, slide, dialog history, paged list, dismissable card) through the app; tests `:16`, `:41`, `:168` of `h()` itself: replaced by page-level tests of the same guarantees (Q5); the originals stay until `h()` goes in 4.10 | same |
| 1.7 | Node tests `states.test.ts`, `styles.test.ts` | import only pure modules (after 1.2) | same |
| 1.8 | The rule: tests import no view module | Grit rule in `lint/`, listed in `biome.jsonc`; the allowed list (the brief's pure, browser-API and data modules, its "Which `site/` modules are views") kept in one place and named by the message; `import type` allowed; dynamic `import()` of the two entries allowed; a test running `biome lint` on a must-fail and a must-pass file; `page.browser.test.ts` allowed its imports of `dom`, `tabs`, `modal` and `dismiss` by name until the tests it keeps go with their helpers: `pill` and `modal` with 4.5, `dismissable` with 4.6, `paged`, `toggle` and `h()` with 4.10, the allowance removed with the file (task 1.6) | the rule passes on the repo and its two-file test passes |
| 1.9 | Phase 1 report | the ledger (old test → new test, or "cannot be tested through the page" and why); coverage before/after; counts; decisions; brief errors | report written |

## Phase 2: lint and format on the Oxc toolchain, unchanged code

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 2.1 | Spike: the toolchain loads together | in a scratch copy, on the current versions: one file, type-aware on, one JS plugin rule, `eslint-plugin-solid` loaded; a frozen-lockfile install holds the linux and darwin binaries; each tool is pinned in the commit of the task that first uses it (`oxfmt` 2.2, `oxlint` and `oxlint-tsgolint` 2.4, `eslint-plugin-solid` 4.2), so knip needs no exception for an unused package ([refactor-task-2.1.md](refactor-task-2.1.md)) | type-aware linting, a JS plugin and `eslint-plugin-solid` run together on the versions recorded, or a stop with evidence |
| 2.2 | oxfmt replaces Biome's formatter | scope to Biome's formatted files, 132 by then (`site/states.ts` and other generated files ignored, generators fixed if they disagree); one formatting-only commit; `mise run format`, `CONTRIBUTING.md` ([refactor-task-2.2.md](refactor-task-2.2.md)) | `oxfmt --check` clean; Biome's formatter off |
| 2.3 | The rule mapping | `biome rage --linter` → table of each rule, its oxlint equivalent, settings ported (`no-use-before-define` functions off, `eqeqeq` null, `max-params` 4, accessibility no `public`, `consistent-test-it`, per-folder exceptions); the 43 info-level findings of 9 rules (**Q2**); unmapped rules beyond the 11 accepted losses listed once (**Stop**) ([refactor-task-2.3.md](refactor-task-2.3.md)) | mapping doc in `docs/concepts/`, owner has approved the losses |
| 2.4 | `.oxlintrc.json` with the mapped rules, on unchanged code | bare mapping, then the type-aware findings one by one: fix real issues; false positives as line suppressions plus `docs/lint-false-positives.md`; `tests/test_suppressions.py` learns `oxlint-disable-next-line`; lint `vitest.config.ts` too | oxlint, type-aware, zero findings and warnings; Biome's TS rules still on in parallel |
| 2.5 | Fixture test harness | `tests/site/rules.test.ts` runs oxlint JSON on `lint/fixtures/`, compares expected findings, fails on a rule without fixtures; fixtures out of the main run, `tsc`, knip, jscpd | the harness runs under `test:site` |
| 2.6 | Port the 13 house rules, one per commit | each: JS plugin rule, message and exemptions kept, bad/good/exempt fixtures, Biome's copy removed in the same commit; `states` from the generator (`pipeline/generate.py` writes the key list; docs that name `lint/states.grit`); done ([refactor-task-2.6.md](refactor-task-2.6.md)) | `lint/*.grit` gone; each rule's fixtures pass |
| 2.6b | The unmapped rules the owner keeps | house rules for `noThisInStatic`, `noPrivateImports`, `useJsonImportAttributes`, `useNodeAssertStrict`, and `noProcessGlobal` for `tests/`, one per commit with fixtures (owner, 19 November; [lint rules](docs/concepts/lint-rules.md), "Unmapped"); the other 17 accepted as losses; done ([refactor-task-2.6b.md](refactor-task-2.6b.md)) | the five rules pass their fixtures |
| 2.6c | The type-aware rules new in oxlint | all 33 on (owner, 19 November; [lint rules](docs/concepts/lint-rules.md), "New in oxlint"): the site's record types made read-only at their definitions for `prefer-readonly-parameter-types` (`allow` for DOM, Node and sql.js types), `promise-function-async` (a synchronous throw becomes a rejection), the other findings fixed; done ([refactor-task-2.6c.md](refactor-task-2.6c.md)) | oxlint passes with the 33 on |
| 2.6d | The card's drawings as data, and drawings hidden by construction | the drawings a community card draws kept as data the generator writes into the site, so its digest is theirs, not `icons.ts`'s; `Drawing` hides every drawing from assistive technology, `review.ts`'s own SVG made by it (the arrow and the map's chevron were hidden only by their callers); done ([refactor-task-2.6d.md](refactor-task-2.6d.md)) | a comment in `icons.ts` leaves the cards current; no SVG without `aria-hidden` |
| 2.7 | Biome to CSS and JSON only | JS linter off, formatter off, `files.includes` without `site/**` and `tests/**/*.ts`, plugins and TS overrides gone; `tests/test_suppressions.py`'s file-set test rewritten; done ([refactor-task-2.7.md](refactor-task-2.7.md)) | Biome touches no `.ts` |
| 2.8 | Tasks, docs, the out-of-scope constraint | `lint:site` split (oxlint / Biome CSS+JSON / oxfmt check) in `check:fast`; `mise run generate` for `commands.md`; `CONTRIBUTING.md`, `docs/guides/the-site.md`, `docs/README.md`; record "user pages never generated from committed data"; done ([refactor-task-2.8.md](refactor-task-2.8.md)) | `mise run check` green; Phase 2 report written |

## Phase 3: Vite build, still on `h()`

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 3.1 | Spike: Vite on this code | pin `vite` at Vitest's version; inputs `main`, `review`, `icons` with fixed names, flat `public/js/`, `base: './'`, no HTML, no preload polyfill; check what it does with the four `new URL(…, import.meta.url)` sites and with `icons.js`'s exports; done ([refactor-task-3.1.md](refactor-task-3.1.md): `vite` 8.3.5, no `icons` input, nothing reads it since 2.6d) | evidence for each, in the phase report draft |
| 3.2 | Switch the build | `vite.config.ts`; `build` = `vite build` then `vendor`; `tsconfig.json` `noEmit`, `allowImportingTsExtensions`; knip, oxlint and `tests/site/tsconfig.json` know the new file; done, the root-file branch removed later on the owner's yes ([refactor-task-3.2.md](refactor-task-3.2.md): `vite` 8.3.8, `main.js`, `review.js`, `shared-<hash>.js`, no warning) | `mise run build:site` builds; `generate:check` clean (`render:design` checks nothing the build touches since 2.6d) |
| 3.3 | Tests against the build | `pages.browser.test.ts` passes; a smoke set of routes and `review.html` in a frame of the built site under the CSP, added to `pages.browser.test.ts`; done ([refactor-task-3.3.md](refactor-task-3.3.md): eleven pages, each drawn with no alert, failed request, CSP violation or console error) | green |
| 3.4 | Served files and docs | list `public/` before and after; load index, review, a community page, an old `#community/<key>` link; `build:site` description, `docs/guides/the-site.md`, `CONTRIBUTING.md`; done ([refactor-task-3.4.md](refactor-task-3.4.md): 57 module scripts gone, `shared-<hash>.js` come, the rest the same; the loads are 3.3's smoke set) | Phase 3 report written (and the `pages.yml` comment mentioned, not edited) |

## Phase 4: Solid 2.0, view by view

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 4.1 | Install and wire Solid | pin `solid-js`, `@solidjs/web`, `@solidjs/compiler`, `@solidjs/vite-plugin` (Q3, settled by Q6: 2.0.3, 2.0.3, 2.0.2, 3.0.1); check `node_modules/solid-js/skills/` exists and read it; `jsx: preserve`, `jsxImportSource`; plugin in `vite.config.ts` and the Vitest browser project; development condition in tests only; done ([refactor-task-4.1.md](refactor-task-4.1.md): `tests/site/hello.tsx` drawn from the tests and from the site's build, `public/js/` unchanged) | a trivial `.tsx` component renders in a test and in the build |
| 4.2 | Lint for Solid | `eslint-plugin-solid` `v2-strict` via `jsPlugins`; the four migration rules with fixtures (incl. `createSignal<T>`, `let loading = true`, `loading` imported from `ui.ts`, `pending.ts`); house rules widened to `.tsx` (`states`, `buttons`, `markup` refusing the `innerHTML` prop, a rule refusing a string `style`); new house rules (owner, 19 November): `noSuspiciousSemicolonInJsx`, `noDuplicatedSpreadProps`, and `<svg>` in JSX refused outside `icons.ts`; done ([refactor-task-4.2.md](refactor-task-4.2.md): `eslint-plugin-solid` 0.20.0, 32 of `v2-strict`'s rules on, warnings as errors; nine house rules added (`thens`, `flags`, `mirrors`, `legacy`, `styles`, `focuses`, `semicolons`, `spreads`, `svgs`), three widened; `styles` refuses the `style` prop, which the compiler writes into the template for constant values) | fixtures pass |
| 4.3 | Console failures | browser `setupFiles` fails a test on any undeclared console warning or error; a way to declare the expected ones (`report.ts`); confirm Solid's dev diagnostics fire for wrong-scope writes and top-level reads; done ([refactor-task-4.3.md](refactor-task-4.3.md): `tests/site/console.ts`'s guard and `expectConsole`, the setup file of both browser projects; two tests failed on the first run, each on an error `report.ts` says on purpose, now declared; a read in a component's body warns `STRICT_READ_UNTRACKED`, a write in it throws `REACTIVE_WRITE_IN_OWNED_SCOPE` and halts Solid, `tests/site/diagnosed.tsx` keeping both shown) | an unexpected warning fails a test |
| 4.4 | Coexistence seam | move `dom.ts`'s non-rendering helpers (`debounced`, `onResize`, `uniqueId`, types) to a module of their own; a Solid view behind the `View` signature, disposed on the signal; `routes.ts` wrapped as one signal; CSP check of the compiler's style output; done ([refactor-task-4.4.md](refactor-task-4.4.md): the helpers in `site/bits.ts`; the address one signal (`site/address.ts`) the router follows in an effect; `site/mount.tsx` renders a view under the page's owner (`site/owner.ts`), in an error boundary saying a failure as `guarded` does, disposed on the signal; This week the first view (`site/week.tsx`, moved from 4.8), its `eventcard` cards still `h()`'s; `tests/site/bundle.test.ts` refuses a style, an `on…` attribute, a `javascript:` URL or a `<style>`/`<script>`, a `srcdoc` in the built markup; JSX `class` typed by `ClassName` through the site's own JSX types, `site/jsx-runtime.d.ts`) | one `.tsx` view mounted inside the `h()` page |
| 4.5 | The shell | header and tabs, sub-navigation, footer, dialog host (`modal`), search combobox, currency switch, updating, report; `page.browser.test.ts`'s kept tests of `pill` and `modal` deleted with them (task 1.6); done ([refactor-task-4.5.md](refactor-task-4.5.md): the shell's parts drawn once under the page's owner through `site/placed.tsx`, each in a boundary that reports, `<body>` their delegated root (`site/body.ts`); the problem line a JSX element with no signal, said after a halt; `tabs.tsx`'s `Row` for both rows of tabs, `shell.tsx` for the footer's links, its currency switch, the skip link and Back to top, `dialog.tsx` for the dialog host and the quick views, `search.tsx`, `updating.tsx` drawn once for two calls; `updating` moved from 4.8; no `X.ts` beside an `X.tsx` (`tests/test_structure.py`)) | one commit per piece, suite green |
| 4.6 | Shared pieces | `eventcard` with `details`, `passes`, `flights`; `plans`' renderers; `ui`'s element helpers; `gantt`, `months`, the community page's cards, with `dismissable`, whose kept test in `page.browser.test.ts` is deleted with it (task 1.6); done ([refactor-task-4.6.md](refactor-task-4.6.md): each piece a function returning JSX, its state signals; the `h()` views hold one through `mount.tsx`'s `held` (and `heldNodes`), with their signal; the quick views (`dialog.tsx` `peek`) drawn from what their opener hands them, each part in `placed.tsx`'s `Reported`; `ui`'s marks in `marks.tsx`; `dismissable` replaced by `over.ts`'s signal of the card open, its kept test gone and `house/tests`' allowance narrowed to `dom.ts`) | same |
| 4.7 | Stateful views | `sentence`, `communities`, `friends`, `artists`, `map` (Leaflet stays an imperative island), `countries`, `people`; done ([refactor-task-4.7.md](refactor-task-4.7.md): each a function of its address mounted through `mount.tsx`'s `mounted`, its choices a signal (`controls.tsx` `chosen`), what its `render()` drew anew drawn anew from it, a part drawn again in `Redrawn`, what other parts read of it through `createDerived`; the controls `dom.ts` gave them in `site/controls.tsx`; Leaflet made in `onSettled` and removed after its zoom; `held`, `heldNodes`, `redraws`, `heldCard`, `heldTag` gone, `main.ts`'s loading mark through `placed.tsx`) | same |
| 4.8 | Read-only views | `sources`, `tables` (`week` was 4.4's first view, `updating` part of 4.5's shell) | same |
| 4.9 | The review dashboard | `review.ts` as its own series | same |
| 4.10 | Finishing | delete `h()` and `replaceChildren` from `dom.ts`, and `page.browser.test.ts` with its kept tests of `paged`, `toggle` and `h()` (Q5, task 1.6); retire `markup`, `classes`, `buttons`, `clicks` only with a fixture proving the replacement; rewrite kept rules' messages; `CLAUDE.md` conventions and the Solid skills; `CONTRIBUTING.md`, docs, `tests/test_suppressions.py` (and revisit the `jsx-a11y/prefer-tag-over-role` suppressions 4.6 kept for identical markup: `months.tsx`, `marks.tsx`, `gantt.tsx`); remove `refactor-brief.md`, `refactor-plan.md`, `refactor-ledger.md` and the task plans | Phase 4 "done when" holds; report written |

## Open questions (from the brief's review)

- **Q1.** May Phase 1 move pure exports out of mixed view modules, as move-only commits? **Answered 18 November: yes,
  move-only commits.**
- **Q2.** The info-level Biome findings, 43 of 9 rules on 19 November (38 at the baseline; the five more are in the
  ported tests): enforce in oxlint, or leave off and record? (Recommended: rule by rule, each enforced or off, none left
  reporting without failing; refactor-task-2.1.md lists them.) Task 2.3: the info level is a property of 96 enabled
  rules, not 9; the 87 with no finding cost nothing as errors; each of the nine with its options and counts is in
  [docs/concepts/lint-rules.md](docs/concepts/lint-rules.md). **Answered 19 November: B**, rule by rule, each enforced
  or off: `noBitwiseOperators` off (deliberate hashes and random numbers); `noAwaitInLoops` an error in `site/`, off in
  `tests/`; `noExcessiveCognitiveComplexity` off; `useDestructuring`, `useDomQuerySelector`, `useShorthandAssign`,
  `useNamedCaptureGroup`, `useConsistentBuiltinInstantiation`, `noExcessiveClassesPerFile` errors, their test findings
  fixed and their site findings left, the rule off for those files until Phase 4; the other 87 errors. Applied in oxlint
  by task 2.4 ([refactor-task-2.4.md](refactor-task-2.4.md)); Biome's settings unchanged until 2.7.
- **Q3.** Pin Solid 2.0.0 or 2.0.1? (Recommended: 2.0.1, re-checked when Phase 4 starts.) **Settled 19 November by Q6:**
  each at its current release when task 4.1 pins it: `solid-js` 2.0.3, `@solidjs/web` 2.0.3, `@solidjs/compiler` 2.0.2,
  `@solidjs/vite-plugin` 3.0.1 ([refactor-task-4.1.md](refactor-task-4.1.md)).
- **Q6.** Should a pinned tool wait two weeks after its release, as an Action does? **Answered 19 November:** not during
  the refactor (each tool is pinned at its current release); after it, an upgrade waits two weeks.
- **Q4.** Accept pnpm's standing warning that `eslint-plugin-solid`'s ESLint peer is missing? **Moot, 19 November:**
  0.20.0 marks the peer optional, and pnpm prints no warning; its rules load in oxlint with ESLint absent
  (refactor-task-2.1.md).
- **Q5.** Replace the three tests of `h()` itself with app-level tests in Phase 1, and delete them with `h()` in Phase
  4? **Answered 18 November: yes.**

## Decisions taken while planning

- **Phase 1 harness (task 1.1, decision 1 of its plan):** the app starts in the test's own page, one start per test
  file, as `main.browser.test.ts` does (answered 18 November). A frame per test was rejected: in a test, Vite rewrites
  `site/db.ts:13`'s data address to the server's root, so a frame cannot be given its own data that way, and
  Playwright's page-wide routing and clock would reach the test runner. The built-site frame (`pages.browser.test.ts`)
  takes the Phase 3 smoke set.
- **The reload (tasks 1.4 and 1.5):** a page cannot reload inside a test, so "kept across a reload" is two files joined
  by one constant (answered 19 November). It is stronger than today's single test, whose re-read is satisfied by the
  token `kept.ts` holds in memory; the same pair serves `updating.ts`'s stored time, so `site/` needs no new export.

## Phase reports

Each phase's report is written here as the phase ends: what changed and the commits, the counts before and after, the
decisions the brief did not settle, and what in the brief turned out wrong.

### Phase 1

Done on 19 November 2026, at `22cd0597`. Every browser test that can reach the site through the page now starts it
through `tests/site/app.ts`, on the fixture and the rows it plants, and asserts what the page shows; a Grit rule refuses
a test's import of a view. The ledger, [refactor-ledger.md](refactor-ledger.md), says where each of the 141 baseline
browser tests went. Phase 1's "done when" holds: the suite passes on the unchanged `h()` code, and no test imports a
view module but the ones row 1.8 allows by name until their helpers go. Task 1.9's "done when" holds with this report;
its plan is [refactor-task-1.9.md](refactor-task-1.9.md).

**What changed**, task by task (`git log c667c877..22cd0597`):

- **1.1** ([plan](refactor-task-1.1.md)): the test server answers `/data/` from the fixture only; `startSite` and
  `startReview` start a page on planted data, a stated day, its own storage and given answers for other hosts, each
  option with a test that fails without it; `main.browser.test.ts` ported, its throwing view in
  `broken.browser.test.ts`. `c8ad336e` Record the Phase 1 baseline: tests per file, coverage, Biome, and the ledger's
  left column; `69b81c7f` Start the page in a test as a visitor gets it: tests/site/app.ts, on the fixture alone;
  `395c8e47` Port main.browser.test.ts onto the app-test helper; the throwing view in a file of its own.
- **1.2** ([plan](refactor-task-1.2.md)): `WIDE` moves to `site/media.ts`; `main.browser.test.ts` reaches `done` through
  the page. `1a5dfca5` Plan task 1.2: one move, and what the page shows for the rest; `9c5061c5` Keep the media queries
  the script shares with the stylesheet in one module; `4d16d9d7` Reach report.ts's done through the page, on the
  fixture's own promo code.
- **1.3** ([plan](refactor-task-1.3.md)): `views.browser.test.ts` becomes eighteen files, one page each, and a node test
  of the fixture. `7330c21a` Plan task 1.3: views.browser.test.ts through the app, by view and by planted data;
  `f64f45cd` Test the views through the app: views.browser.test.ts in eighteen pages.
- **1.4** ([plan](refactor-task-1.4.md)): `onnow`, `flights` and `map` keep their files; `updating` becomes three;
  `shipped.ts` goes. `39db5496` Plan task 1.4: onnow, flights, map and updating through the app; `4b5de649`, `a1b10daf`
  (fixes, below); `5bbaf777` Test now-on, flights, the map and the updating page through the app.
- **1.5** ([plan](refactor-task-1.5.md)): `review.browser.test.ts` becomes five files through `review.html`. `56c0520d`
  Plan task 1.5: the review dashboard's tests through review.html; `3a461070`, `9ab3dc05` (fixes); `cd3e0013` Test the
  review dashboard through review.html.
- **1.6** ([plan](refactor-task-1.6.md)): the user-visible tests of `page.browser.test.ts` move to `tabs`, `tabs.calm`
  (a new `browser-calm` project, reduced motion) and `elements`; seven stay with their helpers. `c35d7bda` Plan task
  1.6: the helpers' tests through the page; `20bd9981`, `10d80505`, `3187f819` (fixes); `ce5a3484` Test the tabs, the
  dialogs, the cards and the drawings through the page.
- **1.7** needed no change of its own: after 1.2 the node tests import only modules the 1.8 rule allows, and their other
  imports of a view are `import type` (refactor-task-1.8.md).
- **1.8** ([plan](refactor-task-1.8.md)): `lint/tests.grit` refuses a test's value import of a `site/` module not on its
  list, held by `tests/site/lint.test.ts`. `6a291cb9` Plan task 1.8: the rule that a test imports no view; `22cd0597`
  Refuse a test's import of a view's values.

**Counts.** Before: 283 tests in 24 files. After: 349 in 57, all passing.

- Node: 142 in 14 files, then 147 in 16: `fixture` 1 (from `views`, task 1.3) and `lint` 3 (1.8) are new; `styles` 8 to
  9 (1.2); the rest unchanged.
- Browser: 141 in 10 files, then 197 in 40 (`browser`) and 5 in 1 (`browser-calm`): `app` 13, `artists` 1, `broken` 1,
  `community` 37, `community-hotice` 1, `community-late` 1, `community-off` 1, `elements` 18, `festivals` 4, `flights`
  6, `friends` 6, `friends-far` 1, `gantt` 10, `gantt-apart` 1, `gantt-days` 1, `gantt-halves` 1, `gantt-parties` 3,
  `gantt-places` 4, `gantt-way` 1, `main` 15, `map` 3, `onnow` 6, `page` 7, `pages` 5, `plans` 1, `recipes` 5, `review`
  6, `review-forget` 1, `review-kept` 3, `review-readonly` 5, `review-settle` 1, `review-token` 1, `reviewpage` 10,
  `search` 1, `server` 4, `sources` 3, `tabs` 6, `updating` 1, `updating-late` 1, `updating-over` 1; `tabs.calm` 5.
- Gone: `views.browser.test.ts` (75 tests) and the helper `shipped.ts`. Split: `review` (11) into five files, `updating`
  (2) into three. Shrunk: `page` 14 to 7, `main` 16 to 15. New helpers: `app.ts`, `planted.ts`, `seen.ts`, `reload.ts`.
  `onnow`, `flights`, `map`, `pages` and `recipes` keep their files. The new tests are the helper's own (`app`,
  `reviewpage`, `server`), one per bug fixed, `review-forget`, and the page-level twins of the `h()` tests (Q5).
- Biome: "Checked 94 files … Found 38 infos", then "Checked 130 files … Found 43 infos". The infos in `site/` are the
  same 18; the five more are in the ported tests (`noAwaitInLoops` 5 to 7, `useDestructuring` and `useDomQuerySelector`
  2 more, `useConsistentBuiltinInstantiation` 1 new, `useNamedCaptureGroup` 1 fewer).

**Coverage of `site/**`**, by the same command:

|  | Before | After | Change |
| -- | -- | -- | -- |
| Lines | 85.79 % | 90.84 % | +5.05 |
| Statements | 84.56 % | 89.77 % | +5.21 |
| Functions | 82.69 % | 88.91 % | +6.22 |
| Branches | 74.81 % | 80.75 % | +5.94 |

The rise is the whole page running in every file: most in `artists.ts` (53.54 % to 81.93 % of lines), `map.ts`,
`search.ts`, `review.ts` and `sentence.ts`, which the old tests called one function at a time. One file fell: `kept.ts`,
93.33 % to 83.87 % of lines. `forgetToken` was reached only by the old review test's clean-up, not by an assertion; the
page's Forget button that calls it was tested by no file. That gap is closed: `review-forget.browser.test.ts` (one test,
"Forget leaves the page read-only and keeps neither the token nor the day it expires") starts a writer's page with the
token kept for the tab and on the device, with the day it expires, presses Forget in the token dialog, and reads the
dialog's words, the read-only token button, no choices, and none of the three entries left in the page's storage.
`kept.ts` is now at 96.77 % of lines; the "After" column is the run with that test (without it: lines 90.60 %,
statements 89.57 %, functions 88.76 %, branches 80.75 %). The catches for storage the browser refuses are reached since:
the helper's `storage: 'refused'` makes reaching either storage throw a SecurityError, and
`review-refused.browser.test.ts` (a token pasted, held for the page, writes a claim) and
`updating-refused.browser.test.ts` (the page mid-update still counts down) take it. `kept.ts` is at 100 % of lines,
`updating.ts` at 90.9 %; the totals, re-measured after task 1.9 with them: lines 90.84 %, statements 89.77 %, functions
88.83 %, branches 80.71 %.

**Decisions the brief did not settle**, each in its task plan:

- The harness: the app in the test's own page, one start per file; the helper owns `fetch`, the clock and storage for
  the file; a day is required at start; `open()` replaces the history entry, since test frames share one history (1.1,
  and "Decisions taken while planning" above).
- What a test reads from `site/`: one move (`WIDE`), `icons` a data module, every other export replaced by what the page
  shows (1.2).
- The file layout: a file per set of planted data that contradicts another's; a variant of a community's added people is
  another community in the same file (1.3, 1.4, 1.5).
- "Kept across a reload" as two files joined by one constant in `reload.ts`, for the updating page's time and the
  review's settled items and token (1.4, 1.5).
- Reduced motion as a second browser project, from the browser context, not a stubbed `matchMedia` (1.6).
- `page.browser.test.ts` keeps seven tests, each to go with its helper in 4.5, 4.6 or 4.10 (1.6, row 1.8).
- The rule as a list of allowed modules, with `import type` and the two entries' `import()` in `app.ts` allowed (1.8).

**Site bugs the ports found**, each fixed in a commit of its own with a test that fails without it:

- `4b5de649` Leave the map's festival picked when Escape closes a dialog over it.
- `a1b10daf` Say nothing went wrong when the map is left before its outline arrives.
- `3a461070` Keep a settled item once when a second write finds it already written (`markSettled` appended duplicate
  ids).
- `9ab3dc05` Clear the review rail's search when the address moves to another tab.
- `20bd9981` Keep the Explore row's oval after the row is drawn again (the oval's layer re-attached).
- `10d80505` Keep a slide's direction until its own end when another begins over it (each slide numbered, the latest
  clears the mark).
- `3187f819` Start a row's oval still when the row is given other tabs.

**Open issues:**

- The pre-push check failed once, intermittently, and passed on retry; the cause was not found. A hook has hung now and
  then, so commits run under `timeout`.
- The modal's `shut()` goes back with `history.back()` in the history the test frames share (`modal.ts`): a site
  behaviour, left as it is. The tests close dialogs through the page and read their own frame's entries.
- Playwright's Chromium is not installed in the cloud container: `CHROMIUM=/opt/pw-browsers/chromium` must be set before
  a browser test (`CONTRIBUTING.md`, "Checks").
- Under refused storage the review page held its token for the page but not the items it settled (seen while writing
  `review-refused`): fixed in `site/kept.ts`, whose `read` and `write` now keep every refused value for the page, as its
  header says; `review-refused` checks the item settled.

**Next:** Phase 2, the Oxc toolchain. Q2 (the info-level findings) is open for the owner; Q4 is moot (task 2.1).

**Baseline** (task 1.1, at `c667c877`, after `mise run build:site` and `mise run build:data`, by the two commands of
[refactor-task-1.1.md](refactor-task-1.1.md), "Tests"):

- 283 tests in 24 files, all passing.
  - Node, 142 in 14 files: `calendar` 15, `claims` 10, `fares` 13, `find` 7, `finder` 9, `logic` 13, `names` 3,
    `pending` 6, `pricing` 7, `roster` 32, `routes` 6, `rows` 7, `states` 6, `styles` 8.
  - Browser, 141 in 10 files: `flights` 5, `main` 16, `map` 2, `onnow` 6, `page` 14, `pages` 5, `recipes` 5, `review`
    11, `updating` 2, `views` 75.
- Coverage of `site/**`: lines 85.79 %, statements 84.56 %, functions 82.69 %, branches 74.81 %. (The plan's probe, on
  an earlier copy of the data, gave 86.12 %, 84.86 %, 83.07 % and 74.92 %; these are the figures at the commit.)
- Biome: "Checked 94 files … Found 38 infos".
- The browser tests by name, each `test.for` case on its own line, are the left column of the ledger,
  [refactor-ledger.md](refactor-ledger.md).

**Brief errors:**

- `refactor-brief.md` cites `main.browser.test.ts:11-50` and `:19-23` for the start-up; after task 1.1 it is in
  `tests/site/app.ts`.
- The counts: 283 tests, 141 of them in 10 browser files, not "about 230" and "133 in 9".
- The one-off coverage command exits 1 on the global thresholds, after writing its summary.
- The list of pure modules gains `media` (1.2), and `icons` counts as a data module: its one write, `Drawing.into`, runs
  only when a view calls it and takes only its own SVG (refactor-task-1.2.md).
- For task 3.1: in a test, Vite rewrites `new URL('../data/', import.meta.url)` to the server's root, and Vitest serves
  `public/` there, the real build's `data/` included.
- For Phase 2, figures Phase 1 changed: Biome now checks 130 files, not 94 (task 2.2's "93 formatted files" to be
  counted again), and finds 43 infos, not 38 (Q2 and task 2.3).

### Phase 2

Done on 19 November 2026, at `0767e73f`. oxlint, type-aware, lints the site, its tests, the house rules and
`vitest.config.ts` with every Biome rule it has an equivalent of, the 33 type-aware rules new in oxlint, and 19 house
rules in `lint/plugin.ts`, each with fixtures (the 13 Grit rules, the five unmapped rules the owner kept, `env`); oxfmt
lays the files out; Biome reads only the stylesheet and the JSON configs. The site's code is unchanged in behaviour but
for the bugs below. Phase 2's "done when" holds: `check:fast` runs `lint:oxlint`, `lint:biome` and `format:site`, each
clean. Task 2.8's holds with this report; its plan is [refactor-task-2.8.md](refactor-task-2.8.md).

**What changed**, task by task (`git log a1f2f60c..0767e73f`):

- **1.9's follow-ups**, after the Phase 1 report: `7a734e05` Scope the view-import rule to the tests by Biome's
  override; `6ff936ba` Let a test start the page with storage refused; `3c559044` Keep the items settled for the page
  when storage is refused.
- **2.1** ([plan](refactor-task-2.1.md)): the four tools load together; each pinned with its first use. `aced0672`
  Record task 2.1: the Oxc toolchain loads together.
- **2.2** ([plan](refactor-task-2.2.md)): oxfmt lays out Biome's 132 files; `format:site`. `6d1b9142` Format with oxfmt
  in place of Biome's formatter; `d4144c69` Reformat the four files oxfmt lays out otherwise; `7abe7362` Check the
  format with oxfmt before each commit.
- **2.3** ([plan](refactor-task-2.3.md)): [the mapping](docs/concepts/lint-rules.md). `80ce8a46` Map each Biome rule to
  oxlint, the losses pending the owner; `a20194c0` Record the owner's answer on the 22 unmapped Biome rules; `5c9be886`
  Record the owner's answers on the remaining lint decisions.
- **2.4** ([plan](refactor-task-2.4.md)): `.oxlintrc.json`, `lint:oxlint` beside Biome. `c7b97744` Narrow the types
  oxlint's type-aware rules find loose; `f101a65e` Write the tests as the info-level style rules ask; `ed45036c` Mark
  the lines oxlint would refuse wrongly, each with its reason; `a24e5b87` Lint the site and its tests with oxlint,
  beside Biome.
- **2.5** ([plan](refactor-task-2.5.md)): the fixture harness, `session` ported. `cf68450c` Test the house rules on
  fixtures, and port session to oxlint.
- **2.6** ([plan](refactor-task-2.6.md)): the twelve other Grit rules. `f4ab2bb7` Scope the house rules by
  .oxlintrc.json's overrides, the fixtures too; one "Port the … rule to oxlint" each: `6f4cf37b` storage, `8998eec8`
  fetch, `64115563` clicks, `fa3cb23b` promises, `4e63f6d7` buttons, `bbd9dd31` classes, `98bbe869` markup, `9854281e`
  home, `36c14f62` formats, `e703cb53` routes, `cc2f1ddc` states, `74b759a2` tests; `35351eba` Record task 2.6.
- **2.6b** ([plan](refactor-task-2.6b.md)): the five rules the owner kept. `32a72052` noThisInStatic, `335aa59a`
  noProcessGlobal, `3751c9fd` useNodeAssertStrict, `b7944323` useJsonImportAttributes, `41c96821` noPrivateImports
  ("Hold Biome's … as a house rule"); `8376cccb` Record task 2.6b; `098ab17c` Refuse process.env read through an
  imported process (`house/env`).
- **2.6c** ([plan](refactor-task-2.6c.md)): `82e13d2c` Make the site's record types read-only where they are defined;
  `3716c204` Make every function that returns a promise async; `113c5236` Fix what the other new type-aware rules find
  in the site and its tests; `7eb8a2e6` Turn on the 33 type-aware rules new in oxlint.
- **2.6d** ([plan](refactor-task-2.6d.md)): `3734f908` Hide every drawing from assistive technology by construction;
  `7edd1b8d` Draw the card's digest from the drawings it draws, kept as data; `138aa48a` Record task 2.6d.
- **The audit of 2.2 to 2.6d** ([fixes](refactor-audit-2.md)): `dc9b2e4a` Plan the fixes of Phase 2's audit; `59a23ded`,
  `3731d709`, `84ec0247`, `f974f9ce`, `f22ac878`, `3c148c2e` (site and pipeline); `abebda71`, `3f1c3bf5` (the harness
  and the rules' helpers); `c47a2a79`, `71bc13d2`, `d35ead8c`, `7f294143`, `fea13d1c`, `ac55f53d`, `718e936b` (each rule
  refusing the thing, not Grit's spelling of it); `ff40484f`, `0b4f1cc4` (tests); `bb034bba`, `09ed694c`, `f2bf5cbb`
  (config and docs).
- **2.7** ([plan](refactor-task-2.7.md)): `f1c53a2a` Hold the order of import statements by oxfmt and their merging by
  oxlint; `2fa8761a` Lint only the stylesheet and the JSON configs with Biome; `a7894060` Write the colour threshold's
  digits as oxlint groups them.
- **2.8** ([plan](refactor-task-2.8.md)): `1e29d907` Lint the stylesheet and the JSON configs as lint:biome; `0767e73f`
  Record that pages people make are never generated from committed data, in
  [docs/concepts/user-pages.md](docs/concepts/user-pages.md); and this report.
- Not the refactor's: `d8a7e819` Refresh places, rates and merge suggestions; `60b30628`, a merge of `origin/main`.

**Counts.** Tests, by Phase 1's command, at `a1f2f60c` (re-measured) and at `0767e73f`: 349 in 57 files, then 414 in 60,
all passing.

- Node: 147 in 16, then 201 in 16: `rules` 60 is new (the house rules' fixtures, 2.5 to the audit); `lint` 3 went with
  the Grit rule it tested (2.6); `states` 6 to 4 (its Biome tests became fixtures, 2.5 and 2.6); `styles` 9 to 8 (the
  drawings' identity check, 2.6d).
- Browser: 197 in 40, then 208 in 43: `review-full` 2 (the audit's quota case), `review-refused` 2 and
  `updating-refused` 2 (1.9's follow-ups) are new; `elements` 18 to 21, `review-readonly` 5 to 6, `reviewpage` 10 to 11
  (hidden drawings, 2.6d and the audit). `browser-calm`: 5 in 1, unchanged.
- Biome: "Checked 131 files … Found 43 infos", then "Checked 8 files" and nothing found (`biome lint`, as `lint:biome`
  runs it, and `biome check` alike).
- oxlint: none, then 354 rules on 155 files, no finding and no warning; `lint/plugin.ts` holds 19 house rules.
- Suppressions: the site's 10 (5 Biome on TypeScript, 1 Biome on the stylesheet, 4 `@ts-expect-error`), then 20 (1 Biome
  on the stylesheet, 15 oxlint on 13 lines, each in [the suppressed findings](docs/lint-false-positives.md), 4
  `@ts-expect-error`); the pipeline's 27, unchanged.

**Coverage of `site/**`**, by Phase 1's command:

|  | `a1f2f60c` | `0767e73f` | Change |
| -- | -- | -- | -- |
| Lines | 90.78 % | 91.63 % | +0.85 |
| Statements | 89.72 % | 90.55 % | +0.83 |
| Functions | 88.83 % | 89.71 % | +0.88 |
| Branches | 80.71 % | 81.69 % | +0.98 |

The commit's figures are below the Phase 1 report's last (lines 90.84 %), which counted `review-refused` and
`updating-refused` before they were committed. The rise is theirs and the audit's: storage refused or full, and more of
the page opened for the hidden-drawing check.

**Decisions the brief did not settle**, each in its plan:

- The owner's, 19 November: Q2, rule by rule; of the 22 unmapped rules, five kept as house rules and 17 lost; the
  frameworks' rules lost but Solid's; the 33 type-aware rules new in oxlint on; `import/no-default-export` off for
  `vitest.config.ts`; Q6, no wait for a tool's release during the refactor; 2.6d's two parts
  ([lint rules](docs/concepts/lint-rules.md), 2.6b, 2.6c, 2.6d).
- Mine: each tool pinned with its first use (2.1); `.oxfmtrc.jsonc` naming the files, not the command line, and
  `sortPackageJson` off (2.2); what counts as an equivalent, by Biome's own metadata (2.3); Biome's settings ported
  where oxlint's defaults differ (2.4); the fixtures under `lint/fixtures/<rule>/` with the test's own config (2.5); a
  rule's scope in `.oxlintrc.json`'s overrides, never its file's path (2.6); `return-await` and the `allow` list (2.6c);
  the drawings as a Python module (2.6d); each house rule widened past Grit's spelling, and `house/privates`' tokenizer
  kept, a parser being a dependency the brief does not name (audit); the names in an import's braces in
  `eslint/sort-imports`' order, for the owner to override, and `noExcessiveLinesPerFile` off (2.7); `lint:biome` running
  `biome lint` (2.8).

**Brief errors** (task 2.3, [refactor-task-2.3.md](refactor-task-2.3.md), Evidence, unless named):

- "about 241 of the 279 TypeScript rules": Biome enables 484 rules, 431 for TypeScript, 291 of them for today's code (no
  JSX, no framework). Biome's own source metadata maps 241 of the 291 (202 the same rule, 39 "inspired by"); the rules'
  docs map 20 more: 261.
- "38 unmapped, 11 named, 27 or so not yet accepted": 30 unmapped, 8 of them on the accepted-loss list, 22 pending the
  owner.
- The eleven accepted losses: three have an oxlint equivalent: `noFlatMapIdentity` (`unicorn/prefer-array-flat`),
  `noParametersOnlyUsedInRecursion` (`oxc/only-used-in-recursion`), `noMisrefactoredShorthandAssign`
  (`oxc/misrefactored-assign-op`), the last two from the same Clippy rules as Biome's. Eight remain.
- "19 of the 20 rules enabled explicitly under `nursery`": the twenty are counted right, but `noDuplicateMapKeys` is a
  YAML rule (it does not report a `Map` or an object with a key twice) and Biome is given no YAML. 18 of the 19 for
  TypeScript are mapped; `noMisleadingReturnType` is the loss.
- "23 rules switched off": 22 (19 for TypeScript, 3 for CSS), and three more off in one folder.
- The info-level findings (Q2): `"preset": "all"` keeps each rule's default severity, so 96 enabled TypeScript rules
  (`noSubstr`, `useAtIndex`, …) report without failing, not 9; 9 of them have findings (43, unchanged). oxlint has no
  info level: the 87 with no finding are errors at no cost today.
- "About 70 findings came from type-aware rules": on the tree now, the mapped type-aware rules find 93 that Biome's
  versions pass (`strict-boolean-expressions` 47, `no-unnecessary-condition` 23, `no-base-to-string` 10, five more);
  2.1's 83 were four of them. They are Biome rules (its nursery `useStrictBooleanExpressions` and others), not rules new
  in oxlint.
- The exceptions miss one: `vitest.config.ts`, once linted, fails `import/no-default-export` (Vitest reads its default
  export), so it needs that rule off as well (the owner agreed). `useConsistentTestIt`'s port also carries Biome's
  `withinDescribe` default, `it`, which `roster.test.ts` uses.
- Biome checks 134 files at 2.3, not 130 (Phase 1 report) or 131 (task 2.1, and `a1f2f60c`).
- `eslint-plugin-solid`'s ESLint peer is optional: pnpm prints no warning, and Q4 needed no answer (2.1).
- `organizeImports`, an assist `biome check` enforced, was named by no mapping; oxfmt's `sortImports`,
  `import/no-duplicates` and `eslint/sort-imports` hold it (2.7). `noExcessiveLinesPerFile` reads the stylesheet too, so
  it stays off there (2.7).
- The 2.6 and 2.6d records cited nine commits by their hashes before a rebase; they now cite those on `main`.

**Site bugs found**, each fixed with a test that fails without it:

- `59a23ded` Keep a token whose write is refused while storage still reads (a regression of 1.9's follow-up `3c559044`,
  which kept a refused value only when reading threw; `remembered()` also read true after a refused write).
- `3731d709` Keep the hints' memory through kept.ts (a hint marked while storage refused showed again).
- `3734f908` Hide every drawing from assistive technology by construction (two arrows and a chevron were hidden only by
  their callers' elements).
- `3c148c2e` Draw no unused info icon.

**Open issues:**

- The pre-push check failed once more intermittently, in 2.7's rebase, and passed on retry; the cause is still unknown.
- The community card's digest was written by hand in 2.6d, not by a render; `stale_cards()` holds it now (a test that it
  finds none), and the next render on a machine with the pinned Chromium writes the same digest.
- `render.cjs` needs the pinned Chromium, which the cloud container lacks; browser tests there need
  `CHROMIUM=/opt/pw-browsers/chromium`.
- `noExcessiveLinesPerFile` is off for `site.css` (3,781 lines), with the stylesheet ordered by component.

**Next:** Phase 3, the Vite build. Q3 (Solid 2.0.0 or 2.0.1) is open for the owner.

### Phase 3

Done on 19 November 2026, at `957f5a45`. Vite 8.3.8 bundles `site/` into `public/js/` as `main.js`, `review.js` and one
`shared-<hash>.js`; `tsc` type-checks first and emits nothing; the committed HTML, `vendor`, `mise run generate` and the
deploy workflow are as they were. Every page and file served before is served, but the per-module scripts the bundle
replaces. The brief's "done when", as its review restated it: `pages.browser.test.ts` loads the build (every route, the
older `#community/<key>` link and `review.html`, each in a frame under its page's CSP) and passes with the rest of the
suite; `site/` changed only by four `/* @vite-ignore */` comments (below). Task 3.4's plan is
[refactor-task-3.4.md](refactor-task-3.4.md).

**What changed**, task by task (`git log c63a5684..`):

- **3.1** ([plan](refactor-task-3.1.md)): a spike in a scratch copy; the repository unchanged but the record. `4400854d`
  Record task 3.1: Vite on this code.
- **3.2** ([plan](refactor-task-3.2.md)): `0bd287cd` Build the site with Vite (`vite.config.ts`, `vite` pinned, `build`
  and `types`, `tsconfig.json` `noEmit`, knip, oxlint and the docs); `fc52a630` Ask for the site's data and libraries in
  the tests as the built site does (the four comments).
- **3.3** ([plan](refactor-task-3.3.md)): `85f10d40` Test the built site's pages in a frame under their
  Content-Security-Policy (eleven pages and the probe's own tests).
- **3.4** ([plan](refactor-task-3.4.md)): `957f5a45` Say in CONTRIBUTING.md that Vite bundles the site and a frame tests
  the build; and this report.
- Not the refactor's: `f5520674` Refresh fares; `3a65002d`, a merge of `origin/main`.

**Counts**, at `4400854d` (the last `tsc` build, built again in a worktree) and now:

- Served files under `public/`, `data/` aside (its built files are `build:data`'s, the same at both): 88 files and
  2,715,912 bytes, then 32 and 2,502,483. `js/`: 59 files, 400,583 bytes (gzip -9 each 138,695, all together 119,472),
  then 3, 187,154 (`main.js` 124,466, `review.js` 19,324, `shared-ggZAhEyJ.js` 43,364; gzip -9 each 65,111, together
  63,956). Went: 57 module files; came: the shared chunk; `main.js` and `review.js` kept by name. The other 29 (the
  committed pages, community pages and cards, stylesheet, fonts, icons, manifest, and `vendor/`) the same at the same
  sizes. `index.html` loads 54 scripts of `js/`, then 2; `review.html` 22, then 2 ([3.1](refactor-task-3.1.md)).
- Tests, by Phase 1's command: 414 in 60 files, then 428 in 60, all passing: `pages.browser.test.ts` 5 to 19
  ([3.3](refactor-task-3.3.md)).
- Build (`pnpm run build`, warm): 1.26 s, then 1.4 to 1.6 s (`tsc` checking, then `vite build`, then `vendor`).
- oxlint: 354 rules on 155 files, then on 156 (`vite.config.ts`); no finding and no warning. Suppressions: one more
  oxlint (`jest/no-done-callback` on `test.for`, 3.3).

**Decisions the brief did not settle**, each in its plan:

- `vite` 8.3.8, the current release by Q6, within Vitest 5.0.5's `^6.4.0 || ^7 || ^8`; one Vite in the lockfile (3.2,
  decision 1).
- `build.rolldownOptions`, not `rollupOptions`: Vite 8 bundles with Rolldown ([3.1](refactor-task-3.1.md), decision 3).
- No `icons` input: nothing reads `public/js/icons.js` since 2.6d, so `render:design` checks nothing the build touches
  ([3.1](refactor-task-3.1.md), decision 2).
- The shared chunk's name carries its hash: Rolldown shortens the names a chunk exports, so a `main.js` cached from
  before a deploy must meet the chunk it was built with, not a newer one of the same name ([3.2](refactor-task-3.2.md),
  decision 3, reversing 3.1's decision 5).
- `tsc -p .` kept in `build`, so a commit that fails to type-check is never deployed; Vite does not type-check (3.2,
  decision 4; for the owner to override).
- `/* @vite-ignore */` on the four `new URL(…, import.meta.url)` sites (`site/db.ts` two, `site/map.ts`,
  `site/review.ts`): no warning, and the tests resolve `../data/` and `../vendor/` as the build does
  ([3.2](refactor-task-3.2.md), decision 6). A change to `site/` beyond imports and the entry point, which the brief's
  "done when" did not foresee.
- `modulePreload: false`: no helper for a dynamic `import()`, which the site has none of (`vite.config.ts`); the brief's
  "no preload polyfill" alone is a no-op without an HTML input ([3.1](refactor-task-3.1.md), decision 3).
- knip's `entry` loses `site/main.ts` and `site/review.ts`: its Vite plugin reads them from `vite.config.ts` (3.2,
  decision 9); `import/no-default-export` off for `vite.config.ts` as for `vitest.config.ts`
  ([3.2](refactor-task-3.2.md), decision 8).
- The smoke set: one page per route, typed over `routes.ts` so a new route needs a case, the older link and
  `review.html` by hand, each read once the page is quiet ([3.3](refactor-task-3.3.md), decisions 1 to 4).

**Brief errors**, each with its evidence in the plan named:

- "`design/render.cjs:37` imports `public/js/icons.js`" and "a three-entry build that must keep `icons.js`'s exports":
  since 2.6d `render.cjs` reads `pipeline/drawings.py`; nothing imports `icons.js` ([3.1](refactor-task-3.1.md)).
- Rollup's options: Vite 8's are `build.rolldownOptions`, `rollupOptions` a deprecated alias
  ([3.1](refactor-task-3.1.md)).
- "No preload polyfill" asks for nothing: with no HTML input Vite writes none, the output byte-identical with or without
  the option ([3.1](refactor-task-3.1.md), decision 3).
- "One `.js` per module, 57 files": 59 at `4400854d` (3.1, and 3.4's list).
- "`vite` … pinned at the version Vitest already resolves (8.3.5)": the owner's Q6 answer made it the current release,
  8.3.8, which pnpm meets Vitest's peers with ([3.2](refactor-task-3.2.md)).
- "Nothing in `site/` rewritten beyond imports and the entry point": the four comments above were needed for a build
  with no warning and tests that resolve the addresses as the build does.

**Site bugs found:** none. 3.3's fail-checks broke the bundle, the policy, the fonts and the probe one by one, and each
was caught; the build drew every page clean as `tsc`'s had.

**Open issues:**

- The test server's root-file branch ([3.2](refactor-task-3.2.md), decision 7): it served only the `'/kiz.sqlite'` case
  of `server.browser.test.ts` (a test, so on the stop list). Closed: on the owner's yes, it, `first()`, `ROOT_FILE`, its
  reader in `tests/site/app.ts` and that case are removed.
- `.github/workflows/pages.yml` (stop list): `:3` "Compiles the site's TypeScript (site/) into public/js/" and `:38`'s
  step name "Compile the site, and build its data from the export" were stale; the step runs `mise run build:site`,
  which bundles with Vite, so the deploy is unchanged. Closed: the owner had both reworded, the steps as they were.
- The intermittent check failure: a hover in `gantt-apart` timed out once in 3.1 and passed alone; the cause is still
  unknown.
- The browser tests in the cloud container need `CHROMIUM=/opt/pw-browsers/chromium`, the commit hook included.

**Next:** Phase 4, Solid 2.0 view by view. Q3 (Solid 2.0.0 or 2.0.1) is open for the owner.
