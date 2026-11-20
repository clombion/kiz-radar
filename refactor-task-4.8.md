# Task 4.8: the read-only views

Task 4.8 of [refactor-plan.md](refactor-plan.md). Status: done, 20 November 2026. Both views Solid's, mounted through
`mount.tsx`'s `mounted`, the markup the same (read through the page before and after each view, on every kind of result
the SQL page draws); nothing of `dom.ts` dead; no stop.

## Summary

The two views row 4.8 names move from `h()` to Solid, one view a commit, each mounted through `mount.tsx`'s `mounted` as
the views of 4.4 and 4.7 are: the sources page (`sources.ts`, `#sources`) and the SQL page (`tables.ts`, `#sql`). This
week was 4.4's first view and `updating` part of 4.5's shell, so nothing else is in the row. Visitors see the same site:
the same markup, words, focus and behaviour, in the latest Firefox and Safari as in Chromium.

What the two views used of `dom.ts` (`h`, `button`) stays for `review.ts`, `report.ts` and `main.ts`'s line of a load
that failed, until 4.9 and 4.10; nothing of `dom.ts` becomes dead with this port, so `dom.ts` and `page.browser.test.ts`
are unchanged (4.10's).

## Design model

- **A view is a function of its address** (4.7, decision 2): `sources()` and `sqlPage()` take `ViewProps` (unused but
  for the signature, as `Week` takes none) and return JSX, mounted with `mounted(…)` in `main.ts`'s `VIEWS`. A first
  draw that throws (the SQL page's list of tables, read as it is drawn) is said in the view's place by `mounted`'s
  boundary, as `guarded` said it.
- **The sources page is markup alone:** JSX for what `h()` built, its helper `part` a function returning JSX (a section
  and its paragraphs), its links inline `<a>`, its words unchanged character for character (JSX's whitespace rules
  checked by the dump, below); `freshness()` read as it is drawn, as before.
- **The SQL page's state is what a query gave:** one signal, the last run's result (its result sets as the page draws
  them, or the query's own error's words), drawn by JSX in the `.sql-out` box, which stays, as `replaceChildren` kept
  it; each run sets it anew, flushed (`flush`), so the rows are there when the click or key returns, as the `h()` page
  drew them in its listener. The query is read from the textarea as it runs (a ref, no `!`: a run before it is drawn
  reads nothing), since a visitor, and the tests, set its value without an input event; an example picked, or a table's
  button, writes its query into it and runs it, as before. The first run is made as the view is drawn, its result the
  signal's first value.
- **A run keeps what the page draws:** of each result set its columns, how many rows it has and its first 1000 rows
  (`SHOWN`, the cap and its count line one constant), a blob as its length, so the signal never holds more than the
  `h()` page kept once it had drawn (audit corrections).
- **A result is plain markup:** drawn once a run and never updated, each cell's words and class are worked out before
  the JSX and the sets, rows and cells mapped, so none is a reactive expression or an owner of its own, as the `h()`
  page built plain nodes (audit corrections).
- **What is drawn again is in a `Redrawn`:** `exec`'s throw (the query's own error, for its writer) is caught in the run
  and drawn as its words, as before; drawing a result is total over what `exec` returns, but a throw as a later run
  draws it (none a query reaches; planted in the tests) is said once as the page's, the rest of the page kept, by
  `mount.tsx`'s `Redrawn`, as 4.7's rule has it, where the plan had no boundary (audit corrections).
- **Shared controls:** the examples are `controls.tsx`'s `choices`, the choice handed back typed (an example's index,
  read as the option at the picked place, as before). The `h()` select marked no option `selected` (the first shown as a
  select shows it); `choices` gains `on: null` for that: no option marked `defaultSelected`, the select's `value` set to
  the first option's (Solid's null `value` would leave the select on none, `selectedIndex` −1: fail-checks), rather than
  adding a `selected` attribute the markup did not have. The Run button and the tables' buttons are
  `<button type="button">`, as `dom.ts`'s `button` drew them.
- **Ctrl/⌘+Enter** is the textarea's `onKeyDown`, delegated to the view's root (a `keydown` bubbles), where the `h()`
  page listened on the textarea; the default prevented as before.
- **A form control's state as `h()` set it:** the textarea's first query is its text (`defaultValue`, the child text
  `h()` appended), never `value` alone, which would leave its markup empty.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The order | the sources page, then the SQL page | The smaller first; neither uses the other. |
