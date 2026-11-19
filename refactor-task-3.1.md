# Task 3.1: Vite on this code

Task 3.1 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. No stop: `vite` 8.3.5 is the one
Vitest resolved (no new package in the lockfile), the deploy workflow needs no change, and the built site loads every
route and `review.html` with no 404, console error or CSP violation. The repository is unchanged but for this file and
the plan's row: `vite` enters `package.json` in 3.2, which uses it.

## Summary

A spike in a scratch copy (`package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `site/`, `tests/`,
`typings/`, the committed `public/` and the built `public/data/`; later `claims/`, `lint/`, `pipeline/rows.js` and
`.oxlintrc.json` for the whole suite). It pins `vite`, builds the brief's config, serves the built `public/` and loads
the pages in Chromium, and runs the test suite with the new config beside Vitest's. Two of the brief's premises are out
of date: `design/render.cjs` no longer imports `public/js/icons.js` (2.6d: it reads the drawings from
`pipeline/drawings.py`), and Vite 8 bundles with Rolldown, whose options are `build.rolldownOptions` (`rollupOptions` is
a deprecated alias).

## Design model

- **Vite builds scripts, never pages**: two inputs, fixed entry names, flat in `public/js/`; the committed HTML and
  `generate:check` are untouched, and `vendor` still copies the classic-script libraries after it.
- **A file's place is its module's URL**: the four `new URL('../…', import.meta.url)` sites work only from a file
  directly in `js/`; the build keeps every chunk there.

## Decisions (for 3.2)

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Version | `vite` 8.3.5, exact (`pnpm add -D -E vite@8.3.5`) | Vitest 5.0.5 declares `vite: ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0` and resolved 8.3.5 (`pnpm why vite`); the same version adds only the importer's line to the lockfile, so one Vite. `latest` is 8.3.8 (`npm view vite dist-tags`); Q6's "current release" yields to the brief's "one Vite, moved only with Vitest". |
| 2 | The `icons` input | Leave it out | No consumer: `render.cjs` reads `pipeline/drawings.py` since 2.6d, and the tests import `site/icons.ts`. Built, it works (Evidence, "`icons.js`"), but adds a facade file and splits a chunk for nothing. The plan's 3.2 "`render:design` draws the same cards" then checks nothing the build touches. |
| 3 | Config | `base: './'`, `publicDir: false`, `build.outDir: 'public/js'`, `emptyOutDir: true`, `rolldownOptions.input: { main, review }`, `output.entryFileNames: '[name].js'`, `chunkFileNames: '[name]-[hash].js'` | The brief's, with `rolldownOptions`. `modulePreload: { polyfill: false }` and `target: 'es2023'` are no-ops here (byte-identical output without them): no HTML input, so no polyfill. |
| 4 | The four URL sites | Add `/* @vite-ignore */` to each (`site/db.ts:13-14`, `site/map.ts:27`, `site/review.ts:37`): a change to `site/` beyond imports, to name in the phase report | Without it the build warns three times and works; with it no warning, the same output without the `'' +`, and the test server resolves the URLs as the build does (Evidence, "In a test"). Also guards against a root `data/` or `vendor/` folder, which Vite would otherwise emit as an asset. |
| 5 | A cached entry | For 3.2 to weigh: a browser holding `main.js` from before a deploy (Pages sends `max-age=600`) imports a `kept-<hash>.js` the deploy removed: a 404 and no page for up to ten minutes. Today a stale `main.js` imports fresh modules by fixed names. Fixed chunk names (`'[name].js'`, a named group) give today's behaviour back. | The brief allows hashed chunks without weighing it. |

## Evidence

Node 22.22.0, pnpm 10.30.0, Vite 8.3.5 (Rolldown 1.2.15), Chromium `/opt/pw-browsers/chromium` (Playwright 1.64.1).
`pnpm install --frozen-lockfile`, then `pnpm add -D -E vite@8.3.5`: "Already up to date", `added 0`, the lockfile's diff
is the importer's three lines.

**Output.** `vite build` (0.68 s; `tsc` 0.90 s): three files, flat, no `assets/`, no `.map`:

| Build | Files | Bytes | gzip -9 of all |
| -- | -- | -- | -- |
| `tsc` today | 59 (one per module) | 400,583 | 119,472 |
| Vite, `main` + `review` | `main.js` 124,470, `review.js` 19,325, `kept-D8_4RdZx.js` 43,370 (shared, named by Rolldown after `kept.ts`) | 187,165 | 63,681 |
| Vite, with `icons` | the same plus `icons.js` 95 (a facade) and `icons-C5y4P4Xi.js` 27,749; `kept-…` falls to 15,624 | 187,297 | not measured |

`index.html` loads 54 JS files today, 2 with Vite; `review.html` 22, 2. No `__vite`, `modulepreload` or `<style>` in the
output; no dynamic `import()` in `site/`.

**The URL sites.** The build warns `new URL("…", import.meta.url) doesn't exist at build time, it will remain unchanged`
for `../data/` (once, for both sites), `../vendor/` and `../vendor/countries-50m.json`, and leaves each as
`new URL('../…', '' + import.meta.url)` (minified): not inlined, not emitted. `db.ts`'s two are in the shared chunk,
`map.ts`'s in `main.js`, `review.ts`'s in `review.js`, all in `js/`, so they resolve to the site's `vendor/` and
`data/`.

**In a test.** Vite's dev transform (the one Vitest uses) rewrites them to `new URL("/data", …)` and `"/vendor"`, with
no trailing slash: `kiz.sqlite` then resolves to `/kiz.sqlite`, which is why `vitest.config.ts` serves root files from
the fixture and `public/vendor`. With `/* @vite-ignore */` the transform leaves `../data/`, which resolves to `/data/…`
(`DATA_FILE`) and `/vendor/…` (Vitest's public folder): the browser projects passed, 44 files, 213 tests. The root-file
branch of the middleware may then be dead; 3.2 checks.

**`icons.js`.** With the third input and `preserveEntrySignatures: 'strict'`:
`export{t as Drawing,n as MORE_TRAITS,r as NOTE,i as TRAITS,a as icon}from"./icons-C5y4P4Xi.js"`, the five value exports
of `site/icons.ts`. Nothing reads it.

**Loaded in Chromium** (a scratch script: a static server, `python -m http.server`, on a folder whose `kiz-radar/` is
the built `public/`; each page's console, `securitypolicyviolation` events, failed and 4xx/5xx responses): `''`,
`#finder`, `#week`, `#map` (84 Leaflet paths, `vendor/countries-50m.json` fetched), `#artists`, `#countries`, `#sql`,
`#sources`, `#friends`, `c/frost-lantern-river-maple/`, `#community/frost-lantern-river-maple` (moved to `c/…/`) and
`review.html` (fetches `data/review.json`): each drew, with no console error or warning, no CSP violation, no failed
request, no inline script, no `<style>`. The same under `/kiz-radar/` and at the server's root. The `tsc` build, the
same probe: the same, clean.

**The tests.** `pages.browser.test.ts` against the Vite build: 5 passed; with `public/js/` moved away, 5 failed (it does
load the build). The whole suite with `vite.config.ts` at the root: 60 files, 414 tests passed (354, then
`rules.test.ts`'s 60 once the copy had `.oxlintrc.json`) (Vitest reads `vitest.config.ts`, not `vite.config.ts`). One
run timed out once on a hover in `gantt-apart`, which passed alone; that test does not load the build.

**Deploy.** `.github/workflows/pages.yml:41` runs `mise run build:site` only: no change. Its comment at `:3` ("Compiles
the site's TypeScript (site/) into public/js/") goes stale: mentioned, not edited (3.4).

## Impact on 3.2–3.4

- 3.2: `vite.config.ts` as decision 3 (no `process.env`; the spike's `ICONS` switch was for the spike), `vite` 8.3.5 in
  `devDependencies`, the four comments (decision 4), decision 5 settled; `build` =
  `rm -rf public/js public/vendor && vite build && pnpm run vendor`; the plan's "`render:design` draws the same cards"
  can go (decision 2); `vitest.config.ts`'s comment on the rewrite, and its root-file branch if dead.
- 3.3: the smoke set as the scratch script did it, inside `pages.browser.test.ts`.
- 3.4: `public/js/` lists 3 files, not 59; the brief's item 4 and `rollupOptions` corrected in the Phase 3 report.

## Done when

The evidence above, for each subtask of the row: met.
