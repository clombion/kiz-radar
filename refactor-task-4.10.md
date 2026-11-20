# Task 4.10: finishing

Task 4.10 of [refactor-plan.md](refactor-plan.md), the last of the refactor. Status: done, 20 November 2026. `dom.ts`
and `page.browser.test.ts` gone; the four Grit-era rules kept, none replaceable; four suppressions replaced, fifteen
kept with their reasons; the Phase 4 report written in the plan; no stop.

## Summary

Every view is Solid's since 4.9; what is left of the `h()` era is `site/dom.ts` (`h()`, `button`, `paged`, `toggle`,
`nodes`, `Attrs`), which only three lines of production code still call (`report.ts`'s `cannotShow`, which `guarded` and
`mount.tsx`'s boundary draw, and `main.ts`'s view root and its line of a load that failed), and
`tests/site/page.browser.test.ts`, which tests the helpers no page shows (Q5, task 1.6: deleted with them). This task
draws those three lines with JSX, deletes `dom.ts` and that test file, reviews the four Grit-era house rules (`markup`,
`classes`, `buttons`, `clicks`), revisits the suppressions the port kept for identical markup, writes the new
conventions into `CLAUDE.md` and the docs, writes the Phase 4 report, and removes the refactor's documents. No visible
change to the site and no change to its words.

## Design model

