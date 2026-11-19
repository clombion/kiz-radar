# Task 4.1: Solid installed and wired

Task 4.1 of [refactor-plan.md](refactor-plan.md). Status: planned, 19 November 2026.

## Summary

`solid-js`, `@solidjs/web`, `@solidjs/compiler` and `@solidjs/vite-plugin` pinned exactly at their `latest`; TypeScript
types JSX by `@solidjs/web`; the plugin compiles `.tsx` in the build (`vite.config.ts`) and in both browser projects
(`vitest.config.ts`). A trivial component, `tests/site/hello.tsx`, is drawn and pressed twice in
`tests/site/solid.browser.test.ts`: once from the tests' transform, on Solid's development build, and once as the site's
build makes it, on Solid's production build. Nothing in `site/` changes, and the built site is byte for byte the same.

## Design model

- **The proof lives beside the tests, not in `site/`.** A component under `site/` would have to be imported by the
  site's entries to be built, which changes what the page loads, or by a test, which the house rule `tests` refuses (a
  test imports no view module; a component is one). A third Vite input would publish an extra `js/` file. So the
  component is a test fixture, and "in the build" means built by the site's own `vite.config.ts` (its plugins and
  options), not by a copy of it.
- **The build in a test, as `pnpm run build` runs it.** A Vitest browser command (`built`, in `vitest.config.ts`) runs
  Vite's `build()` on `hello.tsx` with `configFile: 'vite.config.ts'`, writing nothing, and returns the one module's
  code (Solid bundled in). The test imports it from a `blob:` address and draws it. The input is the fixture and its
  exports are kept (`preserveEntrySignatures: 'strict'`: Vite drops an app entry's exports, and the site's entries have
  none); every other option is the site's. The build runs in a Node of its own (`env -u NODE_ENV node --eval …`): Vite
  resolves its `development|production` condition by `NODE_ENV`, process-wide, and under Vitest it is `test`, so a build
  in Vitest's own process draws Solid's development build. Without it, as under `pnpm run build`, `vite build` sets it
  to `production`. `vite.config.ts` names no condition of its own, so Solid's build follows Vite's mode.
- **Which Solid build runs is asserted, not assumed.** `hello.tsx` re-exports `@solidjs/web`'s `isDev`: `true` from the
  tests' transform, `false` from the build. The plugin adds the development condition under `vite dev` and Vitest
  (`command === 'serve'`) and never under `vite build`, so the tests' config adds no condition of its own.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Versions | `solid-js` 2.0.3, `@solidjs/web` 2.0.3, `@solidjs/compiler` 2.0.2, `@solidjs/vite-plugin` 3.0.1, exact, from `npm view <pkg> dist-tags` on 19 November | Q6 settles Q3: each tool at its current release during the refactor. `@solidjs/web` 2.0.3 peers `solid-js ^2.0.3`; the plugin peers `vite ^8 \|\| ^9`, `solid-js ^2`, `@solidjs/web ^2`: met by what is pinned, nothing forced. |
