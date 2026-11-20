# Task 4.7: the stateful views

Task 4.7 of [refactor-plan.md](refactor-plan.md). Status: done, 20 November 2026. The seven views Solid's, mounted
through `mount.tsx`'s `mounted`, the markup the same (read through the page before and after each view); `held`,
`heldNodes` and `redraws` gone with their last users; no stop.

## Summary

The seven views with state of their own move from `h()` to Solid, one view a commit, each mounted through `mount.tsx`'s
`mounted` as This week was (4.4): Countries (`countries.tsx`), the Friends tab's list (`friends.tsx`), Artists and an
artist's page (`artists.tsx`), the Festivals page (`sentence.tsx`), the Map (`map.tsx`, Leaflet kept an imperative
island), a community's page (`communities.tsx`) and a person's plans (`people.tsx`). Visitors see the same site: the
same markup, words, focus and behaviour, in the latest Firefox and Safari as in Chromium. Once a view is Solid's, what
4.6 handed it through `held`, `heldNodes` and `redraws` (with the view's signal) is plain JSX in it; those uses go with
the view, and each function goes with its last user. `main.ts`'s loading mark, the one user left outside the views, is
drawn through `placed.tsx` in a commit of its own, so `held` goes too.

## Design model

- **A view is a function of its address.** `mounted(view)` takes `(at: ViewProps) => JSX.Element`, not a component: the
  address's parts (`sub`), its query (`qs`) and, new, the database loading (`data`, which the Festivals page reads
  before the database is in) are values that never change over a view's life, and `solid/reactivity` reads every use of
  a prop in a component's body as reactive. The view is called untracked inside its boundary, as Solid calls a
  component. This week (`Week()`) passes unchanged. A view reads its address once, as it starts (`readState`), and
  writes it back with `showInAddressBar` in an effect, as each `render()` did.
