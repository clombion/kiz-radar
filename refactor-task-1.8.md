# Task 1.8: the rule that tests import no view module

Task 1.8 of [refactor-plan.md](refactor-plan.md). Status: done. Task 1.7 needed no change of its own: after 1.2,
`states.test.ts` imports `icons`, `states` and `wording`, and `styles.test.ts` `icons` and `media`, all modules the rule
allows; the node tests' other imports of a view (`festivals`, `passes` in `finder.test.ts`, `pricing.test.ts`,
`samples.ts`) are `import type`, which the rule allows.

## Summary

A Grit rule in `lint/`, listed in `biome.jsonc`, refuses in `tests/**` a value import of any `site/` module that is not
on its list, with the message naming where the list is. A node test runs Biome on a file that must fail and one that
must pass. With 1.3 to 1.6 done, the repository passes the rule.

## Design model

- **A list of what is allowed, not of what is refused** (the brief's "define the rule by a list, not by guesswork"): a
  new `site/` module is refused until someone decides it draws nothing, so a view cannot slip in by being new. The list
  is the brief's "Which `site/` modules are views": the pure modules, the browser-API ones (`routes`, `hints`, `kept`),
  the data module with one sink (`icons`) and `media`.
- **What a test may still reach**: `import type` from any module (erased; binds no test to a view's code); the dynamic
  `import()` of the two entries, `site/main.ts` and `site/review.ts`, in `tests/site/app.ts` alone (how the page
  starts); and `page.browser.test.ts`'s imports of `dom`, `tabs`, `modal` and `dismiss`, named in the rule, until the
  tests it keeps go with their helpers (tasks 4.5, 4.6, 4.10, row 1.8).
- **The rule is held by a test**, as `states.test.ts` holds `states.grit`. A node test runs `biome lint` on two small
  fixture files kept out of Biome's own run of the tree: one importing a view module (must report the rule's message),
  one importing an allowed module, a type from a view and an allowed module by `import()` (must report nothing). A third
  test checks that `biome.jsonc` lists the rule, since the fixtures' config loads it by itself.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Where the list lives | In the rule (`lint/tests.grit`), as one alternation of module names; the message names the file | One place; the message says where to look and why a new module is refused. |
| 2 | Which files | Every `.ts` under `tests/` (the site's tests and their helpers) | The helpers (`seen.ts`, `planted.ts`, `app.ts`) are test code too. |
| 3 | Type imports | `import type` and `export type` allowed; a type named inside a value import (`import { type X }`) refused | Under `verbatimModuleSyntax` the second stays as `import {} from …`, which still loads the view. |
| 4 | Dynamic imports | `import()` of `site/main.ts` and `site/review.ts` allowed in `tests/site/app.ts` alone; any other dynamic import of a `site/` module refused | How the page starts, in one place. |
| 5 | `page.browser.test.ts` | Its imports of `dom`, `tabs`, `modal`, `dismiss` allowed by name, in the rule, with the task that removes each | The tests it keeps go with their helpers. |
| 6 | The rule's test | A node test (`tests/site/lint.test.ts`) running `biome lint` with a config of its own (`tests/site/lint/rule.jsonc`: this plugin alone) on `tests/site/lint/refused.ts`, each refused line marked, and `allowed.ts`; the fixtures excluded from Biome's run of the tree, from tsc's and from knip's | Biome refuses a file its own config ignores when passed by path, so the test brings its own config. |
| 7 | Other spellings of a path | `site//dom.ts` and `site/./dom.ts` are checked and refused (the list names each module by its plain path); an `import()` whose module is not one literal is refused in `tests/` | Both load the view while escaping a check on the plain path (found by the change audit). |
| 8 | What the test does not hold | The two exceptions (`app.ts`, `page.browser.test.ts`) are held from the refused side only; a rule loosened there would pass the test. The rule tells a test by its absolute path containing `/tests/`, so a checkout under a folder named `tests` would lint the site too | The exceptions match a file's path, which a fixture cannot take; the second only adds diagnostics, which `mise run check` would show at once. |

## Impact

- **New:** `lint/tests.grit`; `tests/site/lint.test.ts`; the two fixtures.
- **Changed:** `biome.jsonc` (the plugin; the fixtures' folder excluded from the tree's run); `tsconfig`/`knip.jsonc` if
  the fixtures need excluding; `refactor-plan.md` (1.7 recorded).
- **`site/`:** unchanged.

## Done when

The rule passes on the repository, refuses the must-fail fixture with its message and passes the must-pass one;
`mise run check` at each commit.
