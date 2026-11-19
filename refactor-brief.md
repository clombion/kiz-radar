# Kiz Radar: move to Solid 2.0 and the Oxc toolchain

> **Reviewed against the repository on 18 November 2026** (`main` at `ca33b56f`). The owner's decisions are unchanged.
> Everything the review added is marked **[Review]**: a "Repo facts" block per phase, inline notes, and a final "Review
> findings" section. Evidence is given as `file:line`. Nothing was installed and nothing in the repository was edited.
>
> **Answered since (18 November):** Q1 yes (move-only commits), Q5 yes; Phase 1 tests start the app in the test's own
> page, one start per file. **Answered 19 November:** "kept across a reload" becomes two test files joined by one
> constant. Where this brief disagrees with [refactor-plan.md](refactor-plan.md) or a task plan (the first is
> [refactor-task-1.1.md](refactor-task-1.1.md)), the newer document holds: in particular the Phase 1 notes on the
> harness, and the notes that wait on Q1 and Q5 ("do not move code", "list … and ask"). The brief errors found so far
> are listed in refactor-plan.md's Phase 1 report.

You are working on kiz-radar. This brief sets out decisions already made, the order of work, and how each phase is
judged done. The decisions were researched and tested on 18 November 2026; the evidence is summarised under each one so
you can re-check it rather than re-argue it.

**[Review] House conventions that bind every phase** (`CLAUDE.md`, `CONTRIBUTING.md`):

- Commit to `main`; no pull requests. Each commit is whole and passes `mise run check` on its own (`CONTRIBUTING.md`
  "Making changes"). The pre-commit hook runs `check:commit` and the pre-push hook `check:push` (`prek.toml`), each in a
  worktree, so a half-migrated commit cannot be pushed.
- Packages come through pnpm (`pnpm-lock.yaml`, `packageManager: pnpm@10.30.0`); never npm. `npm view` is fine for
  looking.
- Every step is a task of `tasks.toml`, run as `mise run <task>`. `docs/reference/commands.md` is generated from
  `tasks.toml`: after adding or re-describing a task, run `mise run generate`, or `generate:check` fails.
- A suppression is on its line, names its rule and why, and is listed in `tests/test_suppressions.py`.
- None of this work touches a prompt, a state or a claim, so no "Refresh events" run is due. If a phase does change
  `pipeline/states.py` or a template, stop: that is outside this brief.

## Why

Kiz Radar is growing from a static festival finder into a platform: accounts on Cloudflare Workers and Durable Objects,
then pages for organisers, dancers ("where I'm going") and artists, plus links to an agenda generator and a flyer
generator. The signed-in user and their role will touch nearly every view, and most new code will be forms and writes.
The current views (`h()` plus `replaceChildren` redraws) have no reactivity. Solid 2.0 is the foundation for that work,
and it must be in place **before** accounts are built, so that nothing is written twice.

## Decisions already made

1. **Framework: Solid 2.0** (`solid-js` 2.0.0, `@solidjs/web` 2.0.0). It is plain TSX, so TypeScript 7 checks it with no
   plugin: a test file of Solid 1.x code produced 15 type errors (removed APIs, moved import paths, the one-argument
   `createEffect`, `classList`, a signal passed as a prop).
   - **[Review]** The registry now has `solid-js` **2.0.1** and `@solidjs/web` **2.0.1** as `latest` (published 18
     November, the day of the brief; 2.0.0 was 17 November). `@solidjs/web@2.0.1` requires `solid-js ^2.0.1`, so the two
     move together. See open question Q3 for which to pin.
2. **Build: Vite with `@solidjs/vite-plugin` 3.0.x**, using its default native compiler (`@solidjs/compiler`). **No
   Babel**: it is an optional dependency, used only with `compiler: "babel"`. Do not install it. Note the old package
   name `vite-plugin-solid` still serves Solid 1.x; do not use it.
   - **[Review]** Confirmed: `@solidjs/vite-plugin@3.0.1` depends on `@solidjs/compiler ^2.0.0`; `@babel/core` and
     `@solidjs/babel-plugin` are optional peers. It requires `vite ^8.0.0 || ^9.0.0` and Node `>=22.12.0` (the repo pins
     node 22.22.0, `mise.toml`).
   - **[Review] `vite` itself is not named anywhere in this brief as a dependency.** It is implied by this decision and
     is treated as named: add it to `devDependencies` and pin it exactly. Today it is present only transitively
     (`vite@8.3.5` under `vitest@5.0.5`); pin the same version Vitest resolved so there is one Vite in the lockfile, and
     move it only together with Vitest.
3. **One linter per file type, no overlap.**
   - **oxlint owns `.ts` and `.tsx`**: the rules mapped from the current Biome config, the type-aware rules (via
     `oxlint-tsgolint`, which is built on TypeScript 7 and works with it), Solid's own rules, and the house rules.
   - **Biome keeps CSS and JSON linting only**, with JavaScript linting and its formatter switched off. oxlint has no
     CSS linting, and `site.css` relies on about 30 Biome CSS rules.
   - **oxfmt formats everything.**
     - **[Review]** "Everything" must mean **the files Biome formats today**, no more: `site/**`, `tests/**/*.ts`,
       `public/css/**`, root `*.json` and `*.jsonc`, except `pnpm-lock.yaml` and `site/states.ts` (`biome.jsonc:4-6`).
       oxfmt run bare would also take Markdown (owned by mdformat, `tasks.toml` `format:md`), YAML, HTML (the committed
       `public/index.html` and `public/c/<key>/index.html`, which `generate:check` compares byte for byte), and some
       2,700 JSON data files under `pipeline/`, `source/` and `claims/`. Scope it with explicit paths plus
       `ignorePatterns`.
4. **Solid's lint rules**: `eslint-plugin-solid` (0.20.0 or later), `v2-strict` rule set, loaded into oxlint through
   `jsPlugins`. Do not add ESLint itself: `typescript-eslint` does not accept TypeScript 7.
   - **[Review]** Confirmed: 0.20.0 is `latest` and exports `./configs/v2-strict`. It declares `eslint ^9 || ^10` as a
     peer. \[19 November: the peer is optional (`peerDependenciesMeta`), and pnpm prints no warning; Q4 is moot.\] pnpm
     10 does not fail on that. Leave the warning alone unless the owner says otherwise (Q4); do not silence it with
     `peerDependencyRules`, which is close to the forbidden forcing.
5. **House rules become oxlint JS plugin rules** (ESLint rule API). oxlint has no `no-restricted-syntax`, so each rule
   is a small visitor function. oxlint's JS plugins are labelled alpha; that risk is handled by fixtures (see "Rules
   about rules").
6. **Accessible widgets**: Kobalte is Solid's headless component library. At the time of writing, its 2.0 alpha requires
   exactly `solid-js` 2.0.0-rc.16 and will not install against 2.0.0 final. Use Kobalte only once a release accepts the
   `solid-js` version you have installed. Never force it with `--legacy-peer-deps`, overrides or `--force`. Until then,
   the existing combobox and dialog keep their behaviour and their tests.
   - **[Review]** Confirmed: `@kobalte/core` `alpha` is `2.0.0-alpha.4`, peers `solid-js: 2.0.0-rc.16`,
     `@solidjs/web: 2.0.0-rc.16` (exact). `latest` is 0.13.14 (Solid 1.x). Not usable.
   - **[Review] Where they live.** The combobox is the search box: `site/search.ts:283` (`role: 'combobox'`), its
     listbox at `site/search.ts:292`, the highlight at `site/search.ts:335-338`, inside a `<dialog>` built at
     `site/search.ts:317`. The dialog is `site/modal.ts:13` (`modal(dlg)`, `showModal` at `:43`, the history entry that
     the back button closes) and `peek` at `site/modal.ts:80-89`; the flights dialog opens from
     `site/flights.ts:118-122`, the passes dialog from `site/passes.ts:77`. The review dashboard has its own token
     dialog, `site/review.ts:83-94`. Their tests: `tests/site/page.browser.test.ts:144` (dialog history), `:213`
     (dismissable card), and the search tests in `tests/site/views.browser.test.ts`.
7. **Agent documentation**: Solid ships agent skills inside the package, under `node_modules/solid-js/skills/` (a 2.0
   guide, a cheatsheet, and a guide to its diagnostic codes). Point `CLAUDE.md` at them and read them before writing
   Solid code. Your training data is mostly Solid 1.x; when in doubt, the bundled docs win.
   - **[Review]** Not verifiable before install (nothing is installed). Check the folder exists in the version you pin
     as the first act of Phase 4, and report if it does not.

## Version policy

Versions above were current on 18 November 2026. Before installing, check the current releases with
`npm view <package> dist-tags` and pin **exact** versions (no `^` or `~`) for `solid-js`, `@solidjs/web`,
`@solidjs/vite-plugin`, `@solidjs/compiler`, `oxlint`, `oxlint-tsgolint`, `oxfmt`, `eslint-plugin-solid` and
`@biomejs/biome`. Upgrades are deliberate commits of their own.

