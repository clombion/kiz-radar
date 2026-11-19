# Task 4.2: lint for Solid

Task 4.2 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. `eslint-plugin-solid` 0.20.0 with
`v2-strict` rule by rule (32 rules on, its warnings errors, its five off); nine house rules added and three widened,
each with fixtures; oxlint runs 394 rules on 166 files with no finding; no stop.

## Summary

`eslint-plugin-solid` pinned exactly at its current release and loaded into oxlint through `jsPlugins`, its `v2-strict`
config written out rule by rule in `.oxlintrc.json` (oxlint loads a plugin's rules, not its presets); the four migration
rules of the brief's Phase 4 as house rules on `.tsx`; the house rules that hold the site's views widened to `.tsx`
(`states`, `buttons`, `markup`); a house rule refusing a `style` that is not an object; and the three rules the owner
asked for on 19 November (`noSuspiciousSemicolonInJsx`, `noDuplicatedSpreadProps`, `<svg>` outside `icons`). Each house
rule ships with fixtures, in `.tsx` where it reads JSX. No file of `site/` is `.tsx` yet, so none of it changes; the one
`.tsx` in the tree, `tests/site/hello.tsx`, passes every rule.

## Design model

- **Solid's rules are the plugin's; the house rules are ours.** `eslint-plugin-solid`'s rules are tested by their
  authors; the fixture harness (`tests/site/rules.test.ts`) tests the house rules, and its plugin-to-folder comparison
  is over `lint/plugin.ts` alone. So Solid's rules get no fixtures: a test holds `.oxlintrc.json` to `v2-strict` (each
  rule it turns on is on, each it turns off is off), reading the plugin's own config, so an upgrade that changes the
  preset fails the test rather than drifting. A probe file, not kept, shows the rules load with Solid 2's settings
  (Evidence).
