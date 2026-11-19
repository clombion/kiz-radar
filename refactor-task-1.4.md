# Task 1.4: `onnow`, `flights`, `map` and `updating` through the app

Task 1.4 of [refactor-plan.md](refactor-plan.md). Status: done. The 15 tests are in six browser files (`onnow`,
`flights`, `map`, `updating`, `updating-late`, `updating-over`), with two new ones for the two map bugs the audit found;
`shipped.ts` is gone.

## Summary

Move the 15 tests of `onnow.browser.test.ts` (6), `flights.browser.test.ts` (5), `map.browser.test.ts` (2) and
`updating.browser.test.ts` (2) onto the app helper. Each file starts the real page once, on the fixture plus rows
planted before start, opens routes on the day each test means, and asserts what the page shows. No file loads the
shipped database by hand: `tests/site/shipped.ts` goes with its last two users. No file calls a view or builds a
festival row: `festivals()`, `withDetails`, `eventCard`, `sentenceView`, `citiesOf` and `updatingPage` give way to the
card, the Festivals page, the map's city panel and the updating page (task 1.2's table). `updating.ts`'s stored time
across a reload becomes a writing file and two reading files joined by one constant.

## Design model

- **One page per file, data fixed at start** (task 1.1). Today's files change the live database between reads
  (`UPDATE today` per day, a festival's options rewritten in memory, made-up prices on a card); each becomes rows
  planted before start, and the day given to `open(href, on)`.
- **A day is an argument of opening a page.** A phase read on four days is four opens;
  `vi.useFakeTimers({ toFake: ['Date'] })` and `UPDATE today` go.
- **A variant of a festival's fares is another festival's weekend.** Fares, searches and self-transfers are keyed by
  airport and weekend Friday, and a weekend shows only on its own festival's card and Flights: so "not searched",
  "direct, no price" and "reseller" are planted on three other fixture festivals in one file, each flying to the same
  three airports. The counterpart of 1.3's community rule; a variant of one festival's own days or price is still a file
  of its own.
- **What the page shows replaces what the code returned**: `phase` and `begun` become the card's "On now" tag, its
  flight and cost lines, and whether the Festivals page lists it; `options` and `fare` the Flights dialog's rows and the
  card's flight line; `citiesOf` the map's city panel.
- **Planted rows change what the build made**: UPDATEs of `events`, writes to `price_status`, `event_passes`,
  `pass_tiers`, `event_airports`, `airports`, `fares`, `fare_searches`, `fare_transfers`, `cities`, `meta`; never an
  INSERT into `events` (1.3). The writers live in `planted.ts` and check what they wrote.
- **Kept across a reload is two halves** (1.1, "The reload"): the writing file drives the page and asserts the storage
  entry equals the constant; a reading file starts with `storage` seeded from it and asserts what the page shows.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | File layout | `onnow`, `flights`, `map` keep their names, one start each; `updating` becomes `updating` (writes), `updating-late` (reads, past a quarter of an hour) and `updating-over` (reads, a load that succeeds) | Each file's plants agree with every assertion of the file (1.3's rule). The updating halves need a refused database, an entry seeded 16 minutes old, and a database that loads: three starts. |
