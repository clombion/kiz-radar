# Task 4.6: the shared pieces

Task 4.6 of [refactor-plan.md](refactor-plan.md). Status: planned, 20 November 2026.

## Summary

The pieces several views share move from `h()` to Solid's JSX, one piece a commit: a festival's card (`eventcard.ts`)
with what it opens to (`details.ts`), the quick views over the page (`dialog.tsx`'s `peek`, filled by `flights.ts`,
`passes.ts` and `plans.ts`), the plans' renderers (`plans.ts`: who is going, as a line, as lines, as a list, as a tag),
`ui.ts`'s element helpers (the arrow of a link off the site, On now, the loading mark), and a community page's charts
with the cards they open over the page: a trip's roster (`gantt.ts`, its card of names) and the months (`months.ts`, a
day's popover), with `dismiss.ts`'s `dismissable`, the rule of when such a card goes away. Visitors see the same site:
the same markup, words and behaviour, in the latest Firefox and Safari as in Chromium. `page.browser.test.ts`'s kept
test of `dismissable` goes in the commit that deletes it (task 1.6), what it held read on the page.

The views that hold these pieces are 4.7's and 4.8's and stay `h()` modules until then; they hold a Solid piece through
one function of the views' seam, `mount.tsx`'s `held`.

## Design model

- **A Solid piece held by an `h()` view.** `held(signal, Class, what, part)` (`mount.tsx`) draws `part` under the page's
  owner (`owner.ts`), as `mounted` draws a view, in a root of its own, and hands back the element it drew, checked as
  `bits.ts`'s `asElement` checks one (a TypeError naming `what`), for the `h()` code to put where it puts an element.
  The root is disposed when the view's signal aborts (another view shows), or at once if it has already. The first draw
  is synchronous (measured: an element JSX makes under an owner has its attributes and text when the call returns), so
  the `h()` code holds a whole element, as it did. A piece that throws as it is drawn throws to the `h()` code that drew
  it, its root disposed, as an `h()` element that threw did: the view's `guarded`, or the handler's caller, says it. The
  views pass their signal down to where they draw a piece (`artists`, `communities`, `friends`, `map`, `people`,
  `sentence`, `main.ts`'s loading mark); `personView` is handed it by `main.ts`. A Solid caller (`week.tsx`, the other
  pieces) calls the piece in its JSX.
- **A piece is a function of values.** A card, a line of who is going, a roster: each is a function returning JSX
  (`eventCard(e, options)`), as `search.tsx`'s rows are, not a component reading `props`: what it is given never changes
  over its life (a festival's row, the view's choices), and `solid/reactivity` reads every use of a prop in a
  component's body as reactive. Its own state is signals made as it is drawn (a card open or not), drawn by JSX; what
  derives from them is read in JSX or a memo; an effect only for what JSX cannot do (scroll, focus, measure, a view
  transition). It is called where it is untracked: `held`'s root, a `<For>`'s callback, another piece's body.
- **What a piece draws later has a boundary.** A card's details are read from the database the first time it opens; a
  quick view's body when it opens; a day's popover when the day is shown. Each is drawn in an `<Errored>` whose fallback
  reports what went wrong (`report.ts`, under the words the failure was said with before: "opening a card", "the page")
  and draws nothing, so a throw is said once and the card, the dialog with its history entry, and the page go on, Solid
  not halted.
