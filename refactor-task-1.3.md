# Task 1.3: `views.browser.test.ts` through the app

Task 1.3 of [refactor-plan.md](refactor-plan.md). Status: done: the 75 tests are in eighteen browser files and one node
test, each with its ledger row; the suite passed three full runs in a row.

## Summary

Move the 75 tests of `tests/site/views.browser.test.ts` onto the app helper (`tests/site/app.ts`): each starts the real
page once per file on the fixture plus rows planted before start, opens routes, and asserts what the page shows. The
file goes; about twenty files by view and by planted data take its place; no test imports a view module. The appendix
maps every test.

## Design model

- **One page per file, data fixed at start** (task 1.1). A test that today changes the live database between draws
  (`withTrips`, `withAdded`, `withStays`, direct writes: about 25 sites) needs its rows in the database the page loads.
  Rows that contradict another test's (one traveller's two trips to KUOF; Maja going and maybe) cannot share a page: the
  file boundary is where the data changes, not where the view does.
- **Files by data, grouped by view.** The map groups tests of one view whose plants agree, and splits where they
  contradict (appendix, "Contradicting plants"). Variants that add people to one community are merged when they can be
  planted as other communities of their own (39 and 40 as communities 2 and 3); variants that change a festival itself
  (KUOF cancelled) or one person's trip cannot.
- **What the page shows replaces what the code returned.** The replacement for each value a test read from a view module
  is task 1.2's table; the map's third column gives each assertion's form through the page, and names the few that
  change shape (made-up rows given to `ganttByPlace`, `whoLines`, `doingTag` become planted people, plans and stays).
- **Shared code is test code.** `tests/site/planted.ts` writes rows inside `plant` (trips, stays, added people,
  communities, people, a festival's days); `tests/site/seen.ts` reads the drawn page (the readers the old file defined
  inline, the KUOF opening with its three-frame wait, a viewport change restored at the test's end, the
  `#community/<key>` link spelled once). Each lands with its first user (knip), and holds no clone of another (jscpd).
- **Browser APIs a test replaces are narrowed to what it means**: a spy on `navigator.clipboard.writeText`, the
  `clipboard` getter for "no clipboard", an own `navigator.share` defined and removed; never the whole `navigator`.
- **State that lives for the file**: a choice kept for the visit (the roster by place), a viewport, a spy, an open
  dialog: each test that sets one puts it back (`onTestFinished`), and no test depends on another's order. A dialog
  closes through the page (Escape or its button) and is awaited, since frames share one history.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | File layout | One rule: **a variant of a community's added people is another community** in the same file (its members copied from community 1, its own added rows), since added people show on no other view; **a variant of a festival, of one person's trip or stay, or of who lives where, is a file of its own**, since each changes every view that shows it. The revised list is under "Reconcile" | Planting a copy of community 1 but for the rows under test leaves the base assertions true by construction; a festival or a trip is one row the whole page reads. |
| 2 | Where shared helpers live | `tests/site/planted.ts` (writes), `tests/site/seen.ts` (reads, viewport, community link); festival ids exported from `community.fixture.ts`; its festival `UPDATE` becomes a function `planted.ts` reuses | One home per kind; the fixture stays the one place that names its festivals. |
| 3 | Midnight (test 14) | `open(href, instant)` at 23:59 and 00:01, not fake timers | The helper owns the day; open's `on` is the visitor's clock. |
| 4 | Timers (test 17) | `vi.useFakeTimers({ toFake: ['setTimeout'] })` after the page is open; `SAID_MS` gone: advance well past it | 1.2's replacement; the helper refuses fake `Date` before an `on`. |
| 5 | Real rows a test counts (artists 4, resellers 74, Munich 75, festival 18766 in 47) | Pinned in the plant where an assertion counts them; read, not assumed, where it only names them | No test depends on the build's data changing (1.1's rule). |
| 6 | Assertions the page cannot show (the `today` table, `festivals()` goers, SQL in 58, 74, 75, `friendsTabs`) | Replaced by what the page shows, each recorded in the ledger with its new wording | 1.2's table; the map's column 3. |
| 7 | Test 1 (the fixture itself) | A node test of `plantCommunity` (`tests/site/fixture.test.ts`), on the built database | It tests the fixture, not a view, and needs no browser. |
| 8 | Order of landing | The appendix's commit order, smallest risk first; each commit moves its tests out of the old file and fills their ledger rows | Each commit passes `mise run check`; the old file shrinks until it goes. |

## Impact

- **New:** the appendix's test files; `tests/site/planted.ts`, `tests/site/seen.ts`.
- **Changed:** `tests/site/community.fixture.ts` (ids exported, festival update as a function, the "onDay" sentence of
  its header); `refactor-ledger.md` (the 75 rows); `refactor-plan.md` (1.3 done, the Phase 1 report).
- **Removed:** `tests/site/views.browser.test.ts`. `shipped.ts` stays (onnow and flights still use it, 1.4).
- **`site/`:** unchanged.

## Tests

Every old test has a row in the ledger naming its new test, or why it cannot be tested through the page. Each new file
passes alone and with the suite, three full runs in a row. Coverage of `site/**` is measured at the end of 1.3 against
the baseline (task 1.9 reports it).

## Risks

The appendix's section (d): view transitions (poll after a card toggles), the roster's three-frame measure, fake timers
only after start, navigator narrowed, dialogs closed through the page, the Leaflet map on two tests, state kept for the
file, the styled page at the default viewport, real rows, the address after a community page.

## Done when

- `views.browser.test.ts` is gone and no test imports a view module but those 1.4 to 1.6 port.
- Every old test has a ledger row.
- The suite passes three times in a row; `mise run check` at each commit.

## Reconcile (after the Skeptic pass: 7 gaps, all held)

- **Hidden conflicts inside a file**: test 27's trip (Cédric to HOT Ice from 19 November) makes the community's head
  read "to Oslo and Riga", which test 44 asserts is "to Oslo"; test 68's trip (Christina to KUOF from 9 November, 22:30)
  makes 9's Glasgow sentence "to Glasgow and Oslo". Each of 27 and 68 gets its own file. Rule for every file: its
  planted rows are checked against all of the file's assertions, not only against its other variants.
