# Phase 2 audit: the fixes

The change audit of Phase 2 so far (`a1f2f60c..HEAD`, 45 commits: oxfmt, oxlint beside Biome, the house rules on oxlint,
the five kept rules, the 33 type-aware rules, drawings as data), by seven auditors (design, TypeScript, tests,
behaviour, developer experience, the lint plugin's code, accessibility), 19 November 2026. Each valid finding, its fix,
and the commit it goes in. None is deferred; none needed the owner. Status: done (departures below).

## Design model

Every finding has one of four causes:

- **A rule stated in more than one place** (the route list in `lint/routes.ts` beside `Route`; the oxlint file set in
  `package.json`, `.oxlintrc.json` and `tests/test_suppressions.py`; the house rules' scopes in the config, the docs and
  each rule's header; a storage refusal handled by `kept.ts` and again by `hints.ts`). The fix makes one the source and
  derives or checks the others.
- **A port faithful to Grit's gaps** ("not widened"): each gap lets through what its rule exists to refuse (`+=` on
  `innerHTML`, `window.fetch()`, `window['localStorage']`, an optional call). A house rule refuses the thing, not Grit's
  spelling of it: each is widened, its fixtures cover the forms, and what the wider rule finds in the code is measured
  first; a real finding is fixed in a commit of its own before the rule widens.
- **A homemade tokenizer** (`house/privates` reads other modules from disk). It stays: TypeScript 7 ships no JS API
  (`require('typescript').createSourceFile` is undefined) and a parser package is a dependency the brief does not name
  (stop list). It is hardened against each failure the audit reproduced, and fails closed where it cannot tell.
- **My own `kept.ts` change** (task 1.9's follow-up), which held a refused value only when reading throws: a quota error
  (writing throws, reading works) loses the token. A regression, pushed; fixed first, with its test.

## The fixes

| # | Finding (auditor) | Fix | Commit |
| -- | -- | -- | -- |
| S1 | `kept.ts`: a value whose write is refused while reading works is lost (behaviour, design) | `write` keeps a refused value in the page's map and forgets it once a write succeeds; `read` takes the page's value before storage's | 1: site fix |
| S2 | `remembered()` true after a refused device write (behaviour) | `remembered()` reads the device's storage alone: true only when the token is kept there | 1 |
| S3 | The helper's `storage` cannot model a full quota (design, tests) | `storage: … \| 'full'`: reading works, writing throws a `QuotaExceededError`; review tests for a token kept for the page, the "keep on this device" box, a stored token read under `'refused'` | 1 |
| S4 | `hints.ts` handles a refusal its own way and drops the value (design) | `hints.ts` reads and writes through `kept.ts`'s `read`/`write`; `kept.ts`'s header true again | 2 |
| S5 | `house/routes` hard-codes routes that drifted from `Route` (design, High) | `site/routes.ts` exports the routes as one `as const` list, `Route` derived from it; the rule imports the list; fixtures mark every route | 3 |
| S6 | An icon name is checked only when the page loads (TypeScript, design) | the generated `states.ts` types `icon` as a key of the generated `LUCIDE`; a Python test that every icon of `states.py` is a key of `drawings.LUCIDE` | 4 |
| S7 | `readState` (`routes.ts`) returns a mutable record through a cast; `presence()` (`calendar.ts`) a mutable `Map` (TypeScript) | `readState` returns `Readonly<…>` (no view writes it: checked by tsc); `presence()` a `ReadonlyMap` | 5 |
| S8 | `accessWords` (`review.ts`) lost its exhaustiveness (TypeScript) | the `ok` case back in its arm, a `never` default; `consistent-return` satisfied by returning from each arm | 5 |
| S9 | `Drawing.INFO` drawn by nothing (design) | removed, with its entry in `drawings.py` | 6 |
| S10 | "the site draws each once" check dropped (tests) | a Python test that no markup appears twice in `drawings.py`, `users` and `PEOPLE` the same drawing | 6 |
| L1 | `house/markup` lets `+=`/`??=` on `innerHTML` through (TypeScript) | a compound assignment to one of the members is refused; fixtures `+=`, `??=`, a parenthesised target | 7: per rule |
| L2 | `house/fetch` misses `window.`/`globalThis.`/`self.fetch`, `fetch?.()`, `fetch` as a value (lint) | refuse a reference to the global `fetch` outside `net.ts` (scope-checked, as `process.ts` does) and its `window`/`globalThis`/`self` members | 8 |
| L3 | `buttons`, `promises` miss optional calls (lint) | the optional forms refused; fixtures | 9, 10 |
| L4 | `session`, `storage` miss computed string keys (lint) | a quoted or template key refused as the name is; fixtures | 11 |
| L5 | `states` misses `new X('key')` and `'key' as K` arguments (lint) | both refused; fixtures | 12 |
| L6 | `privates`: a `/` after `++`, `--`, `!`, `<`, `>` read as a regex blinds the rest of the file; `export type *` not followed; last declaration's visibility wins; a module reached twice under two names; unguarded reads; `.js` before `.ts`; paths outside the repository; a hashbang; declarations without semicolons; a binding named `type` (lint) | each fixed with a fixture: `/` after a postfix operator or `!` is division, an unterminated regex falls back to punctuation; `export type *` followed; the strictest visibility kept; `seen` by file and name; reads guarded, a failed read refused as unknown (fail closed: an import from a module the rule cannot read is reported); `.ts` first; resolution stops at the repository root; a hashbang skipped; a newline ends a declaration where ASI would; `type` stripped only as a modifier; `resolved()` cached | 13 |
| L7 | Duplicated helpers across rules (lint) | one `named`, one imported-name reader, one scope walk, one `Scope` and `Visitor` type, `callsMethod` through `namesProperty`, `quotedOneOf` escaping its names | 14 (before 7–13) |
| T1 | The harness's "lets through" test passes with only an exempt file (tests) | each rule's folder has a `good.ts` with no exempt name, checked | 15 (before 7) |
| T2 | `test_suppressions.py` reads a second suppression on a line as part of the first (tests) | each match stops at the next comment opener; a test of two on one line | 16 |
| T3 | Carve-outs without fixtures: `tests`' exceptions against a template literal and `export … from`; `states`' parenthesised, optional-call and type-argument forms; `buttons`' template literal (tests) | fixtures for each | in 7–13 by rule |
| T4 | The hidden-drawing check opens no card, dialog, roster toggle, open map sheet, or the review page with a token; it skips all of `.leaflet-container` (tests, accessibility) | the check after opening a card, the passes dialog, "By place", the map sheet open, and on the review page as a writer; Leaflet's own controls skipped by their class only | 17 |
| T5 | The view-failure test spies on every `innerHTML` set (tests) | it asserts which view failed | 17 |
| T6 | The fake storage's `setItem` no longer coerces (tests) | `String(value)`, as a real `Storage` | 1 |
| T7 | `updating-refused` does not check the give-up clock (tests) | asserts the 15-minute clock does not start without storage | 1 |
| C1 | The oxlint file set in three places; `typeAware`/`denyWarnings` both as flags and options (design) | the `lint:oxlint` script names only the config; the paths in the config (`ignorePatterns` and an explicit file set); `test_suppressions.py` reads the set from the config | 18 |
| C2 | House rules' scopes in the config, the docs table and each header (design) | a test comparing the docs table with `--print-config` | 18 |
| C3 | Docs contradicting code (developer experience, design): `lint-rules.md`'s opening "pending the owner"; the "Accept." rows of the five kept rules; the `lint:site` and `lint:oxlint` descriptions; "13 house rules" (19); CONTRIBUTING's oxfmt exclusions without `site/drawings.ts`; comments saying the SVG is "written in `icons.ts`"; Grit comparisons in rule comments that rot when the records go; the plan's Phase 2 rows "not pushed" and "In progress" | each corrected; `mise run generate` for `commands.md`; rule comments say what they refuse, Grit named only as "the rule this replaced" | 19 |
| C4 | The card's digest was rewritten by hand, not by a render (design) | recorded, not changed: the markup the card draws was byte-identical, which the digest's inputs now are; a render needs the pinned Chromium, which this container lacks, and the next render on a machine with it writes the same digest | none |

Order: 1–6 site and pipeline, then 15 and 14 (harness and helpers), then 7–13 (rules), 16–17 (tests), 18–19 (config and
docs), then the wrap-up (`ai-impl-done`) and a push. Each commit passes its hook; the full `mise run check` at the end.

## Done when

Every row is in a commit (C4 recorded); each widened rule's fixtures cover its forms, and what it finds in the tree is
fixed; `mise run check` passes; the auditors' reproductions (S1's quota case, L1's `+=`, L2's `window.fetch()`, L4's
`window['localStorage']`, L6's `i++ / 2`) each fail before and pass after.

## Reconcile (after the plan's review)

A second agent checked each row against the code. What changed:

- **S1:** a write that succeeds, a removal included, forgets the page's copy.
- **S2:** `remembered()` is `read(device, TOKEN) !== null` with no page copy of it: the box shows unticked when the
  device refused the token (it still works for the page). No second way of reading.
- **S3:** `full: true` beside the starting contents, not a bare `'full'`: a stored old token and a new write refused is
  the case S1 changes. The "stored token under `'refused'`" test is dropped: refused storage holds nothing.
- **S4:** the `kr-*` keys are kept; a hint marked while storage refuses now stays hidden for the page (new, intended).
  `hints.ts` names no storage then, so its `house/storage` exemption, fixture and wording go in the same commit.
- **S5:** `routes.ts` exports the hash routes the site writes as one `as const` list, `Route` that list and
  `'community'` (a path route; its hash form is only the old link the site still reads, which the tests write on
  purpose); the rule imports that list. `people` and `artist` go unless the site writes them.
- **S6:** `Drawing.LUCIDE` typed by the generated names; `lucide()` and its run-time throw go; the Python test stays.
- **S7:** `readState` stays: the views write the fresh copy it returns. Only `presence()` becomes a `ReadonlyMap`.
- **S8:** the `ok` body back in its arm; no `never` default (`switch-exhaustiveness-check` and tsc hold it).
- **L1:** any member access to `innerHTML`/`outerHTML` refused, read or write (destructuring, `for…of`, optional chains
  included), in place of the assignment visitor.
- **L2:** `tests/site/app.ts`, which owns the page's `fetch`, exempt by an override with a fixture; `window['fetch']`.
- **L3:** `states` and `buttons` widened as well (optional call, type arguments, parentheses), not fixtured as
  carve-outs; T3 keeps only the `tests` rule's exceptions.
- **L4:** `globalThis['process']` and `window['fetch']` too. **L5:** `satisfies` and `<K>'key'` too.
- **L6:** fail closed only when an import resolves to a file that cannot be read; an unresolved import or a package is
  skipped as now; the root is `context.cwd`.
- **T6:** the fake's `setItem` takes `value: unknown`.
- **C1:** the paths stay in the `package.json` script, the one source, which `test_suppressions.py` reads (oxlint's
  config has no file list); the flags `options` already sets are dropped.
- **C2:** the docs-against-config test lands after the docs are fixed.
- **C4:** a test that `stale_cards()` is empty, rather than trusting the digest written by hand.

Commits, in order: (1) S1–S3, T6, T7; (2) S4; (3) S5; (4) S6; (5) S7–S8; (6) S9–S10, C4's test; (7) T1; (8) L7; (9)–(15)
L1–L6 by rule, each with its fixtures and any code it finds; (16) T2; (17) T4–T5; (18) C1; (19) C3; (20) C2.

## Departures

- **Not pushed:** the commits stay on `main` unpushed, as the brief for (7)–(20) asks; the wrap-up (`ai-impl-done`) is
  not run with them.
- **(10):** `house/process` became a rule of `globals.ts` with `fetch`, so `globalThis['process']` and a `process`
  destructured from `globalThis` are refused from that commit, not (13)'s; `.oxlintrc.json` exempts `tests/site/app.ts`,
  the one read the wider `fetch` found in the tree.
- **(9)–(14):** a form in parentheses is not fixtured: oxfmt takes the parentheses away (`states` drops its parentheses
  check), and a quoted key without brackets (`{ 'localStorage': s }`) is written by oxfmt as a name, which the rule
  already refuses. `markup` also refuses a destructured key (`const { innerHTML } = el`).
- **(13):** `session` and `storage` are one commit: both are `nameRule`, widened once.
- **(15):** a file that resolves but cannot be read, and one outside the root, are not fixtured: the container reads any
  file, and the harness runs from a copy of the fixtures.
- **(8):** `.oxlintrc.json`'s `prefer-readonly-parameter-types` allows oxlint's `Scope`, the parameter `variableOf`
  takes.
- **(7):** a rule is on for its `good.ts` by the config's overrides read with Node's `path.matchesGlob`.
- **(17):** the card is a trip's card on a community's page; the map's festivals are Leaflet's circles in an SVG of its
  own, skipped by class; on the review page, two queues' items. The view-failure test reads the console's
  `Kiz Radar: the review:` (the page's one guarded view) and checks the queues' tabs were drawn around it.
- **(19):** `session`'s and `storage`'s comments and messages now say what each storage keeps (the tab's: the token and
  `updating.ts`'s clock; the device's: the review dashboard's and `hints.ts`'s). The plan's rows had no "not pushed";
  the task records 2.6–2.6d did, and lose it.
- **(20):** the test reads `--print-config`'s `**/vitest.config.ts` as the `vitest.config.ts` the config writes.
