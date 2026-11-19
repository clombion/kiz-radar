# Task 1.6: the helpers' tests through the app

Task 1.6 of [refactor-plan.md](refactor-plan.md). Status: done.

## Summary

`tests/site/page.browser.test.ts` held 14 tests that call `dom.ts`, `tabs.ts`, `modal.ts`, `dismiss.ts` and `icons.ts`
on elements a test builds by hand. Eleven are user-visible and are now read on the page started by `startSite`
(`tests/site/app.ts`, unchanged by this task): the tab's oval, the slide, the dialog's history entry, the paged list,
the select of choices, the card over the page and the drawings, each where the site uses it (the header's tabs and the
row under them, the Festivals page, the search, the map, a community's page). Three new files take them:
`tabs.browser.test.ts` (the browser project, motion as most visitors have it), `tabs.calm.browser.test.ts` (the
browser-calm project, whose context asks for reduced motion: no helper input) and `elements.browser.test.ts` (the rest,
on planted rows). `page.browser.test.ts` keeps seven tests, each deleted with its helper: the three of `h()` (`:16`,
`:41`, `:168`) and the four checks no page can show (a row hidden with a current tab, a dialog opened twice, the paged
list's old listener, a card placed only while open). The h() tests' guarantees are also read on the page. `PAD` is no
longer exported. Three bugs were found and fixed, each with a test that fails without its fix: the Explore row lost its
oval after its first redraw; a slide begun while another ran lost its direction mark early; a row given other tabs (the
Explore row become the Friends tab's places) moved its oval from where the old tab had been.

## Design model

- **One page per file, inputs fixed at start** (task 1.1). Reduced motion is the visitor's setting, so it is an input of
  the visit, like storage: a file with it and a file without it. Every other test here agrees with one start on
  `2026-11-01` and one set of planted rows, so it shares `elements`.
- **Each helper is read where the site uses it**, and the guarantee is what a visitor sees there: the oval under the
  header's current tab (`main.ts:162`), the Explore row's oval (the same call, `drawSubnav`), the section slide
  (`main.ts:125`), the search dialog (`search.ts:324`), the Festivals page's cards and selects (`sentence.ts:393`,
  `:118`), the day's popover and the roster's names card on a community's page (`months.ts:35`, `gantt.ts:116`), the
  search's dance row and the map's sheet handle (`search.ts:248`, `map.ts:224`, task 1.2's table).
- **The h() tests' guarantees through the page**: each is asserted at a place where a broken `h()` would show, named in
  the decision for it. The originals stay untouched in `page.browser.test.ts` until 4.10, which deletes them with `h()`
  (Q5); after this task that file holds those three tests and nothing else.
- **What a test cannot set through the page it observes, never stubs**: the oval's shapes are counted as the page makes
  them (a `MutationObserver` on the row's layer, which records the most there were during a move); the slide's mark is
  read as the new page appears (an observer on `<main>`); a move still running is held by pausing the page's own
  animations, never by racing a timer.
- **No test depends on another's order** (1.3's rule): each test opens the routes it starts from, waits out a move it
  started, closes the dialog it opened through the page, and restores a viewport it changed (`atWidth`).
- **Classes are read where they are the thing asserted** (1.5, decision 11): the oval's shapes (`.goo .pill`), a
  roster's line marked unsaid, a card's open state. Everything else by role, label or words.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | File layout | Three files. `tabs.browser.test.ts` (the browser project): the slime (old `:84`), a move begun before the last ends (`:109`), the slide's direction (`:127`), a slide held mid-way and one begun over it (the slide bug's test), the oval kept under its tab, still, when the window changes size (`pill`'s still path, through `main.ts`'s resize listener), a row given other tabs (the swap bug's test). `tabs.calm.browser.test.ts` (the browser-calm project): the setting itself (the reduced-motion query matches, the stylesheet's `--dur-short` is `0ms`), the oval under its tab and the Explore row's (`:64`, with the Explore row bug's test), no oval (`:74`), the oval at once (`:98`), the slide at once. `elements.browser.test.ts`: the three h() replacements (`:16`, `:41`, `:168`, the last as two tests), the drawings (`:45`), the dialog's entry (`:144`), the paged list (`:178`), the select (`:197`), the card over the page (`:213`). The rows of tabs and their ovals are read through `seen.ts` alone (`header`, `subnav`, `tabOf`, `layerOf`, `ovalsOf`, `shownOvals`, `offBy`, `mostOvals`) | Reduced motion contradicts the slime: two files, in two projects. `elements`' plants (decision 9) contradict nothing either tab file reads, but the tab files need no rows, and a file with no plant is the one start that proves the tabs on the fixture alone. |
| 2 | Reduced motion | The visitor's own setting, given by the browser context: `vitest.config.ts` builds its two browser projects from one table of rows (name, `reducedMotion`, files), `browser` with `no-preference` for every browser file but the calm ones, `browser-calm` with `reduce` for `tests/site/**/*.calm.browser.test.ts` alone, Vitest's default excludes kept. No helper input, no owned `matchMedia`: `app.ts` is unchanged. The setting's own test (in `tabs.calm`): the reduced-motion query matches, and the stylesheet's `--dur-short` is `0ms` | Playwright's context option is the visitor's real setting, so the stylesheet's `@media (prefers-reduced-motion)` applies too, and nothing is stubbed. Test files run at once in one page's frames, so a setting given per page (`emulateMedia`) would reach other files; a project of its own keeps it to its files. |
| 3 | Which row carries the oval | The header's tabs (`nav.tabs`, built once, never redrawn) for every move; the Explore row (`#subnav`) for "each row has its own oval", read in `tabs-calm` after `#week` then `#map` | The header is the stable row; the Explore row is where the bug is (decision 4). |
| 4 | The Explore row's oval | Bug: `drawSubnav` (`main.ts`) replaces the row's children, the oval's layer among them; `ovalOf` (`tabs.ts:17`) keeps returning the detached layer, so from the first redraw the row has no oval. Fix in `ovalOf`: a known layer no longer in its row is put back as its first child (its last box kept, so the next move starts from where the oval was). Test: `tabs-calm`'s "each row's oval sits under its current tab", failing without the fix | `tabs.ts` owns the layer; a fix there holds for any caller that redraws a row. |
| 5 | "Sits under its tab" | The oval's `getBoundingClientRect()` within 1 px of the current tab's on each of left, top, width and height (`offBy`, `seen.ts`); the layer's box reaches past the row's on every side. `PAD` is not read (task 1.2) and loses its `export` | `pill` writes `offsetLeft + PAD` inside a layer inset by `PAD`: the boxes meet, offsets being whole pixels and boxes not. |
| 6 | Counting the slime's shapes | `mostOvals(row, act)` (`seen.ts`): a `MutationObserver` on the row's layer records the most `.goo .pill` it held while `act` ran (an `open()`); after the move, `rested(row)` (`tabs`) awaits the row's own animations (`row.getAnimations({ subtree: true })`, each `finished` with a cancel taken as done), then polls one oval left | Counting right after `open()` resolves races the 760 ms move on a slow run; the observer sees the four shapes whenever they exist. Animations scoped to the row, so a spinner or a card elsewhere cannot hold the wait. |
| 7 | A move begun before the last ends (`:109`) | `#finder`, rested; then `#friends` with an observer that, the moment the row holds four shapes, pauses the row's animations (the first move held at its start); `open('#finder')`; two frames on, four shapes (the second move's, which the first's cancel event must not remove); rested: one oval, under Festivals | Pausing the page's own animations makes "before the last one ends" certain however slow the run; the cancel still reaches `rest()` a frame later, which is the bug the old test guards. |
| 8 | The slide (`:127`) | In `tabs`: `#finder` to `#friends`, an observer on `<main>`'s children reads `data-vt` on `<html>` as the new page first appears: `ahead`; once the transition is over (polled), no `data-vt` and `<main>` without a `view-transition-name`; `#friends` back to `#finder`: `back`. "At once with no direction": `#sources` (no section), drawn by the time a `hashchange` listener added after start runs (after the page's, 1.5's M1), with no `data-vt` recorded. In `tabs-calm`: `#finder` to `#friends` the same way: drawn at once, no mark | The mark is asserted while the change happens, which holds whether Chromium runs the view transition or skips it (Risks 1). |
| 9 | `elements`' plants | On `2026-11-01`: Glasgow's `title` and `listed_title` `TITLE = 'Glasgow <i data-planted>Kizomba</i> & "Friends" <img data-planted alt="">'`, and `flies(db, GLASGOW, [['GLA', 11]])` so its card has a Flights button whose label names it; `trips(db, TO_KUOF)` and `community(db, NAMES, { added: Ola and Kari at KUOF })`, `NAMES = 'names-card-kuof'` (gantt.browser's TWO_MORE: the KUOF roster has "Everyone else" and its names card); one artist's bookings replaced by `bookings(db, artist, [['NO', 4], ['SE', 1]])` (new in `planted.ts`, checked like every writer), the artist read in the plant as the lowest `artist_id` of `artist_countries` | Each plant serves one guarantee and none contradicts another test of the file: no assertion reads Glasgow's title but H2, the trips but the community page, the artist but H4b. |
| 10 | `:41`, text never markup (H2) | Glasgow's card on the Festivals page: its heading says `TITLE` exactly; its Flights button's label starts `Flights to ${TITLE}:`; no `[data-planted]` element anywhere in the page. The search, `Glasgow` typed: the festival's row names `TITLE`, and still no `[data-planted]` | Text, an attribute, and a second view that builds its row its own way. `data-planted` exists only if the title became markup. |
| 11 | `:16`, what holds nothing is left out (H1) | Two parts. (a) On `#map`: the Explore row's links but Map have no `class` and no `aria-current` attribute, Map's are `active` and `page` (`drawSubnav`'s `false` and `null`); on the Festivals page each select of its sentence and its More filters has exactly one option with the `selected` attribute, the one it shows (`true` written as present). (b) Every route of the site (`TABS`, `EXPLORE`, `sourcesHref()`, `COMM(FIXTURE_COMMUNITY)`, the planted artist's page): no attribute in `<body>` is `null`, `undefined`, `NaN` or `[object Object]`, no `true`/`false` outside `aria-*` and HTML's enumerated `spellcheck`, `draggable`, `contenteditable`; no text says `undefined`, `NaN` or `[object Object]`; Leaflet's own markup (`.leaflet-container`) skipped | (a) is where `h()` meets `false`, `null` and `true` on the page; (b) is the visitor's form of "leaves out what holds nothing" wherever it would show. Listeners are held by every click in the suite; `data-*` by the tabs' `data-nav`, which `main.ts` reads. |
| 12 | `:168`, classes, styles, toggle (H4a, H4b) | Two tests on the community `NAMES` at 1200 px, KUOF laid out (`laidOut`). H4a: the roster's lines' `class` attributes are exactly `gantt-name` and `gantt-name gantt-unsaid` (`gantt.ts:295`'s list with a `false`); "Everyone else" clicked, its names list keeps every class it had and gains `gantt-open`; Escape, it has exactly the classes it had. H4b: every roster bar's `style.left` and `style.width` end in `%`; the planted artist's "Where they're booked" bars read `--w` `100.0%` and `25.0%`, and the second bar's computed `background-image` stops at `25%` | A custom property is the case `setProperty` exists for (`Object.assign` on `style` drops it): reading it through the stylesheet proves it landed. The names list is the one place a class is toggled beside others, synchronously. |
| 13 | `:45`, the drawings (H3) | Task 1.2's replacement: the search's Semba row (a dance, no icon of its own: `NOTE`), its lead holding one `svg` with a `path`; the map's sheet handle (`mapHref()`) holding its chevron's `svg` and `path`. The test throws, naming it, if the search lists no Semba row on the day | `icons.ts` may be imported; the test need not. |
| 14 | `:144`, the dialog's history entry | The search dialog, opened by `#search-btn`: this frame's current entry (`entryAt()`, `navigation.currentEntry.index`) is one past the one before and `history.state` is `{ modal: true }`; the back button pressed as `navigation.back()`, awaited by `popstate`: closed, the entry the one before, the focus on `#search-btn`; opened again, closed by `requestClose()` (Escape's own path: `cancel`, then `close`), awaited by the page's `popstate`: closed, the entry and `history.state` as before. "Opened twice returns false" is dropped | `history.length` and `history.back()` are the joint history's, which other files' frames add to; the Navigation API's are this frame's. `requestClose()` is the platform's Escape without a real key, which goes to whichever frame has the window's focus. The search button is inert under its own modal: a second open cannot happen through the page. |
| 15 | `:178`, the paged list | `festivalsHref({ when: 'year', reach: 'any' })`; N from the page's "N festivals like that"; thrown if N ≤ 30. Cards `min(30, N)`, the button "Show min(30, N - 30) more"; clicked until hidden, each click adding the next page with the first card the same element; then "Where to" set to GB: cards `min(30, M)` for its M, the first card a new element, the button read for M | The page's own words give N, so no count of the build is assumed. "The old list's listener is gone" is dropped: every view builds a new button with each list (`sentence.ts:392`, `artists.ts:229`, `map.ts:392`, `review.ts:549`), so no page can click an old one. |
| 16 | `:197`, the select of choices | The Festivals page's Line-up select (More filters), "20+ artists" picked (`selectedIndex` set, `change` dispatched): the address's query holds `lineup=20`; the redrawn select shows "20+ artists"; the address opened again with `open()`, it still does | The redraw selects the option whose value is strictly equal to the choice (`dom.ts:98`): a choice given back as its text would leave "Any size" shown and write another address. |
| 17 | `:213`, the card over the page | One test on `NAMES` at 1200 px, KUOF laid out: a day's popover (19 November focused) and the names card ("Everyone else" clicked) are open one at a time, each opening closing the other; with the popover open, focus on 23 November keeps it open on that day, focus on the page's Share button closes it; a `pointerdown` on the popover keeps it, on `<body>` closes it; Escape dispatched on `<body>`, the focus on a day, closes it; 13 January's popover opened, then `atWidth(760)`: January's box has moved (checked) and the popover is beside it, at the day's height, over none of it | Every rule of `dismiss.ts` but one, through its two cards. "Placed again only while open" is dropped: a closed card's `place` changes nothing a page shows (`months.ts:39`, `gantt.ts:110`). |
| 18 | `page.browser.test.ts` | Keeps seven tests: `:16`, `:41`, `:168` of `h()`, and the four checks no page can show, whole: with no current tab or the row hidden, no oval (`pill`); a dialog's history entry with "opened twice returns false" (`modal`, its count read from this frame's own entries, `entries()`); the paged list's old listener (`paged`); the card placed only while open (`dismissable`). Each goes with its helper: `pill` and `modal` with 4.5, `dismissable` with 4.6 (the task porting the community page's cards), `paged`, `toggle` and `h()` with 4.10. It imports `dom`, `tabs`, `modal` and `dismiss`, which row 1.8's rule allows it by name until then; its ovals are read by `seen.ts`'s `ovalsOf` | No check is dropped (owner's rule, below); without the allowance 1.8's rule cannot pass while the file stands. |
| 19 | Order of landing | (1) this plan, with row 1.8's allowance in `refactor-plan.md`; (2) the browser-calm project and `tabs.calm`'s tests but the Explore row's; (3) the `ovalOf` fix with that test; (4) `tabs.browser`, the moved tests out of the old file, the slide fix with its test, `PAD`'s `export` gone; (5) `elements` and `planted.ts`'s `bookings`, the old file reduced to its seven tests; (6) the audit's fixes: the still path's test, the held move and slide asserted held, waits bounded and pauses kept to the ovals, one home in `seen.ts` for the rows' selectors and the Navigation API, the projects' table, the swapped row's fix with its test | Each commit moves its tests out and fills their ledger rows; a fix lands with the test it makes pass. |

## Impact

- **New:** `tests/site/tabs.browser.test.ts`, `tabs.calm.browser.test.ts`, `elements.browser.test.ts`.
- **Changed:** `tests/site/page.browser.test.ts` (seven tests left, decision 18); `tests/site/seen.ts` (the rows of
  tabs: `header`, `subnav`, `tabOf`, `layerOf`, `ovalsOf`, `shownOvals`, `offBy`, `mostOvals`; this frame's history:
  `entries`, `entryAt`, `back`; `shownOnChange`); `tests/site/planted.ts` (`bookings`); `vitest.config.ts` (the
  browser-calm project, both browser projects from one table); `refactor-ledger.md` (14 rows); `refactor-plan.md` (rows
  1.6, 1.8, 4.5, 4.6 and 4.10); `CONTRIBUTING.md` (the two browser projects). `tests/site/app.ts` is unchanged.
- **`site/`:** `tabs.ts`: `PAD` loses its `export`; `ovalOf` puts a detached layer back (decision 4); a slide's end
  leaves a later slide's mark; `pill` moves from the old box only when the row has the same tabs. Each fix has its test.
- **New tests besides the ported ones:** the reduced-motion setting's test; the Explore row's oval; the slide held
  mid-way; the oval kept still under its tab on a resize; the row given other tabs; H1 (b)'s scan of every route; H2,
  H4a and H4b (the h() replacements, the originals kept).
- **What changes shape or gets weaker:**
  - *Kept, not ported:* a dialog opened twice, the paged list's old listener, a card placed only while open, a hidden
    row with a current tab: no page reaches them, so they stay in `page.browser.test.ts` until their helpers go.
  - *Shape:* the first move "with nowhere to move from" is read from `#sources` (no oval) to `#week`, not on a first
    call; the slide's "at once" is drawn by the time the address change is handled, not a counter.
  - *Stronger:* the dialog's entry is this frame's own (the old test read the joint `history.length`); the slime's
    shapes are counted whenever they exist; the interrupted move and the held slide are asserted held.

## Tests

Every old test has a ledger row naming its new test, and the three kept say so with the tests that hold their guarantee
on the page. Each new file passes alone, the suite three full runs in a row, and each new file once with
`--sequence.shuffle`.

Measured as the commits land:

- **M1:** the Explore row has no `.goo .pill` after `#week` then `#map` before the fix (decision 4's test, run first
  without it).
- **M2:** view transitions run in a test frame: `slide`'s transition reaches `ready`. If Chromium skips them there, the
  slide test still holds (decision 8); record which.
- **M3:** January moves between 1200 and 760 px on `NAMES`' page (asserted in the test before the popover is read).
- **M4:** `requestClose()` fires `close` on the search dialog, and the page's `popstate` follows (decision 14).
- **M5:** `navigation.back()` in the frame fires this frame's `popstate`.
- **M6:** the search lists a Semba row on 2026-11-01 (the test's own check).

## Risks

1. **View transitions.** Opening a section runs `slide` (`main.ts:125`): the change happens in the transition's callback
   and `open()` resolves on the focus it gives. The tests read the mark as the page changes and poll its removal. A
   slide begun while another runs loses its mark early (the first one's `finally` removes the second's `data-vt`): seen
   by reading, out of this task, recorded for the Phase 1 report. No test here opens a card, the other transition.
2. **Animations.** Waits are scoped to the header's own animations, cancels taken as done; decision 7 pauses only the
   header's, and the next `pill` cancels them. `mostOvals` disconnects its observer however `act` ends.
3. **The shared history.** No test calls `history.back()` or reads `history.length`. Dialogs close through the page:
   decision 14's back press is `navigation.back()`, awaited; the others by `shownDialog` at the test's end.
   `requestClose` and the page's `shut()` are awaited until `popstate`.
4. **Reduced motion is the script's alone.** Under `motion: 'reduce'` the stylesheet's `@media` rules (`--dur-*` at 0
   ms, the dialogs' cross-fade) do not apply; no test in `tabs-calm` reads a duration or a dialog.
5. **Real focus.** The card test moves focus with `.focus()`, as `community.browser.test.ts:487` does; its `focusout`
   rule needs the event, which a frame without the window's focus may miss. The test asserts `document.activeElement`
   first, so a missed event reads as such, not as a wrong rule.
6. **The map** (H3) loads Leaflet and the world file within `open()`'s 10 s (1.3, risk 6).
7. **State for the file**: the Festivals page's choices live in the address, the period in the community's address, the
   viewport restored by `atWidth`, each dialog closed: the shuffled run checks no test leans on another.

## Done when

The eleven tests are read on the page in the three files, which import no view module and stub no global;
`tabs.calm.browser.test.ts` runs in the browser-calm project alone; `page.browser.test.ts` holds its seven kept tests,
allowed by row 1.8 until their helpers go (4.5, 4.6, 4.10); `app.ts` is unchanged; the Explore row keeps its oval, a
later slide its mark, and a row given other tabs starts its oval still; `PAD` is not exported; every old test has a
ledger row; the suite passes three times in a row and each new file once shuffled; `mise run check` at each commit.

## Appendix: the porting map

Line numbers are the old file's. Every file starts on `2026-11-01`. "Row" is the header's tabs unless named.

| # | Test, line | Today | Route and what the page shows | File; plant, setting |
| -- | -- | -- | -- | -- |
| P1 | h() sets attributes, classes, data and listeners, leaves out what holds nothing, `:16` | `h('button', …)` and its `outerHTML` | Stays until 4.10. Held on the page by H1: `#map`'s Explore row (no `class`, no `aria-current` but Map's), the Festivals page's selects (one `selected` each), and every route free of `null`, `undefined`, `NaN`, `[object Object]` and stray `true`/`false` | `page` (kept); H1 in `elements`, no plant read |
| P2 | h() puts text in as text, `:41` | `innerHTML` of a `<p>` | Stays until 4.10. Held by H2: Glasgow's card heading and Flights label say `TITLE`; the search's row too; no `[data-planted]` | `page` (kept); H2 in `elements`, Glasgow retitled, `flies` GLA |
| P3 | a drawing is put in as the SVG icons.ts writes, `:45` | `NOTE.into`, `CHEVRON.into` on spans | H3: the search's Semba row's lead and the map's sheet handle each hold an `svg` with a `path` | `elements`; none read |
| P4 | the oval sits behind the current tab, in the goo layer that reaches past the row, `:64` | `pill(nav, { still })` on a built row; `PAD` read | `#week`, `#map`: the header's oval within 1 px of Explore's box, its layer past the row on every side; the Explore row's oval within 1 px of Map's (the bug's test) | `tabs-calm`; `motion: 'reduce'` |
| P5 | with no current tab, or the row hidden, there is no oval, `:74` | a row with none active, then hidden | `#sources`: no header oval visible (`checkVisibility`), the Explore row hidden with none; `#week`: the oval under Explore at once. The hidden row with a tab: unreachable, recorded | `tabs-calm` |
| P6 | moving to another tab, the slime reaches out an arm and a drop, gone once it rests, `:84` | `pill` twice, shapes counted at once | `#sources` to `#week`: one shape at most (nowhere to move from); `#week` to `#finder`: four at most (`mostOvals`); rested: one, within 1 px of Festivals | `tabs`; motion as the browser project's (checked: the reduced-motion query does not match) |
| P7 | with reduced motion asked for, the oval moves at once, `:98` | `matchMedia` stubbed globally | `#finder` to `#friends`: one shape at most; right after `open()`, the oval within 1 px of Friends | `tabs-calm` |
| P8 | a move begun before the last one ends leaves the oval behind the tab it went to, `:109` | two `pill` calls in a row, two frames waited | Decision 7: the first move held at its start, `#finder` opened; two frames on, four shapes; rested, one under Festivals | `tabs` |
| P9 | a slide changes the page at once with no direction, and marks its direction while it runs, `:127` | `slide()` on a built `<main>` | Decision 8: `ahead` then `back` as the page appears, gone after; `#sources` drawn at once, no mark; under reduced motion `#friends` drawn at once, no mark | `tabs`; and `tabs-calm` for the calm case |
| P10 | a dialog has a history entry of its own, `:144` | `modal()` on a built dialog, `history.length`, `history.back()`, `dlg.close()` | Decision 14 on the search dialog | `elements` |
| P11 | a class list leaves out what is false, a style object sets each property, toggle sets one class, `:168` | `h('p', { class, style })`, `toggle` | Stays until 4.10. Held by H4a (the roster's lines' classes; the names list's `gantt-open` on and off, its others kept) and H4b (roster bars' `left`/`width`; the artist's bars' `--w` through the stylesheet) | `page` (kept); H4a, H4b in `elements`, `NAMES` and `TO_KUOF`, `bookings`, 1200 px |
| P12 | a paged list adds the next page, and showing it again starts over, `:178` | `paged()` on a built list | Decision 15 on the Festivals page | `elements` |
| P13 | a select of choices gives back the picked option as the value it was built with, `:197` | `choices()`, `change` dispatched | Decision 16: `lineup=20` in the address, "20+ artists" still shown after the redraw and after `open()` | `elements` |
| P14 | a card over the page is the only one open, and goes on Escape, the focus leaving and a tap outside, `:213` | two `dismissable()` cards on built elements | Decision 17 on `NAMES`' page: the popover and the names card | `elements`; `NAMES`, `TO_KUOF`, 1200 then 760 px |

## Owner's rules applied before review

- **No check is dropped.** "Deleting or weakening a test" is on the brief's stop-and-ask list. The four checks the page
  cannot show (a dialog opened twice, the paged list's old listener, a card placed only while open, the hidden row with
  a current tab) are not dropped: their tests stay as they are in `page.browser.test.ts`, beside the `h()` tests, until
  the helpers they test go (task 4.10, which deletes them with their helpers, as Q5 answered for `h()`). The ledger says
  so for each.

## Reconcile (after the Skeptic pass: 4 gaps and 3 forced decisions, settled)

- **Reduced motion is the context's, not the helper's**: a second browser project in `vitest.config.ts`, the same as the
  browser project but with `contextOptions: { reducedMotion: 'reduce' }`, includes only
  `tests/site/**/*.calm.browser.test.ts` (and the browser project excludes them). The visitor's real setting, the
  stylesheet's `@media` applying, no owned `matchMedia`, no new helper input: `tabs-calm` becomes
  `tabs.calm.browser.test.ts`. If Vitest 5 cannot give one project its own context options, say so and fall back to the
  plan's owned `matchMedia`, documented in the helper.
- **Bugs found by reading are fixed**, each in a commit of its own with a test that fails without it: the Explore row's
  oval lost after its first redraw (`tabs.ts`, `ovalOf` returning a detached layer), and the slide started while another
  runs losing its direction mark early (`tabs.ts`, the earlier slide's `finally`).
- **The four kept checks keep their whole tests**, as they are, in `page.browser.test.ts`, deleted with the helper each
  tests: `modal` and `tabs` with task 4.5, `paged` and `h()` with 4.10, `dismiss` with the task that ports the community
  page's cards. Row 1.8's rule allows `page.browser.test.ts` its imports of `dom`, `tabs`, `modal` and `dismiss` until
  then, by name. One change of means, not of claim: the kept dialog test's history assertions read this frame's own
  entries (the Navigation API's), not `history.length`, which another file's dialog changes (the 1.1 flake).
- **The held move**: the observer that pauses the header's animations at the move's start disconnects after its first
  pause, so a later move on the same row runs.
- **H1**: an attribute value containing `null`, `undefined` or `NaN` anywhere fails (substring, as for text), and the
  scan covers each route's first draw and the card and dialog the elements file opens; it is shown to pass on today's
  code before it lands.
- **The page's own `shut()`** still goes back in the joint history (`modal.ts`): a site behaviour, recorded for the
  Phase 1 report, not changed here.
