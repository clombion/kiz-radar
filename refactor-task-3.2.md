# Task 3.2: the build on Vite

Task 3.2 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026; decision 7's removal made later, on
the owner's yes. `vite` 8.3.8 is the one Vite in the lockfile; the build writes `main.js`, `review.js` and
`shared-<hash>.js` with no warning; the suite passes.

## Summary

`vite build` replaces `tsc`'s output; `tsc` stays as the build's type check. Two entries, `main` and `review`, and one
shared chunk, flat in `public/js/`; the committed HTML, `vendor` and the deploy workflow as they are. A second commit
makes the tests reach `../data/` and `../vendor/` as the built site does.

## Design model

- **Vite builds scripts, never pages:** `index.html` and `review.html` keep loading `js/main.js` and `js/review.js`, so
  `generate:check` compares nothing new.
- **No `icons` input:** `design/render.cjs` reads `pipeline/drawings.py` since 2.6d and nothing imports
  `public/js/icons.js`; `render:design` checks nothing the build touches and leaves the "done when" (3.1's evidence).
- **One Vite:** each Vite link in `pnpm-lock.yaml` is a peer (`vitest`, `@vitest/browser`, `@vitest/mocker`:
  `^6.4.0 || ^7 || ^8`), which pnpm meets from the importer's own dependency.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Version | `vite` 8.3.8 exactly (`latest`); first check one `vite@` in the lockfile and one version in `pnpm why vite`; if two, pin 8.3.5 and say so | Q6 (current release) within Vitest's range: nothing forced, Vitest not bumped. 8.3.8 brings its own Rolldown; the output is measured again. |
| 2 | Config | `base: './'`, `publicDir: false`, `build.outDir: 'public/js'`, `emptyOutDir: true`, `build.rolldownOptions.input` `{ main, review }`, `entryFileNames: '[name].js'`, `chunkFileNames: '[name]-[hash].js'`, one shared group named `shared` | `main.js`, `review.js`, `shared-<hash>.js`. |
| 3 | The shared chunk's hash | Kept (3.1's decision 5 reversed) | Rolldown shortens the names a chunk exports: an old cached `main.js` meeting a new fixed-name `shared.js` fails on a missing name; with a hash it asks for its own chunk. Today's source-named files cannot be had back by fixing a name. |
| 4 | `build` | `rm -rf public/js public/vendor && tsc -p . && vite build && pnpm run vendor`; `types` = `tsc -p . && tsc -p tests/site` | A type error stops `build:site` today, so `pages.yml` deploys no commit that fails to type-check; Vite does not type-check. For the owner to override. |
| 5 | `tsconfig.json` | `noEmit`, `allowImportingTsExtensions`; `rewriteRelativeImportExtensions`, `outDir`, `rootDir` removed; `tests/site/tsconfig.json` without its `noEmit`/`rootDir`, `../../vite.config.ts` included | Only the browser read what `tsc` wrote. |
| 6 | The four URL sites | `/* @vite-ignore */` at `site/db.ts`, `site/map.ts`, `site/review.ts`: a change to `site/` named in the phase report | No warning; in a test the addresses resolve to `/data/…` and `/vendor/…`, as built. |
| 7 | The test server's root-file branch | The owner is asked: remove the branch, `first()`, `ROOT_FILE`, its reader in `tests/site/app.ts`, the `'/kiz.sqlite'` case of `server.browser.test.ts` (a test, so on the stop list), after making the branch throw where it serves a file and seeing only that case fail (corrected in 3.2: a branch throwing on every request it gets also fails four hover tests of `elements`, `gantt` and `gantt-apart`, since the pages' `mark.svg` and `loading.svg` pass through it to `public/`). The owner said yes: all of it removed, `answer()` left with the one fallback it then has (a 404), and the suite passing without it | Dead once (6) lands: measured in 3.2 (Result). |
| 8 | Lint and format | `lint:oxlint` gains `vite.config.ts`; the `import/no-default-export` override covers it with `vitest.config.ts`; `test_suppressions.py` adds it; oxfmt unchanged (root `.ts` left out) | An exception only where the config needs one. |
| 9 | knip, `.gitignore`, jscpd | `.gitignore` and jscpd unchanged; knip's `entry` loses `site/main.ts` and `site/review.ts` (corrected in 3.2: the plan said unchanged) | knip's Vite plugin reads `vite.config.ts`'s inputs as entries, and with them still listed knip prints two "Remove redundant entry pattern" hints (exit 0); without them, no hint, the same findings (none). `public/js/` stays ignored; jscpd finds 0 clones. |
| 10 | Docs | The `build:site` description, `commands.md`, `the-site.md`, the `vitest.config.ts` header, in commit 1; `pages.yml`'s comment and step name ("Compile the site") reported, not edited (stop list) | They turn false in commit 1. |

## Commits (each passes `mise run check`, which builds the site)

1. **Build the site with Vite:** decisions 1–5, 8–10.
2. **The tests ask for the site's files as the built site does:** decision 6, and 7 as the owner answers.

## Done when

`mise run build:site` writes `main.js`, `review.js` and `shared-<hash>.js`, then `vendor/`, with no warning after commit
2; `generate:check` clean; one `vite` in the lockfile; `pages.browser.test.ts` and the suite pass.

## Result

Commit 1 (`vite` 8.3.8, Rolldown 1.2.19, in place of 8.3.5's 1.2.15): `pnpm add -D -E vite@8.3.8` swaps every
`vite@8.3.5` link for `vite@8.3.8`, one `vite@` package in the lockfile and "Found 1 version of vite". `vite build`:
`main.js` 124,469 bytes, `review.js` 19,327, `shared-D8_4RdZx.js` 43,370 (187,166; gzip -9 of the three 63,964), three
warnings, one per URL (`../data/` once for both sites). Commit 2: `main.js` 124,466, `review.js` 19,324,
`shared-ggZAhEyJ.js` 43,364 (the `'' +` gone), no warning.

The root-file branch, measured over both browser projects (44 files, 213 tests): it gets `/loading.svg` 51 times and
`/mark.svg` 40 times, each passed to Vite's `public/` (neither is the fixture's or `vendor/`'s), and serves one file,
`/kiz.sqlite`, to `server.browser.test.ts`. Throwing where it would serve fails that case alone; throwing on every
request it gets also fails four hover tests (`elements`: the card over the page; `gantt`: two; `gantt-apart`: one).
Removing it (the owner's) leaves the two drawings to `public/` as now.
