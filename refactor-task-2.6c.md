# Task 2.6c: the type-aware rules new in oxlint

Task 2.6c of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026, not pushed. The 33 type-aware rules
oxlint has and Biome does not are on as errors (owner, 19 November; [lint rules](docs/concepts/lint-rules.md), "New in
oxlint"), with zero findings and one suppressed line.

## Summary

| Commit | What |
| -- | -- |
| `82e13d2c` | The site's record types read-only where they are defined (`prefer-readonly-parameter-types`) |
| `3716c204` | Every function that returns a promise async (`promise-function-async`) |
| `113c5236` | The other rules' 25 findings fixed |
| this one | `.oxlintrc.json` turns the 33 on; the one suppression; these docs |

**Read-only records.** `RowOf` and `json.ts`'s `Read` made every row and read record writable (`-readonly`), and `q()`
returned a mutable array. About 70 types of the site, its tests, `lint/` and `pipeline/rows.d.ts` are now read-only at
their definitions, deeply (`readonly` fields, `readonly T[]`, `ReadonlySet`, `ReadonlyMap`), so their parameters pass
without an annotation each; an inline parameter shape is read-only where it is written. Six places filled a record in
place, and each now has a mutable builder type of its own where it fills: a festival's passes (`passes.ts`), a
community's festivals (`communities.ts`), a day's aways (`calendar.ts`), a map city (`map.ts`), a search city
(`search.ts`), and a roster line with its buckets (`roster.ts`). The roster's names are given by new lines instead of
being written into them. Two types stay mutable, being state that changes: the tabs' `Oval` (its slime now returns its
shapes for the row to keep) and the sentence view's `Choices`. In `lint/`, a rule handles a missing module name before
its check, so the check takes a node, not a node or null.

**Async.** The eight site functions (`get`, `send`, `shut`, `go`, `copy`, and `load()`'s downloads) and the tests'
helpers and stubs are async. No caller relied on a synchronous throw: each awaits them, hands them to `done()`, or
already caught their rejection.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | `allow` beyond DOM, Node and sql.js | Leaflet's `LayerGroup`, GeoJSON's `Feature`, and oxlint's syntax-tree types (`Node$1`, the literal kinds, `CallExpression`, `MemberExpression`, `Definition`, `Reference`, `TemplateElement`) | Library types none of whose fields the code can make read-only, like the DOM's; none is the site's own. Each name was checked to be needed (removing it brings findings back). |
| 2 | `return-await` | `error-handling-correctness-only` | Biome's `useAwait` and `require-await` want an await in each async function, so one made async that hands a promise on awaits it. The default `in-try-catch` refuses that await. |
| 3 | The loose promise of `main.browser.test.ts` | Suppressed for `promise-function-async` and `strict-void-return` beside `no-misused-promises`, on its one comment | The callback keeps the rejected promise uncaught on purpose. `tests/test_suppressions.py` reads a comment naming several rules. |
| 4 | Suppressions and the rules | In the commit that turns the rules on | `reportUnusedDisableDirectives` refuses a suppression of a rule that is off. |
| 5 | `say()`'s two `no-unnecessary-condition` suppressions | Gone | `restrict-template-expressions`' fix reads the generic form as a string once, which the condition rule reads correctly. |

## Done when

`mise run lint:oxlint` passes with the 33 on, Biome's check is unchanged, and `mise run check` passes.
