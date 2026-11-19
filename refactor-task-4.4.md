# Task 4.4: the coexistence seam

Task 4.4 of [refactor-plan.md](refactor-plan.md). Status: in progress, 19 November 2026.

## Summary

The first Solid view mounted inside the `h()` page, and what every later port needs to do the same. `dom.ts`'s helpers
that draw nothing move to a module of their own (`site/bits.ts`), so a `.tsx` file never imports `dom.ts` and
`house/legacy` stays absolute. The address becomes one signal (`site/address.ts`), read from `routes.ts`'s `routeOf` on
each `hashchange`, and `main.ts`'s router follows it. A Solid view sits behind the `View` record's `show` through
`site/mount.tsx`: rendered into the root `main.ts` hands every view, inside an error boundary that says a failure as
`report.ts` does, and disposed when the view's abort signal fires. This week (`site/week.tsx`) is the first view so
mounted, its cards still `eventcard.ts`'s `h()` elements. A test over the built scripts (`tests/site/bundle.test.ts`)
refuses any markup the compiler wrote into a template that the page's Content-Security-Policy refuses. Visitors see the
same site.

## Design model

- **A Solid view behind `View`.** `main.ts`'s `View` record and `routes.ts`'s `Show` are unchanged:
  `show(root, sub, qs, { signal, data })`. `mounted(where, View)` returns such a `show`: it renders `<View sub qs />`
  into `root` with `@solidjs/web`'s `render`, and hands `render`'s dispose function to `signal`'s `abort` (or calls it
  at once if the signal has already fired). The dispose function disposes the view's owner and empties `root`; `main.ts`
  replaces `root` in `#main` in the same task, so nothing shows the empty root. Props are values (`sub`, `qs`); `data`
  is not passed, since a view that reads the database waits for it (`waitsForData`) before `show` runs, and `sql.js`
  answers synchronously (the brief: plain `createMemo`).
- **Who owns a view.** Every view is rendered under one owner the seam makes for the page and never disposes. Measured
  (a scratch test, not kept): `render` called inside an effect's callback throws `PRIMITIVE_IN_EFFECT_CALLBACK`, which
  halts Solid, whether the current owner is the effect's or `null`; under an existing owner it renders, and disposing it
  later cleans it up. `main.ts` calls a view's `show` inside the router's effect whenever the view waits for nothing and
  no slide defers the change (`tabs.ts` `slide`), so the page's owner is what makes that call safe. This week waits for
  the database, so its `show` runs in a `.then`, outside any effect; 4.8's `sources`, which waits for nothing, is the
  first port to take the other path.
