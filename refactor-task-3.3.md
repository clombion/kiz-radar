# Task 3.3: tests against the build

Task 3.3 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. `pages.browser.test.ts` passes with
its five tests as they were, and a smoke set of eleven pages of the built site, each in a frame under its page's
Content-Security-Policy, beside two tests of the probe itself (a CSP violation; console errors, an escaped error, a
rejection, failed fetches) and one that each view's link names its view. No change to `site/`, the build or the deploy
workflow; no new dependency.

## Summary

The frame `pages.browser.test.ts` already makes (the built `public/` under `/kiz-radar/`, the fixture's data) takes the
Phase 3 smoke set, as the plan's "Decisions taken while planning" says: the tests' own pages run Vite's transform of
`site/`, so only a frame loads the bundle. Each frame is listened to from its first script, and each smoke test asserts
the page drew, its title, and that nothing went wrong.

## Design model

- **The meta binds the frame:** the CSP is the `<meta http-equiv>` of `index.html` and `review.html`, so it applies to
  the frame's document (not to the test's page, where it would bind Vitest's scripts); nothing is added to make it so.
- **One window, heard from the start:** a frame's initial `about:blank` window is the one its first same-origin page
  reuses, so what is set on it as the frame is appended (listeners, a wrapped `console.error` and `fetch`, storage of
  its own) is the page's from its first script; `framed` checks the frame's `console.error` is still the wrapper once
  the page has drawn (a `WindowProxy` compares equal across pages, so comparing windows could not fail), so a probe that
  would hear nothing fails instead.
- **Read once the page is quiet:** the troubles are read once no resource entry and no fetch has been added for 2 s, so
  a late request is counted; the bundle (`main.js` or `review.js`, and `shared-<hash>.js`) must be among the entries, so
  an empty buffer fails.
- **A route without a case does not compile:** the cases are a `Record` over `HASH_ROUTES` and one over the other
  members of `routes.ts`'s `Route` type (the community's path route), so a new route is covered or `tsc -p tests/site`
  fails; the older `#community/<key>` link and `review.html`, which no route names, are listed by hand. A test asserts
  each hash case's link (built by `routes.ts`, as `house/routes` asks) parses back to its route.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The smoke set | Each of `HASH_ROUTES` (`finder`, `friends`, `week`, `map`, `artists`, `countries`, `sql`, `sources`) by its `routes.ts` link, `c/<key>/`, `#community/<key>`, `review.html`: eleven | One per view the site draws, the two community addresses and the second page. |
| 2 | "Drawn" | A selector per view built from its data (`.festival-cards`, `.who-list`, the week's cards or its empty line, `.leaflet-land-pane path` — the world outline from `vendor/`, `.artist-list li`, `.country-list li`, `.schema li`, `#freshness` from `site.json`, `.profile-head h1`, `#queues a`), and the page's title | The title is set before the data; the selector only after the view built on it, and never by the page's "being updated" `h1`. |
| 3 | "Nothing went wrong" | Equal to empty: the page's `[role="alert"]` and `.status.error` (report.ts's line, a guard's or a failed load's words); every navigation and resource entry with `responseStatus` outside 2xx (an entry without one fails); each fetch answered outside 2xx or refused; the bundle never asked for; `securitypolicyviolation` events; `error`, `unhandledrejection` and `console.error` in the frame | The frame is this origin's, so its Resource Timing gives each request's status; a refused fetch leaves no entry, so `fetch` is wrapped. |
| 4 | The probe's own tests | Two permanent tests on a drawn page: an inline `<script>` and a `style` attribute (`script-src-elem`, `style-src-attr` heard, the script not run); and the frame's `console.error`, a frame function thrown from a timer, a rejected frame promise, a fetch of a missing file and of another host (each heard, with report.ts's alert) | Without them a probe that hears nothing would pass every smoke test. |
| 6 | Isolation and time | The frame's `localStorage` and `sessionStorage` are its own (`app.ts`'s `kept`, now exported), not the origin's the review files share; a wait of 10 s plus the quiet stays under Vitest's 15 s test timeout; each frame is removed as its test ends |  |
| 5 | Lint | `test.for`'s `jest/no-done-callback` suppressed as in four other files (`test_suppressions.py`, `docs/lint-false-positives.md`); the frame's console and timing classes read without `instanceof` (another realm) |  |

## Fail-checks (run, then undone)

- `public/js/shared-*.js` moved away: all 17 frame tests fail (nothing draws).
- `document.body.setAttribute("style", …)` prepended to `public/js/main.js` and `console.error("broken")` to
  `review.js`: the ten site pages fail on `style-src-attr … main.js:1`, `review.html` on `console: broken`.
- `public/fonts/` moved away: `#sources` fails on two `404 …/fonts/*.woff2`.
- The wrapped `console.error` not installed (the marker gone): all eleven fail on "a window of its own".
- `fetch("js/late.js")` and an image `late.png` 1.5 s after `main.js` starts: the ten site pages fail on both 404s and
  the fetch's.
- The resource buffer set to 0: all eleven fail on "never asked" for the bundle.
- `kiz.sqlite` and `site.json` held 3 s by the frame's fetch: each site page draws after 3 s (with the old `#main h1`/
  `h2` selectors too: those views build only once their data is in, so the change guards against the "being updated"
  page's `h1` rather than an early draw).

## Impact

- **Changed:** `tests/site/pages.browser.test.ts`; `tests/site/app.ts` (`kept` exported); `tests/test_suppressions.py`
  and `docs/lint-false-positives.md` (one suppression); `refactor-plan.md` (row 3.3).
- **Unchanged:** `site/`, `vite.config.ts`, `vitest.config.ts`, `public/`, `.github/workflows/`.

## Done when

`pages.browser.test.ts` passes (19 tests) and `mise run check` is green: met.
