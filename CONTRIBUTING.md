# Contributing

## Setting up

Everything runs through [mise](https://mise.jdx.dev): it installs the tools `mise.toml` pins (node, pnpm, uv) and the
git hooks, and runs each task of `tasks.toml`.

```bash
git clone --recurse-submodules https://github.com/clombion/kiz-radar
cd kiz-radar
mise trust && mise install      # the tools, and the hooks of prek.toml
mise run check                  # everything; passing ends with every task "Finished"
mise run serve                  # the site and its data at http://localhost:8000
```

Python packages come from `uv.lock` through uv, and the site's from `pnpm-lock.yaml` through pnpm; never pip or npm.
`claims/` is a submodule (the admin's claims); `mise run hooks` checks it out.

## Checks

```bash
mise run check           # everything
mise run check:fast      # lint, format, types, the site built with its database and tested, the generated files
mise run lint:oxlint     # the site's TypeScript, its tests and the house rules: oxlint, type-aware
mise run lint:stylelint  # the stylesheet: stylelint's rules
mise run format:site     # the site's layout: oxfmt --check
mise tasks               # each check on its own (see docs/reference/commands.md)
mise run format          # write the formats format:py, format:md and format:site hold
```

The hooks run `check:commit` (the quick checks, on what is staged) before a commit and `check:push` (every check, on the
commit pushed) before a push, each in a worktree of its own. The **Tests** Action runs `mise run check` on every push.

- **Python:** every ruff rule but the few `pyproject.toml` ignores, each with its reason; basedpyright strict, `Any` an
  error. What comes from outside (an answer, a page, a CSV) is parsed into a record of `pipeline/records.py` where it
  enters. pytest runs strict, on every core, in a new order, with no network and a time limit per test, and fails below
  the branch coverage `pyproject.toml` sets.
- **Site:** Solid 2.0, its views in `.tsx` (the conventions and the skills to read first are in [CLAUDE.md](CLAUDE.md));
  tsc strict; oxlint (`lint:oxlint`), type-aware, with each Biome rule it has an equivalent of and the type-aware rules
  new in oxlint (`.oxlintrc.json`, [Lint rules](docs/concepts/lint-rules.md)), a warning failing: a record's type is
  read-only where it is defined, a function returning a promise is async, and the names in an import's braces are in one
  order; stylelint on the stylesheet (`lint:stylelint`, `.stylelintrc.yaml`), with each Biome CSS rule it has an
  equivalent of and the stricter rules chosen, each with its reason ([Lint rules](docs/concepts/lint-rules.md)), a
  warning failing, its rules held to their fixtures (`tests/site/stylelint/`) by `tests/site/stylelint.test.ts`; in the
  JSON configs at the root, no key written twice or empty, nor a package in two groups (`tests/test_configs.py`);
  eslint-plugin-solid's `v2-strict` rules; and the house rules in `lint/` (links in `routes.ts`, requests in `net.ts`,
  classes through JSX's `class`, markup from the site's own code only through `icons.ts`, promises reported, a state as
  `KEY`, a test's values only from the modules `lint/tests.ts` lists, and those holding CLAUDE.md's conventions; the
  files each is on for are in Lint rules' table). A class is one the stylesheet defines (`site/classes.ts`, generated),
  in JSX too, where tsc types an element's `class` by it (`site/jsx-runtime.d.ts`, `tsconfig.json`'s `jsxImportSource`).
  vitest runs in Node and in Chromium (`pnpm exec playwright install chromium`, or a Chromium of the machine's own named
  in `CHROMIUM`), and fails below the coverage of the pure modules `vitest.config.ts` sets. The browser tests run in two
  projects: `browser`, with motion as most visitors have it, and `browser-calm`, for a visitor who asked for less
  motion, which runs the files named `*.calm.browser.test.ts` and no others (a calm file runs with reduced motion only).
  In both, a console warning, error or failing assert the test did not declare beforehand fails it
  (`tests/site/console.ts`'s `expectConsole`), so that Solid's development diagnostics and `site/report.ts`'s errors are
  never passed over. A test of the page starts it through `tests/site/app.ts`, whose header says how (once per file; the
  day, data, storage, or its refusal, and other hosts' answers stated before the start); the test server answers the
  tests' pages with the fixture's data only, never `public/data/`. `tests/site/pages.browser.test.ts` loads the built
  site instead, Vite's bundle (`vite.config.ts`), in a frame under each page's Content-Security-Policy: every route, the
  older `#community/<key>` link and `review.html`, each drawn with no error, failed request or refusal.
  `tests/site/bundle.test.ts` reads the bundle's markup, the templates Solid's compiler writes, drawn or not, for what
  that policy refuses. oxfmt (`format:site`) lays out the site, its tests, the stylesheet, the JSON configs and the
  house rules with their fixtures (`.oxfmtrc.jsonc`), sorting the import statements of all but the fixtures, but
  `site/states.ts` and `site/drawings.ts`, which their generators lay out.
- **Suppressions:** a check is suppressed only on its line, naming its rule and why; `tests/test_suppressions.py` lists
  each, so a new one is a change to that list, and an oxlint or stylelint one is also explained in
  [Suppressed findings](docs/lint-false-positives.md).
- **House rules:** a rule of `lint/plugin.ts` is a module beside it, `lint/<rule>.ts` (ESLint's rule API, never reading
  the file's path but to find what its imports name, as `privates` does), listed in the plugin's `rules` and turned on
  in `.oxlintrc.json` as `house/<rule>: error`; the files it is on for, and its exemptions, are `.oxlintrc.json`'s
  overrides, by globs from the root (`site/*.ts`, `tests/**`), so no folder above the checkout changes what a rule sees;
  an exemption of some of a file's code is the rule's options in that file's override (`tests`' in `tests/site/app.ts`).
  It ships with fixtures in `lint/fixtures/<rule>/`, at the paths from the root the overrides read: a file it refuses,
  each refused line ending `// refused` (`// refused: <rule>` for another house rule's finding; in JSX's text, where a
  comment would be text, `{/* refused */}` anywhere on the line), a `good.ts` (`good.tsx` for a rule on `.tsx` alone, or
  one only JSX can break) written the intended way that it lets through, in a file it is on for with no exemption, and,
  where it has exemptions, the forbidden form in an exempt file (`site/kept.ts`, `tests/…`). `tests/site/rules.test.ts`
  lints the fixtures with the house rules as `.oxlintrc.json` sets them, each override's globs found in each rule's
  folder, and fails on a finding on an unmarked line, a marked line not found, a rule without fixtures or a folder
  without a rule. The fixtures are kept out of oxlint's run of the tree, tsc, knip, jscpd and Vitest; oxfmt lays them
  out, but `semicolons`', whose JSX text it would change.
- **Duplicates:** jscpd fails on a block written twice, at the length `.jscpd.json` sets.
- **Generated files:** `mise run generate` writes `pipeline/enums.py`, `site/states.ts`, `site/classes.ts`,
  `site/drawings.ts` (from `pipeline/drawings.py`), `lint/state-keys.ts`, `docs/reference/`, and the home city
  (`pipeline/airports.csv`'s home) where `public/index.html` and `public/site.webmanifest` name it; `generate:check`
  fails when one differs from what it is built from.

## Making changes

- Commit to `main`; the repository takes no pull requests. Each commit is whole and passes `mise run check` on its own.
- A commit message says what changed and why, in prose: the subject what is true now, the body what was wrong and how it
  is held.
- Fix by construction first (a type, a record, a check the database enforces); add a test only where construction can't
  hold it, and make it fail on the defect.
- A change to a prompt's text, a state's criterion or a record changes the prompt's hash: start **Refresh events** at
  once after the push ([Refreshing the events](docs/guides/refreshing-events.md)).
- A new state that changes the site's words or a prompt needs the admin's OK
  ([Adding a state](docs/guides/adding-a-state.md)).

## Where things are

| Folder | What |
| -- | -- |
| `pipeline/` | the steps (one Python package), their records, the shared CSV files, the fare history (`fare_offers/`) |
| `pipeline/extract/` | the passes Claude answers, the load, the artists' resolution, the merge review |
| `pipeline/tickets/` | ticket-site recipes, read logs, first reads, `status.csv` |
| `source/` | the kizomba-world export |
| `claims/` | the admin's claims (a submodule) |
| `site/` | the site's TypeScript, its views Solid's (`.tsx`), bundled by Vite into `public/js/` (`vite.config.ts`) |
| `public/` | the published site: page, stylesheet, fonts, icons; `js/`, `vendor/` and `data/` built |
| `tests/` | the pipeline's tests; `tests/site/` the site's |
| `lint/` | the house rules: oxlint's plugin (`plugin.ts`, a module per rule) with its fixtures |
| `design/` | the share card and the icons' sources |
| `docs/` | this documentation |
