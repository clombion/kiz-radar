# Task 1.1: the baseline and the app-test helper

Task 1.1 of [refactor-plan.md](refactor-plan.md). Status: done. Every result under "What was measured" comes from
running the helper described here in a throwaway copy of the repository; "What building it found", at the end, says
which decisions building it changed, and why.

## Summary

Record the before-counts. Make the test server's `/data/` the fixture's. Build one helper, `tests/site/app.ts`, that
starts the real page in a browser test on planted data, a pinned clock and seeded storage, and opens routes as a visitor
would. Port `main.browser.test.ts` onto it. Tasks 1.3 to 1.6 move the other browser tests onto it.

## What was measured

All of this was run, not read, on a throwaway copy of the repository at `5f97ef58`.

| # | Question | Result |
| -- | -- | -- |
| M1 | What the app asks for in a test | Vite's dev transform rewrites `new URL('../data/', import.meta.url)` to `new URL("/data", …)`, without the last slash. So the app asks for `/kiz.sqlite`, `/site.json`, `/review.json` and `/sql-wasm.wasm` at the server's root. Only `map.ts`'s full file address survives (`/vendor/countries-50m.json`). This is why today's stubs match by file name. |
| M2 | What Vitest's server serves by itself | `public/` at the root (Vite's public folder): `/vendor/…`, `/css/site.css`, and `/data/site.json`, which is **the real build's data, not the fixture's**. Any request that passes a stub by reads real rows. The world file is served from `public/vendor/`, so a request that misses a stub does not fail: it reads real files. |
| M3 | Storage between test files | A file of the same session finds what the file before left, in `localStorage` and in `sessionStorage`. Globals do not carry: each file is a new frame. |
| M4 | A `Date` installed by assignment before `main.ts` is imported | Reaches `load()` and the first draw (`dbDay()` is the pinned day; This week shows that week). It survives `vi.useRealTimers()` and `vi.useFakeTimers({ toFake: ['setTimeout'] })`. `vi.useFakeTimers()` and `vi.setSystemTime()` lay over it, start from its time, and `vi.useRealTimers()` gives it back. The real date is never reachable again. |
| M5 | A `Date` that cannot be replaced (not writable) | `vi.useFakeTimers()` and `vi.setSystemTime()` throw, but leave Vitest's timers half-installed: every later `vi.useFakeTimers` in the file fails with "Cannot read properties of undefined (reading 'uninstall')". |
| M6 | A `fetch` that cannot be replaced (not writable, not configurable) | `vi.stubGlobal('fetch', …)` throws `TypeError: Cannot redefine property: fetch` and changes nothing; `vi.unstubAllGlobals()` afterwards is clean. |
| M7 | Moving the day under one start | Setting the clock and opening a route redraws on the new day, forwards and backwards (`freshDay`, `db.ts:57-64`). |
| M8 | "Wait until no `role="status"`" as the sign a page is drawn | Wrong: `festivals.ts:158` puts a standing `role="status"` line on a page ("The link asks for …"). The three loading lines (`index.html:50`, `main.ts:168`, `sentence.ts:414` through `ui.ts:63-69`) all begin with the word "Loading". The Festivals page shows one until the database is in, so every route shows a loading line until its data is there. |
| M9 | A database refused on purpose | Start resolves on the "being updated" page (`meta.built_at` changed by the plant; `SINCE` seeded 16 minutes back gives "could not load"). Start must not reject it: task 1.4 needs it. |
| M10 | The review page | Starts on a crafted `Review`, a pinned instant, a token seeded in `sessionStorage`, and a GitHub answer given before start: "Writing as clombion · 7 days left: make a new one soon". |
| M11 | A bad row planted before start | `PRAGMA ignore_check_constraints = ON; UPDATE artists SET kind = 'planted'` survives the export; the artists page says "This page could not be shown". |
| M12 | Cost | One start is about 0.75 s with a plant; `open()` is 60 to 100 ms. |
| M13 | The stylesheets, loaded from the page's own `<link>`s | Load and apply (the header sticks, the font is Inter). But they hide controls: `page.getByRole(role)` finds 24 controls on Festivals styled against 30 bare, and 10 on the map against 214. With `{ includeHidden: true }` it finds 42 and 220, all named: more than today's test checks. |
| M14 | House checks on the probe | knip: no unused file once a test imports the helper; it also reports **unused exported types**, so the helper exports only what a test imports. jscpd: no clone between the helper and `shipped.ts`, `main.browser.test.ts` (old or ported) or `vitest.config.ts`. The ported `main.browser.test.ts` passes (15 cases, plus the moved one). `views`, `onnow`, `flights`, `page`, `pages`, `review`, `map` and `updating` pass unchanged on the new server rule. |
| M15 | The baseline | One command gives everything: 283 tests in 24 files (node: 142 in 14; browser: 141 in 10; `main.browser.test.ts`: 16). Coverage of `site/**`: lines 86.12 %, statements 84.86 %, functions 83.07 %, branches 74.92 %. The command exits 1 on the global thresholds, after writing its summary. Biome: "Checked 94 files … Found 38 infos". |

