# oxlint's suppressed findings

Each line where an oxlint rule is turned off by a comment (`oxlint-disable-next-line <rule>, … -- <why>`), and why the
code is right as it is. `tests/test_suppressions.py` lists the same lines by file and rule, so a new one changes both.
The rules and their settings are in [lint rules](concepts/lint-rules.md); the 2.4 task of the move to oxlint fixed every
other finding in the code.

## The rule misreads the code

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/calendar.test.ts` | `jest/no-done-callback` | `test.for`'s callback takes the case, not a done callback: the rule knows `test.each` only. Reproduction: `test.for([1])('%s', (n) => {})`. |
| `tests/site/elements.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/main.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/server.browser.test.ts` | `jest/no-done-callback` | the same |
| `site/globals.d.ts` | `import/no-namespace` | a type-only namespace import (`import type * as TopoJSON`), the one way to type the global the page loads from vendor/; erased, so nothing to tree-shake. Biome's `noNamespaceImport` allows it. |

## The code means it

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/app.browser.test.ts` | `unicorn/new-for-builtins` | `Date()` called without `new` is one of the forms of the clock the test reads (the stub's `apply`); `String(new Date())` would test another. |
| `tests/site/main.browser.test.ts` | `typescript/no-misused-promises`, `typescript/promise-function-async`, `typescript/strict-void-return` | the test leaves a rejected promise uncaught on purpose: only the window's listener may see it. The callback hands setTimeout the promise, so that it is kept and never caught: made async, it would catch it; given a body, it would no longer hold it. One comment names the three rules. |
| `vitest.config.ts` | `house/env` | the machine may name its own Chromium (`CHROMIUM`), the one setting read from the environment. |
| `site/artists.ts` | `house/states` | `next` is an order the address names (`sort=next`), not `tier_today`'s state of that name. |
| `site/json.ts`, `site/rows.ts`, `site/routes.ts`, `site/wording.ts` | `typescript/no-unsafe-type-assertion` | each assertion holds by what the code before it does, as its comment says: every field or column of the shape was read into `out` by its own reader (`json.ts`, `rows.ts`); `s` starts as the defaults and takes only values of their types (`routes.ts`); `say` gives the words exactly when the generated table has them, which `Said` reads (`wording.ts`). Biome's `noUnsafeTypeAssertion` was suppressed on the same four until it stopped linting the TypeScript (task 2.7). |
