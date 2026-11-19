# Task 2.2: oxfmt replaces Biome's formatter

Task 2.2 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026, not yet committed. oxfmt 0.79.0 lays
out the files Biome formatted, the same 132 and its own config; Biome's formatter is off and Biome lints as before.

## Summary

`oxfmt` is pinned exactly and reads `.oxfmtrc.jsonc`: the brief's options, `sortPackageJson` off, and ignore patterns
that let back in exactly `biome.jsonc`'s `files.includes` minus its formatter's exclusion (`site/states.ts`). A new
task, `format:site` (`pnpm run format`, `oxfmt --check`), joins `check:fast`; `mise run format` writes with oxfmt;
`lint:site` is Biome's rules alone. One formatting-only change reflows four files.

## Design model

- **The config names the files, not the command line**: `oxfmt` with no path runs on what `.oxfmtrc.jsonc` lets in, so
  the task, `mise run format` and an editor format the same set. The patterns ignore every file (`*`, folders kept by
  `!*/`), then let back in Biome's globs, then ignore `pnpm-lock.yaml`, `tests/site/lint/` and `site/states.ts` (task
  2.1: `!` globs on oxfmt's command line drop files).
- **A generated file stays its generator's**: `site/states.ts` stays excluded (oxfmt would change 2,324 diff lines of
  it); `site/classes.ts` and `site/schema.ts` are already as oxfmt writes them, so `pipeline/generate.py` is unchanged.
- **Formatting, not content**: oxfmt sorts `package.json`'s keys by default, which Biome never did; that is off.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Version | `oxfmt` 0.79.0, exact | `npm view oxfmt dist-tags` on 19 November: `latest` 0.79.0, the version 2.1 recorded. Released 16 November, three days before: younger than the two weeks `update:actions` waits; the brief's Q3 leaves that patience to the owner. |
| 2 | Config file | `.oxfmtrc.jsonc` at the root, the name oxfmt reads by default (also `.oxfmtrc.json`) | Comments carry each pattern's reason, as `biome.jsonc` does; Biome (`*.jsonc`) and oxfmt check it too. |
| 3 | `sortPackageJson` | `false` | On by default; it moves `packageManager` after `devDependencies`, a change of order, not of layout. |
| 4 | The check | Its own task, `format:site`, in `check:fast`, running a `package.json` script `format` | One check per tool, as `format:py` and `format:md`; the script makes knip see oxfmt used, so no `ignoreDependencies` entry. |
| 5 | Biome | `formatter: { enabled: false }`; `javascript.formatter` removed | With the formatter off its options mean nothing; the linter, plugins and overrides are as they were. |

## Evidence

- **File sets.** Biome before (`biome format --verbose .`): "Checked 132 files", the list of `biome check`'s 133 minus
  `site/states.ts`. oxfmt (`--list-different` with a probe config that changes every file): the same 132 plus
  `.oxfmtrc.jsonc`, 133; `oxfmt --check`: "on 133 files". `biome check` now checks 134 (the new config).
- **The reformat** (`pnpm exec oxfmt`, once): 4 files, 32 lines in, 27 out. `public/css/site.css`: the two long
  `unicode-range` values wrapped; `site/communities.ts` (two), `site/search.ts`, `tests/site/roster.test.ts`: a
  last-argument arrow function hugged (`.map((a): T => ({` … `}))`). Layout only.
- **Biome no longer formats**: a line mis-indented in `site/search.ts` passes `biome check --error-on-warnings` and
  fails `oxfmt --check`.
- **Order of commits**: Biome's formatter refuses the four reformatted files, and oxfmt refuses them unformatted, so the
  formatting-only commit cannot stand alone before or after the switch; see Impact.

## Impact

- **New:** `.oxfmtrc.jsonc`; this file.
- **Changed:** `package.json` (`oxfmt` 0.79.0, script `format`), `pnpm-lock.yaml`, `biome.jsonc` (formatter off),
  `tasks.toml` (`format:site`, `format`, `lint:site`'s description, `check:fast`), `CONTRIBUTING.md` ("Checks", "Site"),
  `docs/reference/commands.md` (generated); the four files above, formatting only.
- **Commits**, each passing `mise run check`: (A) oxfmt pinned, its config, Biome's formatter off, `format` writing with
  oxfmt, the docs, without `format:site` in `check:fast`; (B) the four files, formatting only; (C) `format:site` in
  `check:fast`. Or A and C as one commit holding B.

## Done when

`oxfmt --check` clean on 133 files; Biome's formatter off and `biome check` silent on layout; `mise run check` passes.