| 2 | The plugin's optional peers | None installed (`@babel/core`, `@solidjs/babel-plugin`, `@solidjs/start-devtools`, `@testing-library/jest-dom`) | Not named in the brief; optional (`peerDependenciesMeta`); the native compiler is the default. |
| 3 | `@solidjs/compiler` | A direct exact devDependency; `knip.jsonc`'s `ignoreDependencies` with its reason | The brief's preference over `pnpm.overrides`; nothing imports it, so knip reports it. |
| 4 | TypeScript | `jsx: "preserve"`, `jsxImportSource: "@solidjs/web"` in `tsconfig.json` (the tests' config extends it) | The bundled skill and cheatsheet: `solid-js` has no JSX runtime in 2.0; the renderer owns the JSX types. |
| 5 | Where the plugin goes | `vite.config.ts`'s `plugins`; each browser project of `vitest.config.ts` (`browser`, `browser-calm`), beside `pages()`; not the `node` project | The node tests import no `.tsx`; a project with `environment: 'node'` would get the plugin's server posture. |
| 6 | The development condition | The plugin's default (`dev` unset): development under Vitest; in `vite build`, Vite's own condition with `NODE_ENV` unset, which picks production; the test's build in a child Node without `NODE_ENV` | The design model; asserted by `isDev` both ways. A `production` condition named in `vite.config.ts` was tried and dropped: it held the test's build, but let Solid's build disagree with Vite's mode (`NODE_ENV=development vite build` would give production Solid beside `import.meta.env.DEV` true). |
| 7 | The component | `tests/site/hello.tsx`: a greeting and a button counting its presses, `greet(root, name)` returning the dispose function; `tests/site/solid.browser.test.ts`, two tests | Covers the compile (no JSX left), a prop, a signal, a delegated event and the dispose, and nothing more. |
| 8 | The `blob:` import | One `oxlint-disable-next-line house/tests` with its reason, listed in `tests/test_suppressions.py` and `docs/lint-false-positives.md` | The rule wants an `import()`'s module as one literal so it can check it is no view; this one is the build's output of a test fixture, no `site/` file. A type guard, not an assertion, types what it exports. |
| 9 | `.tsx` in the checks | knip's `project` and `entry` take `{ts,tsx}` under `site/` and `tests/site/`; Vitest's projects take `*.test.{ts,tsx}`; `tests/site/sources.ts` reads `site/`'s `.ts` and `.tsx` (for `states.test.ts` and `styles.test.ts`); oxfmt lets `tests/**/*.tsx` in (`site/**` already) and sorts its imports; jscpd's formats add `tsx`; `tests/test_structure.py`'s clock check reads `site/*.tsx`; oxlint and tsc already take `.tsx` from the folders they are given | Each list said `.ts` only and would have passed over a `.tsx` silently. The house rules' paths (`.oxlintrc.json`'s `site/*.ts` overrides of `states` and `buttons`) are task 4.2's. |
| 10 | Docs | `vite.config.ts`'s and `vitest.config.ts`'s headers, `tsconfig.json`'s comment; `CONTRIBUTING.md`, `CLAUDE.md` and the site guide unchanged | No convention changes yet; task 4.10 writes them with the skills' pointer. |

## What `node_modules/solid-js/skills/` says

The folder exists in 2.0.3 with three skills: `solid-2.0` (a primer for agents, 128 lines), `solid-2.0-cheatsheet` (the
API, generated from `node_modules/solid-js/CHEATSHEET.md`) and `reactivity-diagnostics` (each dev diagnostic code and
its repair). Nothing in them contradicts the brief's plan for Phase 4. What bears on the tasks after this one:

- **4.2, lint.** `eslint-plugin-solid`'s `v2` and `v2-strict` configs are the ones named. `class={{ … }}` and
  `class={[…]}` replace `classList` (a compile error now), which is where the `classes` rule's guarantee must be held;
  `use:`, `attr:`, `on:`, `bool:` are compile errors too. Attributes are lowercase (`tabindex`), events camelCase.
- **4.3, console failures.** Dev reports are console entries headed `[CODE]`, with an owner line (`in <App> › …`) and a
  source line. Top-level reads in a component body warn (`STRICT_READ_UNTRACKED`); a write in a component body, memo or
  effect compute *throws* in dev (`REACTIVE_WRITE_IN_OWNED_SCOPE`), so a wrong-scope write fails a test on its own;
  `untrack` silences neither and must not be used to. The diagnostics endpoint needs `@solidjs/diagnostics`, a package
  the brief does not name: not installed, so the plugin leaves it off.
- **4.4, the seam.** `render(() => <View/>, root)` returns the dispose function the abort signal calls (as `hello.tsx`
  does). `createUniqueId` is Solid's, for `dom.ts`'s `uniqueId`. Refs run before the element is attached: layout work
  (the oval, Leaflet in 4.7) goes in `onSettled`, which replaces `onMount`.
- **The views (4.5 to 4.9).** Props are read (`props.x`), never destructured; values passed, not accessors.
  `createEffect(compute, apply)` takes two functions. Async data is `createMemo(() => get(…))` under `<Loading>`, with
  `isPending` and `<Errored>`: the brief's migration rules. `sql.js`'s synchronous queries are plain memos. Reads lag
  writes until the microtask (`flush()`), which the tests' polling `expect.element` absorbs. Event handlers bind once.
  Inputs are not strictly controlled: the search box, the finder's dropdowns and the SQL page's form keep a draft signal
  and commit on change.
- **Not said:** the style attribute and the CSP, and the `innerHTML` prop; the brief's checks stand (4.4, 4.2).

## Impact

- **New:** `tests/site/hello.tsx`, `tests/site/solid.browser.test.ts`.
- **Changed:** `package.json`, `pnpm-lock.yaml`; `tsconfig.json`; `vite.config.ts`; `vitest.config.ts`; `knip.jsonc`,
  `.oxfmtrc.jsonc`, `.jscpd.json`; `tests/site/sources.ts`, `tests/test_structure.py`, `tests/test_suppressions.py`;
  `docs/lint-false-positives.md`; `refactor-plan.md` (row 4.1, Q3).
- **`site/` and the built site:** unchanged (`public/js/` byte for byte, by `md5sum` before and after).

## Done when

`tests/site/solid.browser.test.ts` draws `hello.tsx` from the tests (development build) and from the site's build
(production build) in the `browser` project; `pnpm run build` writes the same `public/js/`; the lockfile holds no
optional peer of the plugin and one Vite; `mise run check` passes.
