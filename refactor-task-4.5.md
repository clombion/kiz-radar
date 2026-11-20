# Task 4.5: the shell

Task 4.5 of [refactor-plan.md](refactor-plan.md). Status: done, 20 November 2026. The shell drawn by Solid, piece by
piece, the page the same; `page.browser.test.ts`'s tests of `pill` and `modal` gone with them, what they held read on
the page; no stop.

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
  their handlers. `placed.browser.test.tsx` draws a part that throws and one after it.
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
  `close` puts the focus back on the opener). A `close` event that arrives once the dialog is open again belongs to an
  earlier closing and is left alone, and an opening before the last closing's step back takes that entry again instead
  of pushing a second. The backdrop's tap is the `<dialog>`'s own click, a delegated `onClick` whose target is the
  dialog. `open()` returns false when the dialog is open, and when its `<Dialog>` is not drawn or no longer in the page.
  A quick view (`peek`) is drawn at the end of `<body>` when first asked for, its parts handed to the `h()` modules that
  fill them (`plans`, `flights`, `passes`), until 4.6 ports them; a quick view that did not draw throws, naming it.
- **The search.** A component whose state is signals (what is typed, the groups shown in full, whether past ones are
  included, the index once built, the openings, the highlighted option); the text field's value and the checkbox's
  `checked` are bound to them. The list is a memo of them, a new model on each change and each opening, its option ids
  numbered from `search-o1` in the order the old code numbered them ("Show all"'s before its group's rows); an effect on
  each new model puts the highlight on the best match (or none) and scrolls it into view (the option found by its ref),
  and rewrites the live status, as `highlight(0)` and `status.textContent` did. The list is drawn in a boundary of its
  own inside the listbox: a row that throws as it is drawn is reported and the list left empty, the dialog, its entry
  and the next render untouched, as the old input listener left them. The index is built once, its promise kept, however
  many times the search opens while it is built (again after a failure). A filling of the field for the visitor (Did you
  mean, Escape) is flushed, so the field and the list are drawn when the call returns, as the field written by hand was.
- **The page mid-update.** Drawn in `<main>` once for a failure, however many say it (the start and a view that waits
  for the data both do): a call while the page shows is a no-op. The countdown is the drawn page's: started once its
  seconds' span is drawn, its seconds set through that span in the interval, so it counts even after a halt, and cleared
  when the page is disposed; one interval per page shown, none for a page that failed to draw.

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
  `tests/site/placed.browser.test.tsx`, `tests/site/search-broken.browser.test.ts`,
  `tests/site/updating-twice.browser.test.ts`; `lint/fixtures/tests/tests/site/placed.browser.test.tsx`.
