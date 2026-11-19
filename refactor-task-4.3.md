# Task 4.3: console failures

Task 4.3 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. The guard on in both browser projects;
two tests declared what `report.ts` says on purpose, and a third gave up its spy; Solid's development build warns of a
read in a component's body and throws on a write in it, both kept as tests; no fix in `site/`, no stop.

## Summary

The browser tests fail on a console warning or error they did not declare. A setup file of both browser projects
(`tests/site/console.setup.ts`) puts a guard (`tests/site/console.ts`) on the window each test file runs in, which is
also the page's window when `app.ts` starts the site: it hears `console.warn`, `console.error` and a failing
`console.assert`, and after each test fails it on what was said that no `expectConsole(kind, pattern, times = 1)` of
that test declared, on a declaration said other than `times` times, and on a test that replaced `console.warn` or
`console.error`. What is said outside any test (as a file's page starts) fails the file. Measured with the guard on, two
of the 229 browser tests failed and nothing was said outside a test: each a failure path that `site/report.ts` reports
on purpose, no bug. They declare it now, and so does a third, `reviewpage.browser.test.ts`, whose console spy hid the
same kind of error from the guard. Solid's development build is shown to report both mistakes the brief names: a read in
a component's body warns (`STRICT_READ_UNTRACKED`), a write in it throws (`REACTIVE_WRITE_IN_OWNED_SCOPE`) and halts
Solid; a fixture (`tests/site/diagnosed.tsx`) and two test files keep it shown, and show the guard failing a test that
does not declare the warning. Nothing in `site/` changes.

## Design model

- **One window, one guard.** Vitest's browser mode runs each test file in a frame of its own (`isolate: true`, set in
  each browser project, and checked: the guard throws in a window that already ran a file), setup files first; the page
  `app.ts` starts (`main.ts` or `review.ts`, imported) runs in that same window, so wrapping that window's
  `console.warn` and `console.error` hears the site, Solid and the test alike. Each wrapper prints what it does not
  swallow through the console it replaced (Vitest's own, which forwards to the terminal).
- **Declared before, matched on the words, held both ways.** A test calls `expectConsole('warn' | 'error', /…/u)` before
  the code that says it; a call whose words (each argument as `String` gives it, joined by a space, as the console shows
  them) match a declaration of its kind is counted and not printed. After the test (the setup file's `afterEach`, which
  runs after the file's own): anything undeclared fails it, with each line, and so does a declaration said other than as
  often as it says (once, unless it gives `times`), so a declaration cannot outlive the message it was for. A pattern
  with the `g` or `y` flag is refused: its `test` moves `lastIndex`. A console method left replaced (a `vi.spyOn`) fails
  the test, and the guard's own is put back. A declaration lasts its test; called outside a test, it throws.
- **Outside a test.** What is said while no test runs (a page starting at a file's top level, or late, between tests) is
  kept apart and fails the file in `afterAll`, where no test can have declared it; what is said after the file's last
  `afterAll` is not heard.
- **The frames have their own.** `pages.browser.test.ts` draws the built site in frames, each a window with its own
  `console`, which that file already hears (its `listen`: the console's errors, what escapes, refused requests, the
  policy's violations). The guard wraps the test's window only, so nothing is heard twice, and the file's own
  `call(own(frame, 'console'), 'error', 'said')` test reaches the frame's console, not the guard.
- **What only the browser says is out of reach.** A failed request's or the policy's console line is Chromium's, not a
  call of `console`: a setup file cannot hear it. The frames' `securitypolicyviolation` listener and `app.ts`'s fetch
  cover what the tests need of those.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Where the guard lives | `tests/site/console.ts` (the guard and `expectConsole`), started by `tests/site/console.setup.ts`, the `setupFiles` of each browser project (`browser`, `browser-calm`) in `vitest.config.ts` | The brief: "a Vitest `setupFiles` entry for the browser project". Two modules so that the setup file's import and a test's import are the one module, holding one list of declarations. |
| 2 | What counts | `console.warn`, `console.error`, and `console.assert` with a falsy condition (an error, in Chromium's words: `Assertion failed: …`) | The plan's "warning or error". Solid's diagnostics go through them: `reportDiagnostic` picks `console.error` or `console.warn` by severity, and the first report of a code ends with a pointer to its page (`@solidjs/signals`' `dist/dev-shared.js`, `reportDiagnostic`, `takeFooter`). `log`, `info`, `debug` are not failures. Chromium's `console.assert` never calls `console.error`, so it is wrapped itself (the audit). |
| 3 | How a test declares one | `expectConsole(kind, pattern, times = 1)`, one helper, inside the test, before it is said: exactly `times` matching calls; a `g` or `y` pattern refused | The audit: "at least once" let a repeated error pass unseen. With exactly once the default, one existing test needed a count: `reviewpage.browser.test.ts`'s view is drawn twice by `open()` (the address put back, then the route), so it says `2`. |
| 4 | The existing spy | `reviewpage.browser.test.ts`'s `vi.spyOn(console, 'error')` replaced by `expectConsole` | One way. The spy's two checks, "said at least once" and "nothing else", are the guard's. A spy would hide what it catches from the guard, so a replaced `console.warn` or `console.error` fails the test (the audit). |
| 5 | Declared messages printed? | No | They are what the test is about; printing them made each run's output look like a failure. |
| 6 | The frames | Not the guard's: `pages.browser.test.ts` hears its frames' consoles itself | Its frames are other windows; double-counting impossible (design model). |
| 7 | The node project | Out of scope | The plan says browser; the Node tests import no view, no Solid, no `report.ts` path that reaches the console. |
| 8 | The wrong-scope write's test | A file of its own, `halted.browser.test.ts` | The throw halts Solid's reactive system for the rest of the window (`haltReactivity`, `REACTIVITY_HALTED`): any Solid test after it in the file would draw but never update. |
| 9 | The fixture's mistakes | `diagnosed.tsx`, two suppressed lines (`solid/no-write-in-pure-computation`, `solid/reactivity`), in `tests/test_suppressions.py` and `docs/lint-false-positives.md` | oxlint's Solid rules refuse both mistakes, as they should; the fixture exists to make them, so Solid's development build can be seen reporting them. |
| 10 | How the guard's failing is tested | `test.fails` on a test with an undeclared warning, a declaration never said, one said twice and declared once, an undeclared failing `console.assert`, and a `vi.spyOn(console, 'error')`; each keeps its errors (`onTestFinished`, which runs after `afterEach`) for the next test to check the guard's words | `test.fails` passes on any failure; reading the errors pins it to the guard's. With the setup file gone, the `test.fails` tests fail ("Expect test to fail"). |
| 11 | `@solidjs/diagnostics` | Not installed | Not named in the brief (task 4.1). The console reports are enough for tests. |
| 12 | Isolation | `isolate: true` in each browser project, with the reason; the guard marks its window and throws in one already marked | The audit: the guard holds one file's window, and `halted.browser.test.ts`'s halt lasts its window. Vitest's default, but set and checked, not assumed. |

## Evidence

- **First measurement** (the guard on, nothing declared; `vitest run --project browser --project browser-calm`): 2
  failed of 229, in 2 of 45 files. `broken.browser.test.ts`:
  `Kiz Radar: artists: TypeError: column kind: "planted" is no artist_kind state` (`guarded`, the view the test breaks
  on purpose). `main.browser.test.ts`'s test of a loose promise:
  `Kiz Radar: copying the code: Error: a refused clipboard`, `Kiz Radar: the page: Error: a loose promise` (`done` and
  `reportUncaught`), and `[object PromiseRejectionEvent]`, which is Vitest's: its error catcher (`@vitest/browser`'s
  `client/error-catcher.js`) prints an error or a rejection the page listens for itself instead of failing the run on
  it. All three are what the tests are about; none is a fault of `site/`. Nothing said outside a test.

- **A read in a component's body** (`diagnosed.tsx`'s `Reads`): one `console.warn`,
  `[STRICT_READ_UNTRACKED] Reactive value "count" read directly in <Reads> will not update. …`, then `in <Reads>`, an
  `at` line and, the first time, the two lines pointing to Solid's page and skill. The button's presses never show
  (`Pressed 0` after a press).

- **A write in a component's body** (`Writes`): `render` throws
  `[REACTIVE_WRITE_IN_OWNED_SCOPE] Writing to reactive state inside an owned scope …`; Solid then halts (`console.error`
  `[REACTIVITY_HALTED] An uncaught error halted the reactive system. …`), hands the error to `reportError`, and prints
  the pointer lines of both codes as two `console.warn`s. Without a listener of the window's `error`, Vitest fails the
  run on it ("Unhandled Errors"); with one, it prints `Error: Uncaught Error: [REACTIVE_WRITE_IN_OWNED_SCOPE] …`. So a
  wrong-scope write fails a test three ways: the throw, the console, and the window's error.

- **The guard failing a test:** with the read's warning undeclared, the test fails with
  `the console was told what no expectConsole() declared:` and the warning; a declaration never said fails with
  `expectConsole('warn', /never said/u) was declared and never said`; a `console.warn` at a file's top level (a scratch
  file, not kept) failed the file with `the console was told, outside any test:`.

- **Open, found by the guard after the audit:** once in a `check:commit` run under load, `map.browser.test.ts`'s "two
  cities of one name in one country are two bubbles" failed on
  `Uncaught TypeError: Cannot read properties of undefined (reading '_leaflet_pos')`, which `report.ts` also said on the
  page: Leaflet touching a map `site/map.ts` has removed (it removes it 300 ms after leaving, past a zoom animation's
  250 ms). Six reruns of the file and the next `check:commit` passed. A site race, not fixed here: reported.

## Impact

- **New:** `tests/site/console.ts`, `tests/site/console.setup.ts`, `tests/site/diagnosed.tsx`,
  `tests/site/console.browser.test.ts`, `tests/site/halted.browser.test.ts`.
- **Changed:** `vitest.config.ts` (`setupFiles`); `tests/site/broken.browser.test.ts`, `main.browser.test.ts`,
  `reviewpage.browser.test.ts` (declarations); `tests/test_suppressions.py`, `docs/lint-false-positives.md`;
  `CONTRIBUTING.md` (the "Site:" bullet); `refactor-plan.md` (row 4.3).
- **`site/`:** unchanged. knip takes the setup file from the Vitest config.

## Commits

| Commit | What |
| -- | -- |
| `139713ff` | the guard, the three tests' declarations, CONTRIBUTING, this plan |
| the last | Solid's diagnostics shown (`diagnosed.tsx`, `halted.browser.test.ts`), the guard's tests (`console.browser.test.ts`), the two suppressions, the plan's row and this status |

## Review of this plan

Each claim re-read against the code and `node_modules` before the first commit:

- Vitest's after-hooks run in reverse order of registration (`sequence.hooks` `stack`, the runner's `callSuiteHook`), so
  the setup file's `afterEach` runs after a test file's own; `onTestFinished` runs after every `afterEach`, and
  `test.fails` flips a failure from `afterEach` too (`runTest` in `vitest/dist/chunks/run.*.js`).