- **Where a rule is on is the config's, by path, never the rule's.** As for every house rule (CONTRIBUTING, "House
  rules"): the migration rules are on for `**/*.tsx` by an override, so `h()` views (`.ts`) and Solid views coexist and
  `site/net.ts`, `site/github.ts` (which stay `.ts`) are exempt by their extension. A rule that reads only JSX is on
  everywhere oxlint lints: on a `.ts` file it finds nothing.
- **A widened rule keeps one name and one message.** `buttons`, `markup` and `states` learn the JSX form of what they
  refuse (a `<button>` not of `type="button"`, the `innerHTML` prop, a state key given to a component) beside the
  `h()`-era form; their messages name `dom.ts`'s helpers until task 4.10 rewrites the kept ones.
- **The migration rules match syntax, not names in text.** The loading-state rule reads the names a variable declarator
  binds (a plain identifier, an array or object pattern, a default), so `createSignal<boolean>(…)` and
  `let loading = true` are found by the same visitor and an import of `loading` from `ui.ts`, or anything from
  `pending.ts`, is never a declarator.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Version | `eslint-plugin-solid` 0.20.0, exact (`pnpm add -D -E`) | `npm view eslint-plugin-solid dist-tags` on 19 November: `latest` 0.20.0, the version 2.1 spiked (Q6: the current release). Its ESLint peer is optional (`peerDependenciesMeta`): no warning, `node_modules/eslint` absent. Its eight dependencies (`eslint-visitor-keys`, `estraverse`, `is-html`, `kebab-case`, `known-css-properties`, `parse5`, `style-to-object`, `validate-html-nesting`, and theirs) are a named package's, none a peer to add. |
| 2 | `v2-strict` in oxlint | Its 37 `solid/*` rules one by one in `rules`, in name order beside the other plugins'; its `settings.solid.version: 2` in `settings` | `jsPlugins` loads rules, not `configs` (2.1, decision 7). The rules read the setting: nine read it (`isSolidV2`: `event-handlers`, `imports`, `jsx-no-duplicate-props`, `jsx-no-undef`, `no-destructure`, `no-react-deps`, `no-unknown-namespaces`, `prefer-for`, `reactivity`), and without it each keeps its Solid 1 behaviour. oxlint passes `settings` to a JS plugin: its schema says so, and a one-rule probe plugin reporting `context.settings.solid` printed `{"version":2}`. |
| 3 | `warn` | The six `warn` rules (`components-return-once`, `reactivity`, `imports`, `style-prop`, `self-closing-comp`, `prefer-onSettled-for-side-effects`) are errors; the five `off` (`no-react-deps`, `no-array-handlers`, `prefer-show`, `no-proxy-apis`, `prefer-classlist`) written as `off` | `denyWarnings` already fails a warning, but every rule of `.oxlintrc.json` is an error (task 2.4; Q2's "none left reporting without failing"), and an error does not depend on the option. Writing the five `off` keeps the preset whole in one place. |
| 4 | `no-unassigned-vars` | `v2-strict` turns ESLint's off for Solid's, which counts `ref={el}` as an assignment: in `**/*.tsx`, `eslint/no-unassigned-vars` off and `solid/no-unassigned-vars` on; in `.ts` ESLint's alone | The probe: `let el; … <div ref={el}>` is refused by ESLint's. Solid's is the same rule but for the ref (`src/rules/no-unassigned-vars.ts`), so nothing Biome's mapping held is dropped; on `.ts` both would report the same line twice. |
| 5 | Which files | Solid's rules everywhere oxlint lints (one block in `rules`), the override of decision 4 for `**/*.tsx` | The rules about JSX find nothing in `.ts`; the reactive ones (`no-single-arg-create-effect`, `no-write-in-pure-computation`, `no-module-scope-reactive-primitive`…) apply to a `.ts` module of signals as well. |
| 6 | Overlapping rules | Kept both where `v2-strict` and Biome's mapping overlap (`solid/jsx-no-duplicate-props` and `react/jsx-no-duplicate-props`, `solid/jsx-no-script-url` and `react/jsx-no-script-url`, `solid/no-innerhtml` and `house/markup`, `solid/style-prop` and `house/styles`) | Dropping either is a stop ("dropping a Biome rule"), and each pair differs: `no-innerhtml` lets a static string through (`allowStatic`), `style-prop` reads only a literal or a template. Two findings on one line is the cost. |
| 7 | `jsx-a11y` and Solid's `for` | `settings["jsx-a11y"].attributes`: `{"for": ["for"]}` | Solid writes a label's `for` (`htmlFor` is `solid/no-react-specific-props`' to refuse); without the mapping `jsx-a11y/label-has-associated-control` refuses `<label for="q">` (probe). |
| 8 | The JSX rules of 2.3 | Already on everywhere: the 38 of Biome's `error`/`warn` JSX rules (2.4, decision 6); the 8 `info` ones stay off. The probe shows them reporting on `.tsx` | "Mapped now so the first `.tsx` is held" (lint-rules.md). One gap: `jsx-a11y/no-autofocus` reads `autoFocus` only, and Solid's attribute is `autofocus` (lowercase, `@solidjs/web`'s `jsx.d.ts:910`); the `attributes` setting does not reach it (probe). Closed by `house/focuses` (Differences). |
| 9 | Fixtures for Solid's rules | None; the `v2-strict` test of the design model | The harness's rule list is `lint/plugin.ts`'s; the plan's "with fixtures" names the four migration rules, which are house rules here. |
| 10 | The harness and `.tsx` | A rule's `good` file may be `good.ts` or `good.tsx`; oxfmt lets `lint/**/*.tsx` in | A rule on `**/*.tsx` alone has no `.ts` file it is on for. The fixtures stay out of tsc, knip, jscpd and the tree's oxlint run by folder (`lint/fixtures/`), whatever their extension; oxfmt's include said `lint/**/*.ts`, so `.tsx` fixtures would be unformatted while CONTRIBUTING says oxfmt lays them out. |
| 11 | Names | `thens`, `flags`, `mirrors`, `legacy` (the migration rules); `styles`, `focuses`; `semicolons`, `spreads`, `svgs` | One plural noun each, as the house rules are named. |
| 12 | `thens` | A call of `.then` (by name, optional, or `['then']`), on `**/*.tsx` | The brief: "No `.then` in components"; the network module is `.ts`. `.catch` and `await` (an event handler's send) are not named, so not refused. |
| 13 | `flags` | A name bound by a variable declarator (an identifier, in an array or object pattern, a default, a rest) that is `loading`, `pending`, `busy`, `fetching`, `error` or `failed`, any case, with or without `is`, on `**/*.tsx` | The brief's list, matched at the declarator: `const [loading, setLoading] = createSignal<boolean>(false)` and `let loading = true` are both a declarator binding `loading`; an import (`loading` from `ui.ts`, anything from `pending.ts`), a property read and a parameter are not. A store's key (`createStore({ loading })`) is not a variable: not refused. |
| 14 | `mirrors` | `createEffect` or `createRenderEffect` whose apply half (second argument) is a setter (`setX`, by name), or a function whose body is only calls of setters, each passed what the apply half was given (its first parameter, used in an argument) | The brief: "an effect whose apply half only calls a `setX(…)` with what it read". A setter given a constant (`setPage(0)` when a filter changes) reacts, it does not mirror: let through. |
| 15 | `legacy` | On `**/*.tsx`: a call of `replaceChildren`, `createElement` or `createElementNS` (on any object), and an import, re-export or `import()` of `dom.ts` (`…/dom.ts`, `…/dom`), types included | The brief's three, absolute as its review asks (`dom.ts`'s non-rendering helpers move out before the first view, so the rule needs no exception). |
| 16 | `styles` | The `style` prop in JSX is refused, whatever it is given, and so is a `style:` prop, everywhere oxlint lints: a style is a class, or set through a ref with `style.setProperty` for a value known only at run time | `@solidjs/compiler` 2.0.2 writes a string, and an object's constant values (`style={{ color: 'red' }}`, a mixed object's constant part, `style:color="red"`), into the template's HTML as a `style` attribute, which `style-src 'self'` refuses (Chromium, Differences); which values it sets at run time rests on its internals. The first version let an object literal through: wrong (the audit). |
| 17 | `states` in JSX | Widened to `site/*.tsx`; and a state key given to a component as a prop (`<Badge state="cancelled" />`, or in braces) is refused, as an argument is | A component's prop is the call's argument of JSX. An element's attribute is not (it is `h()`'s attribute object, which the rule never read). |
| 18 | `buttons` in JSX | Widened to `site/*.tsx`; a `<button>` whose `type` is not the string `button` (absent, `submit`, `reset`, an expression) is refused | The brief's "Solid form" of the rule: a button never submits a form. `react/button-has-type` refuses only an absent or unknown type. |
| 19 | `markup` in JSX | A JSX attribute `innerHTML` or `outerHTML`, bare or in a namespace (`prop:innerHTML`, which the compiler sets as the property); the exemption gains `site/icons.tsx` | The compiler sets `innerHTML` as the property (Evidence), the door `Drawing.into` keeps; `outerHTML` as `markup`'s other name. |
| 20 | `semicolons` | Biome's `noSuspiciousSemicolonInJsx`: JSX text, among an element's or a fragment's children, that starts with `;` and a line break (`<div />;`, `{x};` at a line's end); each such text, where Biome reports the first of an element's children | Biome 2.6.3 on a scratch file: refused `<p>x</p>;`, `{1};`, a fragment's, and `<div>;` (the first child), each followed by the line's end; let through `;` after spaces, `;` then spaces before the line's end, `; more`, `text;`, and `<i />;</div>` on one line. |
| 21 | `spreads` | Biome's `noDuplicatedSpreadProps`: one element spreading the same name, or the same member of names (`props.a`), twice, compared by its source; each repeat refused; a call (`{...f()}`) let through | Biome 2.6.3 on a scratch file: refused `{...props} x="1" {...props}` and three spreads of `props` (once, at the element); let through `{...props.a}` twice and `{...f()}` twice, and a child's spread of the parent's. A member read twice is the same object; a call may not be. |
| 22 | `svgs` | A JSX `<svg>` is refused everywhere oxlint lints but `site/icons.tsx` | The owner's 19 November decision on `noSvgWithoutTitle`: `Drawing` is the one maker of an SVG; `icons.ts` has no JSX, so the exemption is for its `.tsx` to come. |
| 23 | `classes` and `clicks` | Unchanged | Not in the row: `class={…}` in JSX needs a typed helper or a rule before `classes` can go (brief, Phase 4 review), task 4.4's first view; `stopPropagation` is a call in either syntax, so `clicks` already holds `.tsx`. |

## Evidence

- **Install:** `pnpm add -D -E eslint-plugin-solid@0.20.0`: "Packages: +14 -1", no line with "warn" or "peer";
  `pnpm install --frozen-lockfile`: none either; `node_modules/eslint` absent.
- **The preset:** `import('eslint-plugin-solid/configs/v2-strict')`: keys `plugins`, `languageOptions` (JSX on),
  `settings` (`{ solid: { version: 2 } }`), `rules`: 37 `solid/*` (26 at 2, 6 at 1, 5 at 0) and `no-unassigned-vars: 0`.
  The plugin has 38 rules; `action-yield-after-await` is in no preset.
- **The probe** (`tests/site/probe/probe.tsx`, not kept): a ref left unassigned refused by `eslint(no-unassigned-vars)`
  before decision 4 and let through after; `solid(no-single-arg-create-effect)` with its "In Solid 2.0" message,
  `solid(no-react-specific-props)` on `className`, `solid(no-innerhtml)`, `solid(style-prop)`, `solid(prefer-for)`,
  `solid(reactivity)`; `jsx-a11y(label-has-associated-control)` on `<label for>` until decision 7; `jsx-a11y(alt-text)`,
  `click-events-have-key-events`, `heading-has-content`, `iframe-has-title`, `no-noninteractive-tabindex`,
  `no-static-element-interactions`, `tabindex-no-positive`, `autocomplete-valid` (lowercase too), `no-access-key`
  (`accesskey` too), `react(button-has-type)`, `iframe-missing-sandbox`, `jsx-no-target-blank`,
  `void-dom-elements-no-children`; `no-autofocus` on `autoFocus` only.
- **The tree:** oxlint on `site`, `tests`, `lint` and the configs: 354 rules, then 386 with Solid's (31 on in `rules`,
  one in the override), no finding, on 158 files.