- **Files, revised** (each one start):
  - `artists`, `sources` (2, 3, 74), `search` (75), `friends` (57, 58, 60–62, 72), `festivals` (11, 14, 71, 73);
  - `community`: the base, plus communities 2 and up for every added-people variant: 69 (Maja maybe), 70 (all of KUOF's
    added maybe), 9 (five more to Glasgow), 24 and 26 (Ola to Paris and Albania), 44–49 (Maja to Riga), 47 (Maja to
    KizzEssence; 18766's days set by an `UPDATE`, which no community-1 assertion reads), 67 (two Annas), 39 and 40;
  - `community-off` (13: KUOF cancelled, HOT Ice gone), `community-hotice` (27), `community-late` (68);
  - `gantt` (TO_KUOF: 19, 23, 25, 37, 41, 42, 54, 55), `gantt-parties` (33, 36, 46 with), `gantt-apart` (38),
    `gantt-places` (51, 55 by place, 56, 65 focus ring), `gantt-way` (52, one file: Cédric two places, Christina three,
    within their nights), `gantt-halves` (53), `gantt-days` (66; 67's Annas are a community variant);
  - `plans` (59), `friends-far` (63).
- **Planted rows are UPDATEs of the build's events**, never INSERTs: `event_rows` joins `event_stats`, which the build
  computes (`build_site_db.py`), so an inserted event never shows.
- **75**: the search's city row says "N festivals coming up" (`search.ts:267`), not every festival: the plant reads
  Munich's upcoming count and its spellings, and the test asserts them. "Every city key appears once" over all cities is
  a property of `cityEntries` the page cannot enumerate: the ledger says so, and the Munich case stays.
- **63**: the peek's link follows where people live, not the tab shown: add Cédric's peek on the everywhere tab,
  `friendsHref({ with: 'cedric' })` with no `in`, so a link that copied the tab would fail.
- **16**: the share link is compared with `c/<key>/` spelled from the page's address, as the old test did, not with
  `communityHref`, which is what it tests.
- **71**: `friendsIn([kwanza]) === null` becomes "a list holding Prague Kwanza alone shows no friends line" (Siân only
  may go); the ledger records it (task 1.2's table proposed the Now sentence; this is tighter).
- **73**: Siân's maybe at Glasgow, with her travel booked, is read on Glasgow's card: "Who's going" counts her as going
  (2, no maybe), as the test's title says.
- **3**: the SQL page's count is read in the plant, before and after, exactly as before.
- **2**: re-asserted on the sources page (not pointed at another file's test).
- **The community link** is spelled once, in `seen.ts`; `main.browser.test.ts` imports it.
- **State kept for the visit**: 56, like 55, puts the roster's by-place choice back; 16 and 17 open the page again for
  each case, so a 2.5 s label timer from one cannot reach the next.

## Audit fixes (change audit of the port: six auditors, no test found weaker)

Folded into the port: every writer of `planted.ts` (and `pinFestival`) checks the rows it wrote and throws naming what
it missed, so a test of an absence cannot pass on a plant that never happened; a split test's two halves are each named
by what they check; Cédric's and Christina's KUOF trips are written once (`TO_KUOF`, `FLOWN`, `APART`), and a trip says
its airport (FMO for Cloudkiz, RIX for HOT Ice); the site's home city is read in one place (`homeOf`); the Kwanza check
has a positive control and reads the page's words; Friends rows are matched by one rule (`rowOf`), their On-now tag a
field, a tag's maybe its word; `said()` reads what is shown, `heard()` what a screen reader hears; a dialog's close
button is checked when the dialog opens; the share label is read at 2.4 s and 2.6 s; the fixture's node test also reads
the database the pages load; the readers' rows are typed as tuples.

## Appendix: the porting map

The map below predates the reconcile above, which wins where they differ (the file list above is the one built).

The survey of 19 November, read-only; line numbers are the old file's.

Read-only survey, 2026-11-19. Line numbers are `tests/site/views.browser.test.ts`. "Base" = the fixture as
`community.fixture.ts` plants it (KUOF 20-22 Nov, Glasgow 6-9 Nov, HOT Ice 26 Nov-1 Dec, Prague GOLD 14-18 Jan, Kwanza
11-15 Feb, Cloudkiz 26-28 Feb; Cédric/Christina/Siân living in bergen-no; Tonje, Ragnhild, Maja, Caroline added, Tonje
maybe at GOLD; travel rows for GOLD and Glasgow; no stays). Route names are `site/routes.ts` functions. `COMM(key, qs)`
= the older link `#community/<key>?<qs>` (routes.ts has no hash function for it; `communityHref` is a path link, which
`open()` refuses; `main.browser.test.ts` already spells the literal). KUOF=19033, GLASGOW=18964, HOT_ICE=17493,
GOLD=18666, KWANZA=18660, CLOUDKIZ=18760, PARIS=16904, ALBANIA=18734, RIGA=16246, KIZZESSENCE=18766 (not a fixture
festival: Cologne, 15-18 Jul 2027 in today's data).

Plant names used below (rows, written by the shared helpers of section (c)):

- **TO_KUOF**: travel cedric and christina, KUOF, arrive 2026-11-19T17:05 at OSL, leave 2026-11-23T09:40 from OSL; stays
  each 2026-11-19..2026-11-22 "Scandic Holberg".
- **FLOWN**: TO_KUOF's travel only, no stays. **APART**: stays cedric 19..22 "Scandic Holberg", christina 19..22
  "Comfort Xpress Oslo Sentrum".
- **PARTIES**: travel cedric as TO_KUOF (with his Scandic stay), christina KUOF 2026-11-20T08:00 OSL -> 2026-11-22T20:00
  OSL, no stay.
- **ADDED(names@festival)**: rows of `community_seeded`, status going unless said, community 1 unless said.

### The map

Columns: (1) view and route; (2) what it changes/crafts today, and the day; (3) what it asserts, and whether the page
can show it (UNREACHABLE = cannot be read through the page as written, with why and what replaces it); (4) file and its
planting.

| # | Test (abbrev.), line | (1) View, route | (2) Data changed / crafted; day | (3) Asserts; reachable? | (4) File; planting |
| -- | -- | -- | -- | -- | -- |
| 1 | fixture alone, :33 | none (reads `db`) | none; `loadShipped` | travel/stays/seeded/communities/plans/listed rows of the fixture. UNREACHABLE as a page fact: it reads the database itself. Replace by a read-only `plant` that runs the same SELECTs on the database the page is served (plant may read before it writes; decision 3 of 1.1) and asserts in the test; or a node test on FIXTURE_DATA | community.browser; read-only plant |
| 2 | wasm asked with a deadline, :62 | none | none | the wasm request has an AbortSignal. Reachable via `asked` (`init.signal`). Already `app.browser.test.ts` 09: ledger may point there; or re-assert from `asked` | sources.browser; none |
| 3 | SQL page changes its own copy, :67 | SQL page, `sqlHref()` | `exec('DELETE FROM events')` on the SQL copy | count before > 0; copy shows 0; views' db unchanged. `one()`/`exec()` calls UNREACHABLE; through the page: type `DELETE FROM events` in the "SQL query" textarea, Ctrl+Enter, then `SELECT count(*) FROM events` shows 0 in its table; then `open(festivalsHref())` (or `artistsHref()`) still lists festivals | sources.browser; none |
| 4 | artist list accents/case/no pattern, :83 | Artists, `artistsHref({q})` | crafted call `artistsView(root,[],qs)`; no day | names for q=elodie contain "Boki & Élodie"; ÉLODIE same; `%` and `o_a` none. Reachable: `.artist-row .name` after `open(artistsHref({ q: 'elodie' }))` etc. Real artist rows (not fixture): as today | artists.browser; none |
| 5 | community head, :205 | Community, `COMM(key)` | none; onDay 11-03, 11-07, 11-10 | h1, head sentence, Next line, share badge role/label/title/svg count, Now/Next on later days. Reachable: `open(COMM, '2026-11-03')` etc. | community.browser |
| 6 | before Glasgow, :251 | Community | none; 11-04 | next, now-tag, row open, first row, opened count, Glasgow strokes not past, week count. Reachable | community.browser |
| 7 | while Glasgow on, :263 | Community | none; 11-05, 11-06, 11-09 | Now tag, Next line, "Now Fri 6 - Mon 9 Nov", today's cell aria-current and ring, strokes of the week. Reachable | community.browser |
| 8 | after Glasgow, :288 | Community | none; 11-10, 11-13 | glasgowOn(...) object, period name "Nov...". Reachable | community.browser |
| 9 | sentence leaves ended trip, :304 | Community | `withAdded` Ola, Kari, Per, Nils, Eva @GLASGOW; 11-04, 11-10 | `.community-when` "6-9 Nov: 8 people, to Glasgow" then "20-22 Nov: 5 people, to Oslo". Reachable | community-glasgow.browser; ADDED(5@GLASGOW) |
| 10 | agenda, :313 | Community (+ embedded festival card) | none; 11-01 | headings, trip-when list, who lines, toggles open/close, aria-expanded/label/controls, HOT Ice name opens its line-up card, one festival card, place link = `eventOnMapHref(KUOF)`, members line, links = `personHref`. Reachable; the HOT Ice card opening may go through a view transition (risk d.1) | community.browser |
| 11 | added named only on community, :405 | Festival card, `eventOnMapHref(KUOF)` | crafted `festivals()` call; onDay 11-01 | KUOF goers = cedric, christina. `festivals()` UNREACHABLE (1.2: replaced): the card's "Who's going" names Cédric & Christina and no Tonje/Ragnhild/Maja | festivals.browser |
| 12 | chart drawn on first open, :410 | Community | none; 11-01 | `.gantt` only in first row; once after toggles; `.gantt + .gantt-said` order. Reachable | community.browser |
| 13 | cancelled / no longer listed, :422 | Community | `UPDATE events` KUOF cancelled=1, then listing=gone; 11-21 | listed: Now tag, no trip-off; cancelled: "This festival was cancelled.", no Now; gone: "no longer listed". Reachable, but three contradictory states. Split: listed part in base file; cancelled and gone in one file by planting KUOF cancelled and HOT Ice gone (HOT Ice's row says "no longer listed" on 11-21) | community.browser (listed); community-off.browser (KUOF cancelled=1, HOT_ICE listing=gone) |
| 14 | page open past midnight, :443 | Friends tab `friendsHref()` (needs an upcoming list) | `vi.useFakeTimers({toFake:['Date']})`, `setSystemTime` 2026-11-21 23:59 then 11-23 00:01; `freshDay()` | `freshDay()` and `SELECT day FROM today` UNREACHABLE (internal). `festivals()` phase UNREACHABLE (1.2). Replace: `open(friendsHref(), new Date(2026,10,21,23,59))` KUOF row has the Now tag; `open(friendsHref(), new Date(2026,10,23,0,1))` no KUOF row. Fake timers not needed (open's `on` is the midnight mechanism, M7) and must not be on (open refuses `on` under them) | festivals.browser |
| 15 | no community at link, :459 | Community, `COMM('no-such-community-here')` | crafted call | "No community at this link." Reachable | community.browser |
| 16 | share copies shared link, :463 | Community | `vi.stubGlobal('navigator', {clipboard})`; 11-01 | button text "Link copied"; writeText called with `c/<key>/` absolute. Reachable; replace the stub with `vi.spyOn(navigator.clipboard,'writeText').mockResolvedValue()` and hide `navigator.share` where the browser has one (risk d.4); expected URL `new URL(communityHref(key), document.baseURI).href` | community.browser |
| 17 | share fallback labels, :478 | Community | stubGlobal navigator x4; `useFakeTimers({toFake:['setTimeout']})`; `SAID_MS` | label after click and after SAID_MS for: copy ok, no clipboard, refused, share AbortError. Reachable. `SAID_MS` import goes (1.2): advance well past (e.g. 10 s). Narrow spies per case (d.4). Fake setTimeout installed after the page's open, removed in finally | community.browser |
| 18 | months: period, strokes, counts, :537 | Community | none; 11-01, 11-10 | captions, weekday heads, most=5 on 20-22, aria-label, no shade classes, legend, HOT Ice strokes' columns/from/on, counts, Prague dots, today ring, past cells. Reachable (class reads are of the drawn page) | community.browser |
| 19 | dot on a travelled day, :602 | Community | `withTrips(TO_KUOF)`; 11-01 | dots on 11-05, 11-19, 11-23, 2027-01-13; aria-label "Thu 19 Nov: 2 people travelling to Oslo". Reachable | gantt.browser; TO_KUOF |
| 20 | empty day does nothing, :615 | Community (styled) | `styled()` stylesheet inject; `inPage`; 11-01 | no data-day/tabindex, label, cursor not pointer, no popover; busy cursor pointer; December one stop. Reachable; `styled()` goes (page is styled) | community.browser |
| 21 | popover id per page, :635 | Community | two `communityPage` builds | ids differ between two pages; day described by it. Reachable: two `open(COMM)` calls | community.browser |
| 22 | month one keyboard stop, :650 | Community | `inPage`; 11-01 | arrows/Escape/click/pointerdown on body. Reachable (`focus()` and synthetic keydown on `document.activeElement`) | community.browser |
| 23 | day popover who/when/stay, :683 | Community | `withTrips(TO_KUOF)`; 11-01 | popover lines on 11-19/20/23; titles "Added by Cédric". Reachable | gantt.browser; TO_KUOF |
| 24 | two festivals at once, :709 | Community | `withAdded(Ola@PARIS)`; 11-01 | "November · 4 trips", Paris and KUOF rows, away 21=6, 19=1, two strokes, count 6 with title, popover names both. Reachable | community-paris.browser; ADDED(Ola@PARIS, Ola@ALBANIA) |
| 25 | opened trip Gantt, :762 | Community (Gantt) | `withTrips(TO_KUOF)`; 11-01 | KUOF axis, parties, bar times/left/width/fades, silent stroke, words, unsaid titles, Prague axis, Glasgow bars, HOT Ice unsaid couple. Reachable (inline style left/width read off drawn bars) | gantt.browser; TO_KUOF |
| 26 | Wed-Tue festival fills, :824 | Community `COMM(key,'from=2027-03')` | `withAdded(Ola@ALBANIA)`; 11-01 | May away counts, Albania axis W5..T11. Reachable (qs is carried by `#community/<key>?from=`, routeOf moves it) | community-paris.browser |
| 27 | phone months two a row, fortnight Gantt, :840 | Community at 390px | `styled`, `page.viewport(390,844)`, wrapper div 358px; `withTrips` cedric HOT_ICE 2026-11-19T10:00 -> 2026-12-02T18:00, no stay; 11-01 | HOT Ice axis 14; months side by side; no sideways scroll; Gantt \<= 358; cell >= 16. Reachable, but the crafted 358px wrapper goes: assert against the page (`document.documentElement.scrollWidth <= innerWidth`, gantt width \<= main's content width) | community-periods.browser; + travel cedric HOT_ICE |
| 28 | nothing to come, :864 | Community | none; 2028-01-01 | no "Most members", no months, "No trips coming up." Reachable | community.browser |
| 29 | popover beside month (computer), :897 | Community at 1200 | `atWidth`; 11-01 | popover shown, not over month, right of it, same top, focus stays. Reachable | community.browser |
| 30 | popover panel under row (phone), :916 | Community at 390 | `atWidth`; 11-01 | position static, under Nov/Dec before Jan, wider than month, legend moves, tap again closes. Reachable | community.browser |
| 31 | trip row vs card look, :944 | Community styled | crafts an `article.festival-card` to read the card style; 11-01 | rows no radius/shadow; trip-body has the card's radius/surface/shadow. Reachable, except the crafted reference card: read a real `.festival-card` instead (open a trip's line-up, test 10's card, or compare to the stylesheet's values) | community.browser |
| 32 | stroke swipe its own, stable, :974 | Community | two builds; 11-01 | swipe shapes equal across two draws, all distinct, pattern. Reachable (two opens) | community.browser |
| 33 | bars highlighter swipes, :992 | Community Gantt | `withTrips(PARTIES)`; 11-01 | bar times, ink pattern, distinct, stable across draws. Reachable | gantt-parties.browser; PARTIES + cedric CLOUDKIZ trip |
| 34 | stroke lower half, :1014 | Community | none; 11-01 | stroke height \<= 0.66, drop >= 0.18 (inline style). Reachable | community.browser |
| 35 | "5 people" no break, :1026 | Community | none; 11-01 | NBSP in sentence. Reachable | community.browser |
| 36 | bars level, :1033 | Community Gantt at 1200 and 390 | `plant/uproot(PARTIES)`, `atWidth`; 11-01 | 3 bars, width, rise \<= 2px. Reachable | gantt-parties.browser |
| 37 | bars thin, words for reader, :1100 | Community Gantt 1200 | `kuofAt` = `withStays([])`+`withTrips(TO_KUOF)`; 11-01; 3 rAF | ink height, times, words text, words box \<= 1px, aria-describedby, unsaid width. Reachable | gantt.browser |
| 38 | names card floats, :1186 | Community roster 1200 | `withTrips` apart (cedric 19T17:05->23T09:40 Scandic; christina 20T09:00->23T09:40 Scandic) + `withAdded(Ola,Kari@KUOF)`; 11-01; `userEvent.hover` | lines, floats absolute, in card, not over own line, 2 columns. Reachable | gantt-apart.browser; those trips + ADDED(Ola,Kari@KUOF) |
| 39 | names card in flow, :1204 | Community roster 1200 | `withTrips(TO_KUOF)` + `withAdded` 7 @KUOF; 11-01 | static, in card, not over line. Reachable | gantt.browser, on a planted community 2 (members cedric, christina, sian; added Tonje, Ragnhild, Maja + Ola, Kari, Per, Nils, Eva, Liv, Siri @KUOF); fallback: own file |
| 40 | "Everyone else" on demand, :1215 | Community roster 1200, 390 | `withTrips(TO_KUOF)` + `withAdded(Ola,Kari@KUOF)`; 11-01 | lines, unsaid, silent fades, label colour/dotted, names, inCard, floats by width, five states (click, Escape, hover, unhover), words. Reachable | gantt.browser, on planted community 3 (added Tonje, Ragnhild, Maja, Ola, Kari @KUOF); fallback: own file |
| 41 | stay beside/under, airports, :1264 | Community roster 1200, 390 | `kuofAt(TO_KUOF)` | beside/under/airports/head per width. Reachable | gantt.browser |
| 42 | roster ink = calendar ink, :1280 | Community styled | `kuofAt(TO_KUOF)` | background colour equal, ::after opacity, time colour, alpha limits. Reachable | gantt.browser |
| 43 | calendar four months, steps off, :1312 | Community | none; 11-04 | periodOf: said, months, steps disabled, agenda, head; step svg. Reachable | community.browser |
| 44 | steps through periods, address keeps it, :1329 | Community | `withAdded(Maja@RIGA)`; 11-04; saves/restores `location.href` | periods, months, agenda, steps on/off, address `c/<key>/?from=2027-03`/`07`, head unchanged, back to start, no `from=`. Reachable; the manual history restore goes (open() puts the address back) | community-periods.browser; ADDED(Maja@RIGA) + cedric HOT_ICE trip (for 27) |
| 45 | period in address, :1367 | Community `COMM(key, 'from=...')` | `withAdded(Maja@RIGA)`; 11-04 | from=2027-03/02/11, 2026-07 -> said. Reachable | community-periods.browser |
| 46 | trip with day in period, :1377 | Community | `withTrips` cedric CLOUDKIZ 2027-01-31T20:00 -> 2027-03-01T10:00; 2026-10-15 | agenda without, then with "February · 1 trip". Two states: split | community.browser (without, on 10-15); gantt-parties.browser (with, on 10-15) |
| 47 | trips only far off, :1390 | Community | `withAdded(Maja@18766)`; 2027-03-01 | "Nothing planned in Mar-Jun", step, "Jul - Oct 2027", "July · 1 trip". Reachable; 18766 is not a fixture festival: pin its title/dates/listing/city in the plant (its real dates can move) | community-glasgow.browser; ADDED(Maja@KIZZESSENCE) + festival 18766 pinned 2027-07-15..18 |
| 48 | step turning off moves focus, :1400 | Community | `withAdded(Maja@RIGA)`; 11-04 | focus on "Previous four months". Reachable | community-periods.browser |
| 49 | phone panel in later period, :1412 | Community 390 | `withAdded(Maja@RIGA)`; 11-04 | popover visible on 2027-09-04; step closes it. Reachable | community-periods.browser |
| 50 | steps on period line; month grid, :1429 | Community 390/600/1200 | `atWidth`; 11-04 | step middles within 1px; grid 2x2 or 1x4. Reachable | community.browser |
| 51 | two places beside / counted, :1492 | Community roster 1200, 390 | `kuofAt(FLOWN, APART)` | names, column text, words, no ellipsis; phone "2 places" button opens card by place, dotted. Reachable | gantt-places.browser; FLOWN + APART |
| 52 | one way with arrow; three places, :1530 | Community roster 1200 | two `kuofAt`: cedric alone 19T17:05->23T09:40 + stays Airbnb 19..19, Scandic 20..22; then + Airbnb 19, Thon 20, Scandic 21..22 | column "Airbnb -> Scandic Holberg"; words; "3 places", dotted. Two contradicting plants. Proposal: one file, the three-place way as christina's (travel 20T09:00->23T09:40, stays Airbnb/Thon/Scandic), read as the second line; fallback: split into two files | gantt-way.browser; cedric trip + 2 stays; christina trip + 3 stays |
| 53 | stroke is "there", :1554 | Community roster 1200 | `kuofAt` cedric arrive 19T17:05 only; christina stay 21..21 Comfort Xpress | names, strokes said/fades/at/title, no gantt-none/shared, no "?", masks differ, words. Reachable | gantt-halves.browser |
| 54 | axis is the calendar's, :1587 | Community roster 1200 | `kuofAt(TO_KUOF)` | axis classes, ::after content, font weight. Reachable | gantt.browser |
| 55 | by place from icon buttons, kept, :1605 | Community roster 1200 | `kuofAt(TO_KUOF)` (no choice); `kuofAt(FLOWN, APART)`; a second community inserted (`communities` id 2 'quiet-amber-fjord-lark', members cedric, christina) and deleted | no choice with one place; buttons pressed/labels/svg; by place lines, strokes, words; redrawn still by place; other community by travel; click back. Reachable. "Kept for the visit" is the app's memory/storage: through the page, open the page again (it is drawn again) and read the pressed button; the restoring click at the end must stay, as the choice outlives the test in the file (d.7) | gantt.browser (no choice); gantt-places.browser (rest; community 2 planted) |
| 56 | by place, own nights in names, :1672 | Gantt by place | crafted: `ganttByPlace({...})` over `byPlace(goes)` of five made-up people (Ann, Bo, Cy, Di at Scandic 19..22; Nora 20..22) | count "5 people"; names card "Nora · Fri-Sun"; nights. UNREACHABLE as written (calls a view with crafted rows). Through the page: plant people Ann, Bo, Cy, Di, Nora with KUOF plans and those stays, plus one more member (e.g. Ed, stay "Thon") so the by-place choice exists (>= 2 places), all in a planted community 3; open its page, choose By place, open the Scandic line's "5 people" | gantt-places.browser; community 3 + people + plans + stays |
| 57 | Friends tab list, :1728 | Friends `friendsHref()` | none; 11-04 | who sentence, Next line, month head, Glasgow line, going present, no bar; `NEAR_KM`=200 and `friendsTabs()` labels. `homeOf()` (SQL) and `NEAR_KM`, `friendsTabs()` UNREACHABLE as imports: read the tabs' text ("Near Bergen", "Everywhere") on the page; the 200 km is test 63's | friends.browser |
| 58 | festival on now in Friends, :1748 | Friends | `one(sql ... event_rows)` for Glasgow's start; onDay that day | now-tag row Glasgow; "Now: Glasgow (2) · Next:"; none on 11-04. SQL read UNREACHABLE: use the fixture's day 2026-11-06 (Glasgow's first day, community.fixture.ts) | friends.browser |
| 59 | line names up to four, :1759 | Plans' lines in Friends | crafted `whoLines(...)` with five made-up goers and a booked teacher; `NAMED_UP_TO` | "P1, P2, P3 and P4"; "P1, P2, P3 and 2 more"; ticked p5 first; teacher line first; NAMED_UP_TO=4. UNREACHABLE as written. Through the page: plant people p1..p5 (featured, home = cedric's home read in the plant) going: p1..p4 to KUOF (where Cédric & Christina teach: the teaching line first), p1..p5 to PARIS; read Friends rows: KUOF "teaching: Cédric & Christina", "going: P1, P2, P3 and P4"; Paris "going: P1, P2, P3 and 2 more"; `friendsHref({with:'p5'})` Paris "going: P5, P1, P2 and 2 more" | plans.browser |
| 60 | ticked friends, any, none, :1783 | Friends `friendsHref({with, any})` | none; 11-04 | Glasgow for christina,sian; none message; "0 of 6 festivals in common"; link shows all; any=1; bar shown with a filter. Reachable | friends.browser |
| 61 | name opens peek, :1798 | Friends, peek dialog | appends root; closes `dialog.peek` | links "See their page" = `personHref('sian')`; "Festivals in common" = `togetherHref(['sian'])`; couple -> `togetherHref(['cedric','christina'])`. `togetherHref` import goes (1.2): compare with `friendsHref({with:'sian'})`, `friendsHref({with:'cedric,christina'})`. Dialog pushes history (modal.ts): close through the page and wait for it to shut (d.5) | friends.browser |
| 62 | narrows by name/city/time, :1821 | Friends `friendsHref({q / when})` | none; 11-04 | prague 2 rows, accent-insensitive, weekend Glasgow, months fewer. Reachable | friends.browser |
| 63 | within 200 km, Everywhere, :1829 | Friends (near, `in=everywhere`) | inserts city 'elsewhere-no' at home lat +1.62 and +2.07; moves Siân there; `togetherHref` checks | Siân near at ~180 km, not at ~230; togetherHref near/everywhere; Glasgow line with/without Siân. Two contradicting plants: keep Siân at +2.07 and add a probe person (e.g. Ola, featured, a RIGA plan) at +1.62, so one file holds both. togetherHref UNREACHABLE as import: read Siân's peek link on `friendsHref({in:'everywhere'})`, expect `friendsHref({in:'everywhere', with:'sian'})` (the old pair ['cedric','sian'] has no click that makes it: a peek ticks one person or one couple) | friends-far.browser; cities + people.home + probe person |
| 64 | added said to a screen reader, :1860 | Community | none; 11-01 | shown text, hidden "(added by Cédric)". Reachable | community.browser |
| 65 | day gone by struck; view switch focus, :1880 | Community styled | `styled`; 11-10; crafts `div.gantt-views > button` into the page | line-through, contrast >= 4.5, travelled weight 650, bar font >= 0.7rem; crafted switch focus ring. Crafted switch UNREACHABLE: use the real switch, which needs two places (APART) | community.browser (day/bar parts); gantt-places.browser (focus ring on the real "By place" button) |
| 66 | day without time drawn whole, :1908 | Community Gantt | `withTrips` cedric, christina KUOF 2026-11-20 -> 2026-11-22 (days alone); 11-01 | bar left 0, width 100, fades both. Reachable | gantt-days.browser |
| 67 | two Annas, :1924 | Community | `withAdded(Anna, Anna @KUOF)`; 11-01 | away 21 = 7; "There" line has two Annas. Reachable | gantt-days.browser |
| 68 | leaves one, flies to another, :1944 | Community popover | `withTrips` christina KUOF 2026-11-09T22:30 -> 2026-11-23T09:40; 11-01 | popover 11-09: "Flying out: Christina 19:10 ABZ", "Flying in: Christina 22:30 OSL". Reachable | community-glasgow.browser |
| 69 | maybe tag, counted apart, :1962 | Community | `UPDATE community_seeded` Maja maybe at KUOF (restored); 11-01 | GOLD who line, tags, opened counts, roster tag, words; with Maja maybe KUOF line; Kwanza "Siân maybe". Split | community.browser (GOLD, Kwanza parts); community-maybe.browser (Maja maybe @KUOF) |
| 70 | count going not maybe, :1992 | Community | `UPDATE community_seeded` all KUOF added maybe (restored); 11-01 | GOLD day counts 2, popover text and tag, Kwanza 0; sentence 5 then Glasgow 3. Split | community.browser (first half); community-unsure.browser (all KUOF added maybe) |
| 71 | card and Friends say maybe apart, :2016 | Festival card `eventOnMapHref(KWANZA)`; Friends | crafted `festivals()`, `eventCard(row,{open:true})`, `friendsIn([kwanza])`; 11-01 / 11-04 | goers sian maybe; "Siân may go"; "Who's going0 · 1 maybe"; tag; friendsIn null; Friends row "maybe: Siân". Card parts reachable on the map card (it opens). `festivals()` goers UNREACHABLE (internal rows): the card says it. `friendsIn` UNREACHABLE: it is the Festivals page's friends line (sentence.ts:327); nearest visible form: on `festivalsHref({country:'CZ', when:'year'})` the friends line names Cédric & Christina (GOLD) and never Siân; uncertain whether real CZ festivals alter "N of these" (assert the names only) | festivals.browser |
| 72 | person page, :2029 | Person `personHref('sian')`, `personHref('nobody')` | crafted `personView`; onDay 11-04 | h1, cards > 0; "No one by that name has shared plans." Reachable | friends.browser |
| 73 | line-up teaches whatever plan, :2039 | (unit) `doingTag`, `unsure` | crafted rows | "teaching"/false; "maybe"; "going". UNREACHABLE as written (pure functions over crafted rows; `rows.ts`'s `unsure` is a data module a node test could keep). Through the page: plant Siân's Glasgow plan maybe (she is in its line-up as teacher): Glasgow's card and the Friends row still say "teaching: Christina and Siân" with no maybe tag, and she is counted going; the maybe and going words are test 71's and the base. Or keep a node test of `unsure` in `rows.test.ts` | festivals.browser; plans: sian GLASGOW status=maybe |
| 74 | sources names no reseller/maker, :2047 | Sources `sourcesHref()` | `exec('SELECT DISTINCT reseller FROM ticket_pages')`; crafted `sourcesView` | "a reseller's" present; no kiwi/claude/anthropic/reseller names in text or link hrefs. The reseller list via `exec` UNREACHABLE: read it in the plant (read-only SELECT before start, kept in a closure; fixture today: "Kizzbee") | sources.browser; read-only plant |
| 75 | search lists a city once, :2061 | Search dialog (`#search-btn`, combobox) | crafted `cityEntries()`; `one(sql count munich-de)` | unique keys; Munich once, key munich-de, count = events. `cityEntries()` UNREACHABLE (1.2: replaced): type "Munich" and "München": one city row each time, same row. The expected count read in the plant (read-only), or pinned by planting two events with city "Munich"/"München" and city_key munich-de (deterministic; today 6 events, 2 spellings) | search.browser; read-only or pinning plant |

### (a) The proposed files (superseded: the files built are the Reconcile's)

All under `tests/site/`, each `const app = await startSite({...})` once, no view import, links from `routes.ts`
(community by the shared `COMM` helper). `storage` is empty unless said. 21 files, ~0.75 s start each, run in parallel.

| File | `now` | `plant` | `storage` | Tests |
| -- | -- | -- | -- | -- |
| artists.browser.test.ts | 2026-11-01 | none | none | 4 |
| sources.browser.test.ts | 2026-11-01 | read-only: `SELECT DISTINCT reseller FROM ticket_pages WHERE reseller IS NOT NULL` into a closure | none | 2, 3, 74 |
| search.browser.test.ts | 2026-11-01 | read-only count of events with city_key munich-de and their distinct spellings (or pin two events as Munich/München) | none | 75 |
| friends.browser.test.ts | 2026-11-04 | none | none | 57, 58 (on 11-06), 60, 61, 62, 72 |
| festivals.browser.test.ts | 2026-11-01 | `UPDATE plans SET status='maybe'` for sian @GLASGOW | none | 11, 14 (instants 11-21 23:59 and 11-23 00:01), 71, 73 |
| community.browser.test.ts | 2026-11-01 | read-only fixture SELECTs of test 1 (no writes) | none | 1, 5-8, 10, 12, 13 (listed), 15-18, 20-22, 28-32, 34, 35, 43, 46 (without; 10-15), 50, 64, 65 (day part; 11-10), 69 (GOLD/Kwanza), 70 (first half) |
| community-off.browser.test.ts | 2026-11-21 | KUOF `cancelled=1`; HOT Ice `listing='gone'` (KEY.listing.GONE) | none | 13 (cancelled, gone) |
| community-maybe.browser.test.ts | 2026-11-01 | `community_seeded` Maja @KUOF status maybe | none | 69 (Maja part) |
| community-unsure.browser.test.ts | 2026-11-01 | `community_seeded` every @KUOF status maybe | none | 70 (second half) |
| community-periods.browser.test.ts | 2026-11-04 | ADDED(Maja@RIGA); travel cedric HOT_ICE 2026-11-19T10:00 OSL -> 2026-12-02T18:00 OSL, no stay | none | 27 (on 11-01), 44, 45, 48, 49 |
| community-paris.browser.test.ts | 2026-11-01 | ADDED(Ola@PARIS), ADDED(Ola@ALBANIA) | none | 24, 26 |
| community-glasgow.browser.test.ts | 2026-11-04 | ADDED(Ola, Kari, Per, Nils, Eva @GLASGOW); travel christina KUOF 2026-11-09T22:30 OSL -> 2026-11-23T09:40 OSL; ADDED(Maja@KIZZESSENCE) with 18766 pinned (title, 2027-07-15..18, Cologne, DE, listed, not cancelled, city_key) | none | 9, 47 (on 2027-03-01), 68 (on 11-01) |
| gantt.browser.test.ts | 2026-11-01 | TO_KUOF; community 2 (key e.g. 'still-birch-harbor-wren', members cedric, christina, sian, manager cedric; added Tonje, Ragnhild, Maja, Ola, Kari, Per, Nils, Eva, Liv, Siri @KUOF); community 3 (members as 2; added Tonje, Ragnhild, Maja, Ola, Kari @KUOF) | none | 19, 23, 25, 37, 39 (community 2), 40 (community 3), 41, 42, 54, 55 (no choice) |
| gantt-parties.browser.test.ts | 2026-11-01 | PARTIES; travel cedric CLOUDKIZ 2027-01-31T20:00 -> 2027-03-01T10:00, no stay | none | 33, 36, 46 (with; 10-15) |
| gantt-apart.browser.test.ts | 2026-11-01 | travel cedric 19T17:05->23T09:40, christina 20T09:00->23T09:40, both stays Scandic; ADDED(Ola, Kari @KUOF) | none | 38 |
| gantt-places.browser.test.ts | 2026-11-01 | FLOWN + APART; community 2 'quiet-amber-fjord-lark' (cedric, christina); community 3 with people Ann, Bo, Cy, Di, Nora, Ed (featured 0 or 1, no home needed), KUOF plans, stays Scandic 19..22 (Nora 20..22), Ed "Thon" 19..22 | none | 51, 55 (by place), 56, 65 (focus ring) |
| gantt-way.browser.test.ts | 2026-11-01 | travel cedric 19T17:05->23T09:40, stays Airbnb 19..19, Scandic 20..22; travel christina 20T09:00->23T09:40, stays Airbnb 20..20, Thon 21..21, Scandic 22..22 | none | 52 (fallback: two files) |
| gantt-halves.browser.test.ts | 2026-11-01 | travel cedric KUOF arrive 19T17:05 OSL only; stay christina 21..21 "Comfort Xpress" | none | 53 |
| gantt-days.browser.test.ts | 2026-11-01 | travel cedric, christina KUOF 2026-11-20 -> 2026-11-22 (no times, no airport); ADDED(Anna, Anna @KUOF) | none | 66, 67 |
| plans.browser.test.ts | 2026-11-04 | people p1..p5 (names P1..P5, featured 1, home = cedric's home read in the plant); plans going: p1..p4 @KUOF, p1..p5 @PARIS | none | 59 |
| friends-far.browser.test.ts | 2026-11-04 | city 'elsewhere-no' (home's country, lat home+2.07, lon home); sian.home = it; city 'near-no' at lat +1.62; person Ola (featured 1, home near-no, plan going @RIGA) | none | 63 |

Note on gantt-way: the three-place line must stay within the person's own nights; christina 20T09:00 -> 23T09:40 has
nights 20, 21, 22, so "Airbnb 20..20, Thon 21..21, Scandic 22..22" gives "3 places". If the merge reads awkwardly, split
into gantt-way (cedric two places) and gantt-three (cedric three places), each one plant.

### (b) Contradicting plants, and why they are apart

- Base vs every file that adds people, trips or states: base tests assert exact counts and lists (agenda "November · 3
  trips", most = 5 on 20-22, no dot on 19 Nov (no KUOF travel), KUOF who line "Tonje, Ragnhild and Maja going"; steps
  both off; Glasgow count 3).
- 13: listed vs cancelled vs gone are three states of KUOF; kept as base (listed) + one file using two festivals.
- 69 (Maja maybe) vs 70 (all three maybe): the KUOF who line needs Tonje and Ragnhild going; 70 needs them maybe.
  Neither fits base (KUOF line, sentence 5).
- 19/23/25 (TO_KUOF) vs 33/36 (PARTIES): christina's KUOF travel differs (17:05 with Cédric vs 08:00 alone; stay vs
  none). vs 38 (apart): both trips differ and two more added. vs 51/55b (FLOWN+APART): stays differ (Comfort vs
  Scandic). vs 52, 53, 66, 68: cedric/christina KUOF travel is one row per person and festival (primary key), each
  different.
- 39 vs 40 vs 25: same trips, different added at KUOF (10, 5, 3) on community 1: merged only by planting communities 2
  and 3 (added rows are per community); otherwise three files.
- 24 (Ola@Paris) vs base and TO_KUOF: "4 trips", away 19 = 1 (TO_KUOF puts Cédric and Christina in Oslo on 19th; 68's
  christina trip from 9 Nov too; PARTIES' cedric too).
- 26 (Albania in May) vs 44/45 (Riga): 44 asserts "Nothing planned in Mar-Jun"; Albania is in May. vs base 43 (steps
  off).
- 47 (KizzEssence in July) vs 44: Jul-Oct agenda would gain "July · 1 trip"; vs 26: Mar-Jun "Nothing planned".
- 27 (cedric HOT Ice from 19 Nov) vs 25 (HOT Ice unsaid "Cédric & Christina"), 19 (dot list), 24 (away 19).
- 9 (+5 Glasgow) vs base 5/6 (sentence "5 people, to Oslo" on 11-03/04), 67 (two Annas change the 11-10 sentence to 7).
- 46 with vs without the Cloudkiz trip: split across base and gantt-parties.
- 56 people at KUOF vs 51/55b's exact by-place lines: kept apart by putting them in community 3 only.
- 59 (five more near people) vs 57 (who line names three) and vs 63 (who line must still name Siân/Ola).
- 63 Siân far vs 57/60/61 (Siân near: Glasgow "Christina and Siân", common festivals). 1.62 vs 2.07 contradict each
  other: one file by a probe person.
- 73 (Siân Glasgow maybe) vs base Glasgow tests: should be invisible if the rule holds, but would couple every Glasgow
  assertion to it: kept in festivals.browser, where no Glasgow layout is asserted.

### (c) Shared helpers (tests/site/, never site/)

One module each, so jscpd sees no clones between the 21 files; knip: export only what a file imports.

1. **tests/site/planted.ts** (writes on the plant's `Database`, used only inside `plant`):
   - `trips(db, rows: [key, event, arrive|null, leave|null, stay|null][])`: today's `plant()` SQL (OSL when a time is
     given, stays from arrival night to the night before leaving).
   - `stays(db, rows: [key, event, first, last, place][])`.
   - `added(db, rows: [name, event, status?][], community = 1)`: ids after `max(id)`.
   - `community(db, { id, key, name, manager, members, added })`: rows in `communities`, `community_members`,
     `community_seeded`.
   - `person(db, { key, name, home, featured, plans: [event, status][] })`.
   - `pinned(db, id, { title, start, end, city, country, friday })`: the fixture's festival UPDATE, shared with
     `plantCommunity` (move that statement into a function exported from community.fixture.ts).
   - `homeOf(db)`: the home key, lat, lon read from cedric's row (the fixture sets it).
   - Constants: `TO_KUOF`, `FLOWN`, `APART`, `PARTIES`; festival ids exported from `community.fixture.ts` (today only
     `PRAGUE_GOLD` is; KUOF etc. are local consts there).
2. **tests/site/seen.ts** (reads of the drawn page; no writes): `said`, `heard`, `titled`, `agendaRow`, `cellOn`,
   `awayOn`, `countOn`, `strokesOn`, `monthsOf`, `popover`, `press`, `focusedDay`, `ganttOf`, `opened`, `linesOf`,
   `cardOf`, `periodOf`, `step`, `listOf` (Friends), `collectiveOf`, `kuofOpen()` (open KUOF and wait 3 frames, from
   `kuofAt`), `atWidth(w)` (`page.viewport`, restored by `onTestFinished`), and `COMM(key, params?)`, the one place that
   spells `#community/<key>` (built with `URLSearchParams`, as routes.ts does).
3. **Share stubs** (in seen.ts or a small `tests/site/browser.ts`): `copying(result)` =
   `vi.spyOn(navigator.clipboard, 'writeText')`; `noClipboard()` =
   `vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({})` (still "in" navigator, writeText not a function -> the
   "no clipboard" branch, people.ts:67-69); `sharing(fn)` and `noShare()` = an own `navigator.share` property defined
   configurable and deleted in `onTestFinished`. All restored per test.
4. Not needed any more: `onDay`, `inPage`, `styled`, `withTrips`/`plant`/`uproot`, `withAdded`, `withStays`,
   `communityPage`, `friendsTab`, `homeOf` via `site()`.

### (d) Risks

01. **Animations / view transitions.** `eventcard.ts:164-195` opens and closes cards inside `startViewTransition`, so
    the DOM changes after a frame, not on click; test 10 (HOT Ice name opening its card) and any card toggle need
    `expect.poll`. Tabs slide by view transition too (`tabs.ts:152`), only on swipes. CSS transitions (site.css:563,
    664, 1507...) can make `getBoundingClientRect` read mid-transition in 29, 30, 38-40, 50: read after a frame or two,
    or after `transitionend`. Consider whether the page honours reduced motion (`calm()`), which would make transitions
    instant; the helper has no switch for it (and "A styles switch" was an option not taken).
02. **Roster measuring.** `kuofAt` waits three `requestAnimationFrame`s for the roster to measure and place
    (dom.ts:155). Keep that wait in `seen.ts`; in a frame without the window's focus rAF still runs in Chromium, but a
    hidden frame may throttle it: watch for flakes.
03. **Fake timers.** Only 17 (setTimeout, after start) keeps them; 14 drops them for `open(href, instant)`. Install
    after the page is open; never fake `Date` before `open(..., on)` (refused). 1.2 says drop `SAID_MS`: advance well
    past it. Today's tests mix `vi.useRealTimers()` in `finally`: keep that, as the helper's clock comes back only that
    way.
04. **navigator stubs.** `vi.stubGlobal('navigator', …)` (16, 17) replaces the whole navigator (userAgent, clipboard,
    share, everything the page reads) and must go: spy on `navigator.clipboard.writeText`; for "no clipboard" spy the
    `clipboard` getter; for share, define/delete an own `share`. Headless Chromium on Linux has no `navigator.share`,
    macOS Chromium has one: without hiding it, 16 would open a real share sheet on a developer's Mac. If
    `vi.spyOn(navigator,'clipboard','get')` cannot reach the prototype getter,
    `Object.defineProperty(navigator, 'clipboard', { configurable: true, get })` then delete. The clipboard permission:
    main.browser's spy shows writeText exists in the frame.
05. **Dialogs and shared history.** The peek (61) and the search dialog (75) push a history entry (modal.ts:44) and
    close with `history.back()` (modal.ts:23). Frames share one session history: close through the page (Escape or its
    close button, not `dlg.close()` by hand mid-flight) and wait for the dialog to be gone (and its popstate) before the
    test ends, or another file's `history.back()` may land on this entry (the 1.1 dialog-history failure).
06. **Leaflet map.** Only 11 and 71 open `eventOnMapHref`: the map view loads Leaflet and the world file
    (`/vendor/countries-50m.json`) through the helper's fetch; read the card, not the map; allow for the map's first
    draw being slower (open's 10 s limit). main.browser's promise test already opens Prague GOLD's card this way.
07. **State that outlives a test in one file.** One page per file: the by-place choice (55, "kept for the visit"), hints
    (`hints.ts`), the currency, period step, open dialogs, `page.viewport` and spies persist to the next test. 55 must
    keep its restoring click; every viewport change restored by `onTestFinished`; tests must not depend on order.
08. **Styled page.** Every test now runs styled (decision 9). Tests that built detached, unstyled roots (most) read
    `hidden`, `textContent` and inline styles, which do not change, but anything read with `checkVisibility`, computed
    style or boxes now sees the stylesheet at the default viewport (the tests restore 414x896, so likely that) - e.g.
    37's `.gantt-said` width, 41's `checkVisibility`. Check the default viewport of the browser project before porting
    the layout tests.
09. **Crafted rows and crafted DOM.** 56, 59, 73 call views/helpers with made-up rows; 31 and 65 craft DOM to read
    styles; 27 crafts a 358px wrapper. Each needs a planted equivalent (above); 56 and 59 need people, plans and
    communities planted correctly (featured, home, membership) or the lines will not appear. Their assertions change
    shape (e.g. "going: P1, ..." with a label), so the ledger should record the new wording.
10. **Real (non-fixture) rows.** 4 (artists Boki & Élodie, Rosa), 74 (resellers), 75 (Munich), 71's CZ friends line and
    47's 18766 depend on real data; pin in the plant where an assertion counts them (75, 47).
11. **Address after a community page.** The page moves `#community/<key>` to `c/<key>/`; open() puts the start's address
    back each time. 44 reads `location.pathname`/`search` after steps: read before the next open().
12. **Build artifacts.** All files need `public/vendor/` (mise run build:site), as the helper already does.

### Commit order (superseded: the chunks built were artists, sources and search; Friends and festivals; the community page; its variants; the rosters, plans and far friends)

Each commit moves its tests out of views.browser.test.ts, adds their ledger rows, and passes `mise run check`. The
helpers land with their first user (knip refuses unused exports).

01. artists.browser + sources.browser + search.browser (base data, read-only plants, no timers, no layout; adds
    `seen.ts` with `said` only). Risk: the SQL page interaction and the search dialog's history entry (d.5).
02. friends.browser (base; one dialog). Risk d.5.
03. festivals.browser (one plant line; map card d.6; midnight via open's instant).
04. community.browser (base; the biggest file: keyboard, popovers, widths, share stubs d.3, d.4); adds `COMM`, `atWidth`
    and the community readers.
05. community-off, community-maybe, community-unsure (one UPDATE each; adds `planted.ts` with `added`).
06. community-periods, community-paris, community-glasgow (added rows, one trip each; 18766 pinned).
07. gantt.browser, then gantt-parties, gantt-apart, gantt-halves, gantt-days, gantt-way (travel/stays plants, rAF waits,
    layout at two widths; adds `trips`, `stays`, `community`).
08. gantt-places.browser (planted communities, people, by-place memory d.7, real focus ring).
09. plans.browser and friends-far.browser (people and cities planted; new wording).
10. views.browser.test.ts deleted (it then imports nothing); `community.fixture.ts:5`'s "onDay" reworded. `shipped.ts`
    stays: onnow and flights still use it (1.4).