- **A click stays the control's.** A control inside a card keeps its click from the card's foot and from a dropdown's
  click outside (`dom.ts`'s `dropdown`, which listens on `document`): `own()` stops it. A JSX handler is delegated to
  the root it is drawn into (`<body>`, `body.ts`, or a view's), so a stop there stops the event at that root, before
  `document`, as `own()` did on the control. `own` moves to `bits.ts`, which a `.tsx` module imports, and
  `house/clicks`' exemption moves from `dom.ts` to `bits.ts` with it: still one module that stops a click, and
  `swipe.ts`.
- **A card.** `eventCard(e, { hint, open, onMap })` draws the `<article>`: its open state a signal, its details drawn
  the first time it opens and kept, hidden, when it closes, as before. Every toggle (the title, `N more`, `+N`,
  `Line-up & details`, `Less`) reads the signal for its `aria-expanded`, the foot's label for its words. Opening and
  closing is a view transition, as before (`smoothly`): the change is flushed inside the transition's callback, so its
  new state holds the card changed and the scroll that keeps the card in view measures it so. The foot opens the card on
  a click outside its links and buttons, a delegated `onClick`.
- **The quick views.** `dialog.tsx`'s `peek(id)` draws a quick view whose parts (its lead, title, the line under it, its
  body and foot) are drawn from what its opener hands it, a signal holding functions of JSX, each drawn inside the
  dialog, in a boundary: `show(content, from)` draws them, puts the body's scroll back to its top and opens the dialog,
  or, open already (a name in the list of everyone going), changes what it shows. The title is drawn in the `<h2>`, so
  the heading has content and its `jsx-a11y/heading-has-content` suppression goes. `flights`, `passes` and `plans` each
  keep one quick view, as now, drawn when first asked for.
- **The plans' renderers.** `plans.ts` becomes `plans.tsx`, whole: its readers (`goersOf`, `person`, `withPlans`,
  `togetherHref`, …) unchanged, its renderers JSX (`goingLine`, `whoLines`, `whoIsGoing`, `doingTag`, `goersInline`, the
  faces and names of `friendsIn`), and its two quick views (a person's or a couple's plans; everyone going to a
  festival, with the way back to it from a name).
- **The marks of `ui.ts`.** `away`, `nowTag` and `loading` move to a module of their own, `site/marks.tsx` (no `X.tsx`
  beside an `X.ts`: `ui.ts` keeps its dates, countries and links, and no longer imports `dom.ts`); `loading` is named
  `loadingMark`, since `house/flags` refuses a `.tsx` declaration named `loading`.
- **A card over a community's page.** The cards over the page (a day's popover, a roster's card of names) share one
  rule: one open at a time, site-wide, which closes on Escape wherever the focus is, on the focus leaving what it
  belongs to for elsewhere, and on a tap outside that; placed again on a resize while it is open. With both ported, the
  rule is a signal: which card is open (`site/over.ts`, `overPage({ within, place })`, returning whether this card is
  the one open and its opening and closing), its listeners made where the card is drawn and taken away with it
  (`onCleanup`). `dismissable`, its callbacks and its module go, with `page.browser.test.ts`'s test of it;
  `elements.browser.test.ts` reads each of its guarantees through the page already, and a closed card not placed on a
  resize is added there. Until then `gantt.tsx` holds `dismissable` with a signal its cleanup aborts.
- **The roster (`gantt`).** `gantt` and `ganttByPlace` return the roster's JSX: its axis and lines as before, each
  stroke's position and ink set through a ref with `style.setProperty` (`house/styles`), the card of names behind a text
  a piece whose state (the text the pointer is over, the opener a tap or a key opened) is signals, its place on a
  computer measured in an effect once it shows.
- **The months.** `months` returns the calendar's JSX: the period shown a signal the steps move, the grids drawn from
  it, the popover one element whose day, place and words are signals, drawn by the grids' events (focus, pointer, tap)
  as delegated handlers where they bubble (`onClick`, `onPointerDown`, `onMouseOver`, `onFocusIn`) and the keyboard's
  roving stop an `onKeyDown`; `mouseleave`, which does not bubble, a handler on the calendar itself. On a phone the
  popover moves after the last month of its day's row, as before: placing it moves the one element, in an effect.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The order of the pieces | From the card down: the card, its details, the quick views' host, flights, passes, the plans' renderers, the marks, then the roster and the months | A JSX piece holds an `h()` element as it holds any node, so porting a user before what it uses needs no bridge between them; the other order would put `held` (and a signal) in every piece for one commit. Each commit leaves every piece it has not reached `h()`, called from JSX. |