- **An error stays the view's.** A throw that escapes every Solid boundary halts the whole reactive system
  (`REACTIVITY_HALTED`, in production too), so with the router on a signal, one broken view would stop the page
  following its address. Measured: without a boundary, a Solid view that throws as it builds is said by `guarded`, and
  the next `open()` waits forever. So the seam wraps each view in `<Errored>`, whose fallback is `report.ts`'s
  `cannotShow(where, e)`: the same console line (`Kiz Radar: <view>: …`) and the same paragraph ("This page could not be
  shown: …") `guarded` gives an `h()` view, now from one function both call.
- **The address, one signal.** `createAddress()` (`site/address.ts`) is a signal of
  `routeOf(location.href, document.baseURI)`, set again on each `hashchange`, with `equals: false` so that every move is
  a new value, as each `hashchange` showed a view again before. `routes.ts` is untouched and stays the one source of the
  routes; the signal only says when the address it reads has moved. A view's own state written to the address bar
  (`showInAddressBar`, a `replaceState`) fires no `hashchange` and is not a new address, as before. `main.ts` reads it
  in one effect, in a root made once `site.json` is in (where `start()` added its listener): the effect's compute is the
  address, its apply `route(address, { scrollUp })`, `scrollUp` false for the first value only. What escapes `route()`
  goes to `reportError`, the window's `error` event that `report.ts`'s `reportUncaught` hears, as a throw in the
  `hashchange` listener did, never to Solid. The shell of 4.5 reads the same accessor.
- **The CSP check.** The page refuses inline style and inline script (`style-src 'self'`, `script-src 'self'`). Task 4.2
  found that the compiler writes a constant style object into the template (`<p style=color:red>`), so `house/styles`
  refuses the `style` prop. With `@solidjs/compiler` 2.0.2's `transform` on a probe, what else lands in a template: a
  handler given as a string (`<img onerror="…">`, `<p onclick="…">`), a `javascript:` URL, and a `<style>` or `<script>`
  child; an `onClick={…}` is delegated, a spread `{...{ style }}` and `prop:style` are set at run time. Lint refuses the
  `javascript:` URL (three rules) and only an `onclick` on a non-interactive element, by accident
  (`jsx-a11y/click-events-have-key-events`); `onerror="…"` passes every rule. So `tests/site/bundle.test.ts` reads every
  start tag the built scripts carry (`public/js/*.js`, which `test:site` builds first) and refuses a `style` attribute,
  an `on…` attribute, a `javascript:` URL, and a `<style>` or `<script>` element; it also checks that the markup it
  reads includes This week's template, so it cannot pass on nothing. `pages.browser.test.ts`'s frames, under each page's
  policy, already hear what is refused on each route as drawn (This week among them); this test reads the templates of
  branches no fixture draws.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The first view | This week (`site/week.ts` becomes `site/week.tsx`), moved from 4.8's list | The smallest real view that proves the seam whole: it waits for the database (the `waitsForData` path), holds `h()` pieces inside JSX (`eventCard`, 4.6's), and reads the festivals, which a planted row can break, so the error boundary is tested through the page. `sources` (4.8 too) waits for nothing, reads `site.json` alone, which a test cannot plant, and holds no `h()` piece. A fixture component would not be "a view mounted" and would need the seam module on `lint/tests.ts`'s list. Porting `week` here takes it off 4.8's list rather than doing it twice. |