**[Review] What the registry said, 18 November 2026, from this container** (`npm view <pkg> dist-tags`; the registry is
reachable, nothing was installed):

| Package | `latest` | Other tags | Notes |
| -- | -- | -- | -- |
| `solid-js` | 2.0.1 | `next` 2.0.0-rc.23, `v1-latest` 1.9.19 | the brief says 2.0.0 |
| `@solidjs/web` | 2.0.1 | `next` 2.0.0-rc.23 | peer `solid-js ^2.0.1` |
| `@solidjs/vite-plugin` | 3.0.1 | `next` 3.0.0-next.35 | peers `vite ^8 \|\| ^9`, `solid-js ^2`, `@solidjs/web ^2`; node >=22.12 |
| `@solidjs/compiler` | 2.0.1 | `next` 2.0.0-rc.23 | native bindings as optional deps (linux-x64-gnu, darwin, win32, wasm32-wasi) |
| `oxlint` | 1.94.0 |  | peer `oxlint-tsgolint >=7.0.2007` |
| `oxlint-tsgolint` | 7.0.2007 |  |  |
| `oxfmt` | 0.79.0 |  |  |
| `eslint-plugin-solid` | 0.20.0 |  | peer `eslint ^9 \|\| ^10`; node >=22 |
| `vite` | 8.3.8 | `beta` 8.4.0-beta.1 | installed transitively: 8.3.5 |
| `@kobalte/core` | 0.13.14 | `alpha` 2.0.0-alpha.4 | alpha peers exactly `2.0.0-rc.16` |
| `@biomejs/biome` | 2.6.8 |  | pinned today: 2.6.3 |
| `vitest` | 5.1.1 |  | pinned today: 5.0.5 (peer `vite ^6.4 \|\| ^7 \|\| ^8`) |
| `typescript` | 7.0.2 |  | pinned today: 7.0.2 |

- **[Review]** Already pinned exactly in `package.json` and staying: `@biomejs/biome` 2.6.3, `typescript` 7.0.2,
  `vitest` 5.0.5, `@vitest/browser-playwright` 5.0.5, `@vitest/coverage-v8` 5.0.5, `playwright` 1.64.1, `knip` 6.43.0,
  `jscpd` 4.0.5. Do not bump Biome or Vitest inside a phase: the "89 of 94" and "241 of 279" figures were measured on
  Biome 2.6.3.
- **[Review]** Add `vite` to the exact-pin list (decision 2). `@solidjs/compiler` is a dependency of the plugin, not
  something the site imports: pinning it means a `pnpm.overrides` entry or a direct devDependency that knip will report
  as unused (then `ignoreDependencies` in `knip.jsonc`, with its reason). Prefer the direct devDependency plus the knip
  note.
- **[Review]** The native packages (`oxlint`, `oxfmt`, `oxlint-tsgolint`, `@solidjs/compiler`) ship platform binaries as
  optional dependencies. `pnpm install --frozen-lockfile` (`tasks.toml` `install:site`) must resolve them on the
  developer's machine and on `ubuntu-latest`; check the lockfile holds both.

## Order of work

Each phase changes one thing, so a failure points to its cause. Do not start a phase until the previous one meets its
acceptance criteria. Each phase lands as its own commit series, with the whole suite green at every commit.

**[Review] Baseline to record before Phase 1** (so "before and after" counts mean something): the test totals
`pnpm run test` prints for the `node` and `browser` projects (by grep there are about 230 `test(` declarations, 133 of
them in the 9 `*.browser.test.ts` files; three use `test.each`/`test.for`), and Biome's output. Today `pnpm run lint`
exits 0 with **"Checked 94 files … Found 38 infos"**: 38 findings at info level, which `--error-on-warnings` lets
through (see Phase 2 and Q2).

### Phase 1: tests that survive a rewrite

The browser tests currently import view functions directly (for example `artistsView`, `eventCard`), so rewriting the
views would break the safety net exactly when it is needed.

- Rewrite them to render the app (or a route) and drive it through the page: `page`, `userEvent`, accessible roles and
  labels. Assert on what a user sees and can do, not on internal structure.
- Pure logic modules (`db`, `plans`, `routes`, `states`, `rows`…) keep their unit tests as they are.
- Add a house rule (Grit for now, ported in phase 2) forbidding test files from importing view modules.

**Done when:** the full suite passes on the unchanged `h()` code; no test imports a view module, and the new rule
enforces it; coverage of user-visible behaviour is no lower than before. Report any behaviour that was tested before and
can no longer be tested this way.

#### [Review] Repo facts for Phase 1

**Which `site/` modules are views.** Decided by reading each module, not by its name: a module is a view module if it
builds or changes DOM (calls `h()`, `button()`, `replaceChildren`, `document.*`, or takes an element to draw into).

- **Pure logic, no DOM (24):** `calendar`, `claims`, `classes` (generated), `currency`, `days`, `db`, `fares`, `find`,
  `finder`, `fold`, `github`, `ink`, `json`, `media` (since 1.2: the media queries the script shares with the
  stylesheet), `names`, `net`, `pending`, `pricing`, `roles`, `roster`, `rows`, `schema` (generated), `states`
  (generated), `wording`. (`find`, `finder` and `wording` import only *types* from `dom.ts`/`icons.ts`, plus `finder`'s
  `TRAITS` data from `icons.ts`.) Seventeen of these are the coverage list in `vitest.config.ts:72`.
- **Browser APIs but no rendering (3):** `routes` (`location`, `history`, `document.baseURI`;
  `site/routes.ts:35,63,138,141`), `hints` (localStorage), `kept` (local and session storage). Treat as pure for the
  rule; `routes` is in the coverage list.
- **A data module with one sink (1, since 1.2):** `icons`. It draws nothing on import; its one write, `Drawing.into`,
  runs when a view calls it and takes only the class's own SVG (refactor-task-1.2.md). Treat as pure for the rule.
- **View modules (30):** `artists`, `communities`, `countries`, `details`, `dismiss`, `dom`, `eventcard`, `festivals`,
  `flights`, `friends`, `gantt`, `main`, `map`, `modal`, `money`, `months`, `passes`, `people`, `plans`, `report`,
  `review`, `search`, `sentence`, `sources`, `swipe`, `tables`, `tabs`, `ui`, `updating`, `week`. (`globals.d.ts` is
  declarations only.)
- **Correction to the brief: `plans` is not a pure module.** `site/plans.ts:6` imports `button, h, nodes, own` and
  exports renderers (`doingTag` `:168`, `goingLine` `:175`, `whoLines` `:212`, `whoIsGoing` `:249`) beside data
  functions (`friendsIn` `:97`, `togetherHref` `:439`, `person` `:466`).
- **Mixed modules** hold pure exports that tests use today inside a view module: `plans` (above), `festivals`
  (`festivals()` `:140`, `withDetails` `:113` are data; `leftOut` `:155` draws), `ui` (date wording `:42-60` and
  `flightsUrl` `:74` are pure; `away`, `place`, `nowTag`, `loading` draw), `money` (`money`, `convert` are pure;
  `currencySwitch` `:21` draws), `passes`, `map` (`citiesOf` is pure), `search` (`cityEntries` is pure), `people`
  (`SAID_MS`), `tabs` (`PAD`), `dismiss` (`WIDE`, moved to `media` in 1.2), `report` (`done` `:22` calls `report()`,
  which draws; `guarded` `:27` draws). Task 1.2 settled each: refactor-task-1.2.md.

**Which test files import view modules today** (value imports; `tests/site/`):

| Test file | Tests | View modules imported |
| -- | -- | -- |
| `views.browser.test.ts` (2,071 lines) | 75 | `artists` (`artistsView`), `communities` (`communityView`), `dom` (`h`), `eventcard` (`eventCard`), `festivals`, `friends` (`friendsTabs`, `friendsView`), `gantt` (`ganttByPlace`), `people` (`personView`, `SAID_MS`), `plans` (`doingTag`, `friendsIn`, `NAMED_UP_TO`, `NEAR_KM`, `togetherHref`, `whoLines`), `search` (`cityEntries`), `sources` (`sourcesView`) (`:5-19`) |
| `page.browser.test.ts` | 14 | `dismiss` (`dismissable`), `dom` (`button`, `choices`, `h`, `paged`, `toggle`), `icons` (`Drawing`, `NOTE`), `modal` (`modal`), `tabs` (`PAD`, `pill`, `slide`) (`:5-9`) |
| `review.browser.test.ts` | 11 | `review` (`reviewView`) (`:8`) |
| `onnow.browser.test.ts` | 6 | `eventcard`, `festivals`, `sentence` (`sentenceView`) (`:8-11`) |
| `flights.browser.test.ts` | 5 | `eventcard`, `festivals` (`withDetails`) (`:10-12`) |
| `map.browser.test.ts` | 2 | `map` (`citiesOf`, type `Placed`) (`:3`) |
| `updating.browser.test.ts` | 2 | `updating` (`updated`, `updatingPage`) (`:4`) |
| `main.browser.test.ts` | 8 | `report` (`done`, `:7`); and `await import('../../site/main.ts')` (`:47`), the app's entry |
| `states.test.ts` (node) | 6 | `icons` (`Drawing`, `MORE_TRAITS`, `TRAITS`) (`:9`) |
| `styles.test.ts` (node) | 8 | `dismiss` (`WIDE`), `icons` (`Drawing`) (`:4-5`) |
| `samples.ts` (helper) |  | types only, from `festivals` and `passes` (`:3-4`) |

