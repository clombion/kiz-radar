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
| 2.6c | The type-aware rules new in oxlint | all 33 on (owner, 19 November; [lint rules](docs/concepts/lint-rules.md), "New in oxlint"): the site's record types made read-only at their definitions for `prefer-readonly-parameter-types` (`allow` for DOM, Node and sql.js types), `promise-function-async` (a synchronous throw becomes a rejection), the other findings fixed | oxlint passes with the 33 on |
| 2.6d | The card's drawings as data, and drawings hidden by construction | the drawings a community card draws kept as data the generator writes into the site, so its digest is theirs, not `icons.ts`'s; `Drawing` hides every drawing from assistive technology, `review.ts`'s own SVG made by it (the arrow and the map's chevron were hidden only by their callers); done ([refactor-task-2.6d.md](refactor-task-2.6d.md)) | a comment in `icons.ts` leaves the cards current; no SVG without `aria-hidden` |
| 2.7 | Biome to CSS and JSON only | JS linter off, formatter off, `files.includes` without `site/**` and `tests/**/*.ts`, plugins and TS overrides gone; `tests/test_suppressions.py`'s file-set test rewritten | Biome touches no `.ts` |
| 2.8 | Tasks, docs, the out-of-scope constraint | `lint:site` split (oxlint / Biome CSS+JSON / oxfmt check) in `check:fast`; `mise run generate` for `commands.md`; `CONTRIBUTING.md`, `docs/guides/the-site.md`, `docs/README.md`; record "user pages never generated from committed data" | `mise run check` green; Phase 2 report written |

## Phase 3: Vite build, still on `h()`

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 3.1 | Spike: Vite on this code | pin `vite` at Vitest's version; inputs `main`, `review`, `icons` with fixed names, flat `public/js/`, `base: './'`, no HTML, no preload polyfill; check what it does with the four `new URL(…, import.meta.url)` sites and with `icons.js`'s exports | evidence for each, in the phase report draft |
| 3.2 | Switch the build | `vite.config.ts`; `build` = `vite build` then `vendor`; `tsconfig.json` `noEmit`, `allowImportingTsExtensions`; knip, oxlint and `tests/site/tsconfig.json` know the new file | `mise run build:site` builds; `generate:check` clean; `render:design` draws the same cards |
| 3.3 | Tests against the build | `pages.browser.test.ts` passes; a smoke set of routes and `review.html` in a frame of the built site under the CSP, added to `pages.browser.test.ts` | green |
| 3.4 | Served files and docs | list `public/` before and after; load index, review, a community page, an old `#community/<key>` link; `build:site` description, `docs/guides/the-site.md`, `CONTRIBUTING.md` | Phase 3 report written (and the `pages.yml` comment mentioned, not edited) |

## Phase 4: Solid 2.0, view by view

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 4.1 | Install and wire Solid | pin `solid-js`, `@solidjs/web`, `@solidjs/compiler` (**Q3**: 2.0.0 or 2.0.1), `@solidjs/vite-plugin`; check `node_modules/solid-js/skills/` exists and read it; `jsx: preserve`, `jsxImportSource`; plugin in `vite.config.ts` and the Vitest browser project; development condition in tests only | a trivial `.tsx` component renders in a test and in the build |
| 4.2 | Lint for Solid | `eslint-plugin-solid` `v2-strict` via `jsPlugins`; the four migration rules with fixtures (incl. `createSignal<T>`, `let loading = true`, `loading` imported from `ui.ts`, `pending.ts`); house rules widened to `.tsx` (`states`, `buttons`, `markup` refusing the `innerHTML` prop, a rule refusing a string `style`); new house rules (owner, 19 November): `noSuspiciousSemicolonInJsx`, `noDuplicatedSpreadProps`, and `<svg>` in JSX refused outside `icons.ts` | fixtures pass |
| 4.3 | Console failures | browser `setupFiles` fails a test on any undeclared console warning or error; a way to declare the expected ones (`report.ts`); confirm Solid's dev diagnostics fire for wrong-scope writes and top-level reads | an unexpected warning fails a test |
| 4.4 | Coexistence seam | move `dom.ts`'s non-rendering helpers (`debounced`, `onResize`, `uniqueId`, types) to a module of their own; a Solid view behind the `View` signature, disposed on the signal; `routes.ts` wrapped as one signal; CSP check of the compiler's style output | one `.tsx` view mounted inside the `h()` page |
| 4.5 | The shell | header and tabs, sub-navigation, footer, dialog host (`modal`), search combobox, currency switch, updating, report; `page.browser.test.ts`'s kept tests of `pill` and `modal` deleted with them (task 1.6) | one commit per piece, suite green |
| 4.6 | Shared pieces | `eventcard` with `details`, `passes`, `flights`; `plans`' renderers; `ui`'s element helpers; `gantt`, `months`, the community page's cards, with `dismissable`, whose kept test in `page.browser.test.ts` is deleted with it (task 1.6) | same |
| 4.7 | Stateful views | `sentence`, `communities`, `friends`, `artists`, `map` (Leaflet stays an imperative island), `countries`, `people` | same |
| 4.8 | Read-only views | `week`, `sources`, `tables`, `updating` | same |
| 4.9 | The review dashboard | `review.ts` as its own series | same |
| 4.10 | Finishing | delete `h()` and `replaceChildren` from `dom.ts`, and `page.browser.test.ts` with its kept tests of `paged`, `toggle` and `h()` (Q5, task 1.6); retire `markup`, `classes`, `buttons`, `clicks` only with a fixture proving the replacement; rewrite kept rules' messages; `CLAUDE.md` conventions and the Solid skills; `CONTRIBUTING.md`, docs, `tests/test_suppressions.py`; remove `refactor-brief.md`, `refactor-plan.md`, `refactor-ledger.md` and the task plans | Phase 4 "done when" holds; report written |

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
- **Q3.** Pin Solid 2.0.0 or 2.0.1? (Recommended: 2.0.1, re-checked when Phase 4 starts.)
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

In progress.

**Brief errors** (task 2.3, [refactor-task-2.3.md](refactor-task-2.3.md), Evidence):

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
  export), so it needs that rule off as well (pending the owner). `useConsistentTestIt`'s port also carries Biome's
  `withinDescribe` default, `it`, which `roster.test.ts` uses.
- Biome checks 134 files now (`biome check`), not 130 (Phase 1 report) or 131 (task 2.1).
