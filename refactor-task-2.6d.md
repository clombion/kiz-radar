# Task 2.6d: the card's drawings as data, and drawings hidden by construction

Task 2.6d of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. Two parts, approved by the owner on
19 November, each its own commit.

## Summary

| Commit | What |
| -- | -- |
| `0937373c` | Every drawing hidden from assistive technology by `Drawing`'s constructor; `review.ts`'s chevrons made by it |
| `7491bd72` | The drawings as data (`pipeline/drawings.py` → `site/drawings.ts`); the card's digest covers the drawings it draws |
| `ccd41cad` | The views' hidden-drawing check joined to their strays check, under its one allowed suppression |

**Part A.** `Drawing`'s constructor wrote the markup it was given. `#line` added `aria-hidden="true"`, but `ARROW_UP`
and `CHEVRON` did not. Now the constructor writes the `<svg>` and adds the attribute to every drawing. Before the fix,
`elements.browser.test.ts` failed on `#finder`'s two arrows and `#map`'s chevron. Each view is now checked for an `svg`
without `aria-hidden`, Leaflet's own markup left out. Strictly, neither failure was exposed to a screen reader:
`sentence.ts`'s note and `map.ts`'s span hid them through their parents. They were hidden by their callers, though, not
by construction. `review.ts`'s chevrons, built with `createElementNS`, are now `Drawing.PREVIOUS_ITEM` and `NEXT_ITEM`,
drawn into their buttons, with the same markup and size. `review-readonly.browser.test.ts` checks that they are hidden
and that their buttons are named. `reviewpage.browser.test.ts`'s failing-view test now removes `innerHTML`'s setter
instead of `createElementNS`.

**Premise check, drawing by drawing.** Every drawing stands beside words that say what it means, or sits in a button
named by them. Examples: the arrow beside the hint's words, the chevron in the sheet handle with its title and
"Open"/"Close", lock and people in a `role="img"` span with a label, the plane and bed in buttons labelled "By travel"
and "By place", the steps in labelled buttons, the ring beside the day's number, traits beside their words, and the
search's lead icon beside the row's name. No drawing is the only carrier of meaning. `index.html`'s two static SVGs were
already hidden.

**Part B.** The digest now covers `DRAWN_FROM` (`share-card.html`, `render.cjs`, `mark.svg`, with `icons.ts` gone) and
`json.dumps(drawings.card(), sort_keys=True)`, which is the markup of people, plane and ring. `render.cjs` takes the
three drawings from `drawings.card()` in the Python call it already makes, so `render:design` no longer depends on
`build:site`. The checks were measured again:

- A comment edited in `icons.ts` leaves `test_community_card.py` green.
- A changed path in `users` makes it stale.
- The test now also changes a drawn drawing (stale) and two undrawn ones (not stale).

`share.json`'s digest was recomputed with `drawn_now` and not drawn again. The three drawings' markup is byte for byte
what the built `icons.js` gave before. `share-card.html`'s comments changed (they named `icons.ts`), which the digest
covers in any case.

## Decisions

- **The data is a Python module, `pipeline/drawings.py`.** The generator is Python. `states.py`, which names the icons,
  is the precedent for data that writes a TypeScript module, and the site imports no JSON (`house/json`). The data has
  comments beside each drawing, and the digest hashes values, not the file, so its comments do not count. `E501` is off
  for this module, because a drawing's markup is one string.
- **The digest covers only what the card draws**, which is the three drawings' final markup. A change to another drawing
  or to the line attributes of an undrawn icon leaves the card alone. A change to `LINE`, which people and plane use,
  does not.
- **`Drawing` takes only generated markup:** its private constructor's parameter is the union of `drawings.ts`'s literal
  values. `aria-hidden` is added in one place, `drawings.svg()`. `Drawing.LUCIDE` now also holds `lock`, `info`,
  `chevron-left`, `chevron-right` and `plane`. `Drawing.LUCIDE.users` is a separate instance from `PEOPLE` with the same
  markup, so `styles.test.ts`'s identity check went. Its check that the card copies no path moved to
  `test_community_card.py`. The `svg` getter, which only `render.cjs` and that test read, went too.
- **`site/drawings.ts` is generated as JSON strings** and ignored by oxfmt, as `states.ts` is. `generate:check` covers
  it.

## Checks

The full `mise run check` first failed on `tests/test_suppressions.py`: a second `jest/no-done-callback` suppression,
which `ccd41cad` removed. Its other errors came from this file being written during the run. The run after that is
reported in the task's hand-off.