- **Changed:** `site/main.ts`, `site/report.ts`, `site/money.ts`, `site/bits.ts`, `site/dom.ts`, `site/plans.ts`,
  `site/flights.ts`, `site/passes.ts`, `site/owner.ts`, `site/mount.tsx`; comments in `site/find.ts`, `site/kept.ts`,
  `site/db.ts`, `lint/session.ts`; `tests/site/page.browser.test.ts`, `tests/site/search.browser.test.ts`,
  `tests/site/elements.browser.test.ts`, `tests/site/main.browser.test.ts`, `tests/site/styles.test.ts`,
  `tests/site/updating.browser.test.ts`, `tests/test_structure.py`, `tests/test_suppressions.py`; comments in
  `tests/site/seen.ts`, `tests/site/mount.browser.test.ts`, `tests/site/tabs.browser.test.ts`, `tests/site/app.ts`,
  `tests/site/reload.ts`; `.oxlintrc.json` (the house/tests allowances, the readonly rule's `allow`), `lint/tests.ts`
  and its fixtures; `docs/lint-false-positives.md`, `docs/concepts/lint-rules.md`; comments in `public/index.html` (and
  the community page generated from it) and `public/css/site.css`.
- **Deleted:** `site/tabs.ts`, `site/modal.ts`, `site/search.ts`, `site/updating.ts`; two tests of
  `page.browser.test.ts`.

## Commits

| Commit | What |
| -- | -- |
| `17d8f6b` | this plan |
| `d4b14c1` | no module both `X.ts` and `X.tsx` (`tests/test_structure.py`) |
| `47d9774` | `styles.test.ts` counts a JSX `class="…"` |
| `4930338` | the problem line (`body.ts`, `problem.tsx`, `bits.ts`'s `asElement`), with `problem.browser.test.ts` |
| `58972e2` | the header's tabs and their oval (`placed.tsx`, `tabs.tsx`), with `placed.browser.test.tsx` |
| `c12f47c` | the sub-navigation row; `pill` and its test gone |
| `4dba9d3` | the footer's links, the skip link and Back to top (`shell.tsx`), with their test |
| `f85ad3f` | the currency switch |
| `b698dda` | the dialog host (`dialog.tsx`); `modal.ts` and its test gone; its late close event and backdrop tested |
| `739ae5a` | the search's combobox (`search.tsx`), with its walk and `search-broken.browser.test.ts` |
| `7c25ee7` | the page mid-update (`updating.tsx`), with `updating-twice.browser.test.ts` and the countdown redrawn |
| the last | the plan's rows and this status |

## Tests

- **Deleted** (task 1.6, each with its helper): `page.browser.test.ts`'s "with no current tab, or the row hidden, there
  is no oval" (with `pill`, `c12f47c`: no current tab is read by `tabs.calm.browser.test.ts`, and a hidden row has no
  tabs) and "a dialog has a history entry of its own" (with `modal`, `b698dda`: read through the search in
  `elements.browser.test.ts`).
- **Added:** `tests/test_structure.py`'s twin test and its own; `problem.browser.test.ts`; `placed.browser.test.tsx` (a
  shell part that throws); `main.browser.test.ts`'s skip link and footer links, and Back to top;
  `elements.browser.test.ts`'s search closed and opened again before its close event, and its backdrop tap;
  `search.browser.test.ts`'s three combobox tests; `search-broken.browser.test.ts` (a row that throws);
  `updating.browser.test.ts`'s page drawn anew; `updating-twice.browser.test.ts`.
- **Changed:** `styles.test.ts` (JSX classes counted); `elements.browser.test.ts`'s history test (Ctrl+K and `/` push no
  second entry while the search shows; the focus on the opener after an Escape); `main.browser.test.ts`'s currency
  switch (its words whole, no id left); `search.browser.test.ts`'s third combobox test waits for the last test's slide
  to end before it resizes the window.

## Fail-checks

Each made by undoing one piece and running its test, then putting it back:

- **The twin test:** a copy of `report.ts` as `report.tsx`, staged: `['site/report']` found. Its first version read
  `lint/*.ts` as git does, where `*` matches `/`, and found the house rules' fixtures, which hold both forms on purpose:
  the pathspecs are `:(glob)` now.
- **`styles.test.ts`:** `sentence.ts`'s quoted `'empty'` renamed, so that `week.tsx`'s `class="empty"` alone gives it:
  the old test calls `.empty` unused, the new one does not.
- **The problem line:** a line held as one reactive part fed by a signal shows nothing once Solid has halted (no line);
  a line rewritten in place is the same element twice. (A line whose words are a signal read as it is made still draws
  after the halt: what the halt drops is a later write.)
- **The skip link, the footer, Back to top:** a skip link that does nothing, one drawn at the end of `<body>`, a Back to
  top never shown and one that does nothing each fail the new tests.
- **The currency switch:** without the dots between the currencies, the test of its words fails.
- **The house/tests fixture:** with the allowance still naming `tabs.tsx`, the fixture's refused import of it is not
  found.
- **The dialog host:** an `open()` that opens an open dialog pushes two more entries (`[true, 3]` for `[true, 1]`); a
  close that sends the focus elsewhere fails the focus checks. Removing the focus call alone does not: Chromium puts the
  focus back on the opener when a modal dialog closes.
