# Refactor plan: Solid 2.0 and the Oxc toolchain

The brief, reviewed against the repository on 18 November 2026, is [refactor-brief.md](refactor-brief.md). It holds the
decisions, the repo facts each task relies on (`file:line`), and the open questions. This plan only orders the work.
Each task is one commit series; every commit passes `mise run check` (the push hook enforces it). A phase starts only
when the previous one's "done when" holds and its report is written.

Legend: **Q*n*** = blocked on the owner's answer to that open question (brief, "Open questions"). **Stop** = on the
brief's stop-and-ask list.

## Phase 1: tests that survive a rewrite

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 1.1 | Baseline and the app-test harness | (a) record test counts per Vitest project, Biome's output (94 checked, 38 infos), a one-off v8 report over `site/**`; (b) move `main.browser.test.ts`'s start-up (index body, vendor scripts, stubbed `fetch`, `import main.ts`) into a shared helper beside `shipped.ts`; (c) let a test plant rows and pin the day before the app starts; (d) open a route and wait for it to draw; (e) the same for `review.html` / `review.ts`; (f) port `main.browser.test.ts` onto it | the helper exists, `main.browser.test.ts` uses it, suite green, baseline recorded in the phase report draft |
| 1.2 | Move pure exports out of mixed view modules (Q1: yes) | one move per commit, no behaviour change: `festivals()`/`withDetails`, `friendsIn`/`togetherHref`/`NEAR_KM`/`NAMED_UP_TO`, `citiesOf`, `cityEntries`, `Drawing`, `WIDE`, `PAD`, `SAID_MS`, `done` | every value a test needs from `site/` lives in a pure module, or the test asserts the visible outcome instead |
| 1.3 | `views.browser.test.ts` through the app, one view at a time | split by view: event card, festivals, artists, communities, friends, gantt, people, plans' lines, search, sources; each assertion becomes what the route shows | the file no longer imports a view; each old test is in the ledger |
| 1.4 | `onnow`, `flights`, `map`, `updating` browser tests through the app | plant crafted rows before start, pin the day | same |
| 1.5 | `review.browser.test.ts` through `review.html` | start the review page with its fixture, drive it | same |
| 1.6 | `page.browser.test.ts`: the helpers' tests | user-visible ones (tab oval, slide, dialog history, paged list, dismissable card) through the app; tests `:16`, `:41`, `:168` of `h()` itself: replacement proposed (Q5: replaced now, originals deleted with `h()` in 4.10) | same, and the owner has answered for the three |
| 1.7 | Node tests `states.test.ts`, `styles.test.ts` | import only pure modules (after 1.2) | same |
| 1.8 | The rule: tests import no view module | Grit rule in `lint/`, listed in `biome.jsonc`; the allowed list (pure and browser-API modules) kept in one place and named by the message; `import type` allowed; dynamic `import()` of the two entries allowed; a test running `biome lint` on a must-fail and a must-pass file | the rule passes on the repo and its two-file test passes |
| 1.9 | Phase 1 report | the ledger (old test → new test, or "cannot be tested through the page" and why); coverage before/after; counts; decisions; brief errors | report written |

## Phase 2: lint and format on the Oxc toolchain, unchanged code

| # | Task | Subtasks | Done when |
| -- | -- | -- | -- |
| 2.1 | Spike: the toolchain loads together | pin `oxlint`, `oxlint-tsgolint`, `oxfmt`, `eslint-plugin-solid` (Q4: the ESLint peer warning); one file, type-aware on, one JS plugin rule, `eslint-plugin-solid` loaded; frozen-lockfile install holds the linux and darwin binaries | all three load on the pinned versions, or a stop with evidence |
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
| 3.3 | Tests against the build | `pages.browser.test.ts` passes; a smoke set of routes and `review.html` in a frame of the built site under the CSP | green |
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
| 4.10 | Finishing | delete `h()` and `replaceChildren` from `dom.ts` (and the `h()` tests, per Q5); retire `markup`, `classes`, `buttons`, `clicks` only with a fixture proving the replacement; rewrite kept rules' messages; `CLAUDE.md` conventions and the Solid skills; `CONTRIBUTING.md`, docs, `tests/test_suppressions.py` | Phase 4 "done when" holds; report written |

## Open questions (from the review)

- **Q1.** May Phase 1 move pure exports out of mixed view modules, as move-only commits? **Answered 18 November: yes,
  move-only commits.**
- **Q2.** The 38 info-level Biome findings: enforce in oxlint, or leave off and record? (Recommended: off, recorded.)
- **Q3.** Pin Solid 2.0.0 or 2.0.1? (Recommended: 2.0.1, re-checked when Phase 4 starts.)
- **Q4.** Accept pnpm's standing warning that `eslint-plugin-solid`'s ESLint peer is missing? (Recommended: yes.)
- **Q5.** Replace the three tests of `h()` itself with app-level tests in Phase 1, and delete them with `h()` in Phase
  4? **Answered 18 November: yes.**

## Decisions taken while planning

- **Phase 1 harness (task 1.1, D1):** the app starts in the test's own page, one start per test file, as
  `main.browser.test.ts` does (answered 18 November). A frame per test was rejected: `site/db.ts:13-14` fetches data
  from its module's address, so a frame cannot be given its own data that way, and Playwright's page-wide routing and
  clock would reach the test runner. The built-site frame (`pages.browser.test.ts`) takes the Phase 3 smoke set.