| 2 | Onnow's festivals | The fixture's own: **on** Glasgow (Fri 6 – Mon 9 Nov); **ahead** KUOF; **Saturday** PARIS's row pinned in Oslo on 7–8 Nov, weekend Friday 6 Nov; **Thursday** Prague Kwanza, opened on 11 and 13 Feb 2027; **unpriced, on now** Cloudkiz, opened on 27 Feb 2027. Every other festival moved to 2031 (`movedAway`). Start day 2026-11-06 | A test names its festivals by the fixture's ids. A festival on whose flight is still to leave is a real Thursday start, not a crafted `begun: false`. |
| 3 | Prices on onnow's cards | `priced(db, id, 1240, 'NOK')` (one full pass on sale, `price_status` priced) for Glasgow, Saturday, KUOF, Kwanza, and a weekend fare each; `unpriced(db, CLOUDKIZ)` | The old crafted price and trip become rows, so the page computes them as for a visitor. |
| 4 | Flights' variants | Glasgow carries the base (GLA 210, one stop out, a reseller self-transfer at 150; EDI searched, no direct; ABZ 160 direct); on the same airports KUOF's weekend has no search, HOT Ice's has EDI searched without direct and ABZ direct without a fare, Cloudkiz's has ABZ at 160 resold by Widerøe; all four `unpriced`. Start day 2026-11-01. Cards and Flights opened on the map (`eventOnMapHref`), but F2's dialog on the Festivals page | The design model's rule; fallback a file per variant. F2 was moved to the Festivals page because, on the map, the Escape that closed the dialog also unpicked the map's festival, and took its card and the button the focus goes back to with it. That was a bug of the map (S1 below), now fixed and tested on the map by a test of its own; F2 stays on the Festivals page, where the same dialog shows. |
| 5 | "Checked … ago" | Exact: "checked 2 days ago" (searched 30 Oct, page day 1 Nov) | The day is pinned. |
| 6 | Map | Three cities of the test's own: `kizburg-de` "Kizburg", `springfield-de` and `springfield-2-de` both "Springfield". KUOF, Glasgow, HOT Ice put in Kizburg under the listing spellings "Kizburg", "Kizbourg", "KIZBURG"; Kwanza and Cloudkiz one in each Springfield. Read through `cityOnMapHref(key)`: the panel's heading, its "N festivals" and its cards | Readable without hovering: the panel is the city's group by key. Grouping by name would put two festivals on each Springfield; by spelling, Kizburg would split. |
| 7 | Bubbles as drawn | Besides the panels: with the map searched "Springfield", two bubbles in Leaflet's overlay pane | The bubble itself, though it is Leaflet's structure; recorded in the ledger as such. |
| 8 | The updating page | Plant `anotherBuild(db)` (`meta.built_at` changed): the database is refused and the updating page drawn; start resolves on it (1.1, M9) | The state a visitor gets mid-update; no export of `updating.ts` used. |
| 9 | The countdown | After start, `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })`; opening a view that waits for data draws the updating page again on the fake interval: "in 60 seconds", then "in 1 second." after 59 s; real timers back at the test's end; never advanced to 60 s (`location.reload()`) | The first draw's interval is a real one, already ticking. Measured: a finished file's page reloading itself does not break the run (M1 below). |
| 10 | The reload pair and its constant | `tests/site/reload.ts`: `UPDATING_SINCE = { key, at }` (a fixed UTC instant) and its stored value. **Writing** (`now: at`): the session entry equals key and value. **Late** (`now: at + 16 min`, session seeded): "Kiz Radar could not load", and no timer set. **Over** (a database that loads, session seeded): the entry is gone | The owner's decision of 19 November. With the clock pinned the stored value is the start instant exactly: an equality, stronger than today's "not null". 1.5 adds its token entry to the same module. |
| 11 | `shipped.ts` | Deleted in the commit that moves its last user | Its only users are onnow and flights; `samples.ts` stays (node tests use it). |
| 12 | Order of landing | map; updating with `reload.ts`; flights; onnow and `shipped.ts` deleted | Smallest plants first; writers land with their first user. |

