# Suppressed findings

Each line where an oxlint or stylelint rule is turned off by a comment (`oxlint-disable-next-line <rule>, … -- <why>` in
the TypeScript, `stylelint-disable-next-line <rule>, … -- <why>` in the stylesheet), and why the code is right as it is.
`tests/test_suppressions.py` lists the same lines by file and rule, so a new one changes both. The rules and their
settings are in [lint rules](concepts/lint-rules.md); every other finding is fixed in the code.

## stylelint

### The stylesheet means it

`house/baseline`'s 8 lines are each a feature one browser lacks, or has in part, written so that the page reads the same
without it ([the browser check](concepts/lint-rules.md#the-browser-check-housebaseline)): a row for each reason below,
which the line's comment says in short. The cursor keywords, which iOS Safari lacks, are the rule's `allowed` keys
instead, with their reason in `.stylelintrc.yaml`.

| File | Rule | Why |
| -- | -- | -- |
| `public/css/site.css` | `declaration-no-important` | `[hidden] { display: none !important }`: the `hidden` attribute hides an element whatever `display` its own rules give it (a flex row, a grid), which only `!important` wins over without knowing each rule. |
| `public/css/site.css` | `property-no-vendor-prefix` | `html { -webkit-text-size-adjust: 100% }`: iOS Safari reads the prefixed form alone, and without it enlarges the text of a page turned to landscape. |
| `public/css/site.css` | `house/baseline` | `overscroll-behavior: contain` (4 lines, the sheets' and panels' scrolling bodies): Safari 16 and later apply it to a panel whose content overflows, but not to one too short to scroll, which MDN's compatibility data marks as partial support ("no effect on scroll containers that have no scrollable overflow", as in Chrome before 144 and Firefox before 150); `web-features` 3.45.0 counts partial support as none, so its key names Chrome 144 and Firefox 150 and no Safari. In Safari a panel too short to scroll chains a scroll at its end on to the page, as it did without the property. |
| `public/css/site.css` | `house/baseline` | `ui-monospace, SFMono-Regular, Menlo, monospace` (2 lines: the SQL view's `font-family`, and a promo code's `font` shorthand): `ui-monospace` is Safari's system monospace, and each other browser reads on down the stack. |
| `public/css/site.css` | `house/baseline` | `text-wrap: pretty` (`.review-why`): not in Firefox, which wraps as `text-wrap`'s default does; `pretty` only evens the lines where it is read. |
| `public/css/site.css` | `house/baseline` | `forced-color-adjust: none`: not in Safari, but inside `@media (forced-colors: active)`, which Safari, having no forced colours, never matches. |

## oxlint

### The rule misreads the code

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/calendar.test.ts` | `jest/no-done-callback` | `test.for`'s callback takes the case, not a done callback: the rule knows `test.each` only. Reproduction: `test.for([1])('%s', (n) => {})`. |
| `tests/site/elements.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/main.browser.test.ts` | `jest/no-done-callback` | the same |
| `tests/site/pages.browser.test.ts` | `jest/no-done-callback` | the same |
| `site/dialog.tsx` | `jsx-a11y/click-events-have-key-events` | the `<dialog>`'s click, a tap on its backdrop (the click's target the dialog itself), which closes it: the keyboard closes it with Escape, the dialog's own `cancel` and `close`, so it needs no key of its own. |
| `site/eventcard.tsx` | `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions` | a festival card's foot, which opens the card on a tap outside its links and buttons: a shortcut for the pointer, its Line-up & details button doing the same from the keyboard, so the foot needs neither a key nor a role of its own. One comment names both rules. |
| `site/months.tsx` | `jsx-a11y/interactive-supports-focus` | the month's grid takes no focus of its own: its one stop is a day (a roving tabindex, the grid pattern's), whose arrows the grid hears as they bubble. |
| `site/months.tsx` | `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-static-element-interactions`, `jsx-a11y/mouse-events-have-key-events` | the calendar hears its days' events as they bubble, and is no control itself: a day opens its popover on the focus (`onFocusIn`, beside the pointer's `onMouseOver`) and moves with the arrows (each month's `onKeyDown`); Escape, which closes it, is `over.ts`'s, heard on the document; a tap is the pointer's way to the same. Two comments, one naming the first two rules. |
| `site/search.tsx` | `jsx-a11y/click-events-have-key-events`, `jsx-a11y/interactive-supports-focus` | a result's row and a group's "Show all", each an option of the combobox's listbox (WAI-ARIA's combobox): the focus stays in the text field, which moves the highlight with the arrow keys and picks with Enter (`aria-activedescendant`), so an option takes neither the focus nor a key of its own. Two elements, one comment each naming both rules. |
| `site/search.tsx` | `jsx-a11y/prefer-tag-over-role` | the listbox, its groups and its two kinds of option: a row is a lead and two lines of markup, which a native `<option>` cannot hold, nor a `<select>` or `<datalist>` the rows, and no element of HTML is a group of a listbox's options. Four elements, a comment each. |
| `site/globals.d.ts` | `import/no-namespace` | a type-only namespace import (`import type * as TopoJSON`), the one way to type the global the page loads from vendor/; erased, so nothing to tree-shake. Biome's `noNamespaceImport` allows it. |

### The code means it

| File | Rule | Why |
| -- | -- | -- |
| `tests/site/app.browser.test.ts` | `unicorn/new-for-builtins` | `Date()` called without `new` is one of the forms of the clock the test reads (the stub's `apply`); `String(new Date())` would test another. |
| `tests/site/main.browser.test.ts` | `typescript/no-misused-promises`, `typescript/promise-function-async`, `typescript/strict-void-return` | the test leaves a rejected promise uncaught on purpose: only the window's listener may see it. The callback hands setTimeout the promise, so that it is kept and never caught: made async, it would catch it; given a body, it would no longer hold it. One comment names the three rules. |
| `tests/site/diagnosed.tsx` | `solid/no-write-in-pure-computation`, `solid/reactivity` | the fixture of the console guard's tests (`console.browser.test.ts`, `halted.browser.test.ts`): a component that writes a signal in its body and one that reads a signal in its body, the two mistakes whose report by Solid's development build the tests watch. Written right, there would be nothing to report. |
| `tests/site/solid.browser.test.ts` | `house/tests` | the `import()` of `tests/site/hello.tsx` as the site's build makes it, from the `blob:` address of the code `vitest.config.ts`'s `built` command returns: a module of no `site/` file, whose address cannot be one literal. |
| `vitest.config.ts` | `house/env` | the machine may name its own Chromium (`CHROMIUM`), the one setting read from the environment. |
| `site/communities.tsx` | `jsx-a11y/prefer-tag-over-role` | The page's privacy is a `role="img"` span, a lock and the people counted said as one image by its label, and a trip's two views of its roster a `role="group"` named "The roster": the rule's `<img>` cannot hold the drawing and the count, and its `<fieldset>`, the same group by the same `aria-label`, brings the browser's border, padding, margin and min-content width, which the stylesheet would have to take off again for the page to look the same. Two elements, a comment each. |
| `site/controls.tsx` | `jsx-a11y/prefer-tag-over-role` | A row of segments is a `role="group"` named for a screen reader ("Order", "Which festivals", "Role"), and the line saying what an address asked in vain a paragraph with `role="status"`: the rule's `<fieldset>`, the same group by the same `aria-label`, brings the browser's border, padding, margin and min-content width, which the stylesheet would have to take off again, and its `<output>` is inline and a form's control, not a paragraph, which would change what the page shows. Two elements, a comment each. |
| `site/sentence.tsx` | `jsx-a11y/anchor-is-valid` | The live line's "Show them ↓" is a link to `#` whose click (prevented) takes the visitor to the cards below with the page's own motion (`toList`, which also shows the bar): the address is the router's (`routes.ts`), so a fragment to the cards would be a route, and a button would change what the stylesheet and the tests read of a link in the line. |
| `site/gantt.tsx` | `jsx-a11y/prefer-tag-over-role` | A trip's roster is a `role="group"` named for a screen reader ("Who is in Oslo when") and described by its line in words: the rule's `<fieldset>`, the same group by the same `aria-label`, brings the browser's border, padding, margin and min-content width, which the stylesheet would have to take off again, and its `<details>` would hide the chart. |
| `site/marks.tsx` | `jsx-a11y/prefer-tag-over-role` | The loading mark is a paragraph with `role="status"`, as `public/index.html`'s line before the scripts run is: the rule's `<output>` is inline and a form's control, not a paragraph, and the tests and `index.html` read the line by its role. |
| `site/months.tsx` | `jsx-a11y/prefer-tag-over-role` | A month of a community's calendar is WAI-ARIA's grid (its rows, the weekdays' and each week's, its weekdays' column headers and its cells, a day or a week's count), drawn in `<div>`s and `<span>`s and laid out by the stylesheet's grid over the festivals' strokes. A table's `<tr>`, `<th>` and `<td>` lay out by the table's own model; laid out as a grid (a grid on the table's parts, or `display: contents`), they would need the stylesheet changed. Five elements, a comment each. |
| `site/token.tsx`, `site/dashboard.tsx` | `jsx-a11y/prefer-tag-over-role` | The token dialog's status line and a decision's are paragraphs with `role="status"`: the rule's `<output>` is inline and a form's control, not a paragraph, which would change what the page shows and what the form holds. A comment each. |
| `site/dashboard.tsx` | `jsx-a11y/role-supports-aria-props` | A row of the rail beside a queue's item is a `<button>` marked `aria-selected` while it is the item shown, which a button's role does not take, so screen readers do not say which item is shown; `aria-current`, or a rail that is a listbox, would say it, with a test, and remove this line. |
| `site/artists.tsx` | `house/states` | `next` is an order the address names (`sort=next`), not `tier_today`'s state of that name. |
| `site/json.ts`, `site/rows.ts`, `site/routes.ts`, `site/wording.ts` | `typescript/no-unsafe-type-assertion` | each assertion holds by what the code before it does, as its comment says: every field or column of the shape was read into `out` by its own reader (`json.ts`, `rows.ts`); `s` starts as the defaults and takes only values of their types (`routes.ts`); `say` gives the words exactly when the generated table has them, which `Said` reads (`wording.ts`). |
