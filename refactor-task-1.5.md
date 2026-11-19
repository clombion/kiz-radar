# Task 1.5: `review` through `review.html`

Task 1.5 of [refactor-plan.md](refactor-plan.md). Status: done.

## Summary

Move the 11 tests of `tests/site/review.browser.test.ts` onto `startReview` (`tests/site/app.ts`). Today each test
builds a header and a detached root by hand, calls `reviewView` on them, stubs `fetch` with `vi.stubGlobal`, keeps the
token through `kept.ts`'s own `keepToken`, and fakes `Date`. After the port each file starts `review.html` once, on
`REVIEW` (`reviewed.ts`), its storage and GitHub's answers given before start, reaches an item by its address, drives
the page with clicks, input and keys, and asserts what the page shows and what it stored. GitHub answers through the
helper's `elsewhere` and `answer()`, never a stubbed `fetch`. "Kept across a reload" (the token kept for the tab, the
items settled since the build, the item in the address) becomes writing halves and one reading file, joined by three
constants added to `tests/site/reload.ts`. Five files replace one; `reviewView` loses its `export`.

## Design model

- **One page per file, inputs fixed at start** (task 1.1). What starts the page is the review, the storage and
  `elsewhere`: a test needing another of these is a file of its own.
- **No test depends on another's order** (1.3's rule). Two of the page's states cannot be put back from a test: an item
  settled (`settledIds`, read from storage only at start and after a write) and the token refused on a write (`access`,
  module memory). A test that leaves either behind, or asserts the settled entry exactly, is a file of its own; a test
  that settles an item no other test of its file reads may share.
- **Reaching an item is opening its address.** The review page moves no focus, so the site's `open()` cannot serve it
  (1.1, decision 10). `startReview` gains `open(hash)`: the same address handling as the site's `open()` (the start's
  address put back, then `location.replace`, no history entry, the address checked to hold the route right after),
  resolved on the `hashchange` the page's own handler, registered at import and so first, has drawn on.
- **GitHub answers by the token it is asked with.** One answer in `reviewed.ts`, `github({ token, write })`: any request
  without `Bearer <token>` is refused with 401; with it, `GET /user` names `clombion`, a `PUT` to
  `/repos/<REVIEW.repository>/contents/<file>.json` answers `write` (typed `201 | 403 | 422`), and any other request is
  not found (404), so an unscripted call shows. A refused token is a token the answer does not know, not a second stub.
- **What the page shows and stores replaces what the code returned**: `settled(REVIEW.built_at)` becomes the raw
  `localStorage` entry (writing half) and the item's "✓ Settled since this build" on a fresh page (reading half);
  `keepToken` called by the test becomes the token dialog driven, and the `sessionStorage` entry it leaves.