Writers added to `planted.ts`, each checking what it wrote: `city`, `inCity(db, event, key, spelling)`,
`movedAway(db, kept)`, `priced`, `unpriced`, `newAirport` (its country one `countries` has),
`flies(db, event, [[code, km], …])`, `weekend(db, depart, airports, searches)` (its Friday a festival's weekend Friday),
`anotherBuild`.

## Impact

- **Rewritten:** the four files, importing no view module.
- **New:** `tests/site/updating-late.browser.test.ts`, `updating-over.browser.test.ts`, `reload.ts`.
- **Changed:** `planted.ts`; `seen.ts` (one home for card lookups: `cardTitles`, `cardTitled`, `mapCardOf`; the gantt's
  names card `ganttCardOf`); `community.fixture.ts` (`titleOf`); `app.ts` (a start or open() refused when a new alert
  line appeared during it; `hold()`); `refactor-ledger.md` (15 rows); `refactor-plan.md` (1.4 done).
- **Removed:** `tests/site/shipped.ts`.
- **`site/map.ts`:** two exports dropped (`citiesOf`, `Placed`, for knip), and two bugs fixed. **S1**: the map's Escape
  no longer unpicks the festival when the key closes a dialog over the map (Flights): it is ignored while a
  `dialog[open]` is in the document, which holds because the key goes down before the dialog's cancel. **S2**: leaving
  the map before the world outline arrives no longer says "Something went wrong (drawing the map: … aborted …)": a
  failure of `drawWorld` is dropped when the view's signal is aborted, and every other one is still reported.

New tests, which no ledger row holds (the ledger lists the old tests): in `flights.browser.test.ts`, "Escape closes
Flights over the map and leaves its festival picked, the focus back on its button" (S1); in `map.browser.test.ts`, first
of the file, "the map left before its world outline arrives says nothing went wrong" (S2), which holds the outline's
file with `app.hold()` until the map is left. Each fails without its fix. Without S2's fix the helper's new alert check
also refuses the open() after the map, and an existing map test failed on it as well, where a city's panel was left
before the outline came in.

## Tests

Every old test has a ledger row. Each new file passes alone and with the suite, three full runs in a row. Measured
before the commits:

- **M1** (done, 19 November): a test file whose page reloads itself two seconds after its test ended, run beside a file
  still running for six, leaves both passing.
- **M2**: does `priced()`'s full pass with no sale window read as on sale now ("1 240 kr full pass")? Checked with the
  first onnow test.

## Risks

1. **Fake `setInterval` and the helper's waits**: `open()` waits with `vi.waitUntil`, on Vitest's saved real timers;
   checked in the first run.
2. **Rates**: the "~1 \\d{3} kr" checks read the build's EUR→NOK rate, as today; pinned in the plant if fragile.
3. **The 91-day window**: onnow's Kwanza and Cloudkiz stay out of the start day's lists by 7 days; a wider window fails
   the lists loudly.
4. **Dialogs and history**: Flights is a peek that pushes a history entry: closed through the page and its popstate
   awaited (`shownDialog`).
5. **Leaflet**: the cards of onnow and flights, and all of map, open on the map; its first draw is slower.
6. **`updating-over`'s timing**: the entry is cleared once the data is in: read by polling.
7. **Hidden filter**: the On now checkbox sits in a panel the styled page hides: clicked as a DOM click.
8. **Real rows**: every festival named is a fixture festival pinned or moved away; cities are the test's own; only the
   rates remain the build's.

## Done when

The four files use the helper and import no view module; `shipped.ts` is gone; every old test has a ledger row; the
suite passes three times in a row and `mise run check` at each commit.

## Appendix: the porting map

Line numbers are the old files'. UNREACHABLE: cannot be read as written, with what replaces it.

| # | Test, line | View, route | Crafted or changed today; day | Asserts; reachable? | File; plant |
| -- | -- | -- | -- | -- | -- |
| O1 | on first day to last, still to attend, `onnow:49` | Festivals `festivalsHref({ reach: 'any', country: 'GB' })` | `UPDATE today` to 5, 6, 9, 10 Nov; SQL on `event_rows` | Phase and upcoming per day: UNREACHABLE as SQL; on 5 Nov Glasgow listed, untagged; 6 and 9 Nov tagged "On now"; 10 Nov not listed. Four opens | onnow; base |
| O2 | On now tag before its place, `onnow:90` | Map cards of Glasgow and KUOF | `festivals()`, `eventCard` | The tag on Glasgow's card, none on KUOF's | onnow |
| O3 | flight left from weekend's Friday, `onnow:95` | Map cards | `phase`/`begun`; crafted rows | Fields UNREACHABLE; on 6 Nov Glasgow tagged, "· already started, no flight priced"; Saturday untagged, "no flight priced"; KUOF "full pass + … flight"; Kwanza on 11 Feb 2027 (on, its Friday to come): "full pass + … flight" | onnow; Saturday, Kwanza, prices, fares |
| O4 | cost of one on leaves flight out, `onnow:107` | Map cards | crafted price, trip, fare | Glasgow: "full pass · already started, no flight priced", no "+"; Cloudkiz on 27 Feb 2027: "✈ already started, no flight priced"; KUOF adds its flight | onnow; `priced`, `unpriced` |
| O5 | filter keeps on today, in address, `onnow:136` | Festivals `festivalsHref({ reach: 'any' })` | `sentenceView` on a detached main; others moved to 2031 | Cards Saturday, Glasgow, KUOF; box unchecked and enabled; clicked: Glasgow alone, tag "On now ×", `onnow=1` in the address; that address opened again: checked, Glasgow; × back to three; `onnow: 2` unchecked | onnow; `movedAway` |
| O6 | none on today, filter off, `onnow:160` | `festivalsHref({ reach: 'any', country: 'NO' })` | — | Disabled, "On now only (none on today)", Saturday and KUOF | onnow |
| F1 | every airport, best fare, `flights:65` | Map card of Glasgow | `withDetails` row forced ahead | `options`/`fare` UNREACHABLE as objects (F2's rows); the card: "… to Aberdeen, then 199 km · Flights · 3" | flights; Glasgow's base |
| F2 | Flights lists every airport, `flights:79` | The card's Flights dialog | card appended by hand | Opener's popup and label; focus inside; GLA, EDI, ABZ "on the card"; the chosen one; "11 km from Glasgow · 1 stop out · checked 2 days ago"; EDI "no direct flight that weekend"; GLA's transfer line; links with "to ABZ on 2026-11-06 through 2026-11-09"; Escape closes, focus back | flights |
| F3 | not searched, flies nowhere, `flights:129` | KUOF's card and Flights | crafted options | "✈ flight not checked yet · Flights · 3"; three "not checked yet"; none chosen | flights; KUOF, nothing searched for 20 Nov |
| F4 | direct, no price on Google, `flights:164` | HOT Ice's Flights | ABZ fare nulled | "no direct flight that weekend", "direct, no price on Google" | flights; HOT Ice's 27 Nov |
| F5 | reseller's price, `flights:169` | Cloudkiz's Flights | ABZ fare resold | ABZ "~1 \\d{3} kr · reseller's price, likely cheaper from Widerøe"; GLA's none | flights; Cloudkiz's 26 Feb |
| M1 | one city one bubble, `map:15` | `cityOnMapHref('kizburg-de')` | `citiesOf` on crafted rows | Call UNREACHABLE; the panel: "Kizburg", "3 festivals", the three cards | map; `city`, `inCity` |
| M2 | two cities one name two bubbles, `map:28` | Both Springfield panels; the map searched "Springfield" | crafted rows | Each panel "1 festival" with its own card; two bubbles in the overlay pane (Leaflet's structure) | map |
| U1 | mid-update says how long, counts down, `updating:13` | The updating page | `updatingPage` on a detached div; fake timers | "Kiz Radar is being updated"; "up to ten minutes"; "in 60 seconds" then "in 1 second." under a fake interval; the stored entry equals the constant (writing half) | updating; `anotherBuild`, `now: UPDATING_SINCE.at` |
| U2 | past a quarter hour gives up, `updating:25` | The updating page | entry 16 min back; `updated()` called | "Kiz Radar could not load"; no "loads again by itself"; no timer set; `updated()` clearing the entry becomes a page that loads with the entry seeded: the entry gone | updating-late; updating-over |

## Reconcile (after the Skeptic pass: 4 gaps and 3 open decisions, all settled)

- **The map's spellings test nothing**: `event_rows` names a festival's city by `cities.name`
  (`coalesce(c.name, e.city)`, `build_site_db.py`), so a listing's spelling never reaches the page. Kizburg's three
  spellings stay as data a visitor's page would meet, recorded as true by the build's view; the two Springfields alone
  tell grouping by key from grouping by name. The panel's heading is read after its flag. The map file starts on
  2026-11-01.
- **`site/` changes by two words**: `citiesOf` and `Placed` lose their `export` in the map commit (knip), as 1.3's four
  did.
- **F5 keeps its negative check**: Cloudkiz's weekend has GLA's fare and its resold self-transfer too, so "GLA's line
  names no reseller" can fail.
- **The fare writers replace**: `weekend(db, depart, rows)` deletes the Friday's fares, searches and transfers at every
  airport it names, then writes the rows given (checking each); `weekend(db, depart, airports, [])` clears them, its
  check being the delete. `flies(db, event, …)` replaces the festival's airports. Glasgow and Saturday share their
  Friday (6 Nov): one `weekend` call holds both GLA's and OSL's rows, and Saturday flies from OSL.
- **"No timer set"** (late): after start, under a fake `setInterval`, opening the artists page (a view that waits for
  data, which draws the updating page again) leaves `vi.getTimerCount()` at 0, with the "loads again by itself" words
  absent.
- **13 February**: Kwanza opened on its Saturday reads "already started, no flight priced" (its Friday has gone): O3's
  begun-after-Friday case.
- **Bubbles**: counted in Leaflet's overlay pane, the two Springfields planted at distinct coordinates; tied to
  Leaflet's SVG markup, which the ledger says.
- **Real intervals**: the updating page may start more than one real reload countdown in its file's page; M1 shows a
  page that reloads after its file has ended leaves the run passing, and the updating files end in seconds.