| 2 | How an `h()` view holds a Solid piece | `mount.tsx`'s `held`, with the view's signal | The views' seam, beside `mounted`: a piece needs an owner (an expression in JSX is an effect), and a root under the page's owner must be disposed, which the view's signal says when. `placed.tsx` draws a part in a place of the page for its life; a card is an element an `h()` view puts in a list it builds. |
| 3 | "The community page's cards" | The cards over a community's page that `dismissable` governs: a day's popover (`months`) and a roster's card of names (`gantt`) | `dismiss.ts`'s header ("a card shown over the page from something on it") and `page.browser.test.ts`'s ("dismissable with 4.6, which ports the community page's cards"). A trip's row and its card are `communities.ts`'s view, 4.7's. |
| 4 | Where `dismissable`'s rule goes | `site/over.ts`, a signal of the card open, its listeners the card's; `dismiss.ts` deleted with its kept test, in the months' commit, the last user | The rule's state is one value (which card is open), a signal; `dismissable`'s callbacks (`opened`, `closed`) only told it. Deleted in the commit that ports its last `h()` user, so no commit holds two rules of one card at a time. |
| 5 | `own` | `bits.ts`, with `house/clicks`' exemption (and its fixture) moved there from `dom.ts`, in the card's commit | A `.tsx` module imports nothing of `dom.ts` (`house/legacy`); the rule still allows one module's helper and `swipe.ts`. |
| 6 | `wording.ts`'s `say` and `joined` | Their value type is no longer held to `Kid`: they place what they are given, a node or JSX's element alike | A JSX element is typed `JSX.Element`, which `Kid` is not; neither function reads its values. |
| 7 | Failures | A boundary where a piece draws later (details, a quick view's body, a day's popover), reporting under the words the failure was said with before | The 4.4 and 4.5 audits: a throw in a reactive part with no boundary halts Solid for the page. |
| 8 | Tests | `page.browser.test.ts`'s test of `dismissable` deleted with it; a test through the page for each boundary (a card whose line-up cannot be read, a quick view that cannot be drawn, a day's popover that cannot be), each in a file of its own; a closed card not placed on a resize in `elements.browser.test.ts`; existing tests changed only where they read a change synchronously that Solid now draws on its next flush, each said in its commit | Through the page, as `house/tests` asks; each new test fail-checked. |

## Impact

- **New:** `site/eventcard.tsx`, `site/details.tsx`, `site/flights.tsx`, `site/passes.tsx`, `site/plans.tsx`,
  `site/gantt.tsx`, `site/months.tsx` (from their `.ts`), `site/marks.tsx`, `site/over.ts`; a test file for each
  boundary.
- **Changed:** `site/mount.tsx` (`held`), `site/dialog.tsx` (`peek`), `site/bits.ts` (`own`), `site/dom.ts`,
  `site/ui.ts`, `site/wording.ts`, `site/week.tsx`, `site/search.tsx`, `site/festivals.ts`, `site/pricing.ts`; the `h()`
  views that hold the pieces (`artists.ts`, `communities.ts`, `friends.ts`, `map.ts`, `people.ts`, `sentence.ts`,
  `main.ts`); `.oxlintrc.json` (`house/clicks`, `house/tests`), `lint/clicks.ts`, `lint/tests.ts` and their fixtures;
  `tests/site/page.browser.test.ts`, `tests/site/elements.browser.test.ts`; `tests/test_suppressions.py`,
  `docs/lint-false-positives.md`, `docs/concepts/lint-rules.md`; `refactor-plan.md` (row 4.6).
- **Deleted:** `site/dismiss.ts`; `page.browser.test.ts`'s test of `dismissable`.
- **Unchanged:** `routes.ts`, `db.ts` and the queries, the stylesheet, the page's policy, every other test.

## Commits

| Commit | What |
| -- | -- |
|  | this plan |
|  | a festival's card (`eventcard.tsx`), `held`, `own` in `bits.ts`; the views pass their signal |
|  | what a card opens to (`details.tsx`), its boundary and test |
|  | the quick views drawn from what their opener hands them (`dialog.tsx`), their boundary and test |
|  | a festival's flights (`flights.tsx`) |
|  | a festival's passes (`passes.tsx`) |
|  | the plans' renderers and quick views (`plans.tsx`) |
|  | `ui.ts`'s marks (`marks.tsx`) |
|  | a trip's roster (`gantt.tsx`), still with `dismissable` |
|  | the months (`months.tsx`), the cards over the page as a signal (`over.ts`); `dismiss.ts` and its kept test gone |
|  | the plan's row and this status |

## Done when

Every piece of row 4.6 is JSX, drawn by Solid in the Solid views and held by the `h()` views through `held`; the page
the same; `dismiss.ts` is gone with `page.browser.test.ts`'s test of it, `house/tests`' allowance and its fixture
narrowed; every other test passes; `mise run check` passes.