- **State in signals, one per kind of change.** A view's choices are one signal holding the record `readState` gave (a
  new record on each choice, as each choice drew the view again); what is derived from them is a memo; what the old
  `render()` rebuilt is JSX reading them. A part the old code drew anew on each choice, where drawing it anew is seen (a
  pressed segment's button loses the focus with it; a festival's card drawn anew is closed; a panel's checkboxes), is
  drawn anew: a keyed `<Show>` over the signal's record, so its owner, and all it holds, goes with the draw before. A
  part whose redraw shows nothing (a list of links re-sorted) is a `<For>`. Effects only for what JSX cannot do: the
  address bar, measuring (the sentence's blanks and its rotating dance), the Leaflet map, and listeners on the document
  or the window, each made with an abort signal that the view's owner aborts as it goes (`mount.tsx`'s `disposal()`).
- **A throw is said as before.** A view whose first draw throws says so in its place (`mounted`'s boundary,
  `cannotShow`, as `guarded` did). What the old code drew again in a listener (on a choice, a pan, a toggle, a step),
  which a throw then left to the window's listener ("the page"), is drawn in `mount.tsx`'s `Redrawn`: an error boundary
  whose fallback, while the view is first drawn (`mounted`'s `render` call), hands the error on to the view's boundary,
  and later reports it as "the page" and draws nothing, the part drawn again on its next change (Solid's `Errored`
  heals, measured: a scratch test drew 1, nothing, 3 for 1, a throw, 3). An effect that redraws imperatively (Leaflet's
  bubbles) wraps its work the same way (`mount.tsx`'s `redrawing`): an effect's throw reaches the view's boundary
  otherwise (measured), which would put "This page could not be shown" in place of a working view. So does a memo the
  `Redrawn` part reads and other parts read too (a list's rows, read by its count or summary and, on the Festivals page,
  its panel): `mount.tsx`'s `createDerived` holds the memo's throw as its value, which the `Redrawn` part throws again
  (`drawn`), said once, while the others read what it was before (`last`), as the `h()` view's count and summary stayed
  as they were. A part drawn once and kept (a trip row's chart, its card) is drawn again when it is next shown
  (`Redrawn`'s `again`), as the `h()` row tried again on each opening; the Festivals page's results say a throw as the
  festivals come in in its live line (`Redrawn`'s `says`), as the `h()` page did.
- **Shared controls in JSX** (`site/controls.tsx`), what `dom.ts` gave the `h()` views, which a `.tsx` cannot import
  (`house/legacy`): `choices` (a `<select>`, its initial choice the selected option, a choice handed back typed),
  `segments` (a row of pressed buttons, drawn anew when the choice changes, as each `render()` drew them), `dropdown`
  (the more button and its panel: open a signal, a click outside what counts as inside closes it, its listener on the
  document taken away with the view), `paged` (a list shown a page at a time: how many shown a signal, the rows a
  `<For>` over the items shown, so a page more keeps the rows there, and the button saying how many more), and `leftOut`
  (what an address asked that the view has no choice for, at its top), `searchField` (a text field typed in, heard on
  itself, a ref, as `search.tsx`'s is: a script's `input` event does not bubble to a delegated `onInput`), and `only`
  (one choice as a record, its value checked against its key's type, which `{ [key]: value }` is not).
- **A form control's state is a property.** JSX sets `checked`, `selected` and `value` as properties, where `h()` set
  the attributes; the state shown and read is the same, and the markup compared (below) compares the properties.
- **Leaflet stays an island.** The Map's markup (its bar, the map's element, the panel and its sheet's handle) is JSX;
  the map is made in `onSettled` (run as the view is first drawn, its element in the page: measured), its bubbles and
  legend drawn in an effect on the choices, its handlers Leaflet's own; the legend is a JSX element Leaflet places in
  its control, as the `h()` legend was. The panel is a signal set where the old code called `renderPanel` (a city or a
  festival picked, the map at rest on other festivals), drawn anew from it. The map is taken away by the view's owner
  with the removal-after-zoom fix of "Remove the map only after Leaflet's zoom ends", its test kept.
- **The pieces 4.6 made are called in JSX.** A card is `eventCard(e, options)`, who goes `whoLines`, a roster `gantt`,
  the calendar `months`: called where a list or a row is drawn, its root the view's own owner. The types those pieces
  took for an `h()` caller (`months`' `detail`, `gantt`'s `named`: `Kid`) become JSX's element. A card on the Map tells
  it when the pointer is on it (`eventCard`'s `onHover`, a JSX handler on the card), where the `h()` map listened on the
  held card.
- **The order is the users' before what they use.** A JSX view holds an `h()` element as it holds any node (4.6,
  decision 1), so the community's page holds `people.ts`'s share button and a member's link until `people.tsx` makes
  them JSX, and Countries reads `artists.ts`'s `artistCountries` whatever Artists is.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The order | Countries, the friends' list, Artists, the Festivals page, the Map, a community's page, a person's page; then `main.ts`'s loading mark | Each commit's view depends on no later one but as an `h()` node (design model); the community's page before a person's, whose share button and page it holds. Countries first, the smallest with a choice. |
| 2 | A view's signature | `mounted(view: (at: ViewProps) => JSX.Element)`, `ViewProps` gaining `data` | Design model. A component reading `props.qs` in its body is a reactive read for the lint and Solid's diagnostics, where the address is a value. |
| 3 | What is drawn anew | What the old `render()` rebuilt where rebuilding is seen (focus, a card's open state, a panel's controls): a keyed `<Show>` over the choices; a `<For>` where it is not | Identical behaviour, focus included. A pressed segment losing the focus, as before, is recorded as an open issue, not fixed. |
| 4 | A redrawn part's throw | `mount.tsx`'s `Redrawn` and `redrawing`, the first draw's throw the view's | Design model; the 4.4 to 4.6 audits' lesson. |
| 5 | The Festivals page's data | An async function awaiting `data`, writing the festivals (or why they could not be read) into a signal, as `search.tsx` builds its index; not `<Loading>` | The panel, the live line, the count and the list each draw something of their own while the database loads (the On now box greyed, "Looking for festivals like that…", nothing, the loading mark), which one `<Loading>` fallback cannot hold without new markup. `house/thens` holds: no `.then`. |
| 6 | Imperative pieces kept | The sentence's dance (its widths measured, its timer), its blanks sized to their choice, the Explore tab's hint appended to the header, the Map's Leaflet: each in `onSettled` or an effect, its listeners and timers taken away with the view | What JSX cannot express; each class they set is a signal drawn by JSX (`house/classes`). |
| 7 | `held`, `heldNodes`, `redraws`, `heldCard`, `heldTag`, `festivals.ts`'s `leftOut` | Each deleted in the commit of its last user; `held` with `main.ts`'s loading mark, then drawn by `placed.tsx`'s `instead` | No export nothing imports (knip). |
| 8 | Their tests | `held-redrawn.browser.test.ts` counts every owner under the page's owner, not its roots, as each view ports (a Solid view's draws are owners of its root); `held-broken.browser.test.ts` keeps its case, now a card's throw in a Solid view; `mount.browser.test.ts`'s counts of the Festivals page's held cards become counts of owners | A view's draws no longer make roots; what each test held (a draw's pieces go with it; a piece's throw is said once and the page goes on) is still read through the page. |
| 9 | New tests | For each view that draws again on the visitor's input, its draws counted alike in `held-redrawn.browser.test.ts` (Countries' order, Artists' filters, the Festivals page's choices, the Map's pans and filters with its bubbles, the friends' list, a community's rows, steps and days); a `Redrawn` part that throws after the first draw, said once as "the page", the view working on (planted data); each fail-checked | The 4.6 audit's lesson; through the page (`house/tests`). |
| 10 | Markup | Checked per view by a scratch dump (not committed) of `<main>`'s markup on several addresses and after the visitor's choices, before and after the commit, leaving out Solid's empty comments, attributes' order and class names' order, and reading form controls' state as properties | As 4.6 did; the differences JSX makes and no visitor sees. |

## Impact

- **New:** `site/controls.tsx`; `site/countries.tsx`, `site/friends.tsx`, `site/artists.tsx`, `site/sentence.tsx`,
  `site/map.tsx`, `site/communities.tsx`, `site/people.tsx` (from their `.ts`); tests as decision 9 says.
- **Changed:** `site/mount.tsx` (`mounted`'s view, `Redrawn`, `redrawing`, `disposal`; `held`, `heldNodes`, `redraws`
  deleted), `site/main.ts` (the views mounted, the loading mark), `site/eventcard.tsx` (`onHover`; `heldCard` deleted),
  `site/plans.tsx` (`heldTag` deleted), `site/gantt.tsx` and `site/months.tsx` (JSX in place of `Kid`), `site/week.tsx`,
  `site/festivals.ts` (`leftOut` deleted); `tests/site/held-redrawn.browser.test.ts`,
  `tests/site/held-broken.browser.test.ts`, `tests/site/mount.browser.test.ts`; `.oxlintrc.json` (the `friends.ts`
  exception), `tests/test_suppressions.py`, `docs/lint-false-positives.md`, `docs/concepts/lint-rules.md`,
  `docs/guides/the-site.md`, comments in `public/css/site.css`; `refactor-plan.md` (row 4.7).
- **Unchanged:** `routes.ts`, `db.ts` and the queries, the stylesheet's rules, the page's policy, `dom.ts` (its `h()`
  and helpers stay for `review.ts`, `sources.ts`, `tables.ts` until 4.8 to 4.10).

## Commits

| Commit | What |
| -- | -- |
| `7c1627b` | this plan |
| `7ab2bbb` | Countries (`countries.tsx`), `mounted` taking a function of the address, `controls.tsx`'s segments and `leftOut`; its order's draws counted, its checkbox marked in the markup |
| `5c4b288` | the friends' list (`friends.tsx`), `controls.tsx`'s select, dropdown and search field, `mount.tsx`'s `Redrawn`, `createDerived` and `disposal`, with `redrawn-broken.browser.test.ts`; the controls the address sets marked in the markup; the Friends button kept |
| `95192c7` | Artists and an artist's page (`artists.tsx`), `controls.tsx`'s `paged`, `check`, `chosen` and `only`, `eventcard.tsx`'s `festivalCards`; `dom.ts`'s `segments` gone; the More button kept; a throw of its rows said once, its summary kept |
| `9d87fde` | the Festivals page (`sentence.tsx`), `ViewProps`' `data`, a select following a choice made elsewhere (`kept`), `Redrawn`'s `says`; its cards counted as owners (`tests/site/owned.ts`), the Explore tab's hint taken away with it, the dance's timer and the bar's observer with it; a card's throw as the festivals come in said in its live line |
| `914d474` | the Map (`map.tsx`), Leaflet an island, `mount.tsx`'s `redrawing`, `controls.tsx`'s wrapped panel, `eventCard`'s `onHover`; `festivals.ts`'s `leftOut`, `dom.ts`'s `moreButton` and `dropdown` gone; a throw of its bubbles said once |
| `fe5aacf` | a community's page (`communities.tsx`), `gantt.tsx`'s `hidden`, JSX for `months`' `detail` and `gantt`'s `named`, `Redrawn`'s `again`; `heldTag`, `heldNodes`, `redraws` gone |
| `fcb1f5e` | a person's page (`people.tsx`), its frame, Share button and a person's link JSX, `controls.tsx`'s `awhile`, the Share button's timer taken away with it; `heldCard` gone |
| `70d079b` | `main.ts`'s loading mark through `placed.tsx`'s `instead`; `held` gone; `card-thrown.browser.test.ts` and `drawn-again.browser.test.ts` renamed from `held-broken` and `held-redrawn` |
| the last | the plan's row and this status |

## Tests

- **Deleted** (with `held`, which they read): `mount.browser.test.ts`'s "the cards of a list drawn again are taken away
  with the list they were in" and "the cards an h() view holds are each a root of the page's owner until the view is
  left". What they held is read again as owners: the first by `drawn-again.browser.test.ts`'s Festivals page case (a
  choice drawn three times holds as many owners), the second by `mount.browser.test.ts`'s "the cards a Solid view draws
  are owners under the page's until the view is left".
- **Added:** `drawn-again.browser.test.ts`'s Countries, Artists, Festivals page and Map cases (the search's owners and
  bubbles, a city picked and let go); `redrawn-broken.browser.test.ts` (a list's throw on a later draw said once as the
  page's, the view working on; and on the first draw said in the view's place); `elements.browser.test.ts`'s controls
  the address turns on marked in the markup (Countries, the Friends tab, Artists); `friends.browser.test.ts`'s Friends
  button kept; `artists.browser.test.ts`'s More button kept; `festivals.browser.test.ts`'s Explore tab hint taken away
  with the page; `mount.browser.test.ts`'s owners test above; and, from the audit (below): `redrawn-broken`'s Artists
  case (its rows' throw said once, its summary kept) and Map case (its bubbles' throw, `redrawing`), `card-thrown`'s
  Festivals page case (a card's throw as the festivals come in said in the live line, and on a later choice as the
  page's), `festivals.browser.test.ts`'s dance timer and bar observer taken away with the page,
  `friends.browser.test.ts`'s Share button's timer taken away with a person's page. Suite: 499 tests (and 5 expected to
  fail) before, 513 after.
- **Changed:** `drawn-again.browser.test.ts`'s friends', Map's and community's cases count every owner under the page's,
  not its roots, and every case checks that each round drew its part anew (the part's element before it gone after it),
  Countries' named for its order's buttons, which are what it draws anew; `card-thrown.browser.test.ts`'s header (a
  card's throw in a Solid view); the counting helpers in `tests/site/owned.ts`.

## Fail-checks

Each made by undoing one piece (or adding a leak: a root made per draw under the page's owner, never disposed) and
running its test, then putting it back:

- **The draws counted alike:** a leaked root per draw gives Countries 921, 923, 925; the friends' list 327, 328, 329;
  Artists 751, 753, 755; the Festivals page 601, 602, 603 (and `mount.browser.test.ts` 136 for 135); the Map's panel
  1828, 1829, 1830 (search) and 1834, 1836, 1838 (a city picked); a trip row 1641, 1643, 1645; the agenda 1574, 1576,
  1578; the days 1611, 1636, 1661. The Map's bubbles not cleared before a draw: 210, 315, 420 paths for 210 thrice.
- **`Redrawn`** taken out of the friends' list: no problem line, the view replaced ("Kiz Radar: friends: RangeError"
  undeclared); **its first draw** not handed to the view: the opening refused ("the page says Something went wrong"),
  "Kiz Radar: the page" undeclared.
- **The markup:** `selected`, `value` and `checked` as properties in place of `defaultSelected`, `defaultValue` and
  `defaultChecked`: `['months', []]`, `['oslo', null]`, `[false]` (friends), `[true, false]` (the checkbox),
  `['an', null]` (Artists).
- **The buttons kept:** words read as the button is drawn: `[false, 'Friends (1) ▾', 'true']`,
  `[false, 'More ▾', 'true']`.
- **The Explore tab's hint** not taken out on cleanup: 2 for 1.
- **The map's removal after a zoom** undone: `map.browser.test.ts` sees
  `Cannot read properties of undefined (reading '_leaflet_pos')` reported as the page's.
- **The loading mark** kept until the view is left: `mount.browser.test.ts` 9 roots for 8.

## Audit corrections

A seven-auditor audit of the commits above found the following; each is folded into the commit that wrote the code,
fail-checked as said.

- **A later throw of a list's memo took the whole view** (four auditors, medium): Artists' summary, the friends' bar
  count and the Festivals page's count and panel read the memo the `Redrawn` list reads, outside any `Redrawn`, so a
  throw there (Artists' first search reading the aliases) put "This page could not be shown" in place of the view and
  was said twice. `mount.tsx`'s `createDerived` (the memo holding its throw as its value, `months.tsx`'s `said` the
  precedent): the list's `Redrawn` throws it again, said once as the page's, the others reading what it last was; the
  Festivals page's panel reads whether any festival is on now from it, not from a `matches` of its own. Swept:
  Countries' memo (its rows read as it is first drawn, sorted), the Map (no memo; its bubbles `redrawing`), a
  community's page and a person's (no memo read outside its part) hold no such read. Fail-check: Artists' summary
  reading `drawn` again: the view replaced (`[undefined, 1]`, "Kiz Radar: artists: Error: no such table: artist_aliases"
  undeclared).
- **`redrawing` untested:** `redrawn-broken`'s Map case, Leaflet's `circleMarker` refused as a filter draws the bubbles
  again. Fail-check: the wrapper taken out: "This page could not be shown: planted", "Kiz Radar: map: RangeError"
  undeclared.
- **A card's throw as the Festivals page's festivals come in** was said as the page's, the list empty under a live line
  and a count of festivals not shown: the results' `Redrawn` says it in the live line as the festivals come in (`says`:
  the read written as unread, the loading mark kept), as the `h()` page did; on a later choice it is the page's, once.
  Fail-check: `says` taken out: "Kiz Radar: the page: RangeError" said 2 times, not 1, the opening refused by its line.
- **A trip row's chart or card that threw was never drawn again** (its memo latched): `Redrawn`'s `again` resets the
  boundary when the row opens again, or its line-up shows again. Checked by a scratch test (a throw planted in
  `chartOf`'s code: said once a press, the chart drawn once the throw is gone); without `again`: said once, the chart
  never drawn ("expected 0 to be greater than 0"). No planted data reaches the chart or the card alone, so the suite
  does not hold it (open issues).
- **`{ [key]: v }` with a generic or union key went unchecked** (`artists.tsx`'s `sel`, `sentence.tsx`'s `blank` and
  `check`): `controls.tsx`'s `only(key, value)`, checked against the key's type, no cast. Fail-check: `String(v) + 1`,
  `'yes'` and `'x'` written through it: TS2345 at each of the three.
- **The cleanups untested:** `festivals.browser.test.ts` counts the dance's 3 s timers not cleared and the observers of
  the sentence not disconnected, `friends.browser.test.ts` the Share button's 2.5 s timers not cleared, on the page and
  after Sources. Fail-checks: `clearInterval` taken out `[1, 0]` for `[0, 0]`; `io.disconnect()` `[0, 1]`; `awhile`'s
  `clearTimeout` 1 for 0.
- **`drawnAlike` never checked that a draw happened** (Countries' case drew its order's buttons, not its rows): each
  round's part found before it must be gone after it. Fail-check: Countries' segments read untracked: the button still
  in the page (`expected true to be false`).
- **Duplicates and nits:** the friends' two search fields are `controls.tsx`'s `searchField` (moved to the friends'
  commit, Artists' field with it); `Redrawn` reports through `placed.tsx`'s `reported`; the header of `communities.tsx`
  above its imports; `card-thrown.browser.test.ts`'s header wrapped at 120; stale comments (`tests/site/owned.ts`,
  `main.ts`'s signal, `report.ts`'s `guarded`, `placed.tsx`'s `instead`); `docs/lint-false-positives.md`'s segment rows
  naming "Which festivals".

## Departures from the plan

- **Each shared piece came with its first user**, not all in Countries' commit (knip): the select, the dropdown and
  `Redrawn` with the friends' list (Countries' list cannot throw on a later draw: its rows are read as it is first
  drawn); `paged`, `check`, `chosen` and `only` with Artists; `ViewProps`' `data` with the Festivals page; `redrawing`
  and the wrapped panel with the Map; `awhile` with a person's page.
- **The markup compared** at first left out the attributes of form controls; read again with them, the selects'
  `selected`, the checkboxes' `checked` and the search fields' `value` attributes were missing (JSX sets properties),
  and are set as `h()` set them (`defaultSelected`, `defaultChecked`, `defaultValue`), folded into the commits that
  wrote them and pinned by `elements.browser.test.ts`. A select drawn on no option (`value={undefined}`) was caught so
  before its commit.
- **A more button's words** read as the call is made drew the button anew on each choice (the friends' list, Artists);
  they are drawn as a reactive part, the button kept, folded into those commits with a test each.
- **The Festivals page's measuring** is not in an effect: Solid makes a `flush()` inside an effect a no-op
  (`FLUSH_IN_EFFECT_CALLBACK`) and refuses one in `onSettled`, and the hint of where and the dance are measured with
  their classes changed one after the other. They are measured where the old code measured them (after each choice, on a
  resize, the fonts in), the first time a microtask after the first draw, the hero hidden while it arrives.
- **The Map:** made in `onSettled` (an effect's compute runs before the refs), its first bubbles there; the panel's
  signal `ownedWrite` (the bubbles' effect draws it, which Solid refuses in an effect's apply unless said to be meant);
  what is picked plain state of the island, its address written where the old code wrote it (`save`).
- **A failure said otherwise:** a part drawn again that throws after the first draw draws nothing (`Redrawn`), where the
  `h()` view left what it had drawn before; what other parts read of it stays (`createDerived`). A trip row whose chart
  or card throws as it opens is open with nothing in it, where the `h()` row stayed closed; it is drawn again on the
  next opening, as before.
- **Suppressions added** (each on its line, counted in `tests/test_suppressions.py`, in `docs/lint-false-positives.md`
  under "The code means it", kept for identical markup until after 4.10): `controls.tsx` `prefer-tag-over-role` two (a
  row of segments, the line of what an address asked in vain), `map.tsx` one (the map's region), `communities.tsx` two
  (the privacy image, the roster's two views), `sentence.tsx` `anchor-is-valid` one ("Show them ↓"). Moved:
  `house/states` from `artists.ts` to `artists.tsx`. Removed: none. `prefer-destructuring`'s exception for `friends.ts`
  gone.
- **An extra commit** for `main.ts`'s loading mark, so `held` goes; and the two test files named for it renamed.

## Open issues (recorded, not fixed)

- **Kept as before, to fix after the port:** a pressed segment, a ticked friend and a checkbox of the Festivals page's
  panel are drawn anew, as the `h()` views drew them, so the focus goes with them.
- **The Festivals page's Read** (the festivals, or why they could not be read) is a signal of its own, as `search.tsx`'s
  index is, not `<Loading>` (decision 5).
- **Kept as before:** a click on a control its own handler draws anew (the friends' "Any of them goes", "All of them
  go", Clear) closes the picker, the click's target no longer in it when the document's listener reads it, as the `h()`
  dropdown did (measured alike in both). To fix after the port with the focus: test the event's path (`composedPath()`),
  fixed as the dispatch starts, or keep the buttons and drive their state.
- **Untested in the suite:** a trip row's chart or card drawn again after a throw (`Redrawn`'s `again`; a scratch test
  only, no planted data reaching them alone); a throw of the Festivals page's or the friends' memo (`matches`, `kept`
  read only what the build made, no planted row makes them throw): `createDerived` is the same as Artists', which is
  tested.
- **The suite runs in Chromium alone;** Firefox's and Safari's latest are not checked by it.
- **The Map's dumps** differ between runs, on the `h()` map as on the Solid one, in Leaflet's zoom animation under way.
- **A flake, traced:** the exec rebase's check of the community's commit failed once on `lock:py`, `uv lock --check`
  finding the fresh worktree's `.venv` invalid while `hooks:check` was creating it (the parallel uv tasks of
  `check:fast`); it passed when run again. Not the code's; `tasks.toml` is not changed here.

## Done when

Every view of row 4.7 is a Solid view mounted through `mounted`, the page the same; `held`, `heldNodes` and `redraws`
are gone, with no seam use left in the views; every test passes, each new one fail-checked; `mise run check` passes.
