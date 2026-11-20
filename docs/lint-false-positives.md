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
| `tests/site/pages.browser.test.ts` | `jest/no-done-callback` | the same |
| `site/dialog.tsx` | `jsx-a11y/click-events-have-key-events` | the `<dialog>`'s click, a tap on its backdrop (the click's target the dialog itself), which closes it: the keyboard closes it with Escape, the dialog's own `cancel` and `close`, so it needs no key of its own. |
| `site/dialog.tsx` | `jsx-a11y/heading-has-content` | the quick view's title, drawn empty with the dialog and filled by each view that opens it (`plans`, `flights`, `passes`, `h()` modules until task 4.6) before it shows: the rule reads the JSX alone, where the heading has no content yet. |
| `site/search.tsx` | `jsx-a11y/click-events-have-key-events`, `jsx-a11y/interactive-supports-focus` | a result's row and a group's "Show all", each an option of the combobox's listbox (WAI-ARIA's combobox): the focus stays in the text field, which moves the highlight with the arrow keys and picks with Enter (`aria-activedescendant`), so an option takes neither the focus nor a key of its own. Two elements, one comment each naming both rules. |
| `site/search.tsx` | `jsx-a11y/prefer-tag-over-role` | the listbox, its groups and its two kinds of option: a row is a lead and two lines of markup, which a native `<option>` cannot hold, nor a `<select>` or `<datalist>` the rows, and no element of HTML is a group of a listbox's options. Four elements, a comment each. |
| `site/globals.d.ts` | `import/no-namespace` | a type-only namespace import (`import type * as TopoJSON`), the one way to type the global the page loads from vendor/; erased, so nothing to tree-shake. Biome's `noNamespaceImport` allows it. |

## The code means it

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/app.browser.test.ts` | `unicorn/new-for-builtins` | `Date()` called without `new` is one of the forms of the clock the test reads (the stub's `apply`); `String(new Date())` would test another. |
| `tests/site/main.browser.test.ts` | `typescript/no-misused-promises`, `typescript/promise-function-async`, `typescript/strict-void-return` | the test leaves a rejected promise uncaught on purpose: only the window's listener may see it. The callback hands setTimeout the promise, so that it is kept and never caught: made async, it would catch it; given a body, it would no longer hold it. One comment names the three rules. |
| `tests/site/diagnosed.tsx` | `solid/no-write-in-pure-computation`, `solid/reactivity` | the fixture of the console guard's tests (`console.browser.test.ts`, `halted.browser.test.ts`): a component that writes a signal in its body and one that reads a signal in its body, the two mistakes whose report by Solid's development build the tests watch. Written right, there would be nothing to report. |
| `tests/site/solid.browser.test.ts` | `house/tests` | the `import()` of `tests/site/hello.tsx` as the site's build makes it, from the `blob:` address of the code `vitest.config.ts`'s `built` command returns: a module of no `site/` file, whose address cannot be one literal. |
| `vitest.config.ts` | `house/env` | the machine may name its own Chromium (`CHROMIUM`), the one setting read from the environment. |
| `site/artists.ts` | `house/states` | `next` is an order the address names (`sort=next`), not `tier_today`'s state of that name. |
| `site/json.ts`, `site/rows.ts`, `site/routes.ts`, `site/wording.ts` | `typescript/no-unsafe-type-assertion` | each assertion holds by what the code before it does, as its comment says: every field or column of the shape was read into `out` by its own reader (`json.ts`, `rows.ts`); `s` starts as the defaults and takes only values of their types (`routes.ts`); `say` gives the words exactly when the generated table has them, which `Said` reads (`wording.ts`). Biome's `noUnsafeTypeAssertion` was suppressed on the same four until it stopped linting the TypeScript (task 2.7). |
