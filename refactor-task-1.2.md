# Task 1.2: what tests need from `site/`, out of the view modules

Task 1.2 of [refactor-plan.md](refactor-plan.md). Status: done.

## Summary

Of the sixteen exports the plan named, one move is needed, for a node test that stays: `WIDE` leaves `dismiss.ts` (a
view) for a module of its own. `icons.ts` stays as it is and counts as a data module (below). Every other export a
browser test reads today is replaced, when its file moves onto the app helper (1.3 to 1.6), by what the page shows. One
of them is replaced now: `main.browser.test.ts`, already on the helper, stops calling `report.ts`'s `done`.

## Design model

A test reaches into `site/` for one of four reasons, and each has its own answer:

- **To build a page or read a row** (`festivals()`, `withDetails`, `cityEntries`, `citiesOf`, `friendsIn`, `eventCard`
  …). Through the app, the page is built by the router and the rows are planted before start; the test reads the page.
  These need no move. Three could not move anyway: `friendsIn` builds elements (`plans.ts:112`), `done` calls
  `report()`, which builds the alert line (`report.ts:10-19`), and `festivals()` needs `money`, `passes`, `plans` and
  `ui`, all mixed (`festivals.ts:4-16`).
- **To assert a constant** (`NEAR_KM`, `NAMED_UP_TO`, `PAD`, `SAID_MS`). The constant is a means; the page says what it
  means ("within 200 km of Oslo", "and 2 more", the oval under its tab, the label back after its time). The test asserts
  that.
- **To check that two sources agree** (`styles.test.ts:150`: the stylesheet's `@media` for floating cards equals the
  script's `WIDE`). A node test, with no page to open; it must import the constant, so the constant must live in a
  module that draws nothing.
- **To check the drawings** (`states.test.ts:60-64`, `styles.test.ts:157-162`: every feature has a `Drawing`, the paths
  of three of them). Node tests again: `icons.ts` must draw nothing on its own.

`icons.ts` draws nothing on import: its one write, `Drawing.into` (`icons.ts:121-124`), runs when a view calls it, takes
only the class's own SVG, and is the guarantee that no text from the data becomes markup (private constructor,
`lint/markup.grit` holding `innerHTML` to that file). The node tests already import it. Moving the write out would edit
its ten callers, which Phase 4 rewrites anyway (a Solid view sets the SVG itself), and split the guarantee across two
files. So the rule of 1.8 counts `icons.ts` as a data module, naming `into` as its one sink.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Which exports move | `WIDE` only | The one value a test that stays needs from a module that draws (`styles.test.ts`, a node test). Every browser test can read the page instead; row 1.2's "or the test asserts the visible outcome" is the route the owner's Q1 left open. |
| 2 | Where `WIDE` goes | A new `site/media.ts`, the media queries the script shares with the stylesheet | Defined in `dismiss.ts`, read by `gantt.ts` and `months.ts`: none is a pure module, and no pure module is about layout. Not on the coverage list, which holds modules of logic (`db`, `net` and the generated ones are off it too); a constant has none. |
| 3 | `icons.ts` | Stays; a data module for the test rule, `into` named as its one sink | Design model, above. The option of a `drawn.ts` writer was weighed and not taken: ten edits Phase 4 undoes, and the guarantee in two files. |
| 4 | The other ten | Not moved; recorded for 1.3 to 1.6, each with the visible outcome that replaces it | The table below. Of the sixteen: `WIDE` moves (1), `done` goes through the page (5), `Drawing`, `TRAITS`, `MORE_TRAITS` and `NOTE` stay in `icons.ts` (3), and ten are replaced. |
| 5 | `main.browser.test.ts`'s `done` | The promise test reaches `done` through the page: `navigator.clipboard.writeText` alone is made to refuse (`vi.spyOn`, restored after), the visitor opens Prague GOLD's card and copies its promo code, and the alert line names "copying the code". The code is the fixture's (`community.fixture.ts` takes the build's promo codes out and plants one, `FIXTURE_PROMO`, which the test checks was copied): the build's own codes come from `pipeline/promo_codes.csv`, which a test must not depend on | `details.ts:67-82` puts the copy in `done`; this is the contract (a promise left to run, its failure said with where) through a real path. The test then imports no view module. |
| 6 | The other query the script shares with the stylesheet | `ui.ts`'s reduced-motion query joins `WIDE` in `media.ts`, both as fields of one `MEDIA` object; a node test checks that every one is one of the stylesheet's `@media`, spelled the same | `media.ts` says it holds the queries the script shares with the stylesheet: true of both, and checked for every one, not only `WIDE` (a new query is checked when it is added). One object, so the test reads them all without a namespace import, which the lint refuses. |