Not affected: `pages.browser.test.ts` (imports `routes` only, and loads the built site in a frame),
`recipes.browser.test.ts` (tests `pipeline/rows.js`, no site module), and the other twelve node test files.

**The two patterns to build on already exist.**

- `main.browser.test.ts:11-50` puts `public/index.html`'s body into the test page, loads the three vendor scripts from
  `node_modules`, stubs `fetch` to serve the fixture data, and imports `site/main.ts`. This is "render the app": extend
  it. It runs the *source* through Vitest's own Vite server.
- `pages.browser.test.ts:14-30` loads the *built* site (`public/`, served under `/kiz-radar/` by the `pages()` plugin,
  `vitest.config.ts:28-60`) in an iframe. This is the only test of the build output, and the only one that runs under
  the page's Content-Security-Policy.
- Data: `data.setup.ts` builds `public/data/` if missing and writes `.vitest/fixture-data/` with the fixture community
  (`community.fixture.ts`); `shipped.ts` loads it in the browser. Tests that today hand a view crafted rows
  (`flights.browser.test.ts:23-…` plants airports and fares into the loaded database before calling `eventCard`;
  `onnow.browser.test.ts` crafts festivals in each phase) will need that data planted *before the app starts*, or the
  day pinned (`db.ts` `freshDay`, the `today` table).

**[Review] Notes on the tasks.**

- **Define the rule by a list, not by guesswork.** The Grit rule (and its oxlint port) refuses, in `tests/**`, any
  import from `site/` other than the pure and browser-API modules listed above, with one allowance: the dynamic
  `import('../../site/main.ts')` and its twin for `site/review.ts`, which is how a test starts the app. Keep the list in
  one place and say in the rule's message where it is. Type-only imports (`import type`) are allowed: they are erased
  and bind no test to a view's code.
- **The mixed modules block a clean rule** (Q1). Tests legitimately use `festivals()`, `friendsIn`, `citiesOf`,
  `cityEntries`, `Drawing`, `WIDE`, `PAD`, `SAID_MS`, `NAMED_UP_TO`, `NEAR_KM`. Either each test states the outcome a
  user sees instead of reading the constant, or the pure export moves to a pure module. A move is a change to `site/`
  beyond "unchanged `h()` code", so it needs the owner's word; until then, do not move code.
- **`page.browser.test.ts` tests the helpers themselves** (`h()`, `choices`, `paged`, `toggle`, `pill`, `slide`,
  `modal`). Phase 4 deletes `h()`, so tests 1, 2 and 11 (`:16`, `:41`, `:168`) test something that will stop existing;
  the others (the tab oval, the slide, the dialog's history entry, the paged list, the dismissable card) are
  user-visible and must be re-expressed through the app. Deleting a test is on the stop-and-ask list: list tests `:16`,
  `:41`, `:168` in the phase report and ask, proposing what replaces each ("text from the data never becomes markup" is
  user-visible and must survive as an app-level test).
- **"Coverage no lower than before" needs a measure.** `vitest.config.ts:68-75` measures coverage only for the 17 pure
  modules; no number exists for the views. Produce two things: (a) a ledger, one row per old test, naming the new test
  that holds the same behaviour, or "cannot be tested through the page" with the reason; (b) a one-off v8 report over
  `site/**` before and after (`pnpm exec vitest run --coverage.include='site/**' --coverage.thresholds.perFile=false`),
  without changing the committed config. Report both.
- `tests/test_suppressions.py:65-76` lists the site's suppressions by file; if a rewritten test file needs one, that
  list changes in the same commit.
- A new Grit file goes in `lint/` and in `biome.jsonc`'s `plugins` (`:7-20`). jscpd scans `tests/` with a 20-token
  minimum (`.jscpd.json`): app-level tests share set-up, so put it in a helper beside `shipped.ts`, not in each file.

### Phase 2: lint and format on the Oxc toolchain, on unchanged code

**Formatting.** Replace Biome's formatter with oxfmt, using this config (it reproduces Biome's output on 89 of the 94
files Biome formats today):

```json
{ "singleQuote": true, "printWidth": 120, "tabWidth": 2, "useTabs": false,
  "overrides": [
    { "files": ["*.css"], "options": { "singleQuote": false } },
    { "files": ["*.json", "*.jsonc"], "options": { "trailingComma": "none" } }
  ] }
```

Expect one reformatting commit touching about 4 files (around 60 lines): last-argument arrow functions in 3 TypeScript
files, and the long `unicode-range` values in `site.css`. That commit contains formatting only.

- **[Review]** Biome *checks* 94 files and *formats* 93: `site/states.ts` is excluded from the formatter because its
  generator lays it out (`biome.jsonc:5-6`; `biome format` reports "Checked 93 files"). oxfmt must skip it too
  (`ignorePatterns`), or `generate:check` and `oxfmt --check` will fight. The same goes for the other generated files if
  oxfmt disagrees with their generators: `site/classes.ts`, `site/schema.ts` (`pipeline/generate.py:203-207`). If it
  does, change the generator's output, not the file.
- **[Review]** After Phase 1 the file count will differ from 94; re-measure rather than expect "about 4 files".
- **[Review]** `mise run format` (`tasks.toml:142-148`) ends with
  `pnpm exec biome check --write --linter-enabled=false`; replace that with oxfmt's write, and update the task's
  description and CONTRIBUTING's "Checks" block.

**Linting.** Build `.oxlintrc.json` from the current Biome config, not from oxlint's defaults:

- List the enabled Biome rules with `biome rage --linter`, then map each to its oxlint equivalent. Biome records each
  rule's ESLint-family source in its rule declarations; use those. On 18 November this mapped about 241 of the 279
  TypeScript rules that apply here, including 19 of the 20 rules enabled explicitly under `nursery`.
  - **[Review]** Confirmed: `biome.jsonc:53-74` enables exactly 20 nursery rules; the one without an equivalent,
    `noMisleadingReturnType` (`:73`), is on the accepted-loss list.
  - **[Review]** The config is `"preset": "all"` (`biome.jsonc:24`) minus 23 rules switched off, each with its reason
    (`:25-52`). Carry each reason into the mapping document; a rule off in Biome stays off in oxlint.
- Port the settings and exceptions, or the result will be wrong. A first run with the bare mapping produced 362 findings
  on code that passes Biome, mostly from these:
  - `no-use-before-define`: Biome's version ignores function declarations; set `functions: false`.
  - `eqeqeq`: the project allows `== null` (`noEqualsToNull` is off); configure it the same way.
  - `max-params`: match the limit Biome uses (`biome explain useMaxParams`).
    - **[Review]** No limit is set in `biome.jsonc`, so it is Biome's default: **4** (`biome explain useMaxParams`: "The
      maximum number of parameters allowed (default: 4)"). Its default severity is `warn`, which `--error-on-warnings`
      makes a failure.
  - `explicit-member-accessibility`: Biome's default omits `public`; match it.
  - The per-folder exceptions in `biome.jsonc` (`site/report.ts` may use the console; `tests/**` and `vitest.config.ts`
    may use Node modules and inline regexes).
    - **[Review]** The exceptions, exactly (`biome.jsonc:77-94`): (1) `site/report.ts`: `noConsole` off. (2) `tests/**`
      and `vitest.config.ts`: `noNodejsModules` off, `useTopLevelRegex` off, and **`useConsistentTestIt` set to
      `function: "test"`**, which the brief omits: port it (`vitest/consistent-test-it` with `fn: "test"`). The
      inline-regex exemption is moot, since `useTopLevelRegex` is an accepted loss.
    - **[Review]** `vitest.config.ts` is named in that override but is **not in Biome's file set** (`files.includes`,
      `biome.jsonc:4`, has no root `*.ts`), so Biome has never linted it. Decide deliberately: lint `vitest.config.ts`,
      the new `vite.config.ts` and the plugin's own source with oxlint, under the same exemptions as the tests. They are
      new to linting, so expect findings; fix them in their own commit.