## Design model

**What a test of the page needs.** A visitor arrives at an address, in a browser that holds some storage, on some day,
and the site answers with its files. A test states those four things and looks at the page. Everything the helper does
serves that; nothing in it should let a test put the page in a state no visitor can be in.

**What the code fixes** (`site/` is unchanged in Phase 1):

- **The app starts on import, once per frame** (`main.ts:224`, `review.ts:894-895`). Vitest gives each test file its own
  frame (`isolate: true`, `node_modules/vitest/dist/chunks/defaults.B1FCaFfh.js:52`). So: one start per file (owner, 18
  November).
- **The app reads four things from the frame after it has started:** `fetch` (`net.ts:13`, including the map's world
  file on first use), `Date` (`days.ts:30`, on every draw; `review.ts:65,454,510,697`; `updating.ts:16`), storage
  (`hints.ts`, `kept.ts`, `updating.ts`), and the address. Each needs exactly one owner for the whole file.
- **The database is read once, at start** (`db.ts:66-93`). `main.ts:59` keeps the promise of that one database and hands
  it to views. A visitor's database never changes after that, except its day (`freshDay`). So data is planted before
  start, and the helper gives a test no handle on the live database.
- **The day moves** (`db.ts:54-64`): a page left open past midnight draws its next page on the new day. A test may
  therefore open a page on another day under the same start.
- **The site's files have one source, the build** (`package.json:13` copies the libraries to `public/vendor/`;
  `index.html:34-38` names them). `test:site` depends on `build:site` (`tasks.toml:109-112`), and Vitest serves
  `public/` at the root (M2). The helper loads what the page names from where the page names it. It keeps no list of
  library paths.