What replaces each export left in place (for 1.3 to 1.6; the ledger records it as each test moves):

| Export | Test | What the page shows instead |
| -- | -- | -- |
| `festivals()`, `withDetails` | `views:406,444,2017`, `onnow:67`, `flights:59` | Ids from `community.fixture.ts`; crafted prices and fares planted; the card's line-up, "Who's going", airports and fare read on the page; a phase read on the day given to `open()`. |
| `friendsIn` | `views:2024` | The Now sentence names no friend going to Prague Kwanza on 2026-11-01. |
| `togetherHref` | `views:1806,1813,1848` | Links compared with `routes.ts`'s `friendsHref(…)`; the near/everywhere rule from a home planted before start. |
| `NEAR_KM`, `NAMED_UP_TO` | `views:1733,1780` | "within 200 km of Oslo"; five goers read "… and 2 more", four read all four names. |
| `citiesOf` | `map:16,29` | Two spellings of one city's key give one bubble, two keys of one name two, on the map. |
| `cityEntries` | `views:2062` | Searching "Munich" and "München" gives one city row. |
| `PAD` | `page:70,95,106,124` | The oval's box lies under its tab's. |
| `SAID_MS` | `views:489` | The label is back once the timers have run well past it. |
| `NOTE.into`, `CHEVRON.into` (not among the sixteen; `page.browser.test.ts` calls both) | `page:46,48` | A search dance row and the map's sheet handle each hold an `svg` with a `path` (`icons.ts` may be imported; the test need not). |

## Impact

- **`site/`**: `media.ts` new, its `MEDIA` holding `WIDE` and the reduced-motion query; `dismiss.ts` loses `WIDE`;
  `gantt.ts`, `months.ts` and `ui.ts` read `MEDIA`. No behaviour changes.
- **Tests:** `styles.test.ts` reads `MEDIA` (its comment on the floating cards named `ui.ts`: corrected) and checks
  every query in it against the stylesheet; `community.fixture.ts` takes the build's promo codes out and plants Prague
  GOLD's; `main.browser.test.ts`'s promise test goes through the page and says so when the card has no Copy button.
- **Docs:** the brief's module lists ("Which `site/` modules are views": `media` pure, `icons` a data module with one
  sink, `dismiss` without `WIDE`), which row 1.8 builds its allowed list from; `refactor-plan.md` rows 1.1, 1.2, 1.8;
  the ledger.

## Tests

- The move changes no behaviour: the suite is the check, and `styles.test.ts` still binds the floating cards' `@media`
  to `WIDE`.
- Every query in `MEDIA` is one of the stylesheet's (checked: misspelling the reduced-motion query fails it).
- The promise test fails if the page does not report the copy's failure as "copying the code" (checked: with the copy's
  `done` naming another place, it fails), and if the visitor's copy is not the fixture's code. The copy button is
  clicked as a DOM click, as the file's other controls are: Playwright's click timed out on it when the whole file ran,
  though the button was found and shown.

## Steps

One commit each:

1. The plan (this file) and the records of `refactor-plan.md`, the brief and the ledger.
2. `WIDE` and the reduced-motion query to `site/media.ts`, with the stylesheet check.
3. `main.browser.test.ts`'s promise test through the page, on the fixture's promo code.

## Done when

- No test that stays imports a value from a module that draws, except those 1.3 to 1.6 port (their imports are listed
  above with what replaces each).
- `mise run check` passes at each commit.
