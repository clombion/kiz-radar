# Task 4.9: the review dashboard

Task 4.9 of [refactor-plan.md](refactor-plan.md). Status: done, 20 November 2026. The review page drawn by Solid, its
token dialog (`token.tsx`) and the page (`dashboard.tsx`), `review.ts` its entry alone; the markup the same in all 57
states dumped before and after each commit; `dom.ts`'s `choices` gone and `nodes` unexported; no stop.

## Summary

The review dashboard (`review.html`, its entry `site/review.ts`, 880 lines, 114 `h()` calls) moves from `h()` to Solid
as a series of its own: first its token dialog, then the page itself (the token button, the queues' tabs and the view in
`#review`, with its writes of claims to GitHub through `site/github.ts`). The admin sees the same page: the same markup,
words, focus and behaviour, in the latest Firefox and Safari as in Chromium; the same requests to GitHub, with the same
failures said the same way. `site/review.ts` stays the entry, as `site/main.ts` is the site's: it reports, loads
`review.json` and draws the page; what it draws is `.tsx`. What becomes dead of `dom.ts` with the port goes with it
(knip); `h()`, `dom.ts` and `page.browser.test.ts` stay for 4.10.

## Design model

- **One page, drawn anew where the `h()` page drew itself anew.** The old page kept plain variables (the address, the
  rail's search, the token's state, the two sides of a join) and called `render()` after each change, which replaced the
  token button's contents, the queues' tabs and everything in `#review`, under `guarded`. Every one of those redraws is
  seen: a focused tab link or control goes with it, a choice pressed and a note half written go, a second side's search
  starts empty, the rail's pages start over, and the rail's own field is drawn anew holding the search as it was folded.
  So the port keeps that grain. The page's state is one record, the one last drawn (the address, `{ tab, i }`; the
  rail's search; the two sides picked to join; the token's state, `Access`), which its handlers read and replace, and a
  signal of it, made once in a root, which the shell's parts follow (departures: the plan had two signals and a memo).
  Each change is flushed and the view drawn anew at once, in the handler, as `render()` drew it: the view is drawn
  through `mount.tsx`'s `drawnIn` (the core of `mounted`, given its own name) into `#review` (the root emptied first, as
  `replaceChildren` emptied it), the draw before disposed with its signal, so a draw that throws says "This page could
  not be shown" in its place, with "Kiz Radar: the review:" in the console, as `guarded` did on every render
  (`reviewpage.browser.test.ts` pins it), and the next change draws it again. The queues' tabs (`#queues`) and the token
  button's dot and words (`#access`) are shell parts drawn once through `placed.tsx`, each a keyed `<Show>` over that
  signal, so they are drawn anew on each change too.
- **No effect draws the view.** `render` flushes (`@solidjs/web`), and a flush inside an effect's callback is a no-op
  that Solid warns of (`FLUSH_IN_EFFECT_CALLBACK`, measured in a scratch test: inside `createEffect` and
  `createRenderEffect`, and through `onFlush`, which runs after the handler's `flush` returns, so too late for the tests
  that read the page at once). The page's one function that changes its state (`change`) flushes and draws.
- **What the old page changed in place is changed in place:** a decision's choice pressed, its note, whether it can be
  written, and the write's state (the controls disabled, the button's words, `just-picked`, the status line); a side's
  list of matches as its field is typed in; the rail's next page. Each is a signal of the draw it is in. A list drawn
  again in place (a side's matches, the rail's rows) is in `mount.tsx`'s `Redrawn`: a throw after the draw is said once
  as the page's, as a throw in the old listener was, the rest of the page kept.
- **A form control's state as `h()` set it:** a field's first words as its `value` attribute (`defaultValue`: the rail's
  search, the token's expiry), a box ticked as its `checked` attribute (`defaultChecked`: Keep it on this device), the
  country picker's first option `selected` (`controls.tsx`'s `choices`), the write button `disabled` as drawn. What the
  old code later set as a property (the note filled by a choice, the token field emptied, the box set to what the device
  kept) is set as a property, through the element's ref.