- Solid's console paths (`reportDiagnostic`, `takeFooter`, `emitDiagnostic`'s microtask footer for a thrown code,
  `haltReactivity`'s `console.error` and `reportError`) in `@solidjs/signals` 2.0.3's `dist/dev-shared.js`.
- Vitest's error catcher: with a listener of the window's `error` or `unhandledrejection`, it calls `console.error` with
  the error (`new Error(e.message)`) or the event, not its unhandled-error report.
- `pages.browser.test.ts`'s `listen` wraps the frame's `console.error`, a property of the frame's window, not the
  test's.
- The node project: no node test imports `report.ts` or Solid (`grep`).
- **Corrected:** the first draft said three tests failed in the measurement; two did, and the third
  (`reviewpage.browser.test.ts`) passed because its spy replaced the guard's wrapper for the test.
- **Corrected:** the first draft had the write's test in `console.browser.test.ts`; the halt it causes lasts the window,
  so it has a file of its own (decision 8).

## The audit's corrections

Each made in the commit it belongs to, with its fail-check (the change undone, the test seen failing):

- **`console.assert`** was unheard: Chromium's never calls `console.error`. Wrapped; a falsy condition is an error
  `Assertion failed: …`. Undone: the three assert tests of `console.browser.test.ts` fail.
- **A replaced console method** (`vi.spyOn`) hid what was said from the guard. `afterEach` fails the test and puts the
  guard's own back. Undone: the spy's `test.fails` and the test of its words fail.
- **`expectConsole`** took a `g` or `y` pattern, whose `test` is stateful: refused. It counted "at least once": now
  exactly `times`, once by default; `reviewpage.browser.test.ts` says `2`. Undone: the refusal's test fails; with "at
  least once" back, the said-twice `test.fails` and its words' test fail.
- **Isolation** was Vitest's default, assumed: now `isolate: true` in both browser projects, and the guard throws in a
  window that already ran a file. Undone (`isolate: false`, files run one after another): `console.browser.test.ts` and
  `halted.browser.test.ts` fail with "this window already ran a test file".
- A misleading comment in `console.browser.test.ts` ("nothing else fails it") deleted.

## Done when

A warning or an error no test declared fails the test that heard it (`console.browser.test.ts`, by
`STRICT_READ_UNTRACKED`); a declaration never said fails it; what is said outside a test fails the file; Solid's
development build warns of a read in a component's body and throws on a write in it (`console.browser.test.ts`,
`halted.browser.test.ts`); `mise run check` passes.
