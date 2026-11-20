# Notes for agents working on Kiz Radar

Read [docs/README.md](docs/README.md) for where each task's guide is, and [CONTRIBUTING.md](CONTRIBUTING.md) for the
checks and the conventions. Each step is a task of `tasks.toml`: `mise run <step> -- <its arguments>`.

The site (`site/`) is Solid 2.0 (`solid-js`, `@solidjs/web`), compiled by `@solidjs/vite-plugin`. Before writing or
reviewing Solid code, read the skills Solid ships in `node_modules/solid-js/skills/`: `solid-2.0` (the primer: 2.0 is
neither Solid 1 nor React), `solid-2.0-cheatsheet` (each primitive's exact form) and `reactivity-diagnostics` (what a
`[CODE]` in the console means and how to repair it). The site's own conventions, each held by a rule, a type or a test:

- **A view is a function of its address returning JSX**, in a `.tsx` module; `main.ts` mounts it through `mount.tsx`'s
  `mounted` (the review page draws through `drawnIn`), which renders it under the page's owner (`owner.ts`) in an error
  boundary and disposes it when the visitor leaves. The shell's parts are drawn once through `placed.tsx`. What draws is
  `.tsx` and renders with JSX alone (`house/legacy` refuses `replaceChildren` and `createElement` there); the `.ts`
  modules hold the data, the routes and helpers that make no element, the entry `main.ts` putting each view's root in
  `<main>` and `icons.ts` a drawing in an element JSX made. The site's own code puts markup in only through `icons.ts`
  (`house/markup`, `house/svgs`); Solid's runtime parses the compiler's constant templates, through a `<template>`'s
  `innerHTML`, so a Trusted Types policy would go to `@solidjs/web`'s `setTrustedTypesPolicy` before the first view.
- **A view's choices are a signal** (`controls.tsx`'s `chosen`, kept in the address), and its controls are
  `controls.tsx`'s (`choices`, `segments`, `check`, `dropdown`, `searchField`, `paged`, `leftOut`).
- **A failure is said once.** What a view draws again as the visitor changes it goes in `mount.tsx`'s `Redrawn`; what
  other parts read of it, through `createDerived`; an effect that draws imperatively (the map's bubbles), through
  `redrawing`. A throw as the view is first drawn is the view's ("This page could not be shown"); a later one is the
  page's line (`report.ts`), the view going on.
- **No `style` prop** (`house/styles`: the page's Content-Security-Policy refuses a style attribute, which Solid's
  compiler writes for constant values): a class of the stylesheet, typed by `ClassName` (`site/jsx-runtime.d.ts`), or
  `bits.ts`'s `styled` ref for a value known only as it is drawn.
- **Effects are for DOM work JSX cannot express** (Leaflet, a measure, the focus), never to mirror a value into a signal
  (`house/mirrors`; derive it with `createMemo`) or to render (`render` in an effect warns `FLUSH_IN_EFFECT_CALLBACK`).
  No `.then` in a component (`house/thens`), no loading or error flag of its own (`house/flags`).
- **What a view adds outside its own tree goes with it:** a listener on the document or the window, a timer, through
  `onCleanup` or `mount.tsx`'s `disposal()`.
- **The tests read the page, not the code** (`house/tests`): a browser test starts it through `tests/site/app.ts`. What
  a draw holds is counted (`tests/site/owned.ts`: the owners under the page's are the same after a view is left, or a
  part is drawn again). A console warning or error the test did not declare fails it (`tests/site/console.ts`,
  `expectConsole`), so Solid's development diagnostics are never passed over.

Never:

- edit `pipeline/tickets/pages.csv` or `pipeline/tickets/log/` by hand: go through `mise run tickets`, one festival at a
  time ([Prices from ticket pages](docs/guides/ticket-pages.md));
- edit a claim file in `claims/`: write a new one (`claims.write`) and commit it in the claims repository
  ([Claims](docs/concepts/claims.md));
- add a state that changes the site's words or a prompt without the admin's OK
  ([Adding a state](docs/guides/adding-a-state.md));
- leave a prompt change without its run: after pushing a change to a template, a state's criterion or a record, start
  **Refresh events** at once ([Refreshing the events](docs/guides/refreshing-events.md));
- read pages with `mise run read-page` in a scheduled job or a loop: one page per question;
- open a pull request: commit to `main`.