- **[Review] The 38 info-level findings.** Biome reports 38 infos today that do not fail the check: `noBitwiseOperators`
  (19), `noAwaitInLoops` (4), `noExcessiveCognitiveComplexity` (4), `useDestructuring` (2), `useNamedCaptureGroup` (2),
  `useShorthandAssign`, `noExcessiveClassesPerFile` and others. oxlint has no info level: mapped as errors they fail,
  mapped as off they are dropped. Neither is settled by this brief (Q2). Until the owner answers, map them as `off`, and
  list each in the mapping document under "reported as information by Biome, not enforced", with today's count.
- About 70 findings came from type-aware rules (`strict-boolean-expressions`, `no-unnecessary-condition`,
  `no-base-to-string` and others) being stricter than Biome's versions. Review each one:
  - **A real issue:** fix the code.
  - **A false positive** (some looked like misreadings of generic types): disable that line only, with a comment saying
    why, and add a minimal reproduction to `docs/lint-false-positives.md`.
  - Never disable a rule globally to clear findings.
  - **[Review]** Each such line is a new suppression: `tests/test_suppressions.py` must learn oxlint's comment form and
    list it (below).
- Port the 12 Grit rules in `lint/` to an oxlint JS plugin, one rule each, keeping their messages and their file-based
  exemptions. Then remove them from Biome.
  - **[Review]** Thirteen by then, with Phase 1's rule. The exemptions are written **inside each `.grit` file**
    (`$filename <: …`), not in `biome.jsonc`; `biome.jsonc:7-20` only lists the plugins. The table is below.
  - **[Review] `lint/states.grit` is generated.** `pipeline/generate.py:57-80` writes it from the state keys of
    `pipeline/states.py`, and `generate:check` holds it (`pipeline/generate.py:206`). Porting it means changing the
    generator to write the oxlint rule's data (best: a generated list of keys, say `lint/state-keys.json` or a `.ts`
    module, read by a hand-written rule), with its test, and updating `CONTRIBUTING.md` ("Generated files") and
    `docs/concepts/states.md:17,81`, which name `lint/states.grit`. This is a change to `pipeline/` code, but not to a
    prompt, a state or a record, so no refresh is due.
- Restrict Biome to CSS and JSON linting: JavaScript linting off, formatter off.
  - **[Review]** Also drop `site/**` and `tests/**/*.ts` from `files.includes`, and the `plugins`, `javascript` and
    TypeScript `overrides` blocks, so "Biome no longer touches any `.ts`" is true by construction.
    `tests/test_suppressions.py:94-105` parses `files.includes` from `biome.jsonc` (it must stay on one line) and
    asserts that `site/main.ts` and `tests/site/states.test.ts` are among Biome's files: that test must be rewritten in
    the same commit.

**[Review] The twelve Grit rules** (each `lint/<name>.grit`; "kind" is this review's reading of the brief's Phase 4
finishing list):

| Rule | Forbids | Message | Applies to / exempt | Kind |
| -- | -- | -- | -- | -- |
| `routes` | a string or template chunk starting `#finder`, `#map`, `#artist(s)`, `#countries`, `#friends`, `#people`, `#sql`, `#sources` | "Links are built by routes.ts, so a route has one spelling." | everywhere; exempt `routes.ts` | domain |
| `states` (generated) | a state key in quotes as a call argument (except `plural`), in `===`/`!==`/`==`/`!=`, or as a `case` | "Write a state as KEY.<point>.<NAME> (site/states.ts), held to the table." | only `site/<file>.ts`; exempt `tests/` | domain |
| `formats` | `Intl.DateTimeFormat`, `.toLocaleDateString()`, `.toLocaleTimeString()`, a string containing `google.com/travel` | "Dates are worded, and flight searches linked, by ui.ts." | everywhere; exempt `ui.ts` | domain |
| `storage` | `localStorage` | "Only hints.ts (what a visitor has seen) and kept.ts (the review dashboard's) touch localStorage." | exempt `hints.ts`, `kept.ts`, `tests/` | domain |
| `session` | `sessionStorage` | "Only kept.ts touches sessionStorage: the admin's token, for the tab alone." | exempt `kept.ts`, `tests/` | domain |
| `fetch` | `fetch(…)` | "Requests go through net.ts's get(), with its deadline and the view's signal." | exempt `net.ts` (tests are **not** exempt) | domain ("network") |
| `home` | a string containing `Bergen` or `BGO` | "The home city comes from site.json's home, not from the code." | everywhere, no exemption | domain |
| `promises` | `.then(ok, failed)` with two arguments | "Handle the failure with .catch, or report.ts's done, not .then's second argument." | everywhere, no exemption | neither: a code rule; keep |
| `markup` | `innerHTML`, `outerHTML` (read, write, or by string key), `insertAdjacentHTML`, `setHTMLUnsafe`, `createContextualFragment`, `parseFromString`, `document.write(ln)` | "Markup comes from icons.ts's Drawing.into(), from its own SVG; build elements with dom.ts's h()." | only under `site/`; exempt `tests/`, `site/icons.ts` | markup |
| `classes` | `.classList`, `.className` | "Set classes with dom.ts's h() or toggle(), which take only the stylesheet's (ClassName)." | everywhere; exempt `dom.ts` | markup |
| `buttons` | `h('button', …)` | "A button is made by dom.ts button(), which gives it type=button, so it never submits a form." | only `site/<file>.ts`; exempt `dom.ts`, `tests/` | markup |
| `clicks` | `.stopPropagation()` | "A control inside a card keeps its click with dom.ts own(); swipe.ts alone keeps a swipe from the map." | everywhere; exempt `dom.ts`, `swipe.ts` | markup |

- **[Review]** The brief's Phase 4 list names four markup rules and five domain rules ("routes, states, formats,
  storage, network"). Three rules are in neither list: `session`, `home`, `promises`. This review reads all three as
  kept (they say nothing about how DOM is built). `fetch` is the brief's "network".
- **[Review]** "Everywhere" means every file oxlint is given. Keep the exemptions as path tests of the same shape
  (`/site/<file>.ts`, `/tests/`), so a fixture placed at `lint/fixtures/<rule>/site/x.ts` is in scope and one at
  `…/site/dom.ts` is exempt.
- **[Review]** Existing suppressions to translate, one for one (`tests/test_suppressions.py:65-76`):
  `site/artists.ts:140` (`lint/plugin/states`), and `noUnsafeTypeAssertion` at `site/json.ts:36`, `site/routes.ts:161`,
  `site/rows.ts:58`, `site/wording.ts:106`. `public/css/site.css:315` (`noImportantStyles`) stays a Biome comment. The
  test's patterns (`:62-64`) know only `biome-ignore`, `@ts-` and `eslint-disable`; add oxlint's
  `oxlint-disable-next-line <rule> -- <reason>` form, keep "names its rule and why", and make the file list it reads the
  union of what oxlint and Biome check.

**Accepted losses.** These Biome-only rules have no oxlint equivalent and are dropped knowingly:
`noMisleadingReturnType`, `noEvolvingTypes`, `noImplicitAnyLet`, `useTopLevelRegex`, `noShoutyConstants`,
`noVoidTypeReturn`, `noUnusedTemplateLiteral`, and a few derived from Rust's Clippy (`noFlatMapIdentity`,
`noStringCaseMismatch`, `noParametersOnlyUsedInRecursion`, `noMisrefactoredShorthandAssign`). Check this list against
your own mapping, record the final list in `docs/`, and stop and ask before dropping anything not on it.

- **[Review]** The brief maps "about 241 of 279": 38 unmapped, but only 11 are named here. The other 27 or so are not
  yet accepted. Expect to stop and ask once, with the full list, after the mapping is done; do not ask rule by rule.

**Done when:** CI runs `tsc`, oxlint (type-aware), the rule fixtures, Biome (CSS and JSON only), `oxfmt --check`, knip
and Vitest, with zero findings and zero warnings. Biome no longer touches any `.ts` or `.tsx` file. `docs/` records the
rule mapping, the accepted losses and any false positives.

#### [Review] Repo facts for Phase 2

**What CI runs today.** `.github/workflows/tests.yml:25-30`: `mise run install:site`,
`pnpm exec playwright install --with-deps chromium`, then `mise run check`. `check` = `check:fast` + `test:py` + `audit`
(`tasks.toml:214-217`). `check:fast` (`:165-181`) = `lock:py`, `lint:py`, `format:py`, `format:md`, `types:py`,
**`lint:site`**, **`types:site`**, **`knip`**, **`dup`**, **`test:site`**, `generate:check`, `hooks:check`,
`lint:actions`. The site's ones run `package.json` scripts:

| Task | Script today | After Phase 2 |
| -- | -- | -- |
| `types:site` | `tsc --noEmit -p . && tsc -p tests/site` | unchanged |
| `lint:site` | `biome check --error-on-warnings` (lint, format and the Grit plugins in one) | split in three: oxlint type-aware, failing on warnings (`oxlint --type-aware --deny-warnings`; confirm the flags against the pinned version); `biome lint --error-on-warnings` on CSS and JSON; `oxfmt --check` |
| (none) |  | the fixture test: a Vitest file in the `node` project, so `test:site` runs it |
| `knip` | `knip` | unchanged command; config below |
| `dup` | `jscpd` | unchanged command; config below |
| `test:site` | `vitest run` (depends on `build:site`, `build:data`) | unchanged |

