# Task 4.9: the review dashboard

Task 4.9 of [refactor-plan.md](refactor-plan.md). Status: planned, 20 November 2026.

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
  So the port keeps that grain. The page's state is two signals of the page's life, made under the page's owner
  (`owner.ts`): the dashboard's own record (the address, `{ tab, i }`; the rail's search; the two sides picked to join),
  a new record on each change, and the token's state (`Access`); a memo of both is what a draw is of, a new record
  whenever either changes. Each change is flushed and the view drawn anew at once, in the handler, as `render()` drew
  it: the view is mounted through `mount.tsx`'s `mounted` into `#review` (the root emptied first, as `replaceChildren`
  emptied it), the draw before disposed with its signal, so a draw that throws says "This page could not be shown" in
  its place, with "Kiz Radar: the review:" in the console, as `guarded` did on every render
  (`reviewpage.browser.test.ts` pins it), and the next change draws it again. The queues' tabs (`#queues`) and the token
  button's dot and words (`#access`) are shell parts drawn once through `placed.tsx`, each a keyed `<Show>` over the
  same memo, so they are drawn anew on each change too.
- **No effect draws the view.** `render` flushes (`@solidjs/web`), and a flush inside an effect's callback is a no-op
  that Solid warns of (`FLUSH_IN_EFFECT_CALLBACK`, measured in a scratch test: inside `createEffect` and
  `createRenderEffect`, and through `onFlush`, which runs after the handler's `flush` returns, so too late for the tests
  that read the page at once). The page's own functions that change its state (`changed`, `accessed`) flush and draw.
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
| 3 | The grain of a draw | the whole view drawn anew where `render()` was called (an address, the rail's search, the token's state, a side picked), through `mounted`; in place what the old code changed in place | Identical behaviour and failure (design model). |
| 4 | Drawing the view | in the handler that changed the state, after its flush; no effect | `FLUSH_IN_EFFECT_CALLBACK` (design model). |
| 5 | The rail's pages | `controls.tsx`'s `paged`, given the more button's class (`link` here; `more-btn show-more` as before elsewhere) | Shared control; the markup the old rail drew. |
| 6 | Dead code | `dom.ts`'s `choices` deleted and `nodes` no longer exported, in the page's commit; `h`, `button`, `paged`, `toggle` stay for `report.ts`, `main.ts` and `page.browser.test.ts` (4.10) | knip clean; 4.10 deletes `h()`. |
| 7 | Tests | below | Each fail-checked. |
| 8 | Markup | checked by scratch dumps (not committed) of `#access`, `#queues`, `#review` and the dialog, normalised (Solid's empty comments and adjacent texts, attributes' and classes' order left out; form controls' state and the focus read as properties), in 57 states before and after each commit: every queue and list, a choice by click, by key and by the picker, a note typed and emptied, the keys, the rail paged and searched, a join in each state, an address of no queue, a write held, written and past the beat, a write failed, refused and forbidden, the dialog's every message and expiry, read-only and checking | As 4.6 to 4.8. |

## Tests

- **Deleted:** none.
- **Added** (each through the page, fail-checked):
  - a write that fails on the network says "The claim could not be written: try again.", reported once as "writing a
    claim", every control usable again and the button's words back, the item still shown; the next write goes;
  - while a write is under way every control of the form is disabled and its button says "Writing…"; once written it
    says "✓ Written" (marked `just-picked`) for the beat, then the next open item is shown;
  - a write that lands after the admin moved to another item leaves the page where they went;
  - a token check that fails on the network leaves the page checking, as before, reported once as "checking the token";
  - the rail's search, typed in, filters its rows and keeps the focus in its field, the caret at its end;
  - the controls are marked in the markup as the `h()` page marked them (the rail's search `value`, the picker's first
    option `selected`, the dialog's expiry `value` and its box `checked`, the write button `disabled`);
  - drawn again (`drawn-again`'s way, `tests/site/owned.ts`): moving between items, typing in the rail, the token's
    state changing and a side picked each hold the owners of the last draw alone, the draw before gone;
  - a side's matches that throw as they are typed say so once as the page's, the page going on (planted: a count's words
    refused as the list is drawn); a draw that throws says so in place, and the next address draws the page again.
- **Changed:** none planned.

## Impact

- **New:** `site/token.tsx`, `site/dashboard.tsx`; tests above.
- **Changed:** `site/review.ts` (the entry alone), `site/controls.tsx` (`paged`'s more button's class), `site/dom.ts`
  (`choices` gone, `nodes` unexported), comments naming what moved (`bits.ts`, `report.ts`); `refactor-plan.md` (row
  4.9). Suppressions only if a rule misreads identical markup (a `role="status"` paragraph, `aria-selected` on the
  rail's buttons), each on its line with its reason, counted in `tests/test_suppressions.py` and listed in
  `docs/lint-false-positives.md`.
- **Unchanged:** `github.ts`, `kept.ts`, `claims.ts`, `pending.ts`, `public/review.html`, the stylesheet, the page's
  policy, `vite.config.ts`, `knip.jsonc`, `h()`, `page.browser.test.ts`.

## Commits (planned)

| Commit | What |
| -- | -- |
| 1 | this plan |
| 2 | the token dialog (`token.tsx`) |
| 3 | the page (`dashboard.tsx`), `review.ts` the entry, `paged`'s class, `dom.ts`'s dead exports; its tests |
| 4 | the plan's row and this status |

## Done when

The review page is drawn by Solid, `review.ts` its entry alone, the page the same in every state dumped; every test
passes, each new one fail-checked; knip clean; `mise run check` passes.