- **The compiler** (`@solidjs/compiler` 2.0.2, `transform`): `style="color: red"` →
  `` _$template(`<div style=color:red>a`) ``; `style={{color: p.c}}` → `_$setStyleProperty(el, "color", v)`;
  `style={p.s}` → `_$style(el, v, prev)`, which sets a string as `node.style.cssText` (`@solidjs/web`
  `dist/web.js:646-648`); `innerHTML={p.h}` and `prop:innerHTML={p.h}` → `el.innerHTML = v`; `outerHTML={p.h}` →
  `setAttribute(el, "outerHTML", v)`; `<svg><path d="M0"/></svg>` → a template.

## Impact

- **New:** `lint/thens.ts`, `lint/flags.ts`, `lint/mirrors.ts`, `lint/legacy.ts`, `lint/styles.ts`,
  `lint/semicolons.ts`, `lint/spreads.ts`, `lint/svgs.ts`, each with `lint/fixtures/<rule>/`; `.tsx` fixtures for
  `states`, `buttons`, `markup`.
- **Changed:** `package.json`, `pnpm-lock.yaml`; `.oxlintrc.json`; `lint/plugin.ts`, `lint/states.ts`,
  `lint/buttons.ts`, `lint/markup.ts`, `lint/shapes.ts` (helpers for JSX, if shared); `tests/site/rules.test.ts` (the
  `v2-strict` test, `good.tsx`); `.oxfmtrc.jsonc`; `docs/concepts/lint-rules.md` (the house rules' table and count,
  Solid's rules, the JSX section); `CONTRIBUTING.md` ("House rules": `good.ts` or `good.tsx`); `refactor-plan.md` (row
  4.2).