- **Events as the old page heard them:** a field's `input` on the field itself (a ref's listener: a script's `input`
  does not bubble to a delegated handler): the note, the rail's search, a side's search; the keys on the window, the
  address's change on the window, both for the page's life; the form's submit, a choice's click and the other buttons
  JSX handlers. The rail's search, drawn anew, is focused again with the caret at its end once drawn, as before; a
  number key presses the drawn choice of that number (its `data-key`), as before.
- **The writes to GitHub are unchanged:** `github.ts` stays `.ts` (the brief) and is not touched: the same `PUT` of the
  claim at its digest, one write at a time (each awaits the one before, a failed one leaving the next to go), the same
  words for each answer (written, there already, refused, forbidden) and for a failure ("The claim could not be written:
  try again.", reported as "writing a claim"); a refused or forbidden answer leaves the page read-only, saying why; an
  item written is kept as settled (`kept.ts`) and the page moves to the next open item after the beat (450 ms), unless
  it was drawn anew meanwhile (the old `generation`: here, the draw's record is no longer the one shown). What is
  settled is a plain set read as each draw is made, as the old page read it: the beat shows the written button, not the
  item settled. `house/thens` holds in `.tsx`: the chain is written with `await`, not `.then`.
- **The token dialog** (`site/token.tsx`) is drawn once at the end of `<body>` (`placed.tsx`'s `atEnd`), as the old page
  appended it once; it is shown with `showModal()` and closed with `close()`, no history entry, as before (not
  `dialog.tsx`'s host, which adds one). Its fields are read through their refs as it checks; its status line is a
  signal. It is given the page's functions that check a token and forget it, which change the page's state and draw it;
  its words of the token (`accessWords`) are the button's too.
- **Static content is worked out before the JSX:** an item's words, a row's lead and words, a compared row's cells and
  class, each list's rows mapped before the JSX, so no part of a draw that never changes in place is a reactive
  expression or an owner of its own (the 4.8 audit); no `For` over a fixed array.
- **No `!`, no new rule off:** refs are `T | undefined`, checked where read.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The entry | `site/review.ts` stays the entry and `.ts`, as `site/main.ts`; the page is `site/dashboard.tsx`, the dialog `site/token.tsx` | No change to `vite.config.ts`, `knip.jsonc`, `.oxlintrc.json`'s `house/tests` loads, `tests/site/app.ts` or the docs; no `X.ts` beside an `X.tsx`. |
| 2 | The series | the token dialog (`token.tsx`), the old page drawing the rest; then the page (`dashboard.tsx`) | The dialog stands alone behind two functions the page gives it; the button, tabs and view share the page's state and one draw. |
| 3 | The grain of a draw | the whole view drawn anew where `render()` was called (an address, the rail's search, the token's state, a side picked), through `drawnIn`; in place what the old code changed in place | Identical behaviour and failure (design model). |
| 4 | Drawing the view | in the handler that changed the state, after its flush; no effect | `FLUSH_IN_EFFECT_CALLBACK` (design model). |
| 5 | The rail's pages | `controls.tsx`'s `paged`, given the more button's class (`link` here; `more-btn show-more` as before elsewhere) | Shared control; the markup the old rail drew. |
| 6 | Dead code | `dom.ts`'s `choices` deleted and `nodes` no longer exported, in the page's commit; `h` stays for `report.ts` and `main.ts` (a class list or nothing); `button`, `paged`, `toggle` and `h()`'s `on…`, `style` and `dataset` branches have no production caller left, only `page.browser.test.ts` (a knip entry, so knip stays clean), and are 4.10's to delete with it (corrected by the audit: this row said they stayed for `report.ts` and `main.ts`, which use none of them) | knip clean; 4.10 deletes `h()`. |
| 7 | Tests | below | Each fail-checked. |
| 8 | Markup | checked by scratch dumps (not committed) of `#access`, `#queues`, `#review` and the dialog, normalised (Solid's empty comments and adjacent texts, attributes' and classes' order left out; form controls' state and the focus read as properties), in 57 states before and after each commit: every queue and list, a choice by click, by key and by the picker, a note typed and emptied, the keys, the rail paged and searched, a join in each state, an address of no queue, a write held, written and past the beat, a write failed, refused and forbidden, the dialog's every message and expiry, read-only and checking | As 4.6 to 4.8. |

## Impact

- **New:** `site/token.tsx`, `site/dashboard.tsx`; `tests/site/review-offline.browser.test.ts`, `review-writing`,
  `review-drawn`, `review-broken` (`.browser.test.ts`).
- **Changed:** `site/review.ts` (the entry alone), `site/controls.tsx` (`paged`'s more button's class, `choices`' `off`,
  in an effect of its own), `site/mount.tsx` (`drawnIn`, the core of `mounted`, exported for the review page),
  `site/dom.ts` (`choices` gone, `nodes` unexported), comments (`mount.tsx`'s and `report.ts`'s headers,
  `controls.tsx`'s); `tests/site/owned.ts` (`drawnAlike`, from `drawn-again.browser.test.ts`),
  `tests/site/review.browser.test.ts`, `tests/site/review-readonly.browser.test.ts`; `tests/test_suppressions.py`,
  `docs/lint-false-positives.md`; `refactor-plan.md` (row 4.9).
- **Unchanged:** `github.ts`, `kept.ts`, `claims.ts`, `pending.ts`, `public/review.html`, the stylesheet, the page's
  policy, `vite.config.ts`, `knip.jsonc`, `.oxlintrc.json`, `h()`, `page.browser.test.ts`.

## Commits

| Commit | What |
| -- | -- |
| `067e857` | this plan |
| `3ba20db` | the token dialog (`token.tsx`), the page's `check` and `forget` given to it; `review-offline.browser.test.ts` (a check while GitHub is out of reach), the dialog's fields in the markup |
| `b27a77e` | the page (`dashboard.tsx`), `review.ts` the entry, `paged`'s class and `choices`' `off`, `mount.tsx`'s `drawnIn`, `dom.ts`'s dead code; the tests below |
| the last | the plan's row and this status |

## Tests

- **Deleted:** none.
- **Added** (each through the page): `review.browser.test.ts`: the token dialog's fields marked in its markup (the day
  as its `value` attribute, the box `checked`); an item's controls marked in its markup (the rail's search `value`, the
  picker's first country `selected`, the write button `disabled`). `review-offline.browser.test.ts` (new, a writer's
  page, GitHub then out of reach): a country picked in the picker shows there while its claim is written and once it
  could not be (the audit's); a claim written says it could not be, said once as "writing a claim", every control usable
  again, the item still shown, and the next claim goes once GitHub is back; a token checked leaves the page "Checking
  the token…", the dialog "Asking GitHub…", said once as "checking the token", as before.
  `review-writing.browser.test.ts` (new, GitHub's answer held): a claim under way disables every control of its form,
  its button "Writing…"; written, "✓ Written" marked `just-picked` until the beat's last millisecond (449 ms), then the
  next open item; a claim that lands once the admin has moved to another item leaves the page there.
  `review-readonly.browser.test.ts`: the rail's search keeps the focus, the caret at the end.
  `review-drawn.browser.test.ts` (new): moving between items, typing in the rail, the token checked again and an artist
  picked and let go each hold the owners of the last draw alone, the draw before gone; a row of the rail holds one owner
  (the list's) and a city's card none. `review-broken.browser.test.ts` (new): a side's matches that throw as its search
  is typed in say so once as the page's, the page going on; a draw that throws says so in its place and the next address
  draws the page again. Every test of `review.browser`, `review-offline`, `review-writing`, `review-readonly`,
  `review-drawn` passes on the `h()` page too (run with the port set aside), so they pin what the page did, but two:
  `review-drawn`'s "a row of the rail holds one owner" fails there (`[0, 0]` for `[1, 0]`: the `h()` page holds no Solid
  owner, so `review-drawn` pins the port's own ownership, its other tests passing there only because the `h()` page's
  count is always 0; corrected by the audit, this said every test of it passed), and `review-broken`'s first: the `h()`
  page left the throw uncaught (the browser's own "Uncaught RangeError" beside the page's line), where `Redrawn` says it
  once. Suite: 523 tests (and 5 expected to fail) before, 538 after.
- **Changed:** `drawn-again.browser.test.ts` imports `drawnAlike` from `tests/site/owned.ts`, where it moved unchanged
  for the review page's test.

## Fail-checks

Each made by undoing one piece (or adding a leak) and running its test, then putting it back:

- **The dialog's markup:** the day as `value` in place of `defaultValue`: `[null, true]` for `['2026-11-05', true]`; the
  box as `checked`: `['2026-11-05', false]`.
- **A check while GitHub is out of reach** reported under another name: "Kiz Radar: the token: TypeError" undeclared,
  the declared line never said.
- **The draws counted alike:** the view before not disposed (`leave?.abort()` dropped): the draw before still in the
  page (`expected true to be false`), each of the four; a root made per draw under the page's owner, never disposed:
  `[95, 97, 99]`, `[100, 101, 102]`, `[94, 96, 98]`, `[93, 95, 97]` for flat counts.
- **Static content:** a rail row's class a reactive expression (`isSettled && 'past'` in the list): `[2, 0]` for
  `[1, 0]`; a city's heading a reactive expression: `[1, 2]`.
- **A write under way:** the choices not disabled: `[false, …]` for `[true, …]`; the button's words unchanged: "Write
  the claim" for "Writing…"; `just-picked` never set: `['✓ Written', null]`; no move after the beat: "Ana", never "Bo";
  the move made whatever was drawn since: `['#contested/2', 'Bo']` for `['#merges/1', 'Abi or DJ Abi']`.
- **A write that fails:** the form not opened again: five controls disabled for none; the chain left on the failed write
  (`writing = next`): the next claim never sent (0 for 1), "writing a claim" said twice.
- **The rail's search:** no focus again: `[false, …]`; no caret moved: `[0, 0]` for `[2, 2]`.
- **The item's markup:** the rail's search as `value`: `null` for `'ana'`; the write button not off as drawn: `false`
  for `true`; the picker with no option marked: `[false, false, false]` for `[true, false, false]`.
- **Throws:** a side's matches outside `Redrawn`: the whole view replaced ("Kiz Radar: the review: RangeError"
  undeclared); the view drawn by `render` without `mounted`'s boundary: "Uncaught RangeError" and the page's line, the
  open refused by that line, not by "This page could not be shown".
- **The audit's** (each test failing with the fix undone, passing with it put back):
  - the country picker: `disabled={off?.()}` back in the select's attributes (`controls.tsx`), the value set again with
    it: `[['', true], ['', false]]` for `[['PT', true], ['PT', false]]`;
  - the beat timed: `BEAT` 100 or 449: `[false, …]` for `[true, …]` (the next item drawn before 449 ms); 451: "Ana",
    never "Bo";
  - GitHub's held answer let go when the test ends: with a failure planted after the write button is pressed, the second
    test fails without it (its claim queued behind the held write: `null` for the settled items) and passes with it;
  - the rail's search emptied when the test ends: with a failure planted after the search and a probe test on the same
    tab after it, the probe reads `'ana'` (`review.browser`) and `'a'` (`review-drawn`) for `''` without it.
- **The markup** (scratch dumps, not committed): `#access`, `#queues`, `#review` and the dialog in 57 states, the same
  before and after each commit.

## Departures from the plan

- **The page's state is one record read by the handlers (`now`) and a signal of it the token button and the tabs
  follow**, not two signals and a memo: `solid/reactivity` refuses a signal read in a listener on the window, in the
  page's setup and in the functions handed to the dialog, and the handlers only ever need the record last drawn. No
  `createRoot` around the page: a write inside an owned scope is refused (`REACTIVE_WRITE_IN_OWNED_SCOPE`, seen on the
  first token check as the page starts); the signal alone is made in a root, as `main.ts`'s and `over.ts`'s are.
- **Static content, measured with the compiler** (`@solidjs/compiler`'s `transform`): `class={name}` is an effect (the
  compiler reads a class through `readShallow`) and so is a list with an expression in it, where an object or list
  literal of names is not, and any other attribute or child given a name is set once. So classes are object or list
  literals (`{ active: on }`, `{ past: isSettled }`), and a compared row marked `differs` is one of two `<tr>` (an
  unquoted key fails `styles.test.ts` safe). The dashboard's compiled code has two effects, both a decision's controls.
- **`choices` takes `off`** (disabled while true), for the country picker during a write, which the old form disabled
  with the rest; set by a render effect of its own on the select (its ref), not as a `disabled` attribute beside the
  `value`, which Solid's compiler puts in one effect with it that sets the value again each time it runs.
- **Suppressions added** (each on its line with its reason, counted in `tests/test_suppressions.py`, in
  `docs/lint-false-positives.md` under "The code means it", kept for identical markup until after 4.10):
  `jsx-a11y/prefer-tag-over-role` two (`token.tsx`, `dashboard.tsx`: the status lines), `react/jsx-no-target-blank`
  three (`token.tsx` one, `dashboard.tsx` two: `rel="noopener"` alone, unforeseen by the plan: the rule flags a link to
  a new tab whatever its address, a constant or one built, so no way of writing it avoids the rule; corrected by the
  audit, this said the rule read only a constant address), `jsx-a11y/role-supports-aria-props` one (`dashboard.tsx`: the
  rail's `aria-selected`). Removed: none.
- **The tests' files:** the check while GitHub is out of reach is a file of its own (`review-offline`), as a case of
  `review-token.browser.test.ts` made a block jscpd refuses; `review-writing`, `review-drawn` and `review-broken` are
  new files, each a page of its own; `drawnAlike` moved to `owned.ts`, for both pages. Beyond the plan: `review-drawn`'s
  static-content test (the 4.8 audit's lesson).
- **The beat is timed to the millisecond** in `review-writing` (the audit's): the written state is waited for on real
  pauses, as `expect.poll` would advance vi's faked timers, then the clock is advanced 449 ms and 1 ms.
- **The move after the beat** differs from the `h()` page in one case, which the audit found and left: a write written,
  then an empty queue's tab opened during the beat; the `h()` page's `generation` was bumped only by a queue's item
  drawn, so it then drew that empty tab anew (`go` to the index it was on, a focused control losing the focus), where
  the page now does nothing, its record no longer the one written from.

## Audit corrections

A change audit of the four commits (seven auditors) found one defect the port made and smaller faults; each is fixed in
the commit that introduced its code:

- **The country picker went back to its placeholder while a claim was written, and stayed there after a failed write**
  (medium, three auditors), while the page's pick stayed the country: `choices`' `disabled={off?.()}` sat in the one
  effect Solid's compiler makes of the select's attributes, which sets `value` again each time it runs, so each change
  of the write's phase put the select back on `''`; a failed write then wrote the country the picker no longer showed.
  `off` is now a render effect of its own (`controls.tsx`); no other caller of `choices` passes `off`, so their effects
  are unchanged. Tested and fail-checked (`review-offline`, above).
- **`decision` wrote its `off` twice** (the picker given a copy): given `off` itself.
- **The review drew through `mounted` with made-up props** (`sub` and `qs` empty, `data` a resolved review), and
  `mount.tsx`'s comments said a view was drawn from its address: `mounted`'s core is
  `drawnIn(root, name, signal, draw)`, which `mounted` and the review page both call; the comments say which draws what.
- **`token.tsx`'s header** named `review.ts` as the page holding the token's state: `dashboard.tsx`.
- **The reason recorded for the `react/jsx-no-target-blank` suppressions** (`docs/lint-false-positives.md`, both
  commits, and the departures above) said the rule read a constant address only; it flags any (checked with the three
  suppressions removed: all three flagged). The suppressions' own comments give the reason that holds (`rel` kept as the
  `h()` page drew it) and are unchanged.
- **Decision 6** said `button`, `paged` and `toggle` stayed for `report.ts` and `main.ts`: they have no production
  caller; listed for 4.10 (the plan's row), not deleted here.
- **The plan's 4.10 row** did not name the suppressions 4.9 kept until after 4.10: it does.
- **The tests:** `review-writing` timed the beat loosely (any beat from about 51 ms to 500 ms passed): timed to the
  millisecond; its `held()` never let GitHub's answer go when a test failed, so the next test's write queued behind it:
  let go when the test ends; the rail's search, emptied on the test's last line in `review.browser` and `review-drawn`,
  stayed for the next test on the same tab when one failed: emptied when the test ends. The record said every
  `review-drawn` test passed on the `h()` page: one does not (above).

## Open issues (recorded, not fixed)

- **Defects the `h()` page had too, kept as they were** (found by the audit; to file as issues):

  - choosing the country picker's placeholder ("Another country…") again after a country fills the note "Ana: from " and
    enables Write the claim, which then throws ("a home claim names a country: pick one") and sends nothing;
  - the keys step from the address's index, not the one shown (clamped): on `#contested/9` with two items, item 2 is
    shown, and ←, → and `n` all go to item 2, so the first press seems to do nothing; the move after the beat steps from
    it the same way;
  - Forget pressed while the dialog's Check and keep waits for GitHub is undone when the answer comes: the token is kept
    again (in `localStorage` if the box is ticked), the page says "Writing as …" and the dialog says the choices are on
    each item after it said "Forgotten";
  - Forget pressed while the page's first check of a kept token waits for GitHub leaves the page writable-looking with
    no token: the choices show, and Write the claim does nothing and says nothing (`settle` returns on no token);
  - token checks and writes answered out of order: a kept, expired token's slow refusal arriving after a new token's
    check came back good leaves the page read-only ("GitHub refused this token…") with the good token kept; a write made
    with the old token and refused after the new one was checked does the same;
  - the rail's rows are `<button>`s marked `aria-selected`, which a button's role does not take, so screen readers do
    not say which item is shown (suppressed for identical markup, `jsx-a11y/role-supports-aria-props`; revisit after
    4.10, `aria-current` its likely fix).

- **Kept as before, to fix after the port:** the rail's search is drawn anew on each letter, holding the words folded
  and trimmed (a capital, an accent or a space at the end disappears as it is typed, so "a b" cannot be typed); a choice
  pressed and a note half written go when the rail's search is typed in or the token's state changes; a focused queue
  tab loses the focus on each draw. Each is what `render()` did; the dumps hold them.

- **A token check that fails on the network** leaves the page "Checking the token…" until the next check, as before
  (pinned by `review-offline`).

- **`FLUSH_IN_EFFECT_CALLBACK`:** a scratch test saw it for a `render` in an effect's callback, which is why the page
  draws from its handlers; `main.ts`'s router renders a view from its effect's callback and the suite never sees the
  warning there. Not traced.

- **`styles.test.ts`** counts `past` only because another module quotes the word; an unquoted key fails safe, so the
  class going unused would not be caught.

- **The dumps' focus** differs in one state (the read-only item after the dialog closed: the focus left on the dialog's
  link) when the dump runs beside other files, whose frames take the window's focus; alone, the same before and after.

- **The suite runs in Chromium alone;** the page uses nothing the `h()` page did not (`setSelectionRange` on a search
  field, `showModal`), but Firefox's and Safari's latest are not checked by it.

- **`guarded`** stays in `main.ts` around `mounted`, and `report.ts`'s `cannotShow` is an `h()` line; 4.10's.

## Done when

The review page is drawn by Solid, `review.ts` its entry alone, the page the same in every state dumped; every test
passes, each new one fail-checked; knip clean; `mise run check` passes.