- **The search:** a render that does not scroll its best match into view (the highlight set, the scroll left to the
  arrows), "Show all" numbered after its rows, ArrowUp with no wrap, suggestions highlighted, an Enter that picks
  nothing, a "Did you mean" that does not fill the field: each fails its test.
- **The page mid-update:** without the guard, and with `updating.ts` back, `updating-twice.browser.test.ts` sees two
  countdowns.
- **The audit's corrections:** each in the section below.

## Departures from the plan

- **`report.ts` exports `report`**, which `placed.tsx`'s boundaries call with the part's name.
- **`prefer-readonly-parameter-types`' `allow`** names `ArrayElement` of `solid-js` and of `@solidjs/web`: a component's
  `children` (the dialog host's `<Dialog>`) is JSX's element, which may be a mutable list; documented in
  `docs/concepts/lint-rules.md`. No rule turned off.
- **The search is a function, `searchDialog(trigger, data)`,** not a component: `solid/reactivity` reads every use of a
  prop in a component's body as reactive, and the trigger and the data are values. Its text field is heard on itself (a
  ref), as before: a script's `input` event does not bubble, so a delegated `onInput` missed it (the existing tests type
  that way).
- **`leaving`'s contents** are flattened before the JSX: an expression read in JSX is an effect, and `leaving` makes its
  link outside any owner (`NO_OWNER_EFFECT`, which the console guard caught).
- **The header's tab is set with `equals: false`,** so the oval is placed again on every view shown, the same tab too,
  as `pill` was called on every view: a move cut short by the next view of the same tab still snaps as it did.
- **The page mid-update, drawn anew** after a view has taken its place, disposes the root of the page before, its
  countdown with it, so the page's owner does not keep one per redraw, and the old countdown no longer reloads the page
  into a new one's count (the old code's did).
- **The tests:** `main.browser.test.ts` gained the skip link's, the footer's and Back to top's test, which no test read
  before.
- **No `Modal.shows()`:** the index is a signal and the list a memo of it, drawn whether the dialog shows or not (unseen
  while it is closed), and drawn anew on each opening; the old code rendered it only while the dialog showed.
- **The comments** of five commits were rewrapped to 120 columns before the record, folded into the commits that wrote
  them.

## Open issues (recorded, not fixed)

- The search's listbox holds children that are not options (notes, buttons, links), as it did before.
- The suite runs in Chromium alone; Firefox's and Safari's latest are not checked by it.
- `elements.browser.test.ts` fails now and then, outside any test, on "changing section: InvalidStateError: Transition
  was aborted because of invalid state. Viewport size changed": a slide still running when a later test resizes the
  window. Seen with the header's port set aside (the problem line's commit, whose change no slide reads), and likely
  what failed the hook of this plan's own commit, which changes no code; it passed when run again.
  `search.browser.test.ts` waits for its slide before it resizes; `elements.browser.test.ts`'s case is not traced.
- A shell part's boundary keeps the branch that threw (Solid's `Errored` keeps it for a reset): no cleanup of it runs,
  so the dialog host cannot learn from one that its dialog was taken away; `open()` asks whether the dialog is still in
  the page instead. The search's history entry stays if its whole part throws (no longer for a row, which its list's own
  boundary holds).

## The audit's corrections

The audit of the finished task (seven auditors) found what follows, each fixed in the commit that wrote the code and
each new test fail-checked: the fix undone, the test run and seen to fail, the fix put back.

- **A row that throws as it is drawn** took the open search away, its entry left and every later opening refused (or,
  after Back, `showModal` throwing on a dialog out of the page). The list has a boundary of its own inside the listbox
  (`739ae5a`), and `open()` refuses a dialog no longer in the page (`b698dda`). `search-broken.browser.test.ts` plants a
  past festival whose dates are no days, includes it, and sees the error said once, the dialog open with its entry, a
  search after it, a close and an opening again. Fail-checks: without the list's boundary, the search's part boundary
  says "the search" and the test fails; without the `isConnected` test, a scratch test of that state (the list's
  boundary removed, then Back, then the button) gets `InvalidStateError: … not in a Document`, reported. A cleanup in
  `<Dialog>`, as the audit proposed, never runs there (open issues), so it was left out.
