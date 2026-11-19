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
| 1.3 | `views.browser.test.ts` through the app, one view at a time | split by view: event card, festivals, artists, communities, friends, gantt, people, plans' lines, search, sources; each assertion becomes what the route shows; every change to the live database (25 calls of `withTrips`, `withAdded` and `withStays`, and the direct writes) becomes rows planted before start, side by side where they can stand together and in files of their own where they contradict | the file no longer imports a view; each old test is in the ledger |
| 1.4 | `onnow`, `flights`, `map`, `updating` browser tests through the app | plant crafted rows before start; give the day per page (`open(href, on)`); a file of its own only for data that contradicts another file's; `updating.ts`'s stored time across a reload as the same two-file pair as 1.5; `shipped.ts` goes with its last user | same |
| 1.5 | `review.browser.test.ts` through `review.html` | start the review page with its fixture, drive it; "kept across a reload" as two files joined by one shared constant: the first drives the page and asserts the storage entry equals it, the second starts with the entry seeded from it and asserts what the page shows (owner, 19 November) | same |
| 1.6 | `page.browser.test.ts`: the helpers' tests | user-visible ones (tab oval, slide, dialog history, paged list, dismissable card) through the app; tests `:16`, `:41`, `:168` of `h()` itself: replaced by page-level tests of the same guarantees (Q5); the originals stay until `h()` goes in 4.10 | same |
| 1.7 | Node tests `states.test.ts`, `styles.test.ts` | import only pure modules (after 1.2) | same |
| 1.8 | The rule: tests import no view module | Grit rule in `lint/`, listed in `biome.jsonc`; the allowed list (the brief's pure, browser-API and data modules, its "Which `site/` modules are views") kept in one place and named by the message; `import type` allowed; dynamic `import()` of the two entries allowed; a test running `biome lint` on a must-fail and a must-pass file | the rule passes on the repo and its two-file test passes |
| 1.9 | Phase 1 report | the ledger (old test → new test, or "cannot be tested through the page" and why); coverage before/after; counts; decisions; brief errors | report written |

## Phase 2: lint and format on the Oxc toolchain, unchanged code

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 2.1 | Spike: the toolchain loads together | pin `oxlint`, `oxlint-tsgolint`, `oxfmt`, `eslint-plugin-solid` (Q4: the ESLint peer warning); one file, type-aware on, one JS plugin rule, `eslint-plugin-solid` loaded; frozen-lockfile install holds the linux and darwin binaries | type-aware linting, a JS plugin and `eslint-plugin-solid` run together on the pinned versions, or a stop with evidence |
| 2.2 | oxfmt replaces Biome's formatter | scope to Biome's 93 formatted files (`site/states.ts` and other generated files ignored, generators fixed if they disagree); one formatting-only commit; `mise run format`, `CONTRIBUTING.md` | `oxfmt --check` clean; Biome's formatter off |
| 2.3 | The rule mapping | `biome rage --linter` → table of each rule, its oxlint equivalent, settings ported (`no-use-before-define` functions off, `eqeqeq` null, `max-params` 4, accessibility no `public`, `consistent-test-it`, per-folder exceptions); the 38 info-level rules (**Q2**); unmapped rules beyond the 11 accepted losses listed once (**Stop**) | mapping doc in `docs/concepts/`, owner has approved the losses |
| 2.4 | `.oxlintrc.json` with the mapped rules, on unchanged code | bare mapping, then the type-aware findings one by one: fix real issues; false positives as line suppressions plus `docs/lint-false-positives.md`; `tests/test_suppressions.py` learns `oxlint-disable-next-line`; lint `vitest.config.ts` too | oxlint, type-aware, zero findings and warnings; Biome's TS rules still on in parallel |
| 2.5 | Fixture test harness | `tests/site/rules.test.ts` runs oxlint JSON on `lint/fixtures/`, compares expected findings, fails on a rule without fixtures; fixtures out of the main run, `tsc`, knip, jscpd | the harness runs under `test:site` |
| 2.6 | Port the 13 house rules, one per commit | each: JS plugin rule, message and exemptions kept, bad/good/exempt fixtures, Biome's copy removed in the same commit; `states` from the generator (`pipeline/generate.py` writes the key list; docs that name `lint/states.grit`) | `lint/*.grit` gone; each rule's fixtures pass |
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
| 4.2 | Lint for Solid | `eslint-plugin-solid` `v2-strict` via `jsPlugins`; the four migration rules with fixtures (incl. `createSignal<T>`, `let loading = true`, `loading` imported from `ui.ts`, `pending.ts`); house rules widened to `.tsx` (`states`, `buttons`, `markup` refusing the `innerHTML` prop, a rule refusing a string `style`) | fixtures pass |
| 4.3 | Console failures | browser `setupFiles` fails a test on any undeclared console warning or error; a way to declare the expected ones (`report.ts`); confirm Solid's dev diagnostics fire for wrong-scope writes and top-level reads | an unexpected warning fails a test |
| 4.4 | Coexistence seam | move `dom.ts`'s non-rendering helpers (`debounced`, `onResize`, `uniqueId`, types) to a module of their own; a Solid view behind the `View` signature, disposed on the signal; `routes.ts` wrapped as one signal; CSP check of the compiler's style output | one `.tsx` view mounted inside the `h()` page |
| 4.5 | The shell | header and tabs, sub-navigation, footer, dialog host (`modal`), search combobox, currency switch, updating, report | one commit per piece, suite green |
| 4.6 | Shared pieces | `eventcard` with `details`, `passes`, `flights`; `plans`' renderers; `ui`'s element helpers; `gantt`, `months` | same |
| 4.7 | Stateful views | `sentence`, `communities`, `friends`, `artists`, `map` (Leaflet stays an imperative island), `countries`, `people` | same |
| 4.8 | Read-only views | `week`, `sources`, `tables`, `updating` | same |
| 4.9 | The review dashboard | `review.ts` as its own series | same |
| 4.10 | Finishing | delete `h()` and `replaceChildren` from `dom.ts` (and the `h()` tests, per Q5); retire `markup`, `classes`, `buttons`, `clicks` only with a fixture proving the replacement; rewrite kept rules' messages; `CLAUDE.md` conventions and the Solid skills; `CONTRIBUTING.md`, docs, `tests/test_suppressions.py`; remove `refactor-brief.md`, `refactor-plan.md`, `refactor-ledger.md` and the task plans | Phase 4 "done when" holds; report written |

## Open questions (from the brief's review)

- **Q1.** May Phase 1 move pure exports out of mixed view modules, as move-only commits? **Answered 18 November: yes,
  move-only commits.**
- **Q2.** The 38 info-level Biome findings: enforce in oxlint, or leave off and record? (Recommended: off, recorded.)
- **Q3.** Pin Solid 2.0.0 or 2.0.1? (Recommended: 2.0.1, re-checked when Phase 4 starts.)
- **Q4.** Accept pnpm's standing warning that `eslint-plugin-solid`'s ESLint peer is missing? (Recommended: yes.)
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

In progress.

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

Brief errors found so far:

- `refactor-brief.md` cites `main.browser.test.ts:11-50` and `:19-23` for the start-up; after task 1.1 it is in
  `tests/site/app.ts`.
- The counts: 283 tests, 141 of them in 10 browser files, not "about 230" and "133 in 9".
- The one-off coverage command exits 1 on the global thresholds, after writing its summary.
- The list of pure modules gains `media` (1.2), and `icons` counts as a data module: its one write, `Drawing.into`, runs
  only when a view calls it and takes only its own SVG (refactor-task-1.2.md).
- For task 3.1: in a test, Vite rewrites `new URL('../data/', import.meta.url)` to the server's root, and Vitest serves
  `public/` there, the real build's `data/` included.
