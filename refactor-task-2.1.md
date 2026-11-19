# Task 2.1: the toolchain loads together

Task 2.1 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. No stop: type-aware linting, a JS
plugin rule and `eslint-plugin-solid` run together in one oxlint run on the versions below, with ESLint absent. The
repository is unchanged but for this file: each tool is pinned in the commit of the task that first uses it.

## Summary

A spike in a scratch copy of the repository (its `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `site/`,
`tests/site/`, `typings/`, `vitest.config.ts`), outside the tree. It pins the four packages exactly, runs oxlint with
`--type-aware` on one file, then on `site/` and `tests/`, adds a one-rule local JS plugin and `eslint-plugin-solid`'s
`v2-strict` rules through `jsPlugins`, runs `oxfmt --check` with the brief's config, and proves the lockfile with a
frozen install for linux-x64 and for darwin (arm64 and x64).

## Design model

- **A spike proves loading, not the mapping**: a handful of type-aware rules stand in for task 2.4's mapping, one local
  rule (the shape of `lint/promises.grit`) for task 2.6's plugin, a probe file for Solid code that does not exist yet.
- **Nothing pinned before it is used**: an unused devDependency would need a knip `ignoreDependencies` entry only to be
  removed again. Each package enters `package.json` with its first use, so knip needs no entry for oxfmt or oxlint
  (their scripts use them); `oxlint-tsgolint`, which oxlint runs itself and no script names, may still need one when 2.4
  adds it (see Decisions).

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Versions | `oxlint` 1.94.0, `oxlint-tsgolint` 7.0.2007, `oxfmt` 0.79.0, `eslint-plugin-solid` 0.20.0, exact (`pnpm add -D -E`) | `npm view <pkg> dist-tags` on 19 November: each `latest`, the same as the brief's table of 18 November. |
| 2 | When each is pinned | `oxfmt` in 2.2, `oxlint` and `oxlint-tsgolint` in 2.4, `eslint-plugin-solid` in 4.2 | The coordinator's change of plan: no knip entry for a package not yet used. The plan's row 2.1 ("pin …") is superseded by this. |
| 3 | `supportedArchitectures` | None needed | pnpm 10.30 writes every platform package of an optional-dependency set into the lockfile, whatever the machine; a frozen install picks the one for its platform (Evidence, "Lockfile"). |
| 4 | knip and `oxlint-tsgolint` | For 2.4 to settle: knip reported it unused in the spike; if its oxlint plugin does not count it once a script runs `oxlint --type-aware`, an `ignoreDependencies` entry: "the type-aware half of oxlint, which oxlint runs itself under `--type-aware`: nothing imports or calls it" | Used only by oxlint at run time. |
| 5 | Q4 (ESLint peer) | Moot: `eslint-plugin-solid` 0.20.0 declares `eslint` an **optional** peer (`peerDependenciesMeta`); pnpm prints nothing | The brief says "non-optional" and expects a warning on every install; the registry and the lockfile say otherwise (Evidence). |
| 6 | Where oxlint runs from | Its working directory must have `node_modules/oxlint-tsgolint`: task 2.5's fixture harness runs oxlint from the repository root with `-c`, not from the fixtures' folder | Run from the scratch folder it failed: "Failed to find type-aware linter executable. You may need to add the `tsrs` or `oxlint-tsgolint` package to your project?" |
| 7 | Solid's rule set | 2.4/4.2 expand `v2-strict` into `.oxlintrc.json`'s `rules`, one entry each; oxlint does not take ESLint's `configs` | `jsPlugins` loads a plugin's rules only. `v2-strict` holds 37 `solid/*` rules (32 on: 26 error, 6 warn) and `no-unassigned-vars: off`, a core ESLint rule left out. |

## Evidence

Node 22.22.0, pnpm 10.30.0. Commands ran from the scratch copy or from the repository root with `-c <scratch config>`;
timings are wall time of the whole command on a 4-thread container.

**Install.** `pnpm add -D -E oxlint@1.94.0 oxlint-tsgolint@7.0.2007 oxfmt@0.79.0 eslint-plugin-solid@0.20.0`: exit 0,
`Packages: +233`, no line containing "warn" or "peer". `rm -rf node_modules && pnpm install --frozen-lockfile`: exit 0,
no warning; `node_modules/eslint` absent. The lockfile's entry:

```yaml
eslint-plugin-solid@0.20.0:
  peerDependencies:
    eslint: ^9.0.0 || ^10.0.0
  peerDependenciesMeta:
    eslint:
      optional: true
```

`oxlint` 1.94.0 peers `oxlint-tsgolint >=7.0.2007` and `vite-plus *`, both optional; `oxfmt` 0.79.0 peers `svelte`,
`vite-plus`, `@astrojs/compiler-rs`, all optional, and depends on `tinypool` 2.2.0. The three Oxc packages alone add 510
lines to `pnpm-lock.yaml`.

**Lockfile.** It holds, for each native package,
`@oxlint/binding-{linux-x64-gnu,linux-x64-musl,darwin-arm64,darwin-x64}`, `@oxfmt/binding-` the same four,
`@oxlint-tsgolint/{linux-x64,darwin-arm64,darwin-x64}` (and the other platforms). `pnpm install --frozen-lockfile` here
installed `@oxlint/binding-linux-x64-gnu`, `@oxfmt/binding-linux-x64-gnu`, `@oxlint-tsgolint/linux-x64`. The same
lockfile, in a copy with a `pnpm-workspace.yaml` of `supportedArchitectures: {os: [darwin], cpu: [arm64, x64]}` (to
simulate a Mac, not for the repository), installed with `--frozen-lockfile` and no change:
`@oxlint+binding-darwin-{arm64,x64}`, `@oxfmt+binding-darwin-{arm64,x64}`, `@oxlint-tsgolint+darwin-{arm64,x64}`.

**Type-aware, one file.** Config: `plugins: ["typescript"]`, `correctness` off, five type-aware rules on
(`no-floating-promises`, `strict-boolean-expressions`, `no-unnecessary-condition`, `no-base-to-string`,
`no-unsafe-type-assertion`). `oxlint -c typeaware.json --type-aware site/json.ts`: 0.5 s, one finding,
`no-unsafe-type-assertion` at `site/json.ts:37` (the line Biome's suppression at `:36` covers).

**Type-aware, `site/` and `tests/`.** `oxlint -c typeaware.json --type-aware -f json site tests`: 1.0 s, 127 files, 83
findings: `strict-boolean-expressions` 46, `no-unnecessary-condition` 23, `no-base-to-string` 10,
`no-unsafe-type-assertion` 4 (the four Biome suppressions). No "file not in a project" message: each file found its
tsconfig (`tests/site/tsconfig.json` for the tests). The brief's "about 70" from the type-aware rules is of this order.

**A JS plugin with type-aware.** `house.js`, one rule (ESLint rule API, a `CallExpression` visitor reporting
`.then(ok, failed)` with `lint/promises.grit`'s message), in `jsPlugins`, rule `house/promises: error`. On `site/` and
`tests/`: 1.15 s, the same 83 findings (the code passes the Grit rule). On a probe file with a two-argument `.then` and
an `if (n)` on `number | undefined`: both `house(promises)` and `typescript(strict-boolean-expressions)`, in one run.

**`eslint-plugin-solid`.** `jsPlugins: ["eslint-plugin-solid", "./house.js"]`, the 37 `solid/*` rules of `v2-strict`
with their severities, the five type-aware rules, `house/promises`; ESLint not installed. On a `probe.tsx` of Solid 1.x
habits, 0.25 s: `solid(no-single-arg-create-effect)`, `solid(no-innerhtml)`, `solid(event-handlers)`,
`solid(no-write-in-pure-computation)`, two `solid(reactivity)` warnings, `house(promises)` and
`typescript(strict-boolean-expressions)`. On the copy's `site/` and `tests/`: 1.2 s, 127 files, 38 rules, the same 83
findings and none from Solid's rules on today's `h()` code. The prefix is `solid`, from the plugin's `meta.name`
(`eslint-plugin-solid`).

**oxfmt.** `.oxfmtrc` = the brief's config, passed with `-c`. `oxfmt --check site/json.ts`: clean ("Finished in 1ms on 1
files"); `site/main.ts`: clean; `public/css/site.css`: one file to change (the `unicode-range` values the brief
expects); `package.json` and `tests/site/roster.test.ts` also differ, for task 2.2 to count. A call mixing folders with
`!` globs (`site 'tests/**/*.ts' public/css *.json *.jsonc '!pnpm-lock.yaml' …`) listed fewer files than the same
folders alone (`site.css` missing): task 2.2 should scope with `ignorePatterns`, not command-line negations, and check
the file count.

**Repository checks** (with the three Oxc packages briefly added, before the change of plan; then reverted, and
`pnpm install --frozen-lockfile` from an empty `node_modules` back on the unchanged lockfile): `mise run knip` failed
with "Unused devDependencies (3)" until given `ignoreDependencies`, then passed; `biome check --error-on-warnings`:
"Checked 131 files … Found 43 infos", the same as at `HEAD`; `uv run --group dev pytest -q tests/`: 986 passed (no test
reads `package.json`'s dependencies; `tests/test_suppressions.py:105` reads `biome.jsonc`).

**Brief errors:** `eslint-plugin-solid`'s ESLint peer is optional, so no warning and Q4 needs no answer; Biome checks
131 files, not 130 (the Phase 1 report) or 94.

## The info-level findings (Q2)

Biome at `22cd0597`: 43 infos of 9 rules, which report and fail nothing under `--error-on-warnings`.

| Rule | Findings | Where |
| -- | -- | -- |
| `noBitwiseOperators` | 19 | the hash and the random numbers of `site/ink.ts` (8) and `tests/site/roster.test.ts` (11) |
| `noAwaitInLoops` | 7 | tests only, which drive the page step by step |
| `noExcessiveCognitiveComplexity` | 6 | `site/roster.ts` 3, `site/months.ts` 2, `site/festivals.ts` 1 |
| `useDestructuring` | 5 | `site/` 3, tests 2 |
| `useDomQuerySelector` | 2 | tests |
| `useShorthandAssign`, `useNamedCaptureGroup`, `useConsistentBuiltinInstantiation` | 1 each | tests |
| `noExcessiveClassesPerFile` | 1 | `site/db.ts` |

## Impact

- **New:** this file.
- **Changed:** nothing else; `package.json`, `pnpm-lock.yaml`, `knip.jsonc` as at `HEAD`. Scratch configs, the plugin
  and the probe are not kept.
- **For later tasks:** 2.2 pins `oxfmt` 0.79.0 with no `supportedArchitectures`; 2.4 pins `oxlint` 1.94.0 and
  `oxlint-tsgolint` 7.0.2007 (Decision 4); 2.5 runs oxlint from the root (Decision 6); 4.2 pins `eslint-plugin-solid`
  0.20.0 or its then-current release and expands `v2-strict` (Decision 7).

## Done when

The four packages load together on pinned versions (above), and the frozen lockfile resolves the linux-x64 and darwin
binaries; the repository's checks pass on an unchanged `package.json`.