- **A late `close` event** shut the search opened again at once and left the history one entry long. `closed` leaves the
  event alone while the dialog is open, and `open` pushes no entry while the last one is still there (`b698dda`).
  `elements.browser.test.ts` closes the search as Escape does and opens it again before the event is sent: open, one
  entry, which a step back takes. Fail-checks: without the early return, the dialog is shut; with a push each time, one
  entry too many. `seen.ts`'s `shownDialog` and the search tests no longer wait for the event.
- **A throwing shell part** had no test. `placed.browser.test.tsx` (`58972e2`) draws one in an element's place, then a
  counter in the next one's, and sees the error said once in the console and in a line, nothing drawn in its place, the
  counter drawn, its click heard and a later write drawn. Fail-check: without `<Errored>`, the throw leaves `inPlaceOf`
  and nothing is reported. The test imports `placed.tsx`: an exemption of `house/tests` in its own override, written in
  `lint/tests.ts` and `docs/concepts/lint-rules.md`, with a fixture.
- **The countdown** outlived its page: a page drawn anew 45 seconds on was reloaded 15 seconds into its own minute, and
  a page that failed to draw would have thrown each second. The interval starts in the seconds' span's ref and is
  cleared with the page (`7c25ee7`). `updating.browser.test.ts` draws the page, lets 45 seconds go, draws it anew under
  the same timers: one timer, the new page's 60 seconds, and 59 seconds later "1 second". Fail-check: with the old
  module, two timers.
- **The quick view's parts** were typed as elements through `!`: `peek` checks them once drawn and throws, naming the
  view, if its boundary drew nothing (`b698dda`).
- **The search test resized the window during a slide** (on every run `data-vt` was "ahead" as the third test started):
  it waits for the slide's end first (`739ae5a`). Not fail-checked: the abort it guards against was never seen in that
  file.
- **The date's space** in a search row was a literal no-break space: written `'\u00a0'` as before (`739ae5a`).
- **The search's state** was variables and a render called by hand: signals and a memo now (design model), the field's
  value and the checkbox bound to them, the index built once (`739ae5a`). The combobox tests pass unchanged but for the
  waits above.
- **Handlers by hand** where JSX's serve: the backdrop's tap is the dialog's `onClick`, kept by delegation (target and
  current target the dialog; `jsx-a11y/click-events-have-key-events` suppressed on its line, counted and listed: Escape
  is its key), tested in `elements.browser.test.ts` by a tap on the dialog and one inside it (fail-checks: a handler
  that never closes, and one that closes on any tap, each fail it) (`b698dda`); the field's keys an `onKeyDown` (its
  `input` still heard on the field itself, for a script's event that does not bubble), and the highlighted option found
  by its ref (`739ae5a`).
- **Exports nothing imported:** `RowProps` (`58972e2`) and `Modal` (`b698dda`) no longer exported; `tabs.tsx`'s `Link`
  is, and types `main.ts`'s `Subnav.links` (`c12f47c`).
- **One check for an element JSX made:** `bits.ts`'s `asElement(made, Class, what)`, a TypeError naming what was drawn
  as no element (`4930338`), used by the problem line, the oval's shapes (`58972e2`) and `leaving` (`b698dda`).
- **JSX's types** in `search.tsx` and `dialog.tsx` are the house's (`kiz-jsx/jsx-runtime`), not Solid's own.

## Done when

Every piece of the shell is JSX drawn through `placed.tsx` or `report.ts`'s line, the page the same; `tabs.ts`,
`modal.ts`, `search.ts` and `updating.ts` are gone with `page.browser.test.ts`'s tests of `pill` and `modal`; every
other test passes; `mise run check` passes.
