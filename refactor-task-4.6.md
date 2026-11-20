# Task 4.6: the shared pieces

Task 4.6 of [refactor-plan.md](refactor-plan.md). Status: done, 20 November 2026. Every piece of the row drawn by Solid,
held by the `h()` views through `mount.tsx`'s `held`, the markup the same (read through the page before and after each
piece); `dismiss.ts` gone with its kept test, the rule of the cards over the page a signal (`over.ts`); no stop.

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
  the `h()` code holds a whole element, as it did. A piece that throws as it is drawn, in its body or in a reactive part
  (an expression of its JSX, run as an effect), throws to the `h()` code that drew it, its root disposed, as an `h()`
  element that threw did: the part is drawn in an `<Errored>` whose fallback keeps the error, rethrown once the root is
  made, so the view's `guarded`, or the handler's caller, says it and Solid is not halted; a throw later is reported as
  "the page". The views pass their signal down to where they draw a piece (`artists`, `communities`, `friends`, `map`,
  `people`, `sentence`, `main.ts`'s loading mark); `personView` is handed it by `main.ts`. A part a view draws again
  (the Map's panel, the friends' list, the Festivals page's line and list, a community's agenda and a trip row's line of
  who goes) has a signal per draw (`mount.tsx`'s `redraws`), aborted by the next draw, so what a draw holds goes with
  it. `held` called inside Solid (a day's words, which the months' popover draws; a roster's tags) makes its root under
  the owner it runs in, disposed with it. A Solid caller (`week.tsx`, the other pieces) calls the piece in its JSX.
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
  `site/gantt.tsx`, `site/months.tsx` (from their `.ts`), `site/marks.tsx`, `site/over.ts`;
  `tests/site/card-broken.browser.test.ts`, `tests/site/peek-broken.browser.test.ts`,
  `tests/site/held-broken.browser.test.ts`, `tests/site/held-redrawn.browser.test.ts`.
- **Changed:** `site/mount.tsx` (`held`, `heldNodes`), `site/placed.tsx` (`Reported`), `site/dialog.tsx` (`peek`,
  `leaving`), `site/bits.ts` (`own`, `styled`), `site/dom.ts`, `site/ui.ts`, `site/wording.ts`, `site/week.tsx`,
  `site/search.tsx`, `site/festivals.ts`; the `h()` views that hold the pieces (`artists.ts`, `communities.ts`,
  `friends.ts`, `map.ts`, `people.ts`, `sentence.ts`, `main.ts`); `.oxlintrc.json` (`house/clicks`, `house/tests`),
  `lint/clicks.ts`, `lint/tests.ts` and their fixtures; `tests/site/page.browser.test.ts`,
  `tests/site/elements.browser.test.ts`, `tests/site/main.browser.test.ts`, `tests/site/mount.browser.test.ts`,
  `tests/site/plans.browser.test.ts`, `tests/site/planted.ts`, `tests/site/app.ts` (a comment), the type imports of
  `tests/site/pricing.test.ts` and `tests/site/samples.ts`; `tests/test_suppressions.py`,
  `docs/lint-false-positives.md`, `docs/concepts/lint-rules.md`, `docs/guides/the-site.md`; a comment in
  `public/css/site.css`; `refactor-plan.md` (row 4.6).
- **Deleted:** `site/dismiss.ts`; `page.browser.test.ts`'s test of `dismissable`.
- **Unchanged:** `routes.ts`, `db.ts` and the queries, the stylesheet's rules, the page's policy.

## Commits

| Commit | What |
| -- | -- |
| `15a265d` | this plan |
| `ddef58b` | a festival's card (`eventcard.tsx`), `held`, `own` in `bits.ts`; the views pass their signal; the card's boundary with `card-broken.browser.test.ts`; a held card's root counted in `mount.browser.test.ts` |
| `66029b0` | what a card opens to (`details.tsx`); the promo code's Copy, with its test |
| `589a20c` | the quick views drawn from what their opener hands it (`dialog.tsx` `peek`), a boundary a part; `placed.tsx`'s `Reported`, the one boundary that reports and draws nothing |
| `dfd19a9` | a festival's flights (`flights.tsx`) |
| `432dd7b` | a festival's passes (`passes.tsx`), with `peek-broken.browser.test.ts` |
| `4fdd631` | the search's backdrop test waits for its close event (a flake traced, below) |
| `d207297` | the plans' renderers and quick views (`plans.tsx`), `heldNodes`; the list of everyone going tested |
| `71f4300` | `ui.ts`'s marks (`marks.tsx`); what the Festivals page holds taken away as it is drawn again |
| `ca8eead` | a trip's roster (`gantt.tsx`), still with `dismissable` |
| `a23da9c` | the months (`months.tsx`), the cards over the page as a signal (`over.ts`); `dismiss.ts` and its kept test gone |
| the last | the plan's row and this status |

## Tests

- **Deleted** (task 1.6, with its helper): `page.browser.test.ts`'s "a card over the page is the only one open, and goes
  on Escape, on the focus leaving and on a tap outside" (with `dismissable`, `a23da9c`). Each of its guarantees is read
  through the page by `elements.browser.test.ts`'s "a card over the page is the only one open…" (one at a time across
  the day's popover and the card of names, Escape, the focus leaving and moving within, a tap inside and outside, placed
  again on a resize); the one it held that no test read, a closed card not placed again on a resize while another card
  is open, is pinned there by a new test (the popover closed, the roster's card of names opened, the window resized).
- **Added:** `card-broken.browser.test.ts` (a card whose line-up cannot be read); `peek-broken.browser.test.ts` (a quick
  view whose foot cannot be drawn); `held-broken.browser.test.ts` (a held card whose reactive part throws, on an `h()`
  view); `held-redrawn.browser.test.ts` (the roots held stay as many across the draws of a part drawn again);
  `gantt.browser.test.ts`'s card of names in the flow, hovered then clicked; `main.browser.test.ts`'s promo code copied,
  Copied then Copy; `mount.browser.test.ts`'s held cards counted as roots of the page's owner while their view shows,
  and the cards of a list drawn again taken away with it; `plans.browser.test.ts`'s list of everyone going, a name in it
  and the way back; `elements.browser.test.ts`'s closed card not placed again on a resize, the roster's card of names
  open.
- **Changed:** `mount.browser.test.ts`'s first test's name and header (This week's cards are Solid's);
  `elements.browser.test.ts`'s backdrop test waits for the close event too (`4fdd631`); `card-broken` and `peek-broken`
  plant through `planted.ts`'s `unreadable`.

## Fail-checks

Each made by undoing one piece and running its test, then putting it back:

- **The card's boundary** taken out: `card-broken.browser.test.ts` fails, This week's own boundary taking the whole view
  ("Kiz Radar: week: …" undeclared).
- **`held`'s dispose** not handed to the signal: `mount.browser.test.ts` finds 9 roots where it expects 7.
- **The Copy button:** its words never set back, and Copied never said: `main.browser.test.ts`'s copy test fails each
  way.
- **The quick view's boundary** taken out: `peek-broken.browser.test.ts` fails, Solid halted and no line said.
- **The way back** to everyone going not drawn: `plans.browser.test.ts` finds `['P1', undefined]`. (A name opened with
  an element to open from passes: an open dialog is not opened again, so it pushes nothing.)
- **The Festivals page's held pieces** kept to the view's signal alone: both of `mount.browser.test.ts`'s counts on it
  fail (10 for 7, 10 for 9).
- **A closed card placed on a resize** (`over.ts` calling place whatever card is open): the new
  `elements.browser.test.ts` test finds the popover moved from 76 px to 664 px.
- **house/tests' allowance** still naming `dismiss.ts`: `rules.test.ts` fails, the fixture's refused import not found.
- **The flake's mechanism**, shown by a scratch test (not kept): the search closed by its backdrop, `<main>` focused,
  then the close event: the focus is on the search's button.

## Departures from the plan

- **The order:** the card's boundary and its test came with the card (its details are drawn by the card), not with the
  details' commit; `placed.tsx`'s `Reported`, which jscpd asked for, came with the quick views; the passes' button moved
  to `passes.tsx` with the passes.
- **`heldNodes`** beside `held`: who goes inline, and On now, are words and elements in an `h()` line, not one element.
  A piece whose top is reactive is refused; none is.
- **What the Festivals page holds** (its cards, the friends going, the loading mark) is taken away each time its line
  and list are drawn again, not only when the view is left; `main.ts`'s loading mark once the data is in or failed.
- **The day's popover** belongs to the calendar now: `months` takes what a day says (`detail`) where `communities.ts`
  made a popover and attached the calendar to it.
- **`overPage`** takes the card's own closing as `closed` (optional) and returns `shown`, a memo of the signal of the
  card open; the months' popover is hidden by it, and keeps its words, hidden, once it closes, as before.
- **Failures said:** a card's details that throw are said as "opening a card", as before, but the card opens empty where
  it stayed closed; a quick view's part as "a quick view", the dialog open, where the click's throw was "the page" and
  the dialog stayed shut; a day's popover as "a day's popover", the popover left closed, as it stayed hidden (audit,
  below).
- **Suppressions added** (each on its line, counted in `tests/test_suppressions.py`, explained in
  `docs/lint-false-positives.md`): `eventcard.tsx` (the foot's click, two rules), `marks.tsx` (the loading line's role),
  `gantt.tsx` (the roster's role), `months.tsx` (the grid's five roles, its focus, the calendar's events: eight lines);
  `dialog.tsx`'s `heading-has-content` removed.
- **`house/clicks`' exemption** moved from `dom.ts` to `bits.ts`, with `own` and the rule's fixture.

## Open issues (recorded, not fixed)

- **A day's popover's boundary is not exercised by a test:** what a day says is built from rows the community's page
  read as it was drawn, so no planted row throws there alone (looked for again after the audit: a role, a time, a stay,
  a name, each refused as the page reads it or never thrown on); the card's and the quick view's boundaries are tested,
  and the popover's was checked by a scratch test (the audit's corrections).
- **The suite runs in Chromium alone;** Firefox's and Safari's latest are not checked by it. The code uses nothing newer
  than `AbortSignal.any` (Firefox 124, Safari 17.4).
- **A flake, traced and fixed in the test:** `elements.browser.test.ts`'s "the festivals are shown 30 at a time" waited
  out its 10 s twice in this task's full runs (the page drawn, the focus not on `<main>`): the backdrop test before it
  ended on the step back, and the dialog's late close event gave the focus back to the search's button after the next
  page took it. The test now waits for both (`4fdd631`). An earlier full run reported one unnamed failed file, run with
  a scratch test of this task's (not kept) and not seen again: not traced, and not shown to be the same (an auditor saw
  three files fail at collection in a copy sharing Vite's cache, and pass on a plain run again).
- **Solid's comment markers:** a JSX piece leaves empty comments (`<!---->`) where it inserts an expression, which `h()`
  did not; they hold no text and no element, and the comparison of markup leaves them out (and attributes' order, which
  JSX's templates change).
- **The `h()` views' plumbing:** each view passes its signal to where it draws a piece, until 4.7 makes the views
  Solid's, and a signal per draw where it draws a part again (`redraws`). Closed by the audit: a piece drawn again
  within a view is no longer kept until the view is left (the audit's corrections).

## The audit's corrections

The audit of the finished task (seven auditors) found what follows, each verified against the code, fixed in the commit
that wrote the code, and each new test fail-checked: the fix undone, the test run and seen to fail, the fix put back.

- **A held piece whose reactive part throws halted Solid for the page** (`mount.tsx`'s `held` and `heldNodes`): the
  throw reached the `h()` view, but no boundary was above the root, so the router, the shell and every Solid view froze
  ("the page" said too, then nothing followed the address). The part is drawn in an `<Errored>` whose fallback keeps the
  error; once the root is made it is disposed and the error rethrown to the `h()` caller, whose `guarded` says it once,
  as before; a throw after the first draw is reported as "the page", as such a throw was (`ddef58b`).
  `held-broken.browser.test.ts` plants KUOF ending on a day no month has, opens an artist booked there, and sees the
  artists view say it once, then Sources drawn and the artist's page refused again. Fail-check: without the boundary,
  `Kiz Radar: the page: RangeError` and `[REACTIVITY_HALTED]` undeclared, the view's error said once of two.
- **A click on a roster's dotted text while the pointer was on it** took the card of names out of the flow without
  placing it again (the placing effect read `opened()` only when `over()` was null). Each change now places the card
  again: `changed` bumps the count the effect reads (`placings`), as a resize does (`ca8eead`). `gantt.browser.test.ts`
  hovers the text of a card with no room to float, clicks it, and sees it still in the flow. Fail-check: without the
  bump, `['true', false, 'absolute']` for `['true', true, 'static']`.
- **Held roots piled up until the view was left:** the Map's cards on each panel drawn again, the friends' list on each
  filter, a trip row's line of who goes on each toggle, the agenda (its rosters, their `over.ts` listeners, its cards)
  on each step of the months, a day's tags on each day the popover opened on. `mount.tsx`'s `redraws(signal)` gives each
  draw a signal the next one aborts (with the view's, `AbortSignal.any`), used by `map.ts`'s panel and
  `communities.ts`'s agenda (`ddef58b`), the friends' list, a trip row's line of who goes and, while the months were
  `h()`, the day's words (`d207297`), and the Festivals page in place of its own controller (`71f4300`); `held` called
  inside Solid makes its root under the owner it runs in, so a day's tags go as the popover's words are drawn for
  another day, and a roster's with the roster (`ddef58b`, `a23da9c`); a roster's line draws its names for the one group
  it uses (`ca8eead`). `held-redrawn.browser.test.ts` counts the page owner's roots after each of three draws of each
  part: the same each time. Fail-checks, all fixes undone: the Map 87, 127, 167; the friends 31, 43, 55; a trip row 28,
  32, 36; the agenda 34, 48, 62; the days 28, 36, 44. The roster's unused groups are not seen by the count (their roots
  are the roster's own), so they are held by construction alone.
- **A day's popover whose words throw** was shown open and empty. `months` keeps what the day says in a memo that
  catches the throw and hands it to the popover's boundary to say, and `open` closes the card when the day's words
  threw, so the popover stays hidden and its day undescribed, as before (`a23da9c`). Not testable through the page (open
  issues); a scratch test, not kept, with `dayDetail` throwing for 20 November, sees the error said once, the popover
  hidden and no `aria-describedby`, then 21 November shown again. Fail-check: with the old popover,
  `[false, 'day-pop-1']` for `[true, null]`. Unlike before, hovering the failing day again says nothing more (the words
  are not drawn again for the same day), and opening it closes another card that was open.
- **A closed card not placed again on a resize** was not pinned while another card was open (the deleted test's case):
  the test opens the roster's card of names after Escape closes the popover, then resizes (`a23da9c`). Fail-check:
  `over.ts` placing whenever any card is open (`open() !== null`) moves the popover from 76 px to 664 px.
- **`over.ts`'s listeners** searched what their card belongs to on every tap and focus change before asking whether it
  was open: each asks first, as `dismissable` did (`a23da9c`). No visible change; no test.
- **The seven `prefer-tag-over-role` suppressions** (`months.tsx` five, `marks.tsx`, `gantt.tsx`) were written up as
  false positives, with two wrong claims (a table's parts can be laid out by a grid; a `<fieldset>` may hold other
  content than a form's controls). They are kept for identical markup during the port, to revisit after 4.10, which
  their comments, `docs/lint-false-positives.md` ("The code means it") and `refactor-plan.md`'s row 4.10 now say
  (`71f4300`, `ca8eead`, `a23da9c`, the last commit).
- **A test read its expected value after the view changed:** `plans.browser.test.ts` takes the first name before the
  click (`d207297`). Fail-check: a click on the second name gives `P2` for `P1` (the old form, which read the literal
  `'P1'` once the dialog showed someone's plans, fails so too; it passed whoever was named, while P1 came first).
- **`heldNodes`' refusals:** a value neither nodes nor text was said to have "a reactive top"; it is now said as what an
  `h()` view cannot hold, and a reactive top is refused before the boundary, which would otherwise resolve it once
  (`ddef58b`, `d207297`).
- **Comments:** `months.tsx`'s calendar and its row in `docs/lint-false-positives.md` (Escape is `over.ts`'s); `bits.ts`
  `own` (a delegated stop ends Solid's walk and keeps the click from the document, not from a native listener between
  the control and the root); `body.ts`'s header names `held`, and `mount.tsx` imports `body.ts` itself; `placed.tsx`'s
  `Reported` lists the search's results and a day's popover; `dialog.tsx`'s header lists the quick views; `gantt.tsx`'s
  `changed`.

Found not to hold, or not changed: an auditor's suggestion to give `behind()` only to a line with an opener (its
listeners now return at once while the card is closed, and the old roster made one per line too); a missing boundary
around the months a step draws (no failure found; the calendar's held root now has one); `wording.ts`'s `V = Kid`
default (a nit, no defect).

## Done when

Every piece of row 4.6 is JSX, drawn by Solid in the Solid views and held by the `h()` views through `held`; the page
the same; `dismiss.ts` is gone with `page.browser.test.ts`'s test of it, `house/tests`' allowance and its fixture
narrowed; every other test passes; `mise run check` passes.