So "Done when" in this repo's terms: `mise run check` passes; `check:fast` names every new task;
`docs/reference/commands.md` is regenerated; `tests.yml` is **not edited** (it only calls `mise run check`). Whether the
three lint steps are three tasks (`lint:site`, `lint:css`, `format:site`) or one is the implementer's choice; three is
closer to "one linter per file type". `tests/test_commands.py:97` checks that every task a document names exists.

**Other files that know about Biome or the Grit rules** and must change in the same commits:

- `CONTRIBUTING.md`: the "Checks" block, the "Site:" bullet ("every Biome rule but those `biome.jsonc` turns off … the
  plugins in `lint/`"), "Generated files" (`lint/states.grit`), and the folder table (`lint/` = "Biome's plugins").
- `docs/concepts/states.md:17,81`; `docs/guides/the-site.md:4`; `docs/reference/commands.md` (generated).
- `tests/test_suppressions.py` (above); its docstring `:4-5`.
- `knip.jsonc`: the plugin's source and fixtures are new files. Add the plugin entry file to `entry`, its folder to
  `project`, and keep fixtures out. `oxlint-tsgolint`, `oxfmt` and `eslint-plugin-solid` are used from config or the
  command line only; if knip reports them, add each to `ignoreDependencies` with its reason, as `world-atlas` is
  (`knip.jsonc:5-6`).
- `.jscpd.json`: it scans `lint/` and `tests/` for `typescript` at 20 tokens. A must-fail fixture and its must-pass twin
  are near-copies by design: add the fixtures folder to `ignore`.
- `tsconfig.json` / `tests/site/tsconfig.json`: the plugin's source must be type-checked somewhere
  (`tests/site/tsconfig.json:10` includes `.`, `../../site`, `../../vitest.config.ts`); add the plugin's folder there,
  and keep fixtures out of `tsc` (a must-fail fixture may not type-check) or make every fixture type-correct. Type-aware
  rules need fixtures a tsconfig covers: give the fixtures their own small `tsconfig.json`.
- oxlint's own run must skip the fixtures folder (`ignorePatterns`), or the must-fail fixtures fail the lint.

**Where the documents go.** `docs/reference/` is generated; do not put hand-written pages there. Put the rule mapping
and the accepted losses in `docs/concepts/site-lint.md` (or similar), the false positives in
`docs/lint-false-positives.md` as the brief names it, and add a row for each to the table in `docs/README.md`.
`tests/test_docs.py:12` fails on a link that reaches no file. Markdown is formatted by mdformat (`format:md`), not
oxfmt.

### Phase 3: Vite build, still on `h()`

Today `tsc` compiles `site/` module by module into `public/js/`, with no bundler. Replace that emit with a Vite build.
`tsc` stays as the type-checker, with `noEmit`.

- Keep the GitHub Pages base path (`/kiz-radar/`) and every existing URL working, including the generated community
  pages under `public/c/<key>/`, their `og:` tags and their `share.png`.
- Keep the generation step (`mise run generate`) and the deploy workflow behaving as before. Stop and ask before
  changing the deploy workflow or hosting.

**Done when:** the browser suite passes against the Vite build output, every route and static page that was served
before is still served, and nothing in `site/` was rewritten beyond imports and the entry point.

#### [Review] Repo facts for Phase 3

**How the site is built and served today.**

- `package.json` `build`: `rm -rf public/js public/vendor && tsc -p . && pnpm run vendor`. `tsconfig.json`:
  `rootDir: site`, `outDir: public/js`, `rewriteRelativeImportExtensions` (imports name `.ts`; tsc rewrites to `.js`),
  `module: es2022`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. One `.js` per module, 57 files.
- `vendor` copies, from the pinned packages into `public/vendor/`: `sql-wasm.js`, `sql-wasm.wasm` (sql.js),
  `topojson-client.min.js`, `countries-50m.json` (world-atlas), and `leaflet/leaflet.js`, `leaflet/leaflet.css`,
  `leaflet/images/`.
- `public/js/` and `public/vendor/` are git-ignored build output (`.gitignore`; `tests/repository.py:13` `BUILT`;
  `tests/test_structure.py:188-193` assert they are not committed and are ignored). `public/` itself is the published
  folder and holds committed files: `index.html`, `review.html`, `css/site.css`, `fonts/`, icons, `site.webmanifest`,
  `c/<key>/{index.html,share.json,share.png}`.
- `public/index.html` loads, all relative to `<base href="./">` (`:12`): `vendor/leaflet/leaflet.css`, `css/site.css`,
  three classic scripts `vendor/sql-wasm.js`, `vendor/leaflet/leaflet.js`, `vendor/topojson-client.min.js` (`:36-38`),
  then `<script type="module" src="js/main.js">` (`:39`). `public/review.html:14` loads `js/review.js`. Two entries:
  `site/main.ts`, `site/review.ts` (also `knip.jsonc:3`).
- The three libraries are **globals from classic scripts, never imported** (`site/globals.d.ts`; `needs('initSqlJs', …)`
  `site/db.ts:68`; `needs('L', …)`, `needs('topojson', …)` `site/map.ts:278-279`).
- The code finds its files **relative to its own module URL**: `new URL('../vendor/', import.meta.url)` and
  `new URL('../data/', import.meta.url)` (`site/db.ts:13-14`),
  `new URL('../vendor/countries-50m.json', import.meta.url)` (`site/map.ts:27`), `new URL('../data/', import.meta.url)`
  (`site/review.ts:36`). This is why the site works under `/kiz-radar/`, under `/kiz-radar/c/<key>/` and from
  `localhost:8000` without naming a base path anywhere.
- **No cache-busting, no hashed names, no service worker.** `site.webmanifest` has `start_url: "./"`. Data is fetched
  with `{ revalidate: true }` (`site/db.ts:33,74`).
- **Content-Security-Policy** in both pages: `script-src 'self'` (index adds `'wasm-unsafe-eval'`), `style-src 'self'`,
  `connect-src 'self'` (`public/index.html:8`, `public/review.html:8`). No inline script and no inline style may be
  emitted.
- `mise run serve` (`tasks.toml:104-107`): builds, then `python -m http.server -d public 8000`.
- **Deploy:** `.github/workflows/pages.yml:38-45`: `mise run audit`, `mise run build:site`, `mise run build:data`, then
  uploads `public/` as the Pages artifact. It never calls `tsc` or pnpm directly, so a new build behind `build:site`
  needs **no workflow change**.

**How community pages are generated.** `pipeline/generate.py:132-158` (`community_page`): each
`public/c/<key>/index.html` is `public/index.html` line for line, with its own `<base href="../../">`, title,
description, canonical, `robots` and `og:` tags. It is **committed**, and `generate:check` fails if it differs from what
`public/index.html` would give. So those pages reach `js/main.js`, `css/site.css` and `vendor/…` by the same fixed
relative names through `../../`. `share.png` and `share.json` are drawn by `mise run render:design`
(`design/render.cjs`), and `tests/test_community_card.py` tests the head tags.

**What this forces on the Vite build** (none of it is in the brief):

1. **Vite must not own the HTML.** If Vite processed `index.html` and wrote hashed script names into it, the committed
   `public/index.html` and every committed `public/c/<key>/index.html` would no longer match the build, and
   `generate:check` would have nothing stable to compare. Build the two entries as plain Rollup inputs with fixed names:
   `build.rollupOptions.input = { main: 'site/main.ts', review: 'site/review.ts' }`,
   `output.entryFileNames: '[name].js'`, `build.outDir: 'public/js'`, `emptyOutDir: true`, `publicDir: false`,
   `base: './'`. The pages keep `js/main.js` and `js/review.js` unchanged. Shared chunks may carry a hash in their name;
   the entries may not.
2. **Keep the output flat in `public/js/`** (`chunkFileNames: '[name]-[hash].js'`, no `assets/` subfolder).
   `import.meta.url` in a bundled chunk is the chunk's URL; `../vendor/` and `../data/` resolve correctly only from a
   file directly in `js/`.
3. **`new URL(literal, import.meta.url)` is a pattern Vite rewrites** as an asset reference.
   `../vendor/countries-50m.json` does not exist relative to `site/` at build time, so Vite should leave it and warn;
   the two directory URLs may warn as well. Check what the pinned Vite does with each of the four sites, and report. If
   a `/* @vite-ignore */` comment or an equivalent is needed, that is a change to `site/` beyond "imports and the entry
   point": it is small and mechanical, name it in the phase report.
4. **`design/render.cjs:37` imports `public/js/icons.js`**
   (`const { Drawing } = await import(path.join(site, 'js', 'icons.js'))`) to draw the share cards. With a bundle there
   is no `icons.js`. Add `icons: 'site/icons.ts'` as a third input with its exports kept
   (`preserveEntrySignatures: 'strict'`), so `public/js/icons.js` still exports `Drawing`; then run
   `mise run render:design` and confirm `generate:check` reports no stale card (`pipeline/generate.py:120`, `DRAWN_FROM`
   hashes `site/icons.ts`, not the build). Do not change `render.cjs` to read TypeScript.
5. **The `vendor` copy stays as it is**, run after the Vite build; `build` becomes
   `rm -rf public/js public/vendor && vite build && pnpm run vendor`. The libraries stay classic scripts and globals
   (decision: "`sql.js` stays"). Do not import them into the bundle: `index.html`'s three script tags,
   `main.browser.test.ts:19-23` and `shipped.ts:14` all assume globals.
6. **No inline output.** Vite's module-preload polyfill and any CSS injection must not produce inline scripts or styles
   (`build.modulePreload: { polyfill: false }` if needed). The stylesheet stays `public/css/site.css`, linked by the
   page, not imported by code.
7. **`tsconfig.json`**: `noEmit: true`; `rewriteRelativeImportExtensions` goes (it is an emit option) and
   `allowImportingTsExtensions` takes its place so the `.ts` import paths stay; drop `outDir`. The header comment
   (`tsconfig.json:2-3`) describes the old build. The `types` script's `tsc --noEmit -p .` then needs no flag.
8. **`vite.config.ts` is a new root file.** Vitest reads `vitest.config.ts` in preference to it, so the test config is
   unaffected; say so in a comment. Add `vite.config.ts` to `tests/site/tsconfig.json`'s `include`, to oxlint's files
   with the tests' Node exemption, and let knip's Vite plugin find it. `vite` becomes a direct devDependency, pinned
   exactly (decision 2).
9. **Docs and descriptions that describe the old build:** `tasks.toml` `build:site` description (`:99-102`, then
   `mise run generate` for `docs/reference/commands.md:27`), `docs/guides/the-site.md:4`, `CONTRIBUTING.md`'s folder
   table, the comment at the top of `pages.yml:3` (a comment only; editing it is still an edit to the deploy workflow,
   so leave it and mention it in the report).

**"The browser suite passes against the Vite build output" needs defining.** Only `pages.browser.test.ts` loads the
build (in a frame, from `public/` under `/kiz-radar/`); every other browser test imports source through Vitest's dev
server and never sees `public/js/`. Read the criterion as: (a) the whole suite passes; (b) `pages.browser.test.ts`
passes against the Vite output; (c) Phase 1's app-level tests are written so the same assertions can run against a frame
of the built site, and at least a smoke set of them does: each route in `site/main.ts:77-97` (`finder`, `week`, `map`,
`artists`, `countries`, `sql`, `sources`, `friends`, `friends/<key>`, community) and `review.html` draws under the real
CSP. Note `vitest.config.ts:40-45`: the test server builds a community page by swapping the base tag in
`public/index.html`, so it does not serve the committed `public/c/<key>/index.html`; `tests/test_community_card.py`
covers that file.

**"Every route and static page still served"**: check by listing `public/` before and after (`git ls-files public` plus
the built `js/` entries and `vendor/`), and loading `index.html`, `review.html`, `c/frost-lantern-river-maple/`, and an
old `#community/<key>` link (`site/routes.ts:124-134`).

### Phase 4: Solid 2.0, view by view

**Setup:**

- Install `solid-js`, `@solidjs/web` and `@solidjs/vite-plugin` (native compiler). Set `jsx: "preserve"` and
  `jsxImportSource` as Solid's docs specify.
- Add `eslint-plugin-solid`'s `v2-strict` rules to oxlint via `jsPlugins`.
- Add the four migration rules below as oxlint JS plugin rules, each with fixtures.
- Make the browser tests fail on any console warning or error, so Solid's development-mode diagnostics become failures.
  Check first that Solid 2.0's development mode does report writes in the wrong scope and top-level reads, as its
  bundled cheatsheet says.

**[Review] Setup, in this repo:**

- The plugin goes in **two** configs: `vite.config.ts` (the build) and the `browser` project of `vitest.config.ts`
  (`:83-84`, `plugins: [pages()]`), or no test can import a `.tsx`. Vitest must resolve Solid's `development` export
  condition (`solid-js` exports `development: ./dist/solid.dev.js`) for the diagnostics to exist; the production build
  must not.
- Solid's diagnostics exist only in the development build, so only tests that run source see them. Tests of the built
  site in a frame (`pages.browser.test.ts`) run production code: the console check there catches CSP violations and
  uncaught errors, not Solid's warnings. Both are wanted.
- `site/report.ts:10,31` writes `console.error` on purpose, and tests of failure paths (`main.browser.test.ts`) trigger
  it. The console check needs a way for a test to declare the error it expects; an undeclared one fails. Put the check
  in a Vitest `setupFiles` entry for the browser project (there is none today).
- File-type lists that say `.ts` only and must learn `.tsx`: `tsconfig.json` (`include: ["site"]` already covers it),
  `knip.jsonc:3-4` (`site/**/*.ts`, entry `site/main.ts`), `vitest.config.ts:72` (the coverage list, if a pure module is
  renamed, which it should not be), `tests/test_structure.py:130` (`tracked('site/*.ts')`, the no-clock-in-queries
  check), `.jscpd.json` formats (`typescript` only: add `tsx`), the house rules' path tests (`site/<file>.ts` in
  `buttons` and `states`), oxfmt's and oxlint's file sets, `tests/test_suppressions.py`'s file list.