- **Unchanged:** `site/`, the build, the tests' behaviour; knip needs no entry (its oxlint plugin counts the `jsPlugins`
  entry, and the `v2-strict` test imports the preset).

## Commits

| Commit | What |
| -- | -- |
| `e353c5d4` | this plan |
| `36e86938` | `eslint-plugin-solid` pinned, `v2-strict` on, the test holding it to the preset, lint-rules.md's Solid section |
| `43a7d021` | `states` in `.tsx` and a component's prop; the harness's `good.tsx`; oxfmt's `.tsx` fixtures |
| `66508411` | `buttons` in `.tsx` |
| `15f903a5` | `markup` and the `innerHTML` prop |
| `493691b8` | `styles`: the `style` prop refused |
| `38eeeed5` | `thens` |
| `342cbc40` | `flags` |
| `8059e1aa` | `mirrors` |
| `8c9585ae` | `legacy` |
| `4e857bc3` | `semicolons`, and the harness's JSX marker |
| `f866d940` | `spreads` |
| `b62e56db` | `svgs` |
| `9182cbf0` | `focuses` (the audit) |
| the last | the docs' counts, CONTRIBUTING, the plan's row and this status |

Each rule's commit adds its row to lint-rules.md's table of house rules, which `rules.test.ts` holds to the config.

