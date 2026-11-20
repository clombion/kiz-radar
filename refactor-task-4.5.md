# Task 4.5: the shell

Task 4.5 of [refactor-plan.md](refactor-plan.md). Status: in progress, 20 November 2026.

## Summary

The page's shell moves from `h()` to Solid's JSX, one piece a commit, each depending on the ones before: the line that
says something went wrong (`report.ts`'s), the header's tabs with their oval (`tabs.ts`), the sub-navigation row (the
same row), the footer's links with the skip link and Back to top, the currency switch, the dialog host (`modal.ts`), the
search's combobox (`search.ts`) and the page shown mid-update (`updating.ts`). Visitors see the same page: the same
markup, words and behaviour, in the latest Firefox and Safari as in Chromium. The shell's parts are drawn by Solid
outside any view, under the page's owner, through a second seam (`site/placed.tsx`) beside the views' (`mount.tsx`).
`page.browser.test.ts`'s kept tests of `pill` and `modal` go with them (task 1.6), and what the modal test checked is
pinned through the page.

## Design model

- **The shell's seam.** A shell part is a component drawn once, for the page's life, under the page's owner
  (`owner.ts`), in an `<Errored>` boundary whose fallback reports what went wrong (`report.ts`) and draws nothing: a
  throw in one part neither blanks the page nor halts Solid for the rest of it (`mount.tsx` does the same for views).
  `placed.tsx` draws a part at a place that stays: before a marker, an empty `Text` node, which is never one of the
  page's own elements. In an element's place (the currency switch's `<p>`, the header's and the sub-navigation's
  `<nav>`): the element replaced by a marker, the part drawn before it. At the end of `<body>` (Back to top, the
  dialogs): before a marker appended there. At its start (the skip link): before a marker put just after the start of
  `<body>`. Inside an element (the footer's links): before a marker appended to it. In `<main>` (the page mid-update):
  its contents taken away first, as `render` takes them away on disposal. Each draw is flushed, so the part is there
  when the call returns, as `h()`'s were. Solid delegates a JSX `onClick` to the root it was rendered into; a part has
  none of its own, so `<body>` is registered as a delegated root once (`site/body.ts`), and every part's clicks reach
  their handlers.
- **The start of `<body>`.** A marker inserted once as `<body>`'s first child, held as `Node | undefined` (`body.ts`'s
  `startOfBody`). The problem line is put before it, the skip link after it: the line first, as `prepend` left it.
- **The problem line survives a halted Solid.** An error that escapes every boundary halts `@solidjs/signals`: later
  writes are dropped (`halted.browser.test.ts`), and such an error is the likeliest thing the line will report. So the
  line is a JSX element with no signal read, its words static and its Close button a delegated `onClick`, put before the
  start marker with plain DOM, the previous line removed first: a new `<p role="alert">` each report, as before
  (`app.ts`'s `unalarmed` tells a new line by its identity).
- **The tabs' oval.** A row of tabs is one component, `Row` (`tabs.tsx`), drawing its `<nav>`, the oval's layer (goo)
  and the oval once, then the links (`<For>`). An effect on the row's links and its current one places the oval after
  Solid has drawn them: moving there as before, still when the row has other tabs than before (by their addresses, as
  `pill` compared them), hidden when no tab is current. The layer is never drawn again; a move's shapes are drawn into
  it, before the oval, before the oval starts to move, and removed by that move alone; a move cut short by the next
  removes its own. A resize, and the web font once in, place it again, still, each row for itself. The row is hidden
  exactly when it has no tabs (the sub-navigation's), where no tab is current, so the oval needs no test of `hidden`.
  `slide` stays beside it; its change runs inside the view transition's callback, outside any effect, and is flushed
  there, so the transition's new state holds the new page. Without a slide the change runs in the router's effect, where
  Solid applies the writes before the flush ends.
- **The dialog host.** `modal()` gives a dialog's host and its `<Dialog>`: the same history as `modal.ts` (on open,
  `showModal` then `pushState`; on close, `history.back()` when the entry is still there; `popstate` closes it, and
  `close` puts the focus back on the opener). The backdrop's tap is heard on the `<dialog>` itself. `open()` returns
  false when the dialog is open, and when its `<Dialog>` is not drawn. A quick view (`peek`) is drawn at the end of
  `<body>` when first asked for, its parts handed to the `h()` modules that fill them (`plans`, `flights`, `passes`),
  until 4.6 ports them.
- **The search.** A component whose state is signals (what is typed, the groups shown in full, whether past ones are
  included, the index once built, the highlighted option). The list is built as a model on each render, its option ids
  numbered from `search-o1` in the order the old code numbered them ("Show all"'s before its group's rows); an effect on
  each new model, and on each opening, puts the highlight on the best match (or none) and scrolls it into view, and
  rewrites the live status, as `highlight(0)` and `status.textContent` did.
- **The page mid-update.** Drawn in `<main>` once for a failure, however many say it (the start and a view that waits
  for the data both do): a call while the page shows is a no-op. The countdown's seconds are set through a ref, in the
  interval, so it counts even after a halt; one interval per page drawn.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Where a shell part is drawn | `site/placed.tsx` (draws), `site/body.ts` (the start marker, the delegated root) | Two modules so `report.ts` can draw its line without importing `placed.tsx`, which imports `report.ts` (`import/no-cycle`). |
| 2 | `X.ts` beside `X.tsx` | Refused by `tests/test_structure.py`, a commit of its own before the first port | tsgolint types the imports of such a pair as `any` (the lost run). |
| 3 | Classes in JSX and `styles.test.ts` | The test counts `class="…"` in the modules' code, in a commit of its own | JSX writes a class double-quoted; a class only as an unquoted object key is not counted, which fails safe (an unused-class error). |
| 4 | `tabs.ts` | Becomes `tabs.tsx` with the header's commit (`Row`, `slide`, and `pill` for the sub-navigation until the next commit) | The oval's code is written once (jscpd); `pill` and its kept test go with the sub-navigation's commit, the house/tests allowance narrowed there. |
| 5 | The skip link | Ported with Back to top, in the footer's commit (`site/shell.tsx`) | The brief's shell lists both (`main.ts:201-210`); the start marker exists for it. |
| 6 | The currency switch's home | `site/shell.tsx`, out of `money.ts` | It is the footer's; `money.ts` keeps the prices and stops importing `dom.ts`. |
| 7 | `modal.ts` | Becomes `site/dialog.tsx` (`modal`, `peek`, `leaving`); the search drawn with `<Dialog>` from `search.ts` for one commit | The host before its users; `leaving` returns an element `h()` modules hold. |
| 8 | `Kid` in JSX | `bits.ts`'s `flat` flattens it; `dom.ts`'s `nodes` is defined from it | One rule for what a `Kid` holds. |
| 9 | jsx-a11y on the combobox | Line-level suppressions with their reasons, counted in `tests/test_suppressions.py` and listed in `docs/lint-false-positives.md`; none per file | The rules misread a combobox's `group`, `option` and `listbox`; and the quick view's heading is filled by its `h()` users. |
| 10 | Tests | `page.browser.test.ts`'s `pill` and `modal` tests deleted with them; `problem.browser.test.ts` (the line after a halt, two lines two elements); the search's combobox walk in `search.browser.test.ts`; the modal test's guarantees in `elements.browser.test.ts`'s history test; `updating-twice.browser.test.ts` (one page for two calls) | Each through the page; each fail-checked. |

## Impact

- **New:** `site/body.ts`, `site/problem.tsx`, `site/placed.tsx`, `site/shell.tsx`, `site/dialog.tsx`; `site/tabs.tsx`,
  `site/search.tsx`, `site/updating.tsx` (from their `.ts`); `tests/site/problem.browser.test.ts`,
  `tests/site/updating-twice.browser.test.ts`.
- **Changed:** `site/main.ts`, `site/report.ts`, `site/money.ts`, `site/bits.ts`, `site/dom.ts`, `site/plans.ts`,
  `site/flights.ts`, `site/passes.ts`, `site/owner.ts`, `site/mount.tsx`, `site/find.ts` (comments);
  `tests/site/page.browser.test.ts`, `tests/site/search.browser.test.ts`, `tests/site/elements.browser.test.ts`,
  `tests/site/styles.test.ts`, `tests/site/mount.browser.test.ts`, `tests/test_structure.py`,
  `tests/test_suppressions.py`; `.oxlintrc.json`, `lint/tests.ts` and its fixtures; `docs/lint-false-positives.md`,
  `docs/concepts/lint-rules.md`; comments in `public/index.html` (and the community pages generated from it),
  `public/css/site.css`, `tests/site/seen.ts`.
- **Deleted:** `site/tabs.ts`, `site/modal.ts`, `site/search.ts`, `site/updating.ts`; two tests of
  `page.browser.test.ts`.

## Commits

| Commit | What |
| -- | -- |
|  | this plan |
|  | no module both `X.ts` and `X.tsx` |
|  | `styles.test.ts` counts a JSX `class="…"` |
|  | the problem line |
|  | the header's tabs and their oval |
|  | the sub-navigation row; `pill` and its test gone |
|  | the footer's links, the skip link and Back to top |
|  | the currency switch |
|  | the dialog host; `modal` and its test gone |
|  | the search's combobox |
|  | the page mid-update |
|  | the record |

## Open issues (recorded, not fixed)

- The search's listbox holds children that are not options (notes, buttons, links), as it did before.
- The suite runs in Chromium alone; Firefox's and Safari's latest are not checked by it.

## Done when

Every piece of the shell is JSX drawn through `placed.tsx` or `report.ts`'s line, the page the same; `tabs.ts`,
`modal.ts`, `search.ts` and `updating.ts` are gone with `page.browser.test.ts`'s tests of `pill` and `modal`; every
other test passes; `mise run check` passes.
