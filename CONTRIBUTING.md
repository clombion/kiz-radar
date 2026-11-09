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
mise run check        # everything
mise run check:fast   # lint, format, types, the site built with its database and tested, the generated files
mise tasks            # each check on its own (see docs/reference/commands.md)
mise run format       # write the formats format:py, format:md and lint:site hold
```

The hooks run `check:commit` (the quick checks, on what is staged) before a commit and `check:push` (every check, on the
commit pushed) before a push, each in a worktree of its own. The **Tests** Action runs `mise run check` on every push.

- **Python:** every ruff rule but the few `pyproject.toml` ignores, each with its reason; basedpyright strict, `Any` an
  error. What comes from outside (an answer, a page, a CSV) is parsed into a record of `pipeline/records.py` where it
  enters. pytest runs strict, on every core, in a new order, with no network and a time limit per test, and fails below
  the branch coverage `pyproject.toml` sets.
- **Site:** tsc strict, every Biome rule but those `biome.jsonc` turns off, each with its reason, and the plugins in
  `lint/` (links in `routes.ts`, requests in `net.ts`, classes through `dom.ts`, markup only from `icons.ts`, promises
  reported, a state as `KEY`). A class is one the stylesheet defines (`site/classes.ts`, generated). vitest runs in Node
  and in Chromium (`pnpm exec playwright install chromium`, or a Chromium of the machine's own named in `CHROMIUM`), and
  fails below the coverage of the pure modules `vitest.config.ts` sets.
- **Suppressions:** a check is suppressed only on its line, naming its rule and why; `tests/test_suppressions.py` lists
  each, so a new one is a change to that list.
- **Duplicates:** jscpd fails on a block written twice, at the length `.jscpd.json` sets.
- **Generated files:** `mise run generate` writes `pipeline/enums.py`, `site/states.ts`, `site/classes.ts`,
  `lint/states.grit`, `docs/reference/`, and the home city (`pipeline/airports.csv`'s home) where `public/index.html`
  and `public/site.webmanifest` name it; `generate:check` fails when one differs from what it is built from.

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
| `site/` | the site's TypeScript |
| `public/` | the published site: page, stylesheet, fonts, icons; `js/`, `vendor/` and `data/` built |
| `tests/` | the pipeline's tests; `tests/site/` the site's |
| `lint/` | Biome's plugins |
| `design/` | the share card and the icons' sources |
| `docs/` | this documentation |