## Review of this plan

Each claim above re-read against the code and `node_modules` before the first commit:

- The preset's rules, levels and settings, by importing `eslint-plugin-solid/configs/v2-strict`; the nine rules reading
  the version, by `isSolidV2` in `dist/chunk-T7637WC4.mjs`. **Corrected:** the first draft named
  `no-single-arg-create-effect` among them and took its "In Solid 2.0" message for proof that the setting arrives; it
  reads no setting, so a probe plugin printing `context.settings.solid` took its place.
- `solid/no-unassigned-vars` against ESLint's (`src/rules/no-unassigned-vars.ts`: the ref is the one difference);
  `no-innerhtml`'s `allowStatic` default `true`; `style-prop` reading a `Literal` or a `TemplateLiteral` alone.
- `@solidjs/web`'s `style?: CSSProperties | string` (`types/jsx.d.ts:930`), `autofocus` (`:910`), `for` (`:1518`);
  `style()` setting `cssText` (`dist/web.js:646-648`); the compiler's output, by running `transform`.
- **Corrected:** Biome's two rules by running Biome 2.6.3 on scratch files, not from memory: the semicolon must be
  followed by the line break itself, and a fragment's and an expression's count; the spread rule takes names only.
- The 38 JSX rules on and 8 off, by matching lint-rules.md's JSX table against `.oxlintrc.json`; `react/button-has-type`
  with no options; the fixtures' exclusions (`lint/tsconfig.json`, `tests/site/tsconfig.json`, `knip.jsonc`,
  `.jscpd.json`, `.oxlintrc.json`'s `ignorePatterns`) by folder, and oxfmt's by `.ts` (decision 10).
- **Corrected:** "none left reporting without failing" is Q2's wording, not task 2.4's.
- `site/` has no `.tsx` and `tests/site/hello.tsx` is the tree's one (`find`); knip passes with the package and no
  importer.

## Differences from the plan

- **`mirrors` reports at the first setter** (or the setter passed), not at the effect: oxfmt puts each argument of a
  two-function call on its own line and moves a comment after `createEffect(`, so the marked line had to be one a setter
  starts.