- **The last `h()` lines become JSX, where their kind already lives.** `cannotShow(where, e)` (the console line and
  "This page could not be shown: …") moves to `mount.tsx`, the seam whose boundary draws it, as JSX; its console line
  stays `report.ts`'s (`eslint/no-console` is off there alone), through a function `report.ts` exports for both `report`
  and `cannotShow`. `guarded` goes: what it caught around a view's `show` (a throw escaping `render`, outside the view's
  boundary, which no test reaches since 4.4 put every view in one) is caught in `mounted` itself, which then draws
  `cannotShow`'s line in the view's place through `placed.tsx`'s `instead`, disposed with the view's signal. `main.ts`
  calls `view.show` directly. The line of a load that failed ("Could not load the data: …") is JSX in `marks.tsx`,
  beside the loading mark it replaces, drawn through `instead` (disposed with the view's signal; never, for the page's
  start, which goes no further); the error's words through `report.ts`'s `message`, as the 4.8 audit asked. The view's
  root, an empty `<div>`, is JSX (`mount.tsx`'s `viewRoot`, `bits.ts`'s `asElement`). `main.ts` keeps its `<base>` (the
  page's head, not a view) and moves the root into `<main>` as before.
- **`dom.ts` goes whole.** With no caller, `h()`, `button`, `paged`, `toggle`, `nodes`, `Attrs` and the `on…`, `style`,
  `dataset` branches are dead (knip); the module is empty, so it is deleted, with `page.browser.test.ts` (its four kept
  tests: `h()`'s attributes, text as text, class list and style object with `toggle`, `paged`'s old listener), the
  `.oxlintrc.json` overrides that exempted `dom.ts` (`buttons`, `classes`) or let the test import it (`tests`), and the
  fixtures of those exemptions. What `bits.ts` kept for `dom.ts` alone (`Kid`, `ClassList`, `Classes`, `flat`) goes
  where knip finds it unused.
- **The four Grit-era rules: each kept, its message rewritten.** The brief allows retiring one only with a fixture
  proving Solid or an oxlint rule now enforces the same constraint. Measured on each rule's own refused fixtures, with
  the candidate rule alone (scratch config, not committed):
  - `markup`: `solid/no-innerhtml` (on, `v2-strict`) refuses 2 of the 29 lines `markup` refuses: a bare `innerHTML={…}`
    and `innerHTML` with no value; not a static string, `outerHTML`, `prop:innerHTML`, a spread, or any DOM write
    (`el.innerHTML =`, `insertAdjacentHTML`, `parseFromString`) in `.ts` or `.tsx`. Kept.
  - `buttons`: `react/button-has-type` (on, with its defaults) set to refuse `submit` and `reset`, with
    `react/jsx-no-duplicate-props`, refuses 7 of the 10 JSX lines; it lets through a spread after the type
    (`<button type="button" {...rest} />`, `{...{ type: 'submit' }}`). Kept.
  - `classes`: no rule of oxlint's or Solid's refuses an element's `classList` or `className`; tsc holds JSX's `class`
    to `ClassName` (`site/jsx-runtime.d.ts`), not the DOM's. Kept.
  - `clicks`: no rule refuses `stopPropagation()`. Kept. Their messages, and `legacy`'s, `styles`' and `states`'
    comments, name JSX and `bits.ts` where they named `dom.ts`'s `h()`, `toggle()` and `button()`; `clicks` already
    names `bits.ts`'s `own()`, which exists. The rules' behaviour is unchanged but the exemptions of a file that no
    longer exists; the fixtures that showed `dom.ts`'s helpers as "the intended way" show JSX's instead.
- **The suppressions kept for identical markup, revisited** (row 4.10): replaced where the native element or attribute
  leaves the page looking the same and the tests pass; otherwise kept with the reason that holds, no longer "revisit
  after 4.10":
  - `map.tsx`'s `role="region"` `<div>`: a `<section>` named by `aria-label` is a region by HTML's own mapping (the same
    accessibility tree in Chromium, Firefox and Safari), and the stylesheet reads `.map`, never `div` or `section` but
    under `.sources`: **replaced**, with a test that the map is a region of that name.
  - the review page's three `rel="noopener"` links to a new tab (`token.tsx` one, `dashboard.tsx` two):
    `rel="noopener noreferrer"`, which the rule asks for on these three (it reads an address only when it is an external
    literal or a bare name, so it lets `href={e.url}` through, and the test holds the convention), changes nothing seen;
    it stops the Referer (the page's origin to GitHub and a festival's page under the browsers' default policy, the full
    address to the site's own artist page), which nothing reads: **replaced**, with a test that each link opens a new
    tab with no opener and no referrer.
  - kept: the `role="status"` paragraphs (`marks.tsx`, `controls.tsx`'s `leftOut`, `token.tsx`, `dashboard.tsx`), an
    `<output>` being inline and a form's control; the `role="group"` rows (`controls.tsx` segments, `communities.tsx`'s
    roster views, `gantt.tsx`), a `<fieldset>`, the same group by the same `aria-label`, bringing the browser's border,
    padding, margin and min-content width for the stylesheet to take off again; the `role="img"` privacy mark
    (`communities.tsx`), an image of a drawing and a count, which an `<img>` cannot hold; the calendar's grid
    (`months.tsx`, five), laid out by the stylesheet's grid over `<span>`s, which a table's parts would leave for the
    table's own layout; `sentence.tsx`'s "Show them ↓" link to `#`, whose click scrolls to the cards with the page's own
    motion, the address being the router's; `dashboard.tsx`'s `aria-selected` on the rail's buttons, kept as it is for
    issue #22, which covers its fix.
- **Comments and docs say what is, not what the port kept.** Comments naming `dom.ts`, `h()` or a view "as the `h()`
  page drew it" as present code are reworded where they would now point at nothing (`bits.ts`, `classes.ts` through
  `pipeline/generate.py`, `jsx-runtime.d.ts`, `report.ts`, `main.ts`, the tests' headers the 4.8 record left);
  `CLAUDE.md` gains the site's conventions (below), its "Never" list unchanged; `CONTRIBUTING.md`, the site guide, the
  lint pages and `tests/test_suppressions.py` follow.
- **`CLAUDE.md`'s conventions** (each also held by a rule, a type or a test, named beside it): a view is a function of
  its address returning JSX, mounted by `main.ts` through `mount.tsx`'s `mounted` (the review page's draws through
  `drawnIn`), the shell's parts through `placed.tsx`; a view's choices a signal (`controls.tsx` `chosen`), its controls
  `controls.tsx`'s; what a view draws again in `Redrawn`, what other parts read of it through `createDerived`, an
  imperative redraw through `redrawing`, so a throw is said once; no `style` prop (`house/styles`); effects only for DOM
  work Solid cannot express, never to mirror a value (`house/mirrors`) or to render (`FLUSH_IN_EFFECT_CALLBACK`);
  listeners and timers taken away with their owner (`onCleanup`, `disposal()`); owner counts in tests
  (`tests/site/owned.ts`) for what a draw holds; the console guard (`tests/site/console.ts`, `expectConsole`); and the
  bundled Solid skills in `node_modules/solid-js/skills/` read before writing Solid code.
- **The report, then the removal.** The Phase 4 report goes into `refactor-plan.md` with the row's status, in one
  commit; the last commit removes `refactor-brief.md`, `refactor-plan.md`, `refactor-ledger.md`, `refactor-audit-2.md`
  and every `refactor-task-*.md`, and fixes what links to them or names them as present (`docs/concepts/lint-rules.md`'s
  two links; "the brief's" in the house rules' headers and `.oxlintrc.json`).

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Where `cannotShow` goes | `mount.tsx`, as JSX; its console line through `report.ts` | The seam that draws it; `no-console` stays off for `report.ts` alone; `mount.tsx` already imports `report.ts`'s neighbours, no cycle. |
| 2 | `guarded` | gone; its catch in `mounted`, drawing `cannotShow` through `instead`, disposed with the view's signal | `main.ts`'s one caller; a throw that escapes `render` would otherwise be said as "Could not load the data" (in the `.then`) or the page's line (in the router's effect), not in the view's place. The review page's draws keep `drawnIn` as 4.9 left them. |
| 3 | The line of a load that failed | `marks.tsx`'s `loadFailed(e)`, drawn through `instead`; words through `message` | Beside the loading mark it takes the place of; one spelling of an error's words. |
| 4 | The view's root | `mount.tsx`'s `viewRoot()`, a JSX `<div>` checked by `asElement` | No hand-built element in `main.ts`; the `<div>` the stylesheet and the tests know. |
| 5 | `dom.ts` | deleted, with `page.browser.test.ts` (four tests, approved: Q5, task 1.6) | Nothing left in it once its callers are JSX. |
| 6 | The four rules | all kept, messages rewritten (evidence above) | No replacement refuses all they refuse. |
| 7 | `buttons`' `h('button')` branch | kept, with its fixtures | The rule is kept whole; only its message and the exemption of a deleted file change. |
| 8 | Suppressions | two kinds replaced (map region, review links' `rel`), the rest kept with their reasons | Row 4.10; #22 and #10 not touched. |
| 9 | `.oxlintrc.json`'s Q2 overrides (`roster.ts`, `db.ts`) | unchanged; their comments no longer say "until Phase 4" | Not in row 4.10; an open finding of the report. |

## Impact

- **Gone:** `site/dom.ts`, `tests/site/page.browser.test.ts`; fixtures `lint/fixtures/buttons/site/dom.ts`,
  `lint/fixtures/classes/site/dom.ts`, `lint/fixtures/tests/tests/site/page.browser.test.ts`.
- **Changed:** `site/main.ts`, `site/report.ts`, `site/mount.tsx`, `site/marks.tsx`, `site/bits.ts`, `site/map.tsx`,
  `site/token.tsx`, `site/dashboard.tsx`, the kept suppressions' comments (`controls`, `communities`, `gantt`, `months`,
  `marks`, `sentence`, `token`, `dashboard`), comments elsewhere; `lint/markup.ts`, `classes.ts`, `buttons.ts`,
  `legacy.ts`, `styles.ts`, `states.ts`, `tests.ts` and their fixtures; `.oxlintrc.json`, `knip.jsonc`;
  `pipeline/generate.py` and `site/classes.ts`; tests (below); `CLAUDE.md`, `CONTRIBUTING.md`,
  `docs/guides/the-site.md`, `docs/concepts/lint-rules.md`, `docs/lint-false-positives.md`,
  `tests/test_suppressions.py`; `refactor-plan.md` (row 4.10, the Phase 4 report).
- **Unchanged:** the page's markup, words and styles but the map's tag and the review links' `rel`; `routes.ts`, the
  data layer, the deploy workflow, the dependencies.

## Tests

- **Deleted:** `page.browser.test.ts`'s four (approved).
- **Added:** a load of the database that fails says "Could not load the data: …" in the view's place, the page around it
  kept (`main.browser.test.ts` or a file of its own, on a planted database the load refuses); the map is a region named
  "Map of festivals by city"; the review page's links to a new tab open it with `noopener noreferrer`.
- Each new test fail-checked (undo, see it fail, put back); the suite's existing tests of a view that cannot be shown
  (`broken`, `mount-broken`, `review-broken`, `card-thrown`, `redrawn-broken`) pass unchanged.

## Commits

01. this plan;
02. the last `h()` lines as JSX (`cannotShow`, `guarded`'s catch, the failed load's line, the view's root), with the
    failed load's test;
03. `dom.ts` and `page.browser.test.ts` deleted, with the exemptions and what `bits.ts` held for them;
04. the house rules' messages and fixtures name JSX;
05. the map a `<section>`, with its test;
06. the review links' `rel`, with its test;
07. the kept suppressions' reasons;
08. comments that named `dom.ts` and `h()` as present code;
09. `CLAUDE.md`, `CONTRIBUTING.md` and the docs;
10. the row's status and the Phase 4 report;
11. the refactor's documents removed, and what linked to them.

## Result

| Commit | What |
| -- | -- |
| `40a7739` | this plan |
| `8fdd9cc` | `styles.test.ts` counting a class only where code gives it to an element; the rules it found styling no element dropped, the flight line's `.p` among them (below) |
| `b25c116` | `cannotShow`, `viewRoot` (`mount.tsx`) and `loadFailed` (`marks.tsx`) as JSX, `guarded` gone, `report.ts`'s `logged`; `load-failed.browser.test.ts`; the review test's spy (below) |
| `936c057` | `dom.ts`, `page.browser.test.ts`, the exemptions and their fixtures gone; `bits.ts`'s `flat` gone; the rules' messages, headers and fixtures name JSX; comments that named `dom.ts` as present code |
| `ef3c056` | the map a `<section>`; its test |
| `393c8ad` | the review links' `rel`; `review-links.browser.test.ts` |
| `78941ac` | the fifteen kept suppressions' reasons |
| `0311c1f` | `.oxlintrc.json`'s and the migration rules' comments |
| `bc0efde` | `CLAUDE.md`, `CONTRIBUTING.md`, the site guide, the lint rules' page |
| the record | the plan's row, the Phase 4 report, this status |
| the last | the refactor's documents removed |

**Tests.** Deleted: `page.browser.test.ts`'s four (approved). Added: `load-failed.browser.test.ts` (a database without
its `meta` says "Could not load the data: no such table: meta" in the view, the tabs kept, Sources still shown, the line
going with its view: the page's owners the same after); `map.browser.test.ts`'s "the map is one region a screen reader
names, Leaflet drawn in it"; `review-links.browser.test.ts` (the token dialog's, a home's and a waiting festival's links
to a new tab, each `noopener noreferrer`). Changed: `reviewpage.browser.test.ts`'s test of an item that cannot be drawn
lets a `<template>`'s markup through its spy; fixtures of `buttons`, `classes`, `markup`, `legacy` and `tests` (the
intended way JSX's; `tests`' refused imports the exception that remains, `placed.tsx`). Suite: 538 and 5 expected to
fail in 80 files, then 537 and 5 in 81.

