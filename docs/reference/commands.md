# Commands

<!-- written by pipeline/reference.py from tasks.toml: mise run generate -->

Each is `mise run <task>`. A step takes its own arguments after `--` (`mise run tickets -- todo`); `--help` lists them.

| Task | What |
| -- | -- |
| `test:py` | The pipeline's tests, on every core in a new order, and the branches they reach (pyproject.toml) |
| `build:data` | public/data/kiz.sqlite and site.json, which the site loads, built from the export (they are never committed) |
| `export` | The path of the kizomba-world export the steps work on |
| `scrape` | Refresh the export's events from kizomba-world.com |
| `ask` | Ask Claude the extraction passes for the festivals that need them |
| `check-answer` | Check an answer to an extraction pass against its question, as ask does |
| `tickets` | Ticket pages and first reads, one festival at a time (CLAUDE.md) |
| `read-page` | Read one web page a plain request can't, for a one-off check |
| `load` | Load the saved answers and ticket reads into the export |
| `resolve` | Resolve the export's artist mentions into artists, with stable ids |
| `suggest-merges` | List likely duplicate artists for review (pipeline/artist_merge_suggestions.csv) |
| `geocode` | Place the export's cities on the map with OpenStreetMap Nominatim |
| `rates` | The euro's exchange rates from the European Central Bank |
| `fares` | Search and keep the festival weekends' return fares |
| `install:site` | The site's tools, as pnpm-lock.yaml pins them |
| `build:site` | The site's TypeScript (site/) compiled into public/js/, and the libraries it loads copied into public/vendor/ from the pinned packages |
| `serve` | The site and its data built, and served at http://localhost:8000 |
| `types:site` | tsc, strict, on the site and its tests |
| `lint:site` | Biome's rules and format on the site, its tests and its CSS, with the lint/ plugins |
| `knip` | No module, export or package the site doesn't use |
| `test:site` | The site's tests, in Node and in Chromium (vitest.config.ts), on the database built from the export |
| `dup` | No block written twice, in the code, tests, stylesheet or Actions, at the length .jscpd.json sets; the generated files aside |
| `lock:py` | uv.lock is what pyproject.toml resolves to (the site's lock is held by install:site's --frozen-lockfile) |
| `lint:py` | Ruff's rules on the Python code |
| `format:py` | The Python code as ruff formats it |
| `format:md` | The Markdown as mdformat writes it (.mdformat.toml), the prompts left as they are |
| `types:py` | basedpyright, strict, on the pipeline and its tests |
| `audit` | Every state in the data is one of pipeline/states.py |
| `generate` | Write the files built from the code: the enums and words of pipeline/states.py, the stylesheet's classes, docs/reference/ |
| `generate:check` | The files built from the code still say what it does |
| `hooks` | Install the git hooks (prek.toml): the quick checks before a commit, every check before a push; and check the claims submodule out |
| `lint:actions` | The workflows and their actions: actionlint, and zizmor's security rules (.github/zizmor.yml) |
| `update:actions` | Move each pinned action to its latest release two weeks old (pinact), then check the workflows |
| `hooks:check` | prek.toml is a configuration prek reads |
| `check:fast` | The quick checks, before each commit |
| `check:commit` | The quick checks, before a commit (prek.toml), on what is staged, in a worktree of its own |
| `check:push` | Every check, before a push (prek.toml), on the commit pushed, in a worktree of its own |
| `check` | Every check |