**Fit.** The helper is the page load the app already implies. It changes no `site/` code.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Where the app runs | In the test's own page, one start per file (owner, fixed) | As decided. It does not leave fake timers, `setSystemTime` and `stubGlobal('fetch')` working unchanged: see 4 and 5. |
| 2 | Who serves the fixture | The test server. `vitest.config.ts`'s plugin answers `/data/<path>` (any depth) from `FIXTURE_DATA` only, and a file asked at the root (M1) from `FIXTURE_DATA`, else `public/vendor/`, in that order. Both addresses are two patterns beside `FIXTURE_DATA` (`community.fixture.ts`), which the helper reads too | M2: today the real build's rows are one missed stub away. With this rule no test page can read them, with or without the helper. The helper then reads no file from disk but the page's HTML. |
| 3 | How a test plants data | `plant: (db: Database) => void`, run before start on the fixture's database with the page's own sql.js; the helper serves the exported bytes as `kiz.sqlite`. For the review page: `review: Review`, served as `review.json` | A function binds values and can read before it writes, as `plantCommunity` does. The first draw sees the rows. No handle on the live database exists, so a test cannot change data a visitor's page would never see change. |
| 4 | Who owns `fetch` | The helper, for the file, and it cannot be replaced (M6). It records every request with its `init`, serves the planted file, passes other requests to this server, and gives a request to another host to the test's answer only when the page's Content-Security-Policy (`connect-src`) lets it ask that host; else it refuses it. Its answers are given up when the request's signal aborts, as a real request is | A test's own `fetch` stub cannot delegate to the helper's, so it would take the planted database away: that state is made impossible, and the error names `fetch`. No test reaches the network. |
| 5 | Who owns the clock | The helper installs its own `Date` by assignment; `vi`'s timers may lie over it (M4), installed after the start; a start with `vi`'s timers already on is refused | A `vi` clock over it is complete in itself and gives the helper's back; the real date cannot return (`817fb59c`'s bug class), which it would if `vi`'s timers were installed first (they would give back the real `Date`). Locking it was tried and rejected (M5). |
| 6 | The day | `now` is required at start: a day (`'2026-11-01'`, YYYY-MM-DD, pinned at local noon; a string that is no day is refused) or an instant. `open(href, on?)` sets the clock to `on` until the test ends, or back to the start's, before it navigates; under `vi`'s timers `on` is refused, the day being theirs | No default from the real clock. The day is an argument of opening a page, scoped to its test, so a test that moves it cannot leak it to the next test. Local noon: the browser project sets no zone (`0b4873e2`). |
| 7 | Storage | The page's `localStorage` and `sessionStorage` are the helper's own, in memory, for the file (installed like `fetch`), holding `storage: { local?, session? }` as raw keys and values | M3, and test files run at once (measured: three 1.5 s files finish in 2.65 s), so the origin's storage is shared with files running beside this one: clearing it would race them. Raw entries are exactly what a reload keeps. The site's writers are not used: they run in the app's own module instance and also set memory (`kept.ts:28-34`, `held`), so a seed through them proves nothing about storage. Serial test files were measured and not taken: twice the time, and `page.browser.test.ts`'s dialog-history test fails in that mode. |
| 8 | When a page is drawn | Start: the entry imported, then no line in `<main>` with `role="status"` whose text begins "Loading" (within 30 s). `open()`: blur, put the start's address back and replace it with the route (`location.replace`, no new history entry), then wait until `<main>` has the focus and no loading line (within 10 s, under the 15 s test timeout). Either is refused when the page says it failed ("This page could not be shown", "Could not load the …") | M8, M9. Focus first: before the router runs, the old page has no loading line, so the other order passes on the stale page. The focus itself is read, not its event, which a frame without the window's focus never gets. Both signs are what a visitor or a screen reader gets, not a view's structure. Start resolves on the updating page (a page a visitor gets mid-update); a failure line is never what a test means by drawn. |
| 9 | The page's files | The helper reads the page's HTML, adds its stylesheets and classic scripts to the head by their own addresses (the scripts in the page's order), replaces the body, and imports `site/main.ts` or `site/review.ts` in place of the module script. The CSP `<meta>` is read (decision 4), not applied: in the test's page it would also bind Vitest's own scripts | One source (the build). Every test sees the styled page, as a visitor does. The `VENDOR` and `SCRIPTS` lists go. The one library path the helper names itself is sql.js's WebAssembly in `vendor/`, where `db.ts` asks it, to plant. |
| 10 | One helper, two pages | `startSite({ now, plant?, storage? })` returns `{ open, asked }`. `startReview({ now, review?, storage?, elsewhere? })` returns `{ answer, asked }`. Both run one start sequence over a table of the two pages, given the page's data file already made | `plant` has no meaning for the review page, `open()`'s focus wait would hang there (its router moves no focus), and the site's CSP lets it ask no other host: none of these can be written. |
| 11 | Scope of 1.1 | The server rule, the helper with its own tests, `main.browser.test.ts` ported, the "throws" test in `broken.browser.test.ts`. `shipped.ts` and the files that use it are not touched | The helper shares no code with `shipped.ts` (M14), and never runs in a file with it. `shipped.ts` goes with its last user (1.3, 1.4). |
| 12 | Where the brief, plan and reports live | Committed at the root, removed in task 4.10 (owner) | Row 4.10 of `refactor-plan.md` removes `refactor-brief.md`, `refactor-plan.md` and the task plans; the reports go with the plan. |

### The helper's contract, in full

```ts
// tests/site/app.ts
type Day = `${number}-${number}-${number}`;      // a visitor's day, YYYY-MM-DD, pinned at local noon
type Now = Day | Date;                            // or an instant
type Answer = (url: URL, init: RequestInit) => Response | Promise<Response>;   // another host's answer
// Asked: one request the page made, its url and init (see `asked` below); Database: sql.js's; Review: pending.ts's
interface Visit {
  now: Now;
  storage?: { local?: Record<string, string>; session?: Record<string, string> };
}
startSite(o: Visit & { plant?: (db: Database) => void }):
  Promise<{ open(href: string, on?: Now): Promise<void>; asked: readonly Asked[] }>
startReview(o: Visit & { review?: Review; elsewhere?: Answer }):        // elsewhere: for the whole file
  Promise<{ answer(a: Answer): void; asked: readonly Asked[] }>
```

- **Start**, in order: refuse a day that is no day, then a second start, then `vi`'s timers already on; install the
  page's own storage, seeded; install the clock; read the page; add its stylesheets and libraries; make the data file
  (the plant runs on the page's own sql.js); install `fetch`; set the address to the frame's own, without a route, taken
  before the entry is imported (`main.ts` writes `#finder` into an address with none); import the entry; wait until
  drawn (decision 8). A wait that runs out fails naming what it waited for and the words `<main>` holds.
- **`open(href, on)`**: `href` is a hash link from `routes.ts`. Anything else is refused with the reason: a path link is
  a page load, which a frame cannot do (the community page is reached by its older `#community/<key>` link, as
  `main.browser.test.ts` does). Each call puts the start's address back and replaces it, so opening the route already
  shown is a new page, and no history entry is added (the frames share one session history: an entry pushed by one file
  is where another file's `history.back()` lands).
- **`answer(a)`** replaces `elsewhere` until the test that called it ends (`onTestFinished`, so inside a test only),
  then the start's answer is back.
- **`asked`** is every request the page made since start, in order, each with its `url` and `init` (method, body,
  signal); a test that means one page's requests slices from its length before the `open()`.
- **The clock** is a `Proxy` over the real `Date`: `new Date()`, `Date()` and `Date.now()` give the pinned instant,
  every other form is the real one's, and `instanceof Date` holds for real dates. It does not tick.

Guards that remain, and why no shape replaces them:

- "One start per file" and "hash links only" are runtime refusals. The first follows from an app that starts on import;
  the second from `routes.ts` typing its links as `string`. Both are `site/`'s, unchanged in Phase 1.
- "A day that is no day": a template literal type cannot say two digits. "`vi`'s timers first" and "`on` under `vi`'s
  timers": `vi` installs its clock at run time. "A host the CSP refuses": the policy is the page's HTML. Each is refused
  at the one point it can arise.
- The root-level file lookup in the server rule exists only because of M1. Task 3.1 already has to settle those four
  `new URL` sites; `/data/<file>` is answered too, so the rule holds either way.

### Options not taken

| Option | Property that rules it out |
| -- | -- |
| Keep `vi.stubGlobal('fetch')` / `vi.useFakeTimers` as the helper's means, with a rule that tests never unstub | Two owners; the state "data server gone" stays writable, held off by a convention (`8aee37ad` fixed it once). |
| Serve own files from the helper's `fetch` by reading disk (today's way) | Leaves M2's hole: whatever the stub does not catch is answered with real rows. Keeps a hand-kept list of library paths beside the build's. |
| Playwright `page.route` from a custom command, filtered by frame | Cannot run a test's plant function (it lives in the browser), cannot record the signal a request was made with (`efa580a0`), and it acts on the whole Playwright page, the test runner included (the frame-per-test option the owner turned down on 18 November). |
| Planted bytes written to disk and served by test file | A plant from an earlier run can outlive the test that made it. |
| A handle on the live database for per-test changes | A state no visitor reaches; `main.ts:59` holds the first database, so views and the handle can disagree, and Phase 4 views need not re-read on every route. |
| `load(loadSite())` called again to swap the database | Same, and it is an accident of `db.ts`'s singleton. |
| Lock `Date` | M5: a violation breaks Vitest's timers for the rest of the file. |
| Clear the origin's storage at start | Test files run at once: a clear races the files beside it. |
| Run browser test files one at a time | Twice the time (6.6 s to 13.7 s), and the dialog-history test of `page.browser.test.ts` fails in that mode. |
| `day` optional, or a default day in the fixture | Fails open on the run date, or hides the day each file depends on. |
| `setDay()` as a standing change | A test that forgets to set it back changes the next test's day. |
| Seed storage through `kept.ts`'s writers | Decision 7: memory satisfies the read. |
| Export a writer from `updating.ts` for its `SINCE` key | Changes `site/` in Phase 1, and is not needed: see "The reload" below. |
| "No `role="status"` in `<main>`" as drawn; class selectors | M8: hangs on a standing status line. Classes are a view's structure. |
| Start rejects a refused database | M9: the updating page is a page a visitor gets, and 1.4 tests it. |
| A `styles` switch | Lets a test run on a page no visitor sees. |
| `plant` as SQL text | Cannot bind values or read before writing (`db.ts:100-101`'s rule). |

### The reload (for 1.5 and 1.4; the helper only makes it possible)

A frame cannot reload without ending the test, and a reloaded built-site frame would send its start-time token check to
the real GitHub. So "kept across a reload" is two halves joined by one constant in a shared module:

- the writing file drives the page, then asserts the storage entry equals the constant, key and value;
- the reading file starts with `storage` seeded from the same constant and asserts what the page shows.

A renamed key fails the writing half; a broken read fails the reading half. Today's single test
(`review.browser.test.ts:109-130`) re-reads in the same page, where `kept.ts`'s memory would carry a broken read. The
same pair serves `updating.ts`'s `SINCE` key, so no writer is exported. The brief's stop list names "weakening a test";
the owner agreed to the split on 19 November, as stronger than today's test.

## Impact

- **New:** `tests/site/app.ts`; `tests/site/app.browser.test.ts`; `tests/site/reviewpage.browser.test.ts`;
  `tests/site/server.browser.test.ts`; `tests/site/broken.browser.test.ts`; `refactor-ledger.md`.
- **Changed:** `vitest.config.ts` (the server rule, in the existing plugin, and its comment);
  `tests/site/community.fixture.ts` (the two address patterns); `tests/site/main.browser.test.ts`; `refactor-plan.md`;
  `CONTRIBUTING.md` (where a test of the page starts it).
- **Not touched:** `site/`; `shipped.ts`; every other test file. They are the regression check for the server rule:
  `views`, `onnow`, `flights`, `page`, `pages`, `review`, `map`, `updating` must pass unchanged (M14).
- **A new need:** the helper's files need `public/vendor/` (the build). `mise run test:site` builds it. A script or
  stylesheet that does not load fails the start with "… did not load: `mise run build:site` makes it".
- **House rules:** `fetch.grit`: the helper keeps the real `fetch` under another name and never writes `fetch(`; a test
  that needs a request of its own uses `net.ts`'s `get`. `routes.grit`: links come from `routes.ts`. knip: the helper
  exports only `startSite` and `startReview` (M14). jscpd: no clone (M14). No new suppression.

## Tests

**Baseline (commit 1), into `refactor-plan.md`'s Phase 1 report.** After `mise run build:site` and
`mise run build:data`:

```bash
pnpm exec vitest run --coverage.include='site/**' --coverage.thresholds.perFile=false \
  --coverage.reporter=json-summary --coverage.reportsDirectory=<a folder outside the repository> \
  --reporter=default --reporter=json --outputFile.json=<a file outside the repository>
pnpm exec biome check --error-on-warnings
```

- The first exits 1 on the global thresholds (M15); the two files are written all the same. Record: tests per project
  and per file, the four coverage figures, and the JSON report's full test names (each `test.for` case is listed), which
  are the left column of the 1.9 ledger.
- Expected today: M15's figures. Record what the run gives at the commit.

**The helper's tests.** Each fails if the thing it names is ignored (each checked by reverting it in the helper).

`app.browser.test.ts` starts the site with `now: '2027-01-12'`, a key in each storage and a plant that renames one
fixture festival of that week:

01. Before any page opens, the database's day is the start's (the clock reached `load()`); This week shows "Monday 11
    Jan and Sunday 17 Jan" and the planted name (the plant reached the first draw).
02. The page's storage holds the seeds, and is no other file's: a same-origin frame (the origin's own storage, as
    another file sees it) sees neither the page's writes nor its seeds, and the page does not see the frame's.
03. `vi.stubGlobal('fetch', …)` throws. After `vi.useFakeTimers()`, thirty days advanced and `vi.useRealTimers()`, the
    map opens and asks for the world file (among the requests of that open), and This week is still that week.
04. `open(week, '2026-11-21')` shows that week with KUOF "On now"; `open(week)` after it is back on January.
05. A test that moves the day; the next test, which opens nothing, is on the start's day in every form the clock is read
    (`Date.now()`, `new Date()`, `Date()`, `new Date(0)`, `instanceof Date`).
06. Under `vi`'s timers, `open(week, day)` is refused.
07. Opening the route already shown draws a new page (a new first element in `<main>`) and adds no entry to the frame's
    own history (the Navigation API's entries); a page with a standing status line opens.
08. The page is styled (the header sticks).
09. sql.js's WebAssembly was asked with a signal (`asked`); a request to a host the site's CSP refuses is refused.
10. A day that is no day, a second start and a path link are refused, each with its reason.

`reviewpage.browser.test.ts` starts `review.html` with `reviewed.ts`'s `REVIEW`, an instant, a token in
`sessionStorage`, an expiry in `localStorage` and a GitHub answer:

1. The page shows the crafted review and "Writing as clombion · 7 days left: make a new one soon". This fails if the
   review, the seed, the clock or the start-time answer is ignored.
2. An answer given in a test lasts that test, and the start's is back in the next (two tests).
3. An answer that never comes is given up when the request's signal aborts.
4. A host the review page's CSP does not list is refused, though an answer is given.

`server.browser.test.ts`, a page without the helper: `/data/kiz.sqlite` and `/kiz.sqlite` are the fixture's bytes; a
file `data/` has not is a 404, never the build's; an address with a malformed escape is a 404 from the server, not a
failure of the rule.

`broken.browser.test.ts`: the "view that throws" test, on a row planted before start; `open()` is refused with the
page's words, and the page around the view stays.

Not tested, each for its reason: the wait limits and their messages (a test cannot usefully wait them out); a missing
build file named by the helper, and the folders' order (each needs a broken build, or a name in both folders, which
neither has); the libraries' order (none depends on another today); the types that tie each page to its data
(`@ts-expect-error` is a suppression the repository lists).

**`main.browser.test.ts` ported.** Its 15 remaining cases, with the same assertions, except:

- Start-up, the `VENDOR` and `SCRIPTS` lists and the `fetch` stub go; `startSite({ now: '2026-11-01' })` replaces them.
- The views loop uses `open()` and still asserts that `<main>` has the focus.
- The controls checked include those the stylesheets hide (`{ includeHidden: true }`, M13), so the check covers more
  than today; a shown control is named only by what is shown, a hidden one as it will be shown, so hidden text never
  names a shown control.
- Each view that opens as a failure is refused by `open()`, so the views loop cannot pass on an error page.
- It still imports `done` from `report.ts`; 1.2 moves it. Recorded for the ledger.
- Its header says the page starts through `app.ts` and that the throwing view is in `broken.browser.test.ts`.

## Steps

1. **Baseline.** Run the two commands; write the figures into the Phase 1 report and the test names into
   `refactor-ledger.md`. One commit.
2. **The server rule and the helper.** `vitest.config.ts`; `app.ts` with its header (the convention for 1.3 to 1.6:
   start through `app.ts`, once per file; state the day; plant, seed and answer at start; `fetch` is the helper's;
   planted base tables do not recompute the build's `artist_stats` and `event_stats`); `app.browser.test.ts`;
   `reviewpage.browser.test.ts`; `server.browser.test.ts`; the address patterns in `community.fixture.ts`; the line in
   `CONTRIBUTING.md`. One commit: the helper cannot land without a test that imports it (knip).
3. **The port.** `main.browser.test.ts` onto the helper; `broken.browser.test.ts`. One commit.

Each commit passes `mise run check`; `git revert` undoes it.

## Done when

- The baseline is in the Phase 1 report.
- No test page can read the real build's data.
- `startSite` and `startReview` start the two pages on planted data, a pinned clock, seeded storage and given answers;
  each of those has a test that fails without it.
- `main.browser.test.ts` uses the helper; its only view import is `done` (`routes.ts` is the links' module).
- The other browser files pass unchanged.
- `mise run check` passes at each commit.

## Records changed with this plan

Already done, in the commit that adds this plan:

- `refactor-plan.md`: rows 1.1, 1.3, 1.4, 1.5 and 4.10; the decision on the harness (in a test, Vite rewrites `db.ts`'s
  data address to the server's root); the decision on the reload; the Phase 1 report's brief errors (the start-up's
  citations, the test counts, the coverage command's exit, M1 and M2 for task 3.1).

Changed by the implementation:

- `vitest.config.ts:12-16`, the plugin's comment: it also serves the tests' own pages, and `/data/` is the fixture's.
- `main.browser.test.ts:1-3`, its header.
- `community.fixture.ts:5` ("Each test pins its own day (onDay)") stays true; it is reworded when 1.3 removes `onDay`.

## What building it found

Each is folded into the decisions and the contract above; this says why the code is not what the first draft said.

- `open()` reads the focus, not its event: a frame without the window's focus never gets the event, and test files share
  one window.
- `open()` replaces the history entry: the frames share one session history, and an entry pushed by one file is where
  another file's `history.back()` lands (`page.browser.test.ts`'s dialog test failed once in seven runs that way).
- The page's own address is taken before the entry is imported: `main.ts` writes `#finder` into an address with no
  route, so an address read after start already held one, and opening `#finder` was no change.
- The clock is a `Proxy`, not a subclass: the same behaviour with no type assertion, which the repository's lint
  refuses.
- Storage is the page's own, not the origin's cleared: test files run at once (the change audit; measured).
- `/data/` being the fixture's has a file of its own: in a file that plants, the helper's `fetch` answers first.
- The ledger is its own file: 141 rows did not belong in the plan.
- The coverage baseline at the commit is lines 85.79 %, statements 84.56 %, functions 82.69 %, branches 74.81 % (M15's
  figures were on an earlier copy of the data).