| 2 | Where the helpers go | `site/bits.ts`: `Kid`, `Classes` (and `ClassList`, which `dom.ts`'s `Attrs` uses), `uniqueId`, `debounced`, `onResize`; a move-only commit, every importer changed, nothing else | The brief's list, less what renders: `h`, `button`, `nodes`, `toggle`, `own`, `moreButton`, `dropdown`, `choices`, `segments`, `paged` and `Attrs` stay. `toggle` sets a class, which `house/classes` keeps to `dom.ts`. `uniqueId` stays as it is for `h()` views; a Solid view uses `createUniqueId` (4.1). |
| 3 | The seam's module | `site/mount.tsx`, `mounted(where, View): Show`, `ViewProps` `{ sub, qs }` | `.tsx` since it writes JSX (the boundary); `where` is the name the console line gives, as `guarded`'s is. |
| 4 | The error boundary's words | `report.ts`'s `cannotShow(where, e)`, returning the paragraph `guarded` drew; `guarded` calls it | One place for the words, the class and the console line. The fallback reads the error in JSX (`<>{cannotShow(where, e())}</>`), where a flow callback's accessor is read (Solid's primer). |
| 5 | The page's owner | `createRoot(getOwner)` at `mount.tsx`'s top | The design model. `createOwner` exists at run time but `solid-js` 2.0.3's types do not export it; a root's owner is the same thing, typed. |
| 6 | The router's effect | `createEffect(createAddress(), apply)` in a `createRoot` made in `start()`; errors to `reportError`; the first `route` a microtask after the root is made | Solid's effects run on the next flush (measured: the first apply after the root's body returns, before the next task). The first view shows a microtask later than before, which no visitor can see; a failure in `route()` itself is now reported as "the page", where the first one was "starting the page". |
| 7 | `routes.ts` | Unchanged | The brief: wrap it, never replace it. `Address` is `address.ts`'s, the read-only shape of `routeOf`'s result. |
| 8 | Tests | `tests/site/mount.browser.test.ts` (This week drawn in the page's root with its `h()` cards; the root emptied when left, drawn anew on return); `tests/site/mount-broken.browser.test.ts` (a planted feature no state has: This week says it failed, the console line declared twice, the page moves on to another view and back); `tests/site/bundle.test.ts` | Through the page, as `house/tests` asks; the existing tests of This week (`app`, `pages`, `sources`, `onnow`, `elements`) pass unchanged. |
| 9 | Classes in JSX | Not held to `ClassName` yet | Out of this row. `class="…"` in JSX is typed `string`; `house/classes` reads only `classList` and `className`. This week's four classes are the ones it had and `styles.test.ts` still finds each used elsewhere. A rule or a typed helper is needed before the shell (4.5) writes many. |

## Impact

- **New:** `site/bits.ts`, `site/address.ts`, `site/mount.tsx`, `site/week.tsx` (from `site/week.ts`);
  `tests/site/mount.browser.test.ts`, `tests/site/mount-broken.browser.test.ts`, `tests/site/bundle.test.ts`.
- **Changed:** `site/dom.ts` (the helpers gone), the 18 modules that imported them; `site/main.ts` (the router on the
  address, This week mounted); `site/report.ts` (`cannotShow`); `CONTRIBUTING.md` ("Site:" bullet: the bundle test);
  `refactor-plan.md` (rows 4.4 and 4.8).
- **Unchanged:** `site/routes.ts`, `site/db.ts` (sql.js), every test that was there, the page's policy.

## Commits

| Commit | What |
| -- | -- |
| 1 | this plan |
| 2 | `dom.ts`'s helpers that draw nothing moved to `bits.ts` (move only) |
| 3 | the address as one signal, the router following it |
| 4 | the seam (`mount.tsx`, `cannotShow`) and This week as its first view, with its tests |
| 5 | the built scripts' markup held to the page's policy (`bundle.test.ts`), CONTRIBUTING |
| 6 | the plan's rows and this status |

## Review of this plan

Each claim re-read against the code and `node_modules` before the first commit:

- `main.ts`'s `View` and `show()`: `leave?.abort()` then `main.replaceChildren(root)` in the same call; a view that
  waits for data is built in `data.then`, only if its signal has not fired; `route()` called from `start()` and the
  `hashchange` listener alone (`route`, `show`, `start`).
- `@solidjs/web` 2.0.3's `render` (`dist/web.js:383-410`): `createRoot`, `flush()`, a throw disposes and rethrows; its
  dispose empties the element (`textContent = ""`). Its `owner` option is in the types but not read by the code.
- `@solidjs/signals` 2.0.3's `haltReactivity` (`dist/dev-shared.js:2529`; `prod/boundaries.js:477` in production) and
  `PRIMITIVE_IN_EFFECT_CALLBACK` (`:5666`); the diagnostics skill's repair for it ("attach them to an existing owner
  with `runWithOwner`").
- `Errored`'s fallback is `(err: ErrorAccessor, reset) => …` (`solid-js/types/client/flow.d.ts:205`).
- The compiler's output, by running `@solidjs/compiler`'s `transform` on a probe (design model), and the built
  `public/js/main.js` (`<header class=page-intro>` and three more templates; no markup in `review.js`; 152 tags of icons
  in the shared chunk, none refused).
- **Corrected:** the first draft rendered each view under no owner (`runWithOwner(null, …)`), meant to keep it out of
  the router's effect; a scratch test showed Solid refuses that inside an effect's callback too.
- **Corrected:** the first draft took `sources` for the first view; it cannot be broken through the page (decision 1).
- **Corrected:** the broken-week test first planted `events.phase`, a column of the view `event_rows`, not of a table,
  then `events.listing`, which `event_rows` reads but the festivals filter out without parsing; `event_stats.features`
  is parsed as states (`rows.ts` `EVENT`).

## Done when

This week is a Solid view mounted inside the `h()` page through `mounted`, drawn and taken away through the page's
tests; a Solid view that throws says so in its place and the page goes on; no `.tsx` imports `dom.ts`; the built scripts
carry no markup the policy refuses; every test that was there passes unchanged; `mise run check` passes.
