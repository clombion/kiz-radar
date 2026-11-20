# Task 4.8: the read-only views

Task 4.8 of [refactor-plan.md](refactor-plan.md). Status: planned.

## Summary

The two views row 4.8 names move from `h()` to Solid, one view a commit, each mounted through `mount.tsx`'s `mounted` as
the views of 4.4 and 4.7 are: the sources page (`sources.ts`, `#sources`) and the SQL page (`tables.ts`, `#sql`). This
week was 4.4's first view and `updating` part of 4.5's shell, so nothing else is in the row. Visitors see the same site:
the same markup, words, focus and behaviour, in the latest Firefox and Safari as in Chromium.

What the two views used of `dom.ts` (`h`, `button`) stays for `review.ts`, `report.ts` and `main.ts`'s line of a load
that failed, until 4.9 and 4.10; nothing of `dom.ts` becomes dead with this port, so `dom.ts` and `page.browser.test.ts`
are unchanged (4.10's).

## Design model

- **A view is a function of its address** (4.7, decision 2): `sources()` and `sql()` take `ViewProps` (unused but for
  the signature, as `Week` takes none) and return JSX, mounted with `mounted(…)` in `main.ts`'s `VIEWS`. A first draw
  that throws (the SQL page's list of tables, read as it is drawn) is said in the view's place by `mounted`'s boundary,
  as `guarded` said it.
- **The sources page is markup alone:** JSX for what `h()` built, its two helpers (`link`, `part`) functions returning
  JSX, its words unchanged character for character (JSX's whitespace rules checked by the dump, below); `freshness()`
  read as it is drawn, as before.
- **The SQL page's state is what a query gave:** one signal, the last run's result (its result sets, or the query's own
  error's words), drawn by JSX in the `.sql-out` box, which stays, as `replaceChildren` kept it; each run sets it anew,
  flushed (`flush`), so the rows are there when the click or key returns, as the `h()` page drew them in its listener.
  The query is read from the textarea as it runs (a ref, no `!`: a run before it is drawn reads nothing), since a
  visitor, and the tests, set its value without an input event; an example picked, or a table's button, writes its query
  into it and runs it, as before. The first run is made as the view is drawn, its result the signal's first value.
- **What is drawn again cannot throw past the run:** `exec`'s throw (the query's own error, for its writer) is caught in
  the run and drawn as its words, as before; drawing a result is total over what `exec` returns (a cell is a string, a
  number, `NULL` or a count of bytes), so the box needs no `Redrawn` (no later throw to say, and no test could plant
  one). Recorded as a decision, not a gap.
- **Shared controls:** the examples are `controls.tsx`'s `choices`, the choice handed back typed (an example's index,
  read as the option at the picked place, as before). The `h()` select marked no option `selected` (the first shown as a
  select shows it); `choices` gains `on: null` for that, no option marked and no `value` set, rather than adding a
  `selected` attribute the markup did not have. The Run button and the tables' buttons are `<button type="button">`, as
  `dom.ts`'s `button` drew them.
- **Ctrl/⌘+Enter** is the textarea's `onKeyDown`, delegated to the view's root (a `keydown` bubbles), where the `h()`
  page listened on the textarea; the default prevented as before.
- **A form control's state as `h()` set it:** the textarea's first query is its text (`defaultValue`, the child text
  `h()` appended), never `value` alone, which would leave its markup empty.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The order | the sources page, then the SQL page | The smaller first; neither uses the other. |
| 2 | A view's signature | `mounted((at: ViewProps) => JSX.Element)`, as 4.7 | One seam for every view. |
| 3 | The SQL page's output | a signal of the last run's result, drawn by JSX; no `Redrawn` | Design model: the run catches the query's throw, the draw cannot throw. |
| 4 | The examples' select | `controls.tsx`'s `choices`, with `on: null` for a select with no option marked | Shared control (the 4.7 audit's lesson), identical markup. |
| 5 | Tests | the SQL page's runs counted alike in `drawn-again.browser.test.ts` (owners, the table drawn anew); `sources.browser.test.ts`: an example picked runs it, a table's button inserts and runs its query, Ctrl+Enter and ⌘+Enter run, Enter alone does not, the textarea's first query in its markup and no option marked; each fail-checked | Every way the page runs a query was untested but the Run button; the port changes how each is heard. |
| 6 | Markup | checked per view by a scratch dump (not committed) of `<main>`'s markup on the sources page and, on the SQL page, as drawn, after an example, a table's button, an error, a mixed result (a number, `NULL`, bytes, text), a query of no rows, Enter alone, and 1500 rows, before and after; leaving out Solid's empty comments, attributes' and class names' order, reading form controls' state as properties | As 4.6 and 4.7. |
| 7 | `.oxlintrc.json`'s `prefer-destructuring` exception | `sources.ts` and `tables.ts` taken out of it (and its row in `docs/concepts/lint-rules.md`) as each goes; `roster.ts` stays | The files are rewritten (Q2: "until Phase 4 rewrites these files"). |

## Impact

- **New:** `site/sources.tsx`, `site/tables.tsx` (from their `.ts`).
- **Changed:** `site/main.ts` (the two views mounted), `site/controls.tsx` (`choices`' `on: null`), `.oxlintrc.json`,
  `docs/concepts/lint-rules.md`, `docs/guides/the-site.md` (the module's name), `tests/site/sources.browser.test.ts`,
  `tests/site/drawn-again.browser.test.ts`; `refactor-plan.md` (row 4.8).
- **Unchanged:** `dom.ts` (its `h()` and `button` used by `review.ts`, `report.ts`, `main.ts`), `page.browser.test.ts`,
  `routes.ts`, `db.ts`, the stylesheet, the page's policy.

## Commits (planned)

| Commit | What |
| -- | -- |
| plan | this plan |
| sources | the sources page (`sources.tsx`) |
| SQL | the SQL page (`tables.tsx`), `choices`' `on: null`, its tests |
| record | the plan's row and this status |

## Done when

Both views of row 4.8 are Solid views mounted through `mounted`, the page the same; every test passes, each new one
fail-checked; knip clean; `mise run check` passes.