- `tsconfig.json` has `erasableSyntaxOnly` and `verbatimModuleSyntax`: fine with `jsx: "preserve"`, but confirm
  `tsc --noEmit` accepts the pinned Solid's types with `skipLibCheck: false` (`tsconfig.json:29`); the tests' config
  already skips library checks because Playwright's types need it.
- If the entry becomes `site/main.tsx`, the build input and `knip.jsonc` change; the page still loads `js/main.js`.

**Migration rules** (they apply to `.tsx` files only, so `h()` views and Solid views can coexist):

- **No `.then` in components.** Async data is a promise returned from `createMemo(() => get(...))` and read under
  `<Loading>`. Exempt the network module.

- **No hand-rolled loading or error state.** Flag signals and variables named like `loading`, `pending`, `busy`,
  `fetching`, `error`, `failed` (with or without an `is` prefix, including `createSignal<T>(…)` with a type argument).
  Use `<Loading>`, `isPending(() => x())` or `<Errored>`.

- **No mirroring effects.** Flag an effect whose apply half only calls a `setX(…)` with what it read; derive it with
  `createMemo` instead.

- **No legacy rendering in Solid files.** No `replaceChildren`, `document.createElement`, or imports of `dom.ts` in
  `.tsx` files.

- **[Review]** The network module is `site/net.ts` (`get` `:21`, `send` `:32`); it stays `.ts`, so the `.tsx`-only scope
  already exempts it. `site/github.ts` (the review dashboard's writes) also stays `.ts`.

- **[Review]** `site/ui.ts:63` exports a function named `loading` (the "Loading…" paragraph) and `site/pending.ts` is a
  pure module named for the review queue. The naming rule is `.tsx`-only, but a `.tsx` file importing `loading` from
  `ui.ts` or anything from `pending.ts` will trip a naive name match: the rule matches declarations (a variable
  declarator, a `createSignal` destructuring), not imports or property reads. Put both in the must-pass fixture.

- **[Review]** "No imports of `dom.ts`" will bite on types and on helpers that are not rendering: `Kid`, `Classes`,
  `ClassName`-typed `toggle`, `debounced` (`site/dom.ts:140`), `onResize` (`:149`), `uniqueId` (`:38`). Move the
  non-rendering helpers to a module of their own before the first view is ported, so the rule can stay absolute.

Earlier tests of these four rules found two pitfalls that will recur: a signal declared with a type argument escaped a
naive pattern, and a plain `let loading = true` needed matching at the level of the variable declarator. Include both in
the fixtures.

**Migration:**

- Mount Solid components inside the existing page; `h()` views and Solid views coexist until the end.
- Order: the shell (header, navigation, dialog host) first, then views by how much state they share. Read-only views
  with no shared state come last.
- Keep `routes.ts` as the single source of routes; wrap it rather than replacing it with Solid Router. Stop and ask
  before replacing it.
- `sql.js` stays synchronous; read its queries with plain `createMemo`. Do not move the database to a Web Worker as part
  of this work.
- One view per commit, with the suite green.

#### [Review] Repo facts for Phase 4

- **The shell** is `site/main.ts` (224 lines): the header's tabs and footer links drawn from `routes.ts` (`:112-113`),
  `route()` and `show()` (`:118-185`), the sub-navigation (`:137-148`), the skip link and "Back to top" (`:201-210`),
  `start()` (`:214-223`); with `site/tabs.ts` (the oval and the slide), `site/swipe.ts`, `site/modal.ts` (the dialog
  host), `site/search.ts` (opened from the header), `site/money.ts` (`currencySwitch` in the footer),
  `site/updating.ts`, `site/report.ts` (`guarded`, the error said on the page). Much of the shell's markup is static in
  `public/index.html:42-65`; Solid mounts into `#main`, `.tabs`, `#subnav`, `#footer-nav`, `#currency-switch`, and the
  page file stays the source of the rest (the community pages are copies of it).
- **The seam for coexistence** is the `View` record: `show(root, sub, qs, { signal, data })` (`site/main.ts:63-97`).
  Each view is handed an empty `root` and an `AbortSignal` that fires when the visitor leaves. A Solid view can sit
  behind the same signature (`render(() => <View …/>, root)`, disposed on the signal) until the shell itself is Solid.
  `routes.ts` is wrapped by turning `hashchange` + `routeOf(location.href, document.baseURI)` (`:119`) into one signal.
- **The views and what they share** (lines; imports from `site/`):
  - shared pieces used by several views, so port before their users: `eventcard` (301; used by `artists`, `communities`,
    `map`, `people`, `sentence`, `week`), with `details` (151), `passes` (145), `flights` (127); `plans`' renderers
    (505; used by 9 modules); `ui`'s element helpers; `gantt` (352) and `months` (319) for `communities`.
  - stateful views: `sentence` (508, the finder: choices in the address, paging, dropdowns), `search` (608, the combobox
    in a dialog), `communities` (693), `friends` (328), `artists` (563), `map` (592, Leaflet: an imperative island; keep
    Leaflet's own DOM out of Solid), `countries` (188), `people` (108).
  - read-only, last: `week` (37), `sources` (110), `tables` (172, the SQL page: read-only data but it has a form),
    `updating` (52).
  - **`review` (895 lines, 114 `h()` calls, its own page and entry, `public/review.html`) is not mentioned in the
    brief.** "All views are `.tsx`" includes it. It shares almost nothing with the main page (`claims`, `github`,
    `kept`, `pending`, `net`), so it can go at any point; do it as its own series after the shell pattern is proven. Its
    writes (claims to GitHub) are the closest thing in the code to the forms the accounts work will need, which makes it
    a useful proving ground.
- **Content-Security-Policy and Solid.** The page refuses style attributes: `style-src 'self'` with no
  `'unsafe-inline'`; `site/dom.ts:8-9,21` says so and sets each property through `el.style.setProperty`. Sixteen call
  sites pass `style:` objects (`gantt`, `months`, `map`, `tabs`, `artists`, `search`, `ink`…). In Solid, a literal
  `style="…"` string in JSX is written into the template's HTML and **will be refused by the CSP**; an object
  (`style={{ … }}`) is set property by property and is allowed. Check this against the pinned compiler's output on the
  first view that needs a style, add a house rule (or confirm a `v2-strict` rule) that refuses a string `style` in
  `.tsx`, and let the built-site console check prove it. Do not loosen the CSP.
- **`markup` and Solid's `innerHTML`.** `Drawing.into` (`site/icons.ts`) is the one place markup is written. In `.tsx`
  the same door is the `innerHTML` prop: the ported `markup` rule must refuse the `innerHTML` JSX attribute outside the
  icons module, or the rule silently stops holding in Solid files. The same for `classes`: `class={…}` in JSX is typed
  by Solid, not by `ClassName` (`site/classes.ts`, generated from the stylesheet); the guarantee "a class is one the
  stylesheet defines" needs a typed helper or a rule before `classes` can be retired.
- **`states` and `buttons` path tests** say `site/<file>.ts`; widen to `.tsx` before the first view moves, with a
  fixture, or the state-key rule stops applying to every ported view. A `<button>` in JSX without `type="button"` is the
  `buttons` rule's Solid form.
- Generated modules stay `.ts`: `site/states.ts`, `site/classes.ts`, `site/schema.ts`.

**Finishing:**

- When no `h()` or `replaceChildren` remains, delete them from `dom.ts`.
- Review the Grit-era house rules `markup`, `classes`, `buttons` and `clicks`. Retire each one **only** after showing,
  with a fixture, that Solid or an oxlint rule now enforces the same constraint. Keep the domain rules (routes, states,
  formats, storage, network).
  - **[Review]** Also keep `session`, `home` and `promises` (see the Phase 2 table). The messages of `markup`,
    `classes`, `buttons` and `clicks` name `dom.ts`'s `h()`, `toggle()`, `button()` and `own()`; a rule that is kept
    needs its message rewritten once those are gone.
- **[Review]** `page.browser.test.ts`'s tests of `h()` go when `h()` goes: deleting them needs the owner's word (Phase 1
  asks once, for both moments).
- **[Review]** `CONTRIBUTING.md` ("Site:" bullet, folder table), `docs/guides/the-site.md` and
  `tests/test_suppressions.py` describe `dom.ts`, `h()` and the plugins; update them with `CLAUDE.md`.

**Done when:** no `.ts` view code renders DOM by hand; all views are `.tsx`; Solid's rules and the four migration rules
report zero findings; the browser suite passes with console warnings failing tests; and `CLAUDE.md` describes the new
conventions and points to the bundled Solid skills.

## Rules about rules

- **Every custom lint rule ships with two fixture files**: one that must produce findings (listing the expected ones)
  and one written the intended way that must produce none. A test runs oxlint on both and fails on any difference. A
  rule without fixtures is not done.
- **Prefer structure to instruction.** If a convention can be a type, a lint rule or a test, make it one; a note in
  `CLAUDE.md` alone is not enough.
- **Prefer reporting to guessing.** When a tool's behaviour differs from what this brief says, say so with the evidence;
  don't work around it silently.

**[Review] The fixtures, concretely.**

- Layout: `lint/fixtures/<rule>/…/bad.ts(x)` and `good.ts(x)`, at paths the rule's own scope accepts
  (`lint/fixtures/buttons/site/bad.ts`), plus, where a rule has exemptions, a file at an exempt path holding the
  forbidden form (`lint/fixtures/buttons/site/dom.ts`) that must produce nothing. Expected findings are listed beside
  the fixture (rule id, line, message), not inferred.
- The test is a Vitest file in the `node` project (`tests/site/rules.test.ts`): it runs the pinned `oxlint` binary with
  JSON output on the fixtures folder with the real `.oxlintrc.json` (not the ignore that hides fixtures from the main
  run) and compares. Tests may use Node modules (`biome.jsonc:85-93`, carried to oxlint). It then runs under
  `test:site`, in `check:fast`, in CI and in both hooks, with no new task.
- The fixture test must also fail when a rule **exists without fixtures**: compare the plugin's rule names with the
  fixture folders.
- Phase 1's rule is written in Grit and cannot be run by oxlint: for that one phase, its "fixture" is a test that runs
  `biome lint` on two small files. It gets real fixtures when ported in Phase 2.
- The fixtures are excluded from: oxlint's main run, `tsc` (or given a tsconfig of their own), knip, jscpd, and
  `tests/test_suppressions.py`'s file list.
- The generated `states` rule: the fixture uses a few real keys (`cancelled`, `sold_out`); a state removed from
  `pipeline/states.py` would break it, which is right.

## Out of scope, with one constraint to record

Accounts, Workers, Durable Objects and changes to how community pages are generated are **not** part of this work.

Record this constraint in `docs/` for that later work: **user-created pages and memberships must never be generated from
data committed to the public repository.** The current prototype commits community keys and members
(`pipeline/communities.csv`, `pipeline/community_members.csv`) as a known stopgap. With accounts, such pages come from a
Worker reading Durable Objects at request time, or from a private build whose output goes only to hosting.

- **[Review]** A natural home is `docs/guides/plans-and-promos.md` ("add who's going, a community, or a promo code") or
  a short new page under `docs/concepts/`, with its row in `docs/README.md`. Record it in Phase 2's documentation
  commit; it depends on nothing else.

## Stop and ask before

- changing the deploy workflow, hosting or DNS
- deleting or weakening a test
- disabling a rule globally, or dropping a Biome rule not on the accepted-loss list
- adding a dependency not named in this brief
- replacing `routes.ts` or the `sql.js` data layer
- forcing any package past its declared dependency ranges

**[Review] Dependencies this brief names, in full, so "not named" is unambiguous:** `solid-js`, `@solidjs/web`,
`@solidjs/vite-plugin`, `@solidjs/compiler` (through the plugin), `vite` (implied by decision 2; added by this review),
`oxlint`, `oxlint-tsgolint`, `oxfmt`, `eslint-plugin-solid`. `@kobalte/core` is named but conditional (decision 6).
Anything else is a stop: in particular `@solidjs/testing-library`, `@testing-library/*`, `eslint`, `@babel/*`,
`@solidjs/router`, a Solid devtools package. Phase 1's design (drive the app through `page` and `userEvent`, which
Vitest already provides) needs no testing library.

## Report back after each phase

- what changed, and the commits
- the counts: findings before and after, tests before and after
- every decision you made that this brief did not settle, with your reason
- anything in this brief that turned out to be wrong, with the evidence

______________________________________________________________________

## [Review] Review findings

### Corrections (with evidence)

01. **`plans` is a view module, not pure logic.** `site/plans.ts:6` imports `button, h, nodes, own` and exports
    `doingTag`, `goingLine`, `whoLines`, `whoIsGoing` as element builders (`:168-249`). Eleven other modules are mixed
    in the same way (Phase 1 facts).
02. **The view-importing tests are ten files, not two examples.** Seven browser files, `main.browser.test.ts` (for
    `report.ts`), and two *node* files (`states.test.ts`, `styles.test.ts`, for `icons.ts` and `dismiss.ts`). About 115
    of the 133 browser tests are affected; `views.browser.test.ts` alone is 2,071 lines and 75 tests.
03. **Biome formats 93 files, checks 94.** `site/states.ts` is excluded from formatting (`biome.jsonc:5-6`). oxfmt must
    exclude it as well.
04. **Biome is not silent today: 38 info-level findings pass the check** (`biome check --error-on-warnings` → "Found 38
    infos", exit 0). "Zero findings" has no equivalent starting point; see Q2.
05. **The Grit rules' exemptions are in the `.grit` files, not in `biome.jsonc`.** And one of the twelve,
    `lint/states.grit`, is generated by `pipeline/generate.py:57-80` and held by `generate:check`.
06. **`vitest.config.ts` is named in a Biome override but is outside Biome's file set** (`biome.jsonc:4`): it has never
    been linted. The `tests/**` override also sets `useConsistentTestIt` to `test`, which the brief does not list.
07. **`useMaxParams` has no configured limit**: Biome's default, 4.
08. **The domain/markup split leaves three rules unnamed**: `session`, `home`, `promises`. Read here as kept.
09. **Versions moved**: `solid-js`, `@solidjs/web`, `@solidjs/compiler` are at 2.0.1 and `@solidjs/vite-plugin` at
    3.0.1; `@solidjs/web@2.0.1` needs `solid-js ^2.0.1`. Kobalte's alpha is unchanged (`2.0.0-alpha.4`, exact
    `2.0.0-rc.16`).
10. **"The browser suite passes against the Vite build output"**: only `pages.browser.test.ts` loads the build today;
    the rest import source. The criterion is restated in Phase 3.
11. **CI needs no edit in Phase 2 or 3.** `tests.yml` runs `mise run check` and `pages.yml` runs `mise run build:site`;
    the changes belong in `tasks.toml` and `package.json`.

### Gaps filled

- **`vite` is an unnamed dependency**; now named, to be pinned at the version Vitest already resolves (8.3.5).
- **oxfmt's scope**: restricted to Biome's current file set, so it does not fight mdformat, reformat the committed HTML,
  or touch the data files.
- **Phase 3 constraints the brief does not mention**: Vite must not rewrite `index.html` (committed community pages are
  copies of it, checked by `generate:check`); fixed entry names `js/main.js` and `js/review.js`; flat output so
  `new URL('../vendor/', import.meta.url)` still resolves; `design/render.cjs:37` imports `public/js/icons.js`; the
  `vendor` copy and the classic-script globals stay; the CSP forbids inline scripts and styles; `tsconfig.json` loses
  its emit options.
- **Files that encode today's toolchain and must change with it**: `tests/test_suppressions.py` (patterns, file list,
  the allowed table), `tests/repository.py:13`, `tests/test_structure.py:130`, `knip.jsonc`, `.jscpd.json`,
  `tests/site/tsconfig.json`, `tasks.toml` (and the generated `docs/reference/commands.md`), `CONTRIBUTING.md`,
  `docs/concepts/states.md`, `docs/guides/the-site.md`, `pipeline/generate.py` (the states rule).
