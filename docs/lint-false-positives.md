# oxlint's suppressed findings

Each line where an oxlint rule is turned off by a comment (`oxlint-disable-next-line <rule> -- <why>`), and why the code
is right as it is. `tests/test_suppressions.py` lists the same lines by file and rule, so a new one changes both. The
rules and their settings are in [lint rules](concepts/lint-rules.md); the 2.4 task of the move to oxlint fixed every
other finding in the code.

## The rule misreads the code

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/calendar.test.ts` | `jest/no-done-callback` | `test.for`'s callback takes the case, not a done callback: the rule knows `test.each` only. Reproduction: `test.for([1])('%s', (n) => {})`. |
| `tests/site/elements.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/main.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/server.browser.test.ts` | `jest/no-done-callback` | the same |
| `site/wording.ts` (twice) | `typescript/no-unnecessary-condition` | `form` is optional, yet `form === undefined` is called a comparison of literals: the generic `Form<P, K>` is read as one literal type. |
| `site/globals.d.ts` | `import/no-namespace` | a type-only namespace import (`import type * as TopoJSON`), the one way to type the global the page loads from vendor/; erased, so nothing to tree-shake. Biome's `noNamespaceImport` allows it. |
| `tests/site/community.browser.test.ts` | `unicorn/numeric-separators-style` | `0.039_28` is grouped as Biome's `useNumericSeparators` wants (threes from the point, the last shorter); oxlint's rule wants another grouping of a fraction, and written `0.03928` Biome reports it. |

## The code means it

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/app.browser.test.ts` | `unicorn/new-for-builtins` | `Date()` called without `new` is one of the forms of the clock the test reads (the stub's `apply`); `String(new Date())` would test another. |
| `tests/site/main.browser.test.ts` | `typescript/no-misused-promises` | the test leaves a rejected promise uncaught on purpose: only the window's listener may see it. |
| `site/artists.ts` | `house/states` | `next` is an order the address names (`sort=next`), not `tier_today`'s state of that name. |
| `vitest.config.ts` | `node/no-process-env` | the machine may name its own Chromium (`CHROMIUM`), the one setting read from the environment. |
| `site/json.ts`, `site/rows.ts`, `site/routes.ts`, `site/wording.ts` | `typescript/no-unsafe-type-assertion` | the four assertions Biome's `noUnsafeTypeAssertion` is suppressed on too, each with its reason in the `biome-ignore` above it. Written `oxlint-disable-line`, on the line itself, as Biome's comment must come right before the line; they become `oxlint-disable-next-line` when Biome stops linting the TypeScript (task 2.7). |