| 2 | A view's signature | `mounted((at: ViewProps) => JSX.Element)`, as 4.7 | One seam for every view. |
| 3 | The SQL page's output | a signal of the last run's result (at most 1000 rows a set), drawn by JSX as plain markup in a `Redrawn` | Design model; the plan had no `Redrawn` (the draw cannot throw) and drew cells as reactive expressions: the audit's corrections. |
| 4 | The examples' select | `controls.tsx`'s `choices`, with `on: null` for a select with no option marked | Shared control (the 4.7 audit's lesson), identical markup. |
| 5 | Tests | the SQL page's runs counted alike in `drawn-again.browser.test.ts` (owners, the table drawn anew); `sources.browser.test.ts`: an example picked runs it, a table's button inserts and runs its query, Ctrl+Enter and ⌘+Enter run, Enter alone does not, the textarea's first query in its markup and no option marked; each fail-checked | Every way the page runs a query was untested but the Run button; the port changes how each is heard. |
| 6 | Markup | checked per view by a scratch dump (not committed) of `<main>`'s markup on the sources page and, on the SQL page, as drawn, after an example, a table's button, an error, a mixed result (a number, `NULL`, bytes, text), a query of no rows, Enter alone, and 1500 rows, before and after; leaving out Solid's empty comments, attributes' and class names' order, reading form controls' state as properties | As 4.6 and 4.7. |
| 7 | `.oxlintrc.json`'s `prefer-destructuring` exception | `sources.ts` and `tables.ts` taken out of it (and its row in `docs/concepts/lint-rules.md`) as each goes; `roster.ts` stays | The files are rewritten (Q2: "until Phase 4 rewrites these files"). |

## Impact

- **New:** `site/sources.tsx`, `site/tables.tsx` (from their `.ts`).
- **Changed:** `site/main.ts` (the two views mounted), `site/controls.tsx` (`choices`' `on: null`), `site/mount.tsx`
  (its header and `Redrawn`'s comment), `site/report.ts` (`message` exported), `.oxlintrc.json`,
  `docs/concepts/lint-rules.md`, `docs/guides/the-site.md` (the module's name), `tests/site/sources.browser.test.ts`,
  `tests/site/drawn-again.browser.test.ts`, `tests/site/redrawn-broken.browser.test.ts`,
  `tests/site/mount.browser.test.ts`, `tests/site/mount-broken.browser.test.ts`; `refactor-plan.md` (row 4.8).
- **Unchanged:** `dom.ts` (its `h()` and `button` used by `review.ts`, `report.ts`, `main.ts`), `page.browser.test.ts`,
  `routes.ts`, `db.ts`, the stylesheet, the page's policy.

## Commits

| Commit | What |
| -- | -- |
| `a59e2c0` | this plan |
| `121b316` | the sources page (`sources.tsx`); `mount.browser.test.ts`'s count of roots read on a page every view of which is Solid's |
| `750e042` | the SQL page (`tables.tsx`), `choices`' `on: null`, `main.ts`'s and `mount.tsx`'s headers; its tests |
| the last | the plan's row and this status |

## Tests

- **Deleted:** none.
- **Added:** `sources.browser.test.ts`: the SQL page starts on its first example, run, its query the field's text, no
  example marked chosen; an example picked, or a table's button, writes its query into the field and runs it; Ctrl+Enter
  and ⌘+Enter in the field run its query (the key taken), Enter alone does not; a query's own error, and a query of no
  rows, are said where its rows would be. `drawn-again.browser.test.ts`: the SQL page's result, drawn again on each run,
  holds the owners of its last run alone. `mount-broken.browser.test.ts` (its page planted also with a table's
  description that is no text): the SQL page's list of tables throwing as it is drawn is said in the view's place, the
  page going on. Each new test of the SQL page's behaviour also passes on the `h()` page (run with the port set aside),
  so they pin what the page did. After the audit (audit corrections): `sources.browser.test.ts`: a result is drawn as
  the page drew it (a number marked `num`, `NULL` and bytes said, the columns, several result sets, 1000 rows of 1500
  and their count line, in the `polite` live region), and the list of tables marks a view and says what a table holds;
  `drawn-again.browser.test.ts`: a thousand rows of ten columns hold the owners of one value;
  `redrawn-broken.browser.test.ts`: a result that throws as a run draws it is said once as the page's, the page going
  on. Suite: 513 tests (and 5 expected to fail) before, 523 after.
- **Changed:** `mount.browser.test.ts`'s "a Solid view's root leaves the page's owner when the view is left" left This
  week for the sources page, an `h()` view with no root, and counted one root more on This week; every view now has a
  root, so it counts the same roots on either, the root of the view left gone, and is named for that: "the page holds as
  many roots on any view: a Solid view's root goes when the view is left". Not weakened: a root left behind still fails
  it (below), and a view rendered outside the page's owner fails it and the file's two other tests (Solid refuses the
  unowned root). `sources.browser.test.ts`'s `ran` helper split into `rows` and `field`.

## Fail-checks

Each made by undoing one piece (or adding a leak) and running its test, then putting it back:

- **The roots of the views left:** `mounted` not disposing a view: `mount.browser.test.ts` 12 roots for 11 (and its two
  other tests: the root not emptied, 1805 owners for 1287).
- **The runs counted alike:** a root made per run under the page's owner, never disposed: `[808, 809, 810]` for
  `[808, 808, 808]` (after the audit's corrections, which draw a result with no owner of its own: `[547, 548, 549]` for
  `[547, 547, 547]`); the first run not made: "the page has no part to draw again" (and the first example's rows 0).
- **The keys:** the handler matching no key: `false` for `true` (Ctrl+Enter not taken); `metaKey` dropped: the same at
  ⌘+Enter; the modifier test dropped: Enter alone taken (`true` for `false`); `preventDefault` dropped: `false` for
  `true`.
- **The markup:** the field's query as `value` in place of `defaultValue`: its text `''`; the examples drawn with
  `on: 0`: one option marked `selected` (`[Array(1)]` for `[]`); `choices`' `on: null` setting no value: the select on
  no option (`selectedIndex` −1 for 0).
- **The writes:** an example picked running without writing its query: the field unchanged; a table's button the same:
  the last example's query in place of `SELECT * FROM artists LIMIT 50;`.
- **The query's own error** not caught in the run: the old rows still shown (`[…(25)]` for `[]`) and "Kiz Radar: the
  page: Error: no such column: nothing_here" undeclared.
- **The list of tables' throw:** caught in the view (the list empty): the opening not refused and the declared error
  never said; the view drawn outside `mounted`'s boundary: the throw the window's ("the page"), Solid halted, the next
  address never drawn ("still waiting for the focus a new page takes after 10000 ms").
- **The markup** (scratch dump, not committed): `<main>`'s markup, adjacent texts merged, the sources page and the SQL
  page as drawn, after an example, after a table's button, after an error, after a mixed result (a number, `NULL`,
  bytes, text, and a result set with no rows), after a query of no rows, after Enter alone, and the count line of 1500
  rows: the same before and after each commit.

## Audit corrections

A seven-auditor audit of the commits above found the following; each is folded into the commit that wrote the code,
fail-checked as said (each fail-check undoes the one fix, runs the test, and puts it back).

- **Every cell of a result was reactive** (two auditors, medium and low): a cell's text and its `class` were reactive
  expressions (an effect each, by the compiled output), and every row, result set and column a `For`'s owner, built and
  disposed on each run though never updated: a thousand rows of ten columns held 22,562 owners under the page's where
  one value held 557. A result is now plain markup (design model): both hold 546, the first example's 25 rows 547 where
  they held 808. `drawn-again.browser.test.ts` pins it (a thousand rows hold the owners of one value). Fail-checks: the
  port's cell put back, `[10000, 20546]` for `[10000, 548]`; the rows drawn by `For`, `[10000, 2550]` for
  `[10000, 552]`.
- **The result signal held the whole result** (two auditors, low): a query of 300,000 rows, or a 200 MB blob, stayed on
  the heap while the page showed it, where the `h()` page let it go once drawn. A run keeps the columns, the count, the
  first 1000 rows and a blob's length (`Got`, `Kept`), held by its type; memory is not seen from the page, so no test.
- **No test pinned how a result is drawn** (medium): `sources.browser.test.ts` now does (Tests). Fail-checks: the `num`
  class dropped, `[null, null, null, null, null]` for `['num', null, null, null, 'num']`; `NULL` drawn `''`, `''` for
  `'NULL'`; the cap dropped, `[1500, ['1'], ['1500']]` for `[1000, ['1'], ['1000']]`; " (first 1000 shown)" dropped,
  `'1,500 rows'` for the line with it; a blob's words its length alone, `'2'` for `'2 bytes'`; `aria-live` dropped,
  `null` for `'polite'`; the view's `<small>` unclassed, `undefined` for `' view'`; a table's description drawn as a
  `<span>`, the test failing on its `p.small.muted`.
- **A later throw while drawing a result took the whole page** (low, no query reaches it): the old `try` covered the
  drawing too; the port's run caught `exec` alone, so a throw on a later run reached the view's boundary, the field and
  the visitor's query gone. The result is drawn in `mount.tsx`'s `Redrawn`: said once as the page's, the box empty, the
  rest kept, the next run drawing again; as the view is first drawn, still the view's. `redrawn-broken.browser.test.ts`
  plants it (`Number.prototype.toLocaleString` refused as a run counts its rows, in words of its own: the Map's case
  above leaves its own problem line). Fail-check: `Redrawn` taken out, the problem line still the Map's and "Kiz Radar:
  the page: RangeError: a count refused" never said, the view's "Kiz Radar: sql:" said instead.
- **The first result not announced** (low): not a departure. The `h()` page also drew the region and filled it in one
  task, in a root already in `<main>` (`main.ts`'s `show`, then `sqlView`'s `root.replaceChildren(…)` and `run()`), so
  the accessibility tree, updated after the task, met it filled either way, and neither page announced it. Filling it a
  task later would be new behaviour, an announcement on each opening; nothing to restore.
- **`Rows` restated sql.js's `QueryExecResult`** (low): gone; the run maps what `exec` returns, typed by it, into `Got`,
  the page's own shape. A named function taking a `QueryExecResult` is refused by `prefer-readonly-parameter-types` (why
  `Rows` was written), the inline callback is not.
- **`For` over a section's fixed paragraphs** (nit): mapped before the JSX, as the `h()` page mapped them; a map inside
  the JSX is refused by `solid/prefer-for`, which is why `For` was there.
- **Stale or contradicting words** (four auditors): this record's views' names, the sources page's helper and `choices`'
  `on: null` (it sets the select's `value`, the fail-check's reason); `mount.tsx`'s header and `Redrawn`'s comment, and
  `mount.browser.test.ts`'s header, which spoke of `h()` views; `docs/concepts/lint-rules.md`'s "these files" on a row
  of one, as `.oxlintrc.json` says.
- **The 1000-row cap written twice** (low): `SHOWN`, the cap and its count line.
- **An error's words written in three modules** (low): `report.ts`'s `message` exported and used by the SQL page; the
  other two left (open issues).
- **`mount.browser.test.ts`'s name claimed more than it held** (low): renamed (Tests); the claim it dropped is held by
  the file's other tests.
- **Not changed:** `guarded` stating "cannot be shown" beside `mounted`'s boundary, already an open issue (4.10).

## Departures from the plan

- **`mount.browser.test.ts`** had to change in the sources page's commit: it read the sources page as an `h()` view,
  with no root (Tests, above). Its hook failed on it before the commit was made.
- **A test of the first draw's throw** was added beyond decision 5, for the lesson of the 4.4 to 4.7 audits (a first
  draw's throw is the view's), folded into the SQL page's commit: first as a file of its own, which jscpd refused (its
  start and plant written as `mount-broken.browser.test.ts`'s), so as a second case of that file, on a second planted
  row.
- **`main.ts`'s header** spoke of an `h()` view's listeners; every view being Solid's, it says so. `report.ts`'s still
  names `guarded` for an `h()` view: the review page's (4.9).
- **A throw as a run draws a result** is said as the page's (`Redrawn`), where the `h()` page drew it in the box as the
  query's own error: the 4.7 rule for what a view draws again (`mount.tsx`), as a throw that is no query's error is the
  page's, not the visitor's; no query reaches one.
- **Suppressions:** none added or removed (`tests/test_suppressions.py` and `docs/lint-false-positives.md` unchanged).
  The one exception touched is `.oxlintrc.json`'s `prefer-destructuring` override, now `roster.ts` alone, its row in
  `docs/concepts/lint-rules.md` with it.

## Open issues (recorded, not fixed)

- **The suite runs in Chromium alone;** Firefox's and Safari's latest are not checked by it. The two views use nothing
  the `h()` views did not (a `keydown` delegated to the view's root, `defaultValue` on a `<textarea>`).

- **Solid's text nodes:** JSX writes a text with a value in it (the flight prices' city) as several text nodes, where
  `h()` wrote one; the text and the markup serialised are the same.

- **`guarded` in `main.ts`** now wraps only `mounted`, whose boundary says a view's throw; it catches what escapes
  `render` itself. Kept: 4.10 decides `main.ts`'s last `h()` (the line of a load that failed) with `dom.ts`.

- **`mount-broken.browser.test.ts`'s header** still says "as an h() view does (broken.browser.test.ts)", stale since 4.7
  made Artists Solid's; not this task's code, left for 4.10's pass over comments.

- **An error's words** are still written out in `main.ts`'s line of a load that failed (4.10's, with `dom.ts`) and
  `sentence.tsx`'s `unread`, beside `report.ts`'s `message`: not this task's code.

## Done when

Both views of row 4.8 are Solid views mounted through `mounted`, the page the same; every test passes, each new one
fail-checked; knip clean; `mise run check` passes.