- **A measure for "coverage no lower"**: a test-by-test ledger plus a one-off coverage report over `site/**`.
- **The fixture mechanics**: layout, the runner (a Vitest node test, so no new task), exclusions, and a check that no
  rule lacks fixtures.
- **Phase 4 specifics**: the plugin in both Vite and Vitest configs; the development condition; expected `console.error`
  from `report.ts`; the `.tsx` blind spots in path-based rules and Python tests; the CSP and string `style` attributes;
  `innerHTML` and `class` in JSX; the non-rendering helpers in `dom.ts`; the review dashboard as an unmentioned 895-line
  view; a suggested order from the import graph.
- **Where the combobox and dialog are** (decision 6).
- **Where new documents go**, given `docs/reference/` is generated and `tests/test_docs.py` checks links.

### Open questions for the owner

- **Q1. May Phase 1 move pure exports out of mixed view modules, as move-only commits?** (`festivals()`/`withDetails`,
  `friendsIn`/`togetherHref`/`NEAR_KM`/`NAMED_UP_TO`, `citiesOf`, `cityEntries`, `Drawing`, `WIDE`, `PAD`, `SAID_MS`.)
  Without it, the "no test imports a view module" rule either needs per-export exceptions or forces tests to give up
  assertions on those constants. Recommended: yes, one move per commit, no behaviour change; it also leaves Phase 4 with
  cleaner seams. This touches "unchanged `h()` code", hence the question.
