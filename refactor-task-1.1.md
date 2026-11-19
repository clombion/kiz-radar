# Task 1.1: the baseline and the app-test helper

Task 1.1 of [refactor-plan.md](refactor-plan.md). Status: planned, reviewed and revised; not started. Every result under
"What was measured" comes from running the helper described here in a throwaway copy of the repository.

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
| 2 | Who serves the fixture | The test server. `vitest.config.ts`'s plugin answers `/data/<file>` from `FIXTURE_DATA` only, and a file asked at the root (M1) from `FIXTURE_DATA`, else `public/vendor/` | M2: today the real build's rows are one missed stub away. With this rule no test page can read them, with or without the helper. The helper then reads no file from disk but the page's HTML. |
| 3 | How a test plants data | `plant: (db: Database) => void`, run before start on the fixture's database with the page's own sql.js; the helper serves the exported bytes as `kiz.sqlite`. For the review page: `review: Review`, served as `review.json` | A function binds values and can read before it writes, as `plantCommunity` does. The first draw sees the rows. No handle on the live database exists, so a test cannot change data a visitor's page would never see change. |
| 4 | Who owns `fetch` | The helper, for the file, and it cannot be replaced (M6). It records every request with its `init`, serves the planted file, passes other requests to this server, and gives a request to another host to the test's answer, or refuses it | A test's own `fetch` stub cannot delegate to the helper's, so it would take the planted database away: that state is made impossible, and the error names `fetch`. No test reaches the network. |
| 5 | Who owns the clock | The helper installs its own `Date` by assignment; `vi`'s timers may lie over it (M4) | A `vi` clock over it is complete in itself and gives the helper's back; the real date cannot return (`817fb59c`'s bug class). Locking it was tried and rejected (M5). |
| 6 | The day | `now` is required at start: a day (`'2026-11-01'`, pinned at local noon) or an instant. `open(href, on?)` sets the clock to `on`, or back to the start's `now`, before it navigates | No default from the real clock. The day is an argument of opening a page, so a test that moves it cannot leak it to the next test. Local noon: the browser project sets no zone (`0b4873e2`). |
| 7 | Storage | Start clears both storages, then writes `storage: { local?, session? }` entry by entry, as raw keys and values | M3. Raw entries are exactly what a reload keeps. The site's writers are not used: they run in the app's own module instance and also set memory (`kept.ts:28-34`, `held`), so a seed through them proves nothing about storage. |
| 8 | When a page is drawn | Start: the entry imported, then no line in `<main>` with `role="status"` whose text begins "Loading". `open()`: blur, listen for `focus` on `<main>`, set the address, wait for the focus, then for no loading line | M8, M9. Focus first: before the router runs, the old page has no loading line, so the other order passes on the stale page. Both signs are what a visitor or a screen reader gets, not a view's structure. Start resolves on whatever page the visitor would get, the updating page included. |
| 9 | The page's files | The helper reads the page's HTML, adds its stylesheets and classic scripts to the head by their own addresses, replaces the body, and imports `site/main.ts` or `site/review.ts` in place of the module script. The CSP `<meta>` is not copied | One source (the build). Every test sees the styled page, as a visitor does. The `VENDOR` and `SCRIPTS` lists go. |
| 10 | One helper, two pages | `startSite({ now, plant?, storage?, elsewhere? })` returns `{ open, answer, asked }`. `startReview({ now, review?, storage?, elsewhere? })` returns `{ answer, asked }`. Both run one start sequence over a table of the two pages | `plant` has no meaning for the review page and `open()`'s focus wait would hang there (its router moves no focus): neither can be written. |
| 11 | Scope of 1.1 | The server rule, the helper with its own tests, `main.browser.test.ts` ported, the "throws" test in `broken.browser.test.ts`. `shipped.ts` and the files that use it are not touched | The helper shares no code with `shipped.ts` (M14), and never runs in a file with it. `shipped.ts` goes with its last user (1.3, 1.4). |
| 12 | Where the brief, plan and reports live | Committed at the root, removed in task 4.10 (owner) | Row 4.10 of `refactor-plan.md` removes `refactor-brief.md`, `refactor-plan.md` and the task plans; the reports go with the plan. |

### The helper's contract, in full

```ts
// tests/site/app.ts
type Day = `${number}-${number}-${number}`;      // a visitor's day, pinned at local noon
type Now = Day | Date;                            // or an instant
type Answer = (url: URL, init: RequestInit) => Response | Promise<Response>;   // another host's answer
// Asked: one request the page made, its url and init (see `asked` below); Database: sql.js's; Review: review.ts's
interface Start {
  now: Now;
  storage?: { local?: Record<string, string>; session?: Record<string, string> };
  elsewhere?: Answer;                             // for the whole file, start-time requests included
}
startSite(o: Start & { plant?: (db: Database) => void }):
  Promise<{ open(href: string, on?: Now): Promise<void>; answer(a: Answer): void; asked: readonly Asked[] }>
startReview(o: Start & { review?: Review }):
  Promise<{ answer(a: Answer): void; asked: readonly Asked[] }>
```

- **Start**, in order: refuse a second start; clear and seed storage; install the clock; read and apply the page; build
  the planted file; install `fetch`; set the address to the frame's own, without a hash; import the entry; wait until
  drawn (decision 8). A wait that runs out fails with the words `<main>` holds.
- **`open(href, on)`**: `href` is a hash link from `routes.ts`. Anything else is refused with the reason: a path link is
  a page load, which a frame cannot do (the community page is reached by its older `#community/<key>` link, as
  `main.browser.test.ts:70` does). Each call resets the address to the start's, so opening the route already shown is a
  new page.
- **`answer(a)`** replaces `elsewhere` until the test that called it ends (`onTestFinished`), then the start's answer is
  back.
- **`asked`** is every request the page made since start, in order, each with its `url` and `init` (method, body,
  signal).
- **The clock** is a subclass of the real `Date`: `new Date()` and `Date.now()` give the pinned instant, every other
  form is the real one, and `Symbol.hasInstance` accepts real dates. It does not tick.

Guards that remain, and why no shape replaces them:

- "One start per file" and "hash links only" are runtime refusals. The first follows from an app that starts on import;
  the second from `routes.ts` typing its links as `string`. Both are `site/`'s, unchanged in Phase 1.
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
  `tests/site/broken.browser.test.ts`.
- **Changed:** `vitest.config.ts` (the server rule, in the existing plugin, and its comment);
  `tests/site/main.browser.test.ts`; `refactor-plan.md`.
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

**The helper's tests.** Each fails if the thing it names is ignored.

`app.browser.test.ts` sets a key in both storages, then starts the site with `now: '2027-01-12'` and a plant that
renames one fixture festival of that week:

1. This week shows "Monday 11 Jan and Sunday 17 Jan" and the planted name (the clock reached `load()`; the plant reached
   the first draw).
2. The keys set before start are gone.
3. `vi.stubGlobal('fetch', …)` throws. After `vi.unstubAllGlobals()`, `vi.useFakeTimers()`, thirty days advanced and
   `vi.useRealTimers()`, the map opens and asks for the world file, and This week is still that week.
4. `open(week, '2026-11-21')` shows that week with KUOF "On now"; `open(week)` after it is back on January.
5. Opening the route already shown is a new page, and a page with a standing status line opens.
6. The page is styled (the header sticks).
7. sql.js's WebAssembly was asked with a signal (`asked`); a request to another host is refused when no answer is given.
8. A second start and a path link are refused, each with its reason.

`reviewpage.browser.test.ts` starts `review.html` with `reviewed.ts`'s `REVIEW`, an instant, a token in
`sessionStorage`, an expiry in `localStorage` and a GitHub answer:

1. The page shows the crafted review and "Writing as clombion · 7 days left: make a new one soon". This fails if the
   review, the seed, the clock or the start-time answer is ignored.
2. An answer given in a test lasts that test, and the start's is back in the next.

`broken.browser.test.ts`: the "view that throws" test, on a row planted before start.

**`main.browser.test.ts` ported.** Its 15 remaining cases, with the same assertions, except:

- Start-up, the `VENDOR` and `SCRIPTS` lists and the `fetch` stub go; `startSite({ now: '2026-11-01' })` replaces them.
- The views loop uses `open()` and still asserts that `<main>` has the focus.
- `controls()` and `unnamed()` pass `{ includeHidden: true }` (M13). Without it the stylesheets would hide controls from
  the check and weaken it; with it the check covers more than today.
- It still imports `done` from `report.ts`; 1.2 moves it. Recorded for the ledger.
- Its header says the page starts through `app.ts` and that the throwing view is in `broken.browser.test.ts`.

## Steps

1. **Baseline.** Run the two commands; write the figures and the test names into the Phase 1 report. One commit
   (`refactor-plan.md` only).
2. **The server rule and the helper.** `vitest.config.ts`; `app.ts` with its header (the convention for 1.3 to 1.6:
   start through `app.ts`, once per file; state the day; plant, seed and answer at start; `fetch` is the helper's;
   planted base tables do not recompute the build's `artist_stats` and `event_stats`); `app.browser.test.ts`;
   `reviewpage.browser.test.ts`. One commit: the helper cannot land without a test that imports it (knip).
3. **The port.** `main.browser.test.ts` onto the helper; `broken.browser.test.ts`. One commit.

Each commit passes `mise run check`; `git revert` undoes it.

## Done when

- The baseline is in the Phase 1 report.
- No test page can read the real build's data.
- `startSite` and `startReview` start the two pages on planted data, a pinned clock, seeded storage and given answers;
  each of those has a test that fails without it.
- `main.browser.test.ts` uses the helper; its only view import is `done`.
- The other browser files pass unchanged.
- `mise run check` passes at each commit.

## Records changed with this plan

Already done, in the commit that adds this plan:

- `refactor-plan.md`: rows 1.1, 1.3, 1.4, 1.5 and 4.10; the decision on the harness (in a test, Vite rewrites `db.ts`'s
  data address to the server's root); the decision on the reload; the Phase 1 report's brief errors (the start-up's
  citations, the test counts, the coverage command's exit, M1 and M2 for task 3.1).

Changed by the implementation:

- `vitest.config.ts:12-13`, the plugin's comment: it also serves the tests' own pages, and `/data/` is the fixture's.
- `main.browser.test.ts:1-3`, its header.
- `community.fixture.ts:5` ("Each test pins its own day (onDay)") stays true; it is reworded when 1.3 removes `onDay`.