- **Kept across a reload is two halves** (1.1, "The reload"; owner, 19 November). The writing half drives the page and
  asserts the storage entry equals the constant, key and value; the reading file starts with `storage` seeded from it
  and asserts what the page shows. Today's re-read in the same page proved nothing about the token: `kept.ts` keeps it
  in memory too (`held`, set by `keepToken`, read last by `token()`), so a broken storage read passed. A reading file is
  a fresh module instance, where `held` is null.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | File layout | Five files: `review` (writes that share: R3, R5, R6, R8, R9, and the item another tab settled); `review-readonly` (no token: R1, R7, R10, R11, and the rail's search); `review-token` (a token found refused, then one pasted: R2); `review-settle` (writing half of the settled pair: R4); `review-kept` (reading half of the pairs: K1, K2, the address) | `review-readonly` and `review-token` start on other storage or answers. R4 asserts the settled entry exactly, which a write of R5 or R9 before it would change. R6's refused access is put back through the page's dialog at its test's end, so it shares `review`. R5 and R9 settle items nothing else in their file reads (R8 reads the pair's table, which a settled pair still shows). |
| 2 | Day | Every file `now: AT`, `2026-10-29T18:01:23Z`, exported from `reviewed.ts`; `vi.useFakeTimers({ toFake: ['Date'] })` goes | The helper's clock does not tick, so a claim's `at` is `AT` exactly, as today, and the expiry's "7 days left" holds. |
| 3 | Shared start inputs | `reviewed.ts` gains `AT`, `LOGIN`, `github({ token, write = 201 })` (typed `NonNullable<Parameters<typeof startReview>[0]['elsewhere']>`, as `reload.ts` types its visit) and `WRITER = { token, storage }`: the token `'a device token'` kept on the device with its expiry `2026-11-05` (`localStorage`); `KEPT`, the three keys `kept.ts` keeps (token, expires, settled), which `reload.ts`'s keys come from. `review` and `review-settle` start on `WRITER` | One spelling of what a writing page starts with. The device keeps the token as `keepToken('good', true)` did in R3. `reviewpage.browser.test.ts` keeps its own answer: its "start's answer is back" test asks `/user` with no token. |
| 4 | GitHub's answers | `elsewhere: github(…)` per file; `answer()` inside a test only (R5 and the item another tab settled, `write: 422`; R6, `write: 403`); the token refused (R2) by the file's `elsewhere`; never `vi.stubGlobal('fetch')` | The helper's `fetch` cannot be replaced (1.1); the start's token check happens before any test, so what it meets is the file's answer. |
| 5 | Reaching an item | `startReview` returns `open(hash)` beside `answer` and `asked`, `hash` typed `` `#${string}` `` (a route that is no `#link` is a type error, and the starting `route` is typed so too; the site's routes are `routes.ts`'s strings, so its `open()` and route keep a runtime check); puts the start's address back and replaces it with `hash`; refused at once when the address does not hold `hash` as given (one it re-encodes); resolves on the next `hashchange`, the one its handler draws on (within 10 s), the listener removed however `open()` ends; refused when a new alert line appeared (`unalarmed`). Tested in `reviewpage.browser.test.ts`: `open('#contested/1')` shows Ana with this frame's entries (the Navigation API's) unchanged; the item shown, opened again twice, drawn as a new page each time; a re-encoded route refused | Today's `history.replaceState` before `reviewView` read the address at start; the helper starts without a route. The queue links are never clicked: a click pushes a history entry another file's `history.back()` can land on (1.1). |
| 6 | The settled pair | `reload.ts`: `REVIEW_SETTLED`, key `kiz-radar-review-settled`, value `REVIEW.built_at`, a newline, `home p:ana` (`localStorage`). **Writing** (`review-settle`, R4): after Ana's claim, `localStorage.getItem(key)` equals `value`. **Reading** (`review-kept`, K2): seeded; Ana's item says "✓ Settled since this build: on the site after the next run." with no choice, the summary "1 open, 1 settled since the build", her rail row ✓ and Bo's his flag; Bo's item, opened, does not say it is settled | The id is spelled literally, not by `homeId`: the stored text is what a reload keeps, so a changed format must fail the writing half. Bo is the reading half's control: the entry settles Ana alone. |
| 7 | The token pair | `reload.ts`: `CLAIMS_TOKEN = { key: 'kiz-radar-claims-token', value: 'github_pat_kept_for_the_tab' }` (`sessionStorage`). **Writing** (`review-token`, R2's second half): the value pasted in the token dialog, "Keep it on this device" left unticked, "Check and keep" pressed; `sessionStorage` holds it, `localStorage` holds no token. **Reading** (`review-kept`, K1): seeded; the access button says exactly "Writing as clombion", the start's `/user` request carried `Bearer` and the value, and Bo's item offers his choice (Ana's is settled in that file) | Only the dialog writes the token on a visitor's page. On a fresh page `held` is null, so the Bearer header can only come from storage. |
| 8 | R2 | One test in `review-token`, the old halves in a visitor's order: started with `'an expired token'` in `sessionStorage` and `elsewhere: github({ token: CLAIMS_TOKEN.value })`, the page says "Read-only · token refused", Ana's item has no choice and says "GitHub refused this token: it is mistyped, expired or revoked."; then the token pasted (decision 7) unlocks Ana's two choices | Both halves need a token found at start; refused-then-pasted is one page, one test, no order between tests. The old "unlocks" at start stays read in `review` (R3's button) and `review-kept` (K1's header). |
| 9 | Ending a write | A write test ends on what the page does after `BEAT` (450 ms): R4 on "2 of 2" and `#contested/2`; R5, which fakes `setTimeout` once the write is sent to read "Already written" before the redraw, advances past the beat and ends on the pair's "✓ Settled since this build"; the item another tab settled on the next open item, Ana; R9, whose queue moves nowhere, on its line "Written as <id>.json: on the site after the next run." | No timeout of one test lands in the next. R9's late timeout is also stopped by `generation`, bumped by the next test's draw. |
| 10 | Keys, clicks and typing | As today: `KeyboardEvent` dispatched on the window, DOM `click()`, a value set and an `input` event dispatched | Test files run at once in one window: a real key goes to the focused frame, which may be another file's (1.1, "What building it found"). |
| 11 | What is read | Roles and names where the page gives them: `#access` (review.html's own id), the item `article` "The item", choices as its `button[aria-pressed]`, the note as the textbox "Why", "Write the claim", the main's text for the summary and "n of m"; a class only where the class is what is asserted (`differs` on the compared rows) | 1.1: classes are a view's structure; `differs` is the marking itself, recorded so in the ledger. |
| 12 | Requests a test means | `const from = app.asked.length` at the test's start; its writes are `asked.slice(from)` with method `PUT`; R1's "asked nothing" is no request to `https://api.github.com` | `asked` holds every request since start, the served `review.json` among them. |
| 13 | R3 and `reviewpage`'s first test | R3 kept, in `review`, on the device token; the ledger notes the overlap | `reviewpage` reads the token kept for the tab, R3 the one kept on the device (`read(device, TOKEN)`). |
| 14 | `reviewView` | Loses its `export` in the commit that removes the old file | Its only importer goes (knip), as 1.3's and 1.4's view exports did. |
| 15 | Order of landing | `open(hash)` with its test; `reviewed.ts` and `reload.ts`; `review-readonly`; `review` with R3, R5, R6, R8, R9; `review-settle`, `review-kept`, `review-token`; the old file removed with `reviewView`'s `export` | Helper first; read-only before writes; each commit moves its tests out of the old file and fills their ledger rows. |

## Impact

- **Rewritten:** `tests/site/review.browser.test.ts` (R3, R5, R6, R8, R9), importing no view module.
- **New:** `tests/site/review-readonly.browser.test.ts`, `review-token.browser.test.ts`,
  `review-settle.browser.test.ts`, `review-kept.browser.test.ts`.
- **Changed:** `tests/site/app.ts` (`startReview`'s `open(hash)`, the starting `route` of both pages, its header's
  list); `tests/site/reviewpage.browser.test.ts` (tests of `open(hash)`); `tests/site/reviewed.ts` (`AT`, `LOGIN`,
  `KEPT`, `github`, `WRITER`, `WRITING`, `writes`, `claimed`); `tests/site/reload.ts` (`CLAIMS_TOKEN`, `REVIEW_SETTLED`,
  `REVIEW_ROUTE`, its header now naming the review page too); `refactor-ledger.md` (11 rows).
- **`site/`:** `review.ts` drops one `export` (`reviewView`). Two bugs the port found, each fixed with a test that fails
  without it:
  - `review.ts`: an address change by `hashchange` (back, forward, a pasted link) to another tab kept the rail's search
    that `go()` clears on a tab change; `fromAddress` now clears it too. Test: `review-readonly`'s "the rail's search
    stays with its tab: another tab opened by its address lists all its items".
  - `kept.ts`: `markSettled` appended an id already settled (a second write, answered "already written", of an item
    another tab settled); it now writes nothing then. Test: `review`'s "an item another tab settled, written again here,
    is kept as settled once".
- **New tests besides the ported ones:** `reviewpage`'s `open(hash)` tests (an item opened in place of the entry shown;
  the item shown opened again, drawn as a new page each time; a re-encoded route refused; a failed draw refused); K1, K2
  and the address read on a fresh page (`review-kept`); the two above.
- **What changes shape or gets weaker:**
  - *Weaker:* the address read at start (`fromAddress` in `reviewView`) is reached only with no route (the merges
    queue); a hash is read through `hashchange`, by the same `fromAddress`. Recorded in the ledger.
  - *Weaker:* R1's "asked nothing" becomes "asked GitHub nothing": the page's own `review.json` is now a request.
  - *Shape:* R2 is one test, refused first; its "unlocks" is the pasted token, not a token found at start.
  - *Shape:* R4's `settled()` set becomes the raw entry; its "after a reload" moves to `review-kept` (stronger: a fresh
    page, no `held`).
  - *Shape:* R6's `settled().size === 0` becomes "no settled entry"; R5 also asserts "Already written (<id>.json):
    nothing changed." (stronger).
  - *Not covered, as today:* the token kept on the device through the dialog (the box ticked).

## Tests

Every old test has a ledger row naming its new test. New tests, which no ledger row holds: `reviewpage`'s `open(hash)`
tests; K1 and K2 (the reading halves of R2 and R4, named in those rows); the two site fixes' tests (Impact). Each new
file passes alone, with the suite three full runs in a row, and once with `--sequence.shuffle` (decision 1's "no
order").

Measured before the commits:

- **M1:** the page's `hashchange` handler runs before one added after import, so `open(hash)` resolves on a drawn page.
  Read by the `reviewpage` test (Bo's name present when `open` resolves, no polling).
- **M2:** `showModal()` and the dialog's buttons work in a test frame that does not hold the window's focus. Read by
  `review-token`.

## Risks

1. **The token dialog** (`review-token`): a modal `<dialog>`, opened by a DOM click on `#access`, closed by its "Close"
   button, and awaited closed (no `dialog[open]`) before the test ends. It pushes no history entry (not a peek); while
   open, `onKey` ignores keys, and none are sent.
2. **History entries**: `open(hash)` replaces; the page's own moves (`go`) use `replaceState`; no queue link is clicked.
3. **Timers**: `BEAT` is a 450 ms timeout, waited out by what follows it (decision 9). R5 alone fakes `setTimeout`,
   after its write is sent, to read the line the write leaves before the redraw, then advances past the beat and gives
   the timers back; the day is the helper's.
4. **The start's token check** resolves after start: every assertion on `#access` polls (`expect.poll`), as today's
   `ready()` did.
5. **State for the file**: R5 and R9 settle items in `review` that no other test of the file reads; the shuffled run
   checks it.
6. **`answer()`** only inside a test (R5, R6, the item another tab settled); it answers `/user` too, as
   `github({ token: WRITER.token, write })` does.
7. **`asked` grows for the file**: sliced per test (decision 12).

## Done when

The old file's tests are in the five files, which import no view module and stub no global; `reviewView` is not
exported; every old test has a ledger row; the suite passes three times in a row and each new file once shuffled;
`mise run check` at each commit.

## Appendix: the porting map

Line numbers are the old file's. Every test's day is `AT`; today's `vi.setSystemTime(AT)` goes. "Item" is the address
given to `open(hash)`.

| # | Test, line | Item | Crafted or stubbed today | Asserts; how the page shows it | File; review, storage, elsewhere, `answer()` |
| -- | -- | -- | -- | -- | -- |
| R1 | read-only without a token, `review:80` | `#contested/1` | hand-built header and root; `fetch` stubbed, recording | "Read-only · add a token" on `#access`; no choice, no textbox "Why", no "Write the claim" in the item; "add a token" in it; no request to `api.github.com` | `review-readonly`; `REVIEW`, no storage, `github({ token: CLAIMS_TOKEN.value })`, none |
| R2 | token named unlocks, refused leaves read-only, `review:89` | `#contested/1` | two `keepToken` calls, two stubs, two roots | One test: "Read-only · token refused", no choice, "GitHub refused this token: …"; the dialog: `CLAIMS_TOKEN.value` pasted, "Check and keep"; its status "Writing as clombion: the choices are on each item."; the `/user` request's `Bearer`; two choices on Ana; `sessionStorage` holds the value, `localStorage` no token (token pair, writing half); the dialog closed | `review-token`; `REVIEW`, session `kiz-radar-claims-token: 'an expired token'`, `github({ token: CLAIMS_TOKEN.value })`, none |
| R3 | expiry shown and warned of, `review:101` | none (merges) | `keepToken('good', true)`, expiry set by hand | `#access` reads "Writing as clombion · 7 days left: make a new one soon" (polled) | `review`; `REVIEW`, `WRITER.storage`, `github({ token: WRITER.token })`, none |
| R4 | home written at its digest, settled, next open, `review:109` | `#contested/1` | token kept by hand; `settled()` read; the page drawn again in place | Angola clicked: the note "Ana: from Angola, as 2 line-ups state"; "Write the claim": one `PUT` to `…/contents/<digest>.json`, its file `claimText(homeClaim('p:ana', 'AO', …, AT))`; then "2 of 2", "1 open, 1 settled since the build", `#contested/2`; `localStorage` entry equals `REVIEW_SETTLED.value` (settled pair, writing half). The settled item after a reload: K2 | `review-settle`; `REVIEW`, `WRITER.storage`, `github({ token: WRITER.token })`, none |
| R5 | merge by its keys, own note kept, `review:132` | `#merges/1` | stub with `write: 422` | The note typed "Two people: different cities"; key `2`: the note unchanged; the form submitted: one `PUT`, its file the `separate` merge claim at `AT`; "Already written (<id>.json): nothing changed."; then the pair's "✓ Settled since this build" | `review`; as R3, `answer(github({ token: WRITER.token, write: 422 }))` |
| R6 | token refused on a write, `review:146` | `#contested/1` | stub with `write: 403` | Angola, "Write the claim": "Read-only · token refused"; the item says "Contents, Read and write" and offers no choice; the settled entry unchanged; the access put back through the dialog at the test's end | `review`; as R3, `answer(github({ token: WRITER.token, write: 403 }))` |
| R7 | arrow keys move, address follows, `review:155` | `#contested/1` | — | `ArrowRight`: `#contested/2`, the item's heading "Bo"; again: `#contested/1` | `review-readonly` |
| R8 | pair side by side, differing rows marked, `review:165` | `#merges/1` | token kept by hand | Rows marked `differs`: "Line-ups state", "Roles" (the class itself, in the ledger); "Both named in 1 line-up" | `review`; as R3, none |
| R9 | two artists joined by a merge claim, `review:175` | `#join/1` | token kept by hand | "kwenda" in the first search, Kwenda Lima chosen; "kl" in the next, DJ KL; "One artist", "Write the claim": one `PUT`, its file the `merge` claim of `p:kwenda`, `p:kl@dj`, "Kwenda Lima / DJ KL: one artist, under two names", `AT`; "Written as <id>.json: on the site after the next run." | `review`; as R3, none |
| R10 | cities listed, nothing to choose, `review:201` | `#cities/1` | hand-built `#queues` | The queue link to `#cities/1` reads "Cities 2"; Porto's article: "🇵🇹 Porto", "porto-pt · Portugal · 2 festivals to come", "Porto Kizomba", "Kiz Gaia", "Proposed: small (OPO, VGO). OPO 25 min by metro; VGO 1 h 40 by bus"; Faro's "No proposal yet."; no button in `#review` | `review-readonly` |
| R11 | an empty list says so, `review:218` | `#festivals/1` | — | "Nothing waits here." | `review-readonly` |
| K1 | new: the token kept for the tab, read on a fresh page | `#contested/2` | — | `#access` reads exactly "Writing as clombion"; the start's `/user` request carried `Bearer ${CLAIMS_TOKEN.value}`; Bo's item offers "🇵🇹 Portugal" (token pair, reading half) | `review-kept`; `REVIEW`, session `CLAIMS_TOKEN`, local `REVIEW_SETTLED`, `github({ token: CLAIMS_TOKEN.value })`, none |
| K2 | new: the settled item, read on a fresh page | `#contested/1`, `#contested/2` | — | Decision 6's reading half | `review-kept` |

## Reconcile (after the Skeptic pass: 5 gaps and 2 forced decisions, settled)

- **A starting route, for both pages**: `start()` takes a `route` among the visit's inputs, typed `` `#${string}` `` for
  the review page and a string for the site's (its routes are `routes.ts`'s strings, checked to be a `#link` at run
  time), and sets the address to the page's own plus that route before importing the entry, as a visitor who reloads
  `review.html#contested/5` arrives; the address is then checked to hold the route as given. The address read at start
  (`fromAddress()` in `reviewView`) is then tested: a test starts at `#contested/2` and sees the second contested home.
  It is also a third reload pair: the writing half asserts the address `go()` writes (`#contested/2` after moving), the
  reading half (`review-kept`) starts at that route. The site's page gets the same input (`#finder` and the rest become
  reachable at start).
- **One address routine**: the site's `open()` and the review's `open(hash)` share one private routine in `start()`:
  refuse a site's route that is no `#link` (the review's is typed), arm what draws it, put the page's own address back,
  replace it with the route (no history entry), check right after that `location.hash` is the route as given, wait until
  drawn, and refuse a failed page (`FAILED`) and a new alert. The review's wait is the `hashchange` its own handler
  draws on (its router moves no focus), the listener removed however `open()` ends. Its tests: a route opened is drawn
  and replaces this frame's entry (the Navigation API's entries, which no other file adds to); the route shown opened
  again, drawn as a new page each time; a re-encoded route refused; a failed draw refused.
- **Five files**: R6's refused access is put back through the page at its test's end (the dialog's "Check and keep" with
  the field empty checks the kept token again), so R6 joins `review`; R4 keeps its own file, since its writing half
  checks the settled entry exactly against the constant, which another write first would change.
- **R6's assertion** is scoped to the item's `article`: the closed dialog always says "Contents, Read and write".
- **R5's "Already written"** is read while the redraw is held: `setTimeout` faked after the write is sent, the line
  asserted, then the timers advanced past the beat and the redraw read.
- **GitHub by token, for writes too**: `github()` answers a write with 401 unless its `Authorization` is the known
  token's, and with 404 unless it is a `PUT` to the claims repository's contents, so R4, R5 and R9 check the header the
  page sends and the address it writes to (`claimed()`, the repository spelled as `review.json` names it).
- **K2 does not rest on K1**: it is read on the page whatever the token's state (the settled item shown as settled), so
  a broken token read fails K1 alone.