- **The harness's JSX marker.** In JSX's text `// refused` is text, and the `semicolons` fixtures need a marker on the
  line of the semicolon: `tests/site/rules.test.ts` also reads `{/* refused */}` anywhere on a line. oxfmt is kept off
  `lint/fixtures/semicolons/`, whose JSX text it would lay out again (it moved `;` onto the next element's line).
- **`prefer-readonly-parameter-types`' `allow`** gains oxlint's `JSXAttribute` and `JSXOpeningElement`, as it holds its
  other syntax-tree types, for the shared JSX helpers in `lint/shapes.ts` (`tagOf`, `isComponent`, `attributeName`,
  `attributeOf`, `valueOf`, and `unwrapped`, now exported).
- **The `buttons` fixture declares its `h()`** rather than importing `dom.ts`, which `legacy` refuses in a `.tsx` file.
- **`semicolons` and `spreads` report each repeat**, where Biome reports once per element; each fixture marks every one.

## The audit's corrections

An audit of the unpushed commits found these; each fix is folded into the commit of its rule, with fixtures that fail on
the rule as it was and pass now.

- **`styles` (high).** The compiler writes a style object's constant values into the template (`<p style=color:red>`;
  `style:color="red"` the same). Probe: a component built with the site's plugin, on a page under `style-src 'self'`, in
  Chromium: the console says "Refused to apply inline style … style-src 'self'" and a `securitypolicyviolation`
  (`style-src-attr`) fires; Chromium still paints the cloned element red, so the refusal shows in the console, which
  task 4.3's check makes a failure, not on the page. The rule now refuses the `style` prop and `style:` props
  altogether; its fixtures add the constant, mixed and dynamic objects and `style:color`, and `good.tsx` has no style.
- **`focuses` (new).** `jsx-a11y/no-autofocus` misses Solid's `autofocus` and its `attributes` setting does not reach it
  (measured): a house rule on `**/*.tsx` refuses `autofocus` in any spelling (`autoFocus`, `prop:autofocus`,
  `attr:autofocus`, an object spread's key). The jsx-a11y click rules' blind spot for `on:click` and `oncapture:click`
  needs no rule: the compiler refuses both namespaces ("removed in Solid 2.0", as it does `attr:`).
- **`mirrors`.** Now caught: `{ return setB(v) }`, `void setB(v)`, `setB?.(v)`, a cast apply half, `Solid.createEffect`
  and `import { createEffect as effect }`; `setB(await f(v))` too, since the brief makes async data a memo. A method
  (`o.setB(v)`, `el.setAttribute(…)`) is not: a signal's setter is a name, and a method is the DOM work an effect is
  for.
- **`flags`.** Now caught: a function declared by a flag's name, a class field (`#private` too), a setter destructured
  alone (`const [, setLoading]`; the name list gains `set` before it). A loop's variable (`for (const failed of …)`) is
  let through.
- **`thens`:** `p.then.call`, `.bind` and `const { then } = p`. **`legacy`:** `./dom.js`; the path must be relative, so
  `@testing-library/dom` is let through; `createElement` destructured or handed on with `.call`/`.bind`. **`spreads`:**
  read through `as`, `!` and an optional chain, a key in quotes the same as a name. **`buttons`:** `type` given twice,
  or a spread after `type="button"`. **`markup`:** `{...{ innerHTML }}`. **`svgs`:** `<Dynamic component="svg">` and
  `dynamic(() => 'svg')`.
- **The `v2-strict` test** compares the set of the plugin's rules on with the preset's, so a rule outside it (an extra
  `solid/action-yield-after-await`) fails it.

## Done when

Every house rule passes its fixtures (`tests/site/rules.test.ts`), `.oxlintrc.json` sets `v2-strict` as the test reads
it, oxlint lints the tree with no finding, and `mise run check` passes.
