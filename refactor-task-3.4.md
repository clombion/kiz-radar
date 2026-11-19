# Task 3.4: served files and docs

Task 3.4 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. Every file served before the Vite
build is served after it but the 57 per-module scripts, which `shared-<hash>.js` replaces beside a new `main.js` and
`review.js`; the four pages load from the build on every check; `CONTRIBUTING.md` names the build and its frame tests;
the Phase 3 report is written. `.github/workflows/pages.yml` is unchanged: its two stale lines are reported.

## Summary

The site built at `4400854d` (the first parent of 3.2's `0bd287cd`, the last `tsc` build) in a scratch worktree, beside
the same `node_modules`, and at `HEAD`; every file under `public/` listed with its size, committed and built, and the
lists compared. The loads are task 3.3's smoke set, which runs on every `mise run check`; the one load it lacks, the
site's root with no hash, run once by adding it to that set and taken out again. The three documents read against the
build as it is.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | What "served" covers | Every file under `public/`: the 18 committed outside `data/`, `js/` and `vendor/` built by `build:site`; `data/` (`LICENSE.md`, committed; `kiz.sqlite`, `site.json`, `review.json`, built) left out of the diff | `build:data` is not Phase 3's; nothing under `pipeline/` or `public/` changed between `4400854d` and `HEAD` (`git diff --quiet`), so its output is the same. |
| 2 | The four loads | Cited, not duplicated: `pages.browser.test.ts`'s smoke set loads `#finder` (index.html), `review.html`, `c/<key>/` and `#community/<key>` from the build in a frame under the CSP, with its own tests that the community address and the older link show the page | Added to it once, the bare root (`''`) drew the same, clean (20 tests passed); not kept: it asks the server for the same `index.html` as `#finder`, and its empty route is `routes.ts`'s (`parseRoute('')` is `finder`, `routes.test.ts`). |
| 3 | Docs | `build:site`'s description and `docs/guides/the-site.md` true since 3.2: unchanged; `CONTRIBUTING.md` said every test of the page starts through `tests/site/app.ts` and named no build: one commit (`957f5a45`) | The frame tests and the bundler, where the checks and the folders are listed. |
| 4 | `pages.yml` | Not edited (stop list): `:3` "Compiles the site's TypeScript (site/) into public/js/" and `:38`'s step name "Compile the site, and build its data from the export", for the owner | It still runs `mise run build:site`, which builds with Vite: the deploy behaves as before. |

## Evidence

**Served files** (`find public -type f`, sizes in bytes, `data/` aside):

|  | `4400854d` (`tsc`) | `HEAD` (Vite) |
| -- | -- | -- |
| Files | 88: 59 `js/`, 11 `vendor/`, 18 committed | 32: 3 `js/`, 11 `vendor/`, 18 committed |
| Bytes | 2,715,912 | 2,502,483 |
| `js/` | 400,583 (gzip -9 each, summed, 138,695; of all together 119,472) | 187,154: `main.js` 124,466, `review.js` 19,324, `shared-ggZAhEyJ.js` 43,364 (gzip -9 each, summed, 65,111; of all 63,956) |

Went: 57 module files (`js/artists.js` … `js/wording.js`). Came: `js/shared-ggZAhEyJ.js`. Kept by name, new content:
`js/main.js` (9,012 → 124,466), `js/review.js` (27,708 → 19,324). The other 29 (the committed pages, stylesheet, fonts,
icons, manifest, community pages and cards, and `vendor/`) are the same files at the same sizes. No `.map`, no
`assets/`, no HTML written by the build.

**Build time** (`pnpm run build`, wall clock, warm): `4400854d` 1.26 s (`tsc` emitting, then `vendor`); `HEAD` 1.57 s
and 1.43 s (`tsc` checking, `vite build`, `vendor`).

## Done when

The lists compared, the loads confirmed, the docs true, the Phase 3 report written with the `pages.yml` comment
mentioned: met.