- **Q2. The 38 info-level Biome findings** (`noBitwiseOperators`, `noAwaitInLoops`, `noExcessiveCognitiveComplexity`,
  `useDestructuring`, `useNamedCaptureGroup` and others): enforce in oxlint (fix or suppress 38 sites) or leave
  unenforced and recorded? Recommended: leave off and record them; decide rule by rule later. Related: the 27 or so
  unmapped rules beyond the eleven named accepted losses will come as one list for approval.
- **Q3. Pin Solid 2.0.0 (the brief) or 2.0.1 (current, hours old)?** Recommended: 2.0.1 across `solid-js`,
  `@solidjs/web` and `@solidjs/compiler`, as the version policy says to check current releases; by the time Phase 4
  starts it will have aged. The repository waits two weeks before taking a new Action release (`tasks.toml`
  `update:actions`); say if the same patience should apply here.
- **Q4. `eslint-plugin-solid` declares ESLint as a peer**, which decision 4 forbids installing. Accept the standing
  unmet-peer warning from pnpm (recommended), or allow a `pnpm.peerDependencyRules.ignoreMissing` entry for `eslint`?
- **Q5. The tests of `h()` itself** (`tests/site/page.browser.test.ts:16`, `:41`, `:168`): agree now that they are
  replaced in Phase 1 by app-level tests of the same guarantees (text never becomes markup; a class is the stylesheet's)
  and deleted with `h()` in Phase 4?

### Risks

- **Phase 1 is the largest phase, not the smallest.** About 115 browser tests change shape, and several hand crafted
  rows to a view (`flights`, `onnow`); through the app they need the data planted before start and the day pinned.
  Expect some behaviours to be reported as untestable through the page.
- **oxlint JS plugins are alpha, and type-aware linting plus `jsPlugins` plus `eslint-plugin-solid` without ESLint is an
  untested combination here.** Prove all three load together on the pinned versions, on one file, before porting
  thirteen rules. If `eslint-plugin-solid` needs something from the `eslint` package at run time, that is a stop.
- **Solid's compiled templates under this CSP** (`style-src 'self'`, `script-src 'self'`): string `style` attributes
  will be refused; anything else the compiler writes inline should be checked on the built site, which only the frame
  tests exercise.
- **Vite's handling of `new URL(…, import.meta.url)`** for files that do not exist at build time, and of a three-entry
  build that must keep `icons.js`'s exports: verify both early in Phase 3; either may need a line in `site/`.
- **Every commit must pass `mise run check`** (the push hook enforces it), including mid-migration commits where Biome
  and oxlint both run. Order Phase 2 so each commit has exactly one owner per file type: formatter first, then the
  mapped rules, then the house rules one by one with Biome's copy removed in the same commit.
- **Native binaries**: `oxlint`, `oxfmt`, `oxlint-tsgolint` and `@solidjs/compiler` must install from the frozen
  lockfile on `ubuntu-latest` and on the developer's machine; `oxlint-tsgolint` tracks TypeScript 7 closely
  (`7.0.2007`), so a TypeScript bump and a tsgolint bump go together.
- **`sql.js` reads in `createMemo` are synchronous and can be slow** (the finder's sentence, the map): a memo that
  re-runs a query on every keystroke will be felt. Not a reason to change the decision; a reason to keep queries behind
  the existing cached readers (`festivals()`, `site/festivals.ts:140`).
- **The dual period in Phase 4**: two rendering systems, path-based rules that key on `.ts` vs `.tsx`, and a rule set
  whose messages still name `dom.ts`. Widen the path tests before the first view moves, not after.