**Fail-checks**, each undone, seen failing, put back:

- `load-failed`: the line's words changed ("Could not load data"): the open resolves; the line left undisposed with its
  view (no abort listener): 176 owners for 164; no plant: the open resolves. It passes on the `h()` line too.
- the map's region: the name taken off the `<section>`: `[]` for `[true]`; on the old `<div role="region">` it passes.
- the review links: on the old `dashboard.tsx` (`noopener` alone): the list differs.
- `reviewpage`: the boundary's words changed: the open resolves.
- the fixtures: a refused marker taken off `tests`' `other.ts` and `app.ts`; `h('button')` in `buttons`' `good.ts`;
  `classList` read in `classes`' `good.tsx`; `innerHTML` set in `markup`'s `good.ts`: each fails `rules.test.ts`.

**Departures from the plan:**

- **`.p`:** with the `h('p', …)` calls gone, `styles.test.ts` found `.flight .p` and `.flight.easy .p` styling no
  element, hidden until then by the quoted tag; the rules went in a commit of their own before the JSX one. The audit
  found the test counting any quoted word, so other rules hid the same way: the test now counts a class only where code
  gives it to an element, and the `.card`, `.fare`, `.lineup` and `button.sort` rules it then found went in the same
  commit, each listed in its message (failing on a class planted in the stylesheet and quoted elsewhere).
- **The review page's test of a broken item** spied on every element's `innerHTML`, which now also refused the template
  Solid parses the boundary's line from (the fallback threw, uncaught): its spy lets a `<template>`'s markup through.
- **The failed load's plant** is `meta`, read after `site.json` is in, not `today`, written as the database is opened:
  the first full run failed the file once, the rejection coming before `main.ts` listened and so said as the page's too
  (an open issue of the report).
- **Comments:** what named `dom.ts` as present code went with it (the deletion's commit); the planned comment commit
  became `.oxlintrc.json`'s and the migration rules' (`0311c1f`). The past-tense comparisons with "the `h()` page" were
  kept, then reworded after the audit to say the behaviour itself (`936c057`).
- **`buttons`' `h('button')` branch** and `legacy`'s refusal of a `dom` module stay, the rules kept whole.

## Done when

No `h()`, `dom.ts` or `replaceChildren` helper is left; every view is `.tsx`; the four rules are each retired with a
fixture or kept with a message naming no deleted helper; every suppression the row lists is replaced or kept with its
reason; `CLAUDE.md` holds the conventions and points to the Solid skills; the Phase 4 report is committed; the
refactor's documents are gone and nothing links to them; knip clean; `mise run check` passes.
