# Task 4.7: the stateful views

Task 4.7 of [refactor-plan.md](refactor-plan.md). Status: planned, 20 November 2026.

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
  otherwise (measured), which would put "This page could not be shown" in place of a working view.
- **Shared controls in JSX** (`site/controls.tsx`), what `dom.ts` gave the `h()` views, which a `.tsx` cannot import
  (`house/legacy`): `choices` (a `<select>`, its initial choice the selected option, a choice handed back typed),
  `segments` (a row of pressed buttons, drawn anew when the choice changes, as each `render()` drew them), `dropdown`
  (the more button and its panel: open a signal, a click outside what counts as inside closes it, its listener on the
  document taken away with the view), `paged` (a list shown a page at a time: how many shown a signal, the rows a
  `<For>` over the items shown, so a page more keeps the rows there, and the button saying how many more), and `leftOut`
  (what an address asked that the view has no choice for, at its top). A text field typed in is heard on itself (a ref),
  as `search.tsx`'s is: a script's `input` event does not bubble to a delegated `onInput`.
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
| (this) | this plan |
|  | Countries (`countries.tsx`), with `controls.tsx`, `mounted`'s view and `Redrawn` |
|  | the friends' list (`friends.tsx`) |
|  | Artists and an artist's page (`artists.tsx`) |
|  | the Festivals page (`sentence.tsx`) |
|  | the Map (`map.tsx`) |
|  | a community's page (`communities.tsx`) |
|  | a person's page (`people.tsx`) |
|  | `main.ts`'s loading mark through `placed.tsx`; `held` gone |
| the last | the plan's row and this status |

## Done when

Every view of row 4.7 is a Solid view mounted through `mounted`, the page the same; `held`, `heldNodes` and `redraws`
are gone, with no seam use left in the views; every test passes, each new one fail-checked; `mise run check` passes.
