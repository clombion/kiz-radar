# Plan: replace Biome with stylelint (issue #23)

Planning only: no repository file changed. Measured on 20 November 2026 in scratch copies under
`/tmp/claude-0/-home-user/3ac79d32-70ba-5249-902e-a3881d3411e5/scratchpad/` (`m17/`: stylelint 17.16.0 and every
candidate plugin; `m18/`, `pe/`: stylelint 18.0.0; `pe8/`: the browser plugin on current MDN data; `sl/`: Biome 2.6.3
on a copy of the files it reads). Each stylelint core rule was run alone on `public/css/site.css` (3738 lines) with
17.16.0 and 18.0.0: **every rule's count is the same on both**. Raw counts: `each17.tsv`, `each18.tsv`; the proposed
config: `tools/proposed.json`.

## 1. What Biome runs today

`biome.jsonc`: `"preset": "all"`, with `noHexColors`, `noExcessiveLinesPerFile`, `noDescendingSpecificity` and
`useBaseline` off. `biome rage --linter` lists 482 enabled rules; `files.includes` gives Biome `public/css/**` and the
seven root configs (`.jscpd.json`, `.oxfmtrc.jsonc`, `.oxlintrc.json`, `biome.jsonc`, `knip.jsonc`, `package.json`,
`tsconfig.json`). Nursery rules are not in the preset (0 enabled). Which rules read which files was taken from
`biome explain` (a rule whose examples are CSS) and checked by planting violations in the copy: a duplicate key, an
empty key, a top-level literal, a duplicated dependency, an empty file, irregular whitespace.

Today `biome lint --diagnostic-level=info` reports **nothing** on these files; the one `biome-ignore` is `site.css:277`
(`noImportantStyles`, the `[hidden]` rule).

### CSS rules in force (29)

| Biome rule | Level |
| -- | -- |
| `a11y/useGenericFontNames` | error |
| `complexity/noImportantStyles` | warn |
| `complexity/noExcessiveSelectorClasses` | info, and a no-op: `maxClasses` has no default |
| `correctness/noInvalidDirectionInLinearGradient` | error |
| `correctness/noInvalidGridAreas` | error |
| `correctness/noInvalidPositionAtImportRule` | error |
| `correctness/noMissingVarFunction` | error |
| `correctness/noUnknownFunction` | error |
| `correctness/noUnknownMediaFeatureName` | error |
| `correctness/noUnknownProperty` | error |
| `correctness/noUnknownPseudoClass` | error |
| `correctness/noUnknownPseudoElement` | error |
| `correctness/noUnknownTypeSelector` | error |
| `correctness/noUnknownUnit` | error |
| `correctness/noUnmatchableAnbSelector` | error |
| `style/noValueAtRule` | info (CSS Modules' `@value`) |
| `suspicious/noDeprecatedMediaType` | warn |
| `suspicious/noDuplicateAtImportRules` | error |
| `suspicious/noDuplicateCustomProperties` | error |
| `suspicious/noDuplicateFontNames` | error |
| `suspicious/noDuplicateProperties` | error |
| `suspicious/noDuplicateSelectors` | warn |
| `suspicious/noDuplicateSelectorsKeyframeBlock` | error |
| `suspicious/noEmptyBlock` | warn |
| `suspicious/noEmptySource` | warn (CSS, JSON) |
| `suspicious/noImportantInKeyframe` | error |
| `suspicious/noIrregularWhitespace` | warn (CSS too: planted, reported) |
| `suspicious/noShorthandPropertyOverrides` | error |
| `suspicious/noUnknownAtRules` | error |

Off: `noHexColors`, `noDescendingSpecificity`, `useBaseline` (CSS) and `noExcessiveLinesPerFile` (every file). Biome's
CSS parser also fails a file that does not parse.

### JSON rules that act on the configs (9, and the parser)

| Biome rule | Level | Reads |
| -- | -- | -- |
| `suspicious/noDuplicateObjectKeys` | error | any JSON object (planted: reported) |
| `suspicious/noEmptyObjectKeys` | warn | any JSON object (planted: reported) |
| `style/noTopLevelLiterals` | info | any JSON file (planted: reported, never fails) |
| `suspicious/noDuplicateDependencies` | warn | `package.json` (planted: reported) |
| `suspicious/noEmptySource` | warn | an empty file (a `.json` one is a parse error first) |
| `suspicious/noBiomeFirstException` | error | `biome.jsonc` |
| `suspicious/useBiomeIgnoreFolder` | warn | `biome.jsonc` |
| `suspicious/noQuickfixBiome` | info | `.vscode/settings.json`, Zed's: none is in the set |
| `suspicious/useRequiredScripts` | warn | `package.json`; a no-op without `requiredScripts` |

The other rules whose `biome explain` shows JSON only use it for their options (JS, TS, JSX, GraphQL, Vue rules).

## 2. Mapping

### CSS: Biome rule to stylelint

Taken from Biome's own metadata: `biome migrate stylelint --include-inspired --include-nursery` run on a one-rule
config for each of stylelint's 150 core rules; every pair below is Biome's (`migmap.txt`), but the two marked.

| Biome rule | stylelint | Findings today |
| -- | -- | -- |
| `useGenericFontNames` | `font-family-no-missing-generic-family-keyword` | 0 |
| `noImportantStyles` | `declaration-no-important` | 1, the suppressed line (comment moves to stylelint's) |
| `noExcessiveSelectorClasses` | `selector-max-class` | none in force (no option); stricter table sets 4 |
| `noInvalidDirectionInLinearGradient` | `function-linear-gradient-no-nonstandard-direction` | 0 |
| `noInvalidGridAreas` | `named-grid-areas-no-invalid` | 0 |
| `noInvalidPositionAtImportRule` | `no-invalid-position-at-import-rule` | 0 |
| `noMissingVarFunction` | `custom-property-no-missing-var-function` | 0 |
| `noUnknownFunction` | `function-no-unknown` | 0 |
| `noUnknownMediaFeatureName` | `media-feature-name-no-unknown` | 0 |
| `noUnknownProperty` | `property-no-unknown` | 0 |
| `noUnknownPseudoClass` | `selector-pseudo-class-no-unknown` | 0 |
| `noUnknownPseudoElement` | `selector-pseudo-element-no-unknown` | 0 |
| `noUnknownTypeSelector` | `selector-type-no-unknown` | 0 |
| `noUnknownUnit` | `unit-no-unknown` | 0 |
| `noUnmatchableAnbSelector` | `selector-anb-no-unmatchable` | 0 |
| `noValueAtRule` | dropped: `at-rule-no-unknown` refuses `@value` (not a CSS at-rule) | 0 |
| `noDeprecatedMediaType` | `media-type-no-deprecated` | 0 |
| `noDuplicateAtImportRules` | `no-duplicate-at-import-rules` | 0 |
| `noDuplicateCustomProperties` | `declaration-block-no-duplicate-custom-properties` | 0 |
| `noDuplicateFontNames` | `font-family-no-duplicate-names` | 0 |
| `noDuplicateProperties` | `declaration-block-no-duplicate-properties` | 0 |
| `noDuplicateSelectors` | `no-duplicate-selectors` | 0 |
| `noDuplicateSelectorsKeyframeBlock` | `keyframe-block-no-duplicate-selectors` | 0 |
| `noEmptyBlock` | `block-no-empty` | 0 |
| `noEmptySource` | `no-empty-source` | 0 |
| `noImportantInKeyframe` | `keyframe-declaration-no-important` | 0 |
| `noIrregularWhitespace` | `no-irregular-whitespace` | 0 |
| `noShorthandPropertyOverrides` | `declaration-block-no-shorthand-property-overrides` | 0 |
| `noUnknownAtRules` | `at-rule-no-unknown` | 0 |
| (parser) | stylelint's own: a `CssSyntaxError` fails the run; oxfmt (`format:site`) parses it too | 0 |

Off in Biome, staying off: `noHexColors` = `color-no-hex` (18 findings: the tokens are hex); `noDescendingSpecificity`
= `no-descending-specificity` (61: the stylesheet is ordered by component, Biome's reason holds for stylelint's
version, which is the same check); `noExcessiveLinesPerFile` has no stylelint rule. `useBaseline` is replaced by the
browser check against the declared targets (section 3).

**No CSS rule is lost.** stylelint's `selector-type-no-unknown`, `function-no-unknown` and the `*-no-unknown` family
read the same CSSTree data Biome's do; every one finds 0 today on 17 and 18.

### JSON: Biome rule to what holds it after

| Biome rule | After Biome | Status |
| -- | -- | -- |
| (parser: a config that does not parse) | oxfmt (`format:site`) refuses it (planted: "Error occurred"), and each tool reading the file (pnpm, tsc, oxlint, oxfmt, knip, jscpd) | held |
| `noDuplicateObjectKeys` | nothing: oxfmt lays a duplicate out without a word (planted), and every reader takes the last value | **loss, or a test (card D)** |
| `noEmptyObjectKeys` | nothing | loss, or the same test (card D) |
| `noDuplicateDependencies` | a duplicate key within a group: the same test (card D) | loss, or the same test |
| `noTopLevelLiterals` | info, never failed; every config's reader wants an object | dropped |
| `noEmptySource` | an empty `.json` is a parse error to pnpm, tsc and oxlint; oxfmt passes an empty file (planted) | held by the readers |
| `noBiomeFirstException`, `useBiomeIgnoreFolder` | read `biome.jsonc`, which goes | moot |
| `noQuickfixBiome` | reads editor settings, none in the set | moot |
| `useRequiredScripts` | a no-op without `requiredScripts` | dropped |

## 3. Stricter than Biome: each rule considered

The issue asks for each rule decided on or off with its reason, not a shared config's defaults; so no
`stylelint-config-standard`/`recommended` is extended (their rules are among the ones below). Counts: findings on
today's `site.css`, the rule alone, stylelint 17.16.0 = 18.0.0. "Fix" means the stylesheet changes (section 5 lists
each; the page renders the same).

### Core rules

| Rule (setting) | Findings | Decision | Reason |
| -- | -- | -- | -- |
| The validity rules with no Biome twin: `annotation-no-unknown`, `at-charset-rule-no-invalid` (18), `at-rule-descriptor-no-unknown`, `at-rule-descriptor-value-no-unknown`, `at-rule-no-deprecated`, `at-rule-prelude-no-invalid`, `block-no-redundant-nested-style-rules`, `color-no-invalid-hex`, `comment-no-empty`, `declaration-property-value-keyword-no-deprecated`, `declaration-property-value-no-unknown`, `function-calc-no-unspaced-operator`, `media-feature-name-value-no-unknown`, `media-query-no-invalid`, `nesting-selector-no-missing-scoping-root`, `no-invalid-double-slash-comments`, `no-invalid-position-declaration`, `no-unknown-animations`, `no-unknown-custom-media`, `property-no-deprecated`, `selector-no-deprecated`, `selector-no-invalid`, `selector-no-unmatchable`, `string-no-newline`, `syntax-string-no-invalid`, `value-no-invalid` (18) | 0 each | **on** | each refuses CSS a browser drops or misreads, which Biome's rules do not see (a value a property cannot take, an invalid prelude, an animation name no `@keyframes` defines); no cost today |
| `no-descending-specificity` | 61 | off | Biome's reason: ordered by component, specificity decides between weights |
| `selector-max-specificity` (`0,4,0` / `0,5,2`) | 3 / 1 | off | a ceiling fitted to today's worst selector holds nothing; with descending specificity off, specificity is how the stylesheet weighs rules |
| `selector-max-compound-selectors` (3 / **4**) | 2 / 0 | **on, 4** | today's deepest is 4 (`.sentence-hero .live .friends b`); stops descendant chains growing |
| `selector-max-class` (3 / **4**) | 3 / 0 | **on, 4** | Biome's `noExcessiveSelectorClasses` given the option it lacked; today's most is 4 |
| `selector-max-id` (0) | 1 | off | the one id is `#main:focus`, the skip link's target; a cap of 0 would need it suppressed for nothing gained |
| `selector-no-qualifying-type` | 77 (0 ignoring class and attribute) | off | `button.link`, `dialog.search`, `input[type]` qualify on purpose: a class styles one element kind |
| `max-nesting-depth` (0) | 0 | **on, 0** | the stylesheet is flat, and `styles.test.ts`'s `rules()` and `pipeline/generate.py`'s class reader read flat rules |
| `selector-max-type` 2, `-universal` 1, `-attribute` 2, `-pseudo-class` 3, `-combinators` 3 | 0 each | off | caps chosen only to fit today; the compound and class caps bound a selector already |
| `unit-allowed-list` (`px rem em %`) | 68 (0 with the 15 units in use) | off | every unit in use is deliberate (`fr`, `dvh`, `svh`, `deg`, `ms`); a list of today's units refuses nothing wrong |
| `declaration-property-unit-allowed-list` (`font-size: rem em %`, unitless `line-height`, no unit on transitions) | 6 | off | fluid type is `clamp(rem, vw, rem)` by design; Leaflet's attribution is `10px`; one `line-height` in rem |
| `color-named` (`never`, `ignoreProperties: [/^mask/]`) | 6 (0 with the exemption) | **on** | the 6 are `black` in `mask-image` gradients (opacity, not colour); elsewhere a named colour passes `styles.test.ts`, whose colour pattern is hex and colour functions: this closes that gap |
| `color-hex-length` (`short`) | 1 | **on, fix** | `--accent-ink: #ffffff` |
| `font-weight-notation` (`numeric`) | 0 | **on** | one spelling |
| `selector-class-pattern` (kebab: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) | 0 | **on** | `site/classes.ts` is generated from these names (`generate.py`'s reader takes any `[\w-]`); the rule holds them to the form JSX's `class` is written in; Leaflet's own are kebab too |
| `custom-property-pattern`, `keyframes-name-pattern` (kebab) | 0 / 0 | **on** | the tokens and animations, the same form |
| `selector-id-pattern`, `container-name-pattern`, `layer-name-pattern`, `custom-media-pattern` | 0 (none exist but `#main`) | off | nothing to hold; turn on with the first container, layer or custom media |
| notations: `alpha-value-notation` number, `color-function-notation` modern, `color-function-alias-notation` without-alpha, `hue-degree-notation` angle, `lightness-notation` percentage, `import-notation` string, `selector-not-notation` complex, `selector-pseudo-element-colon-notation` double, `selector-attribute-quotes` always, `display-notation` short, `keyframe-selector-notation`, `length-zero-no-unit`, `number-max-precision` 4, `selector-type-case` lower, `function-name-case` lower, `comment-whitespace-inside` always | 0 each | **on** | one spelling each, as written today |
| `media-feature-range-notation` (`prefix` / `context`) | 0 / 12 | **on, prefix** | `media.ts`'s queries must be the stylesheet's own spelling (`styles.test.ts`); prefix is today's |
| `function-url-quotes` (`never` / `always`) | 0 / 4 | **on, never** | today's spelling |
| `function-url-scheme-allowed-list` (`[data]`) | 0 | **on** | a remote `url()` is refused by the page's CSP at run time; this refuses it at lint time |
| `time-min-milliseconds` (100) | 0 | **on** | a duration under 100 ms is a typo for seconds; the reduced-motion `0ms` is exempt by the rule |
| `at-rule-no-vendor-prefix`, `media-feature-name-no-vendor-prefix`, `selector-no-vendor-prefix`, `value-no-vendor-prefix` | 0 each | **on** | the targets are the latest browsers |
| `property-no-vendor-prefix` | 4 | **on, 3 fixed, 1 suppressed** | `-webkit-appearance` ×3 beside `appearance` (all three targets take the unprefixed one): deleted; `-webkit-text-size-adjust` is iOS Safari's only form: kept, suppressed with the browser check on its line |
| `declaration-block-no-redundant-longhand-properties` | 1 | **on, fix** | `flex-direction: row; flex-wrap: wrap` → `flex-flow: row wrap` |
| `shorthand-property-no-redundant-values` | 2 | **on, fix** | `0.4rem 0 0.4rem` → `0.4rem 0`; `0.5rem 0.5rem` → `0.5rem` |
| `no-unknown-custom-properties` | 3 | off | `--w` (`artists.tsx`'s `styled`) and `--header-h` (`main.ts`) are set by the code; `styles.test.ts` already checks every token read is defined by a rule or the code, which stylelint cannot see |
| `value-keyword-case` (`lower`) | 2 | off | case only; it misreads `Roboto` inside `--font`; the other is `currentColor` |
| `font-family-name-quotes` (`always-where-recommended`) | 5 | off | quotes only; it skips `--font`, which quotes the same names, so the sheet would spell one font two ways |
| `color-no-hex` | 18 | off | Biome's `noHexColors` reason: the tokens are hex |
| `declaration-property-value-disallowed-list` as a copy of the token test (hex and colour functions outside tokens, `cubic-bezier`, literal durations, literal `z-index`) | 0; 8 of 8 planted caught | off now (card E) | it would state `styles.test.ts`'s token rule twice; the issue's invariant keeps that test unchanged |
| layout mappings: `property-layout-mappings` / `unit-layout-mappings` / `value-keyword-layout-mappings` (`flow-relative`) | 320 / 24 / 7 | off | logical properties: the site has no right-to-left or vertical text; 351 rewrites for no visitor. Core rules, so no plugin is needed if this changes |
| layout: `rule-empty-line-before` 564, `comment-empty-line-before` 46, `at-rule-empty-line-before` 18, `declaration-empty-line-before` 3, `custom-property-empty-line-before` 2 | | off | layout is oxfmt's (`format:site`) |
| list rules (`*-allowed-list`, `*-disallowed-list` but those above, `comment-word-disallowed-list`, `rule-selector-property-disallowed-list`, `declaration-property-max-values`, `rule-nesting-at-rule-required-list`, `at-rule-property-required-list`, `declaration-property-custom-property-allowed-list`, `value-type-custom-property-required-list`) | | off | each needs a list the house has no rule for |

Config-level, on: `reportDescriptionlessDisables`, `reportNeedlessDisables`, `reportInvalidScopeDisables` (planted: a
disable without `-- reason` and a needless one both fail), so stylelint itself holds the suppression rule that
`tests/test_suppressions.py` counts.

With all of the above (`tools/proposed.json`) on today's sheet: **11 findings** = 7 fixes + 4 rule findings on 3
suppressed lines; after them, 0 (`pe/public/css/site.css` holds the result; oxfmt `--check` passes it). Run time ~2 s.

### Plugins

| Plugin | Latest (released) | Peer vs stylelint | Maintenance | Findings today | Decision |
| -- | -- | -- | -- | -- | -- |
| `stylelint-browser-compat` (MDN browser-compat-data, reads `browserslist`) | `1.0.0-beta.200` (2026-10-05); the `latest` tag is `1.0.0-beta.180` (2025-11-15) | `stylelint >=14.8.5`, `browserslist >=4.20.3`: fits 17 and 18 | one maintainer, 48k downloads a week, 200 betas and no stable release; **bundles `@mdn/browser-compat-data` 7.1.22 exactly (2025-11-17)**, a year old (current: 8.1.10); undeclared `tslib` (fails to load under pnpm without a `packageExtensions` entry, verified); `lodash.get` deprecated | **2**: `-webkit-text-size-adjust` (desktop Safari, Firefox), `forced-color-adjust` (Safari) | **recommended**, needs OK |
| `stylelint-no-unsupported-browser-features` (doiuse, caniuse) | `8.1.2` (2026-09-09) | `stylelint >=16.0.2` | one maintainer, 560k/week; doiuse 6.0.6 (2025-12-13) | 19 (partial support notes: `text-decoration`, `multicolumn`, `display: contents`…), 1 with `ignorePartialSupport` (`ui-monospace`) | rejected: blind to the CSS that matters: no finding for `@starting-style`, view transitions, `@scope`, `text-wrap`, anchor positioning, `field-sizing`, scroll timelines, `interpolate-size`, `reading-flow`, `corner-shape`, `if()`, even against Safari 16 / Firefox 115 (it took `:has-slotted` for `:has`); of 18 planted lines it flagged 5 against the latest three, browser-compat 12 (the other 6, `if()`, `text-wrap`, `@starting-style`, a view transition, `appearance: base-select`, `@scope`, it finds in all three) |
| `stylelint-plugin-use-baseline` | `1.4.8` (2026-10-18) | `^16.0.2 \|\| ^17.0.0`: **not 18** | one maintainer, 28k/week | 31 (widely available), 7 (`newly`) | rejected: Baseline, not the declared browsers; flags `overscroll-behavior`, view transitions, `@starting-style`, which all three targets have |
| `@double-great/stylelint-a11y` | `3.8.3` (2026-11-01) | `>=16.7.0` | two maintainers, 39k/week, releases monthly | `media-prefers-reduced-motion` 26, `no-display-none` 36, `line-height-is-vertical-rhythmed` 20, `selector-pseudo-class-focus` 10, `media-prefers-color-scheme` 8, `content-property-no-static-value` 3, `no-outline-none` 1 (`#main:focus`, meant), `font-size-is-readable` 1 (Leaflet's attribution), the other four 0 | rejected: its two flagship rules misread the design: reduced motion zeroes the duration tokens in `:root` (`site.css:3260`), and colour schemes swap tokens, so each animated or coloured rule is reported; the rest is noise or meant |
| `stylelint-declaration-strict-value` | `1.13.0` (2026-11-11; for 18), `1.12.1` (2026-08-24; peer `>=16 <=17`) | 1.13.0 `>=16 <=18` | one maintainer, 1M/week | 5 (`ease` in `transition`/`animation` shorthands), 0 allowing the keywords | rejected: it lets any function through, so `rgb()`, `oklch()`, `cubic-bezier()` and a colour inside `box-shadow` pass (planted); `styles.test.ts` catches all of them, and core `declaration-property-value-disallowed-list` caught 8 of 8 with no dependency (card E). 1.13.0 also fails Q6 until 25 November |
| `stylelint-use-logical` / `stylelint-plugin-logical-css` / `stylelint-use-logical-spec` | 2.1.3 / 2.1.1 (2026-11-17) / 6.0.1 (2026-11-13) | `<18` / 2.1.1 only for 18 / 6.x | | 307 (use-logical) | not needed: logical properties are off, and core's `*-layout-mappings` would hold them |
| `stylelint-high-performance-animation` | `2.1.0` (2026-11-12; 2.0.0 for 17) | 2.1.0 `^17 \|\| ^18` | | 14 (9 `display` in `allow-discrete` transitions, which are the `@starting-style` pattern) | not proposed: the issue does not ask for it; its main finding misreads `display` transitions |

**Browser targets measured:** `last 1 Chrome version, last 1 Firefox version, last 1 Safari version` resolves to
chrome 157, firefox 160, safari 27.2 (caniuse-lite 1.0.30001826). Adding `last 1 iOS version, last 1 ChromeAndroid
version, last 1 FirefoxAndroid version` changes no finding (card B). Both browser plugins read the `browserslist`
field of `package.json` with no option (verified), so the targets are declared once.

**`@starting-style` and the newer CSS:** browser-compat knows `@starting-style`, `::view-transition-*`, `@scope`,
`text-wrap`, `:has-slotted` (each reported against Safari 16 / Firefox 115, none against the latest three), so the
progressive-enhancement uses Biome's `useBaseline` reason named (`backdrop-filter`, `@starting-style`) pass without an
exception: the targets have them. **Stale data:** with its bundled 2025 data it refuses `anchor-name`,
`field-sizing`, `animation-timeline` in Firefox 160 / Safari 27.2, which current data (BCD 8.1.8, forced in `pe8/`)
says they support; with 8.1.8 it breaks instead (10 "No information was found" errors, schema drift). It errs toward
refusing, so it never lets an unsupported feature through; the cost is a line suppression if the site adopts a 2026
feature before the plugin's data catches up (card A).

## 4. Dependencies to add (exact pins)

Q6 (refactor plan, 19 November): after the refactor an upgrade waits two weeks after its release; today is 20
November, so a version released on or before **6 November** meets it. A new dependency is read as falling under the
same rule (card F).

### stylelint itself (approved)

| Package | Pin | Released | Q6 | Note |
| -- | -- | -- | -- | -- |
| `stylelint` | `18.0.0` | 2026-11-03 | meets (17 days) | `engines.node ^22.22.2`: `mise.toml` pins node 22.22.0 (card C). 18.1.0 is today's, eligible 4 December. Fallback: `17.16.0` (2026-10-01, `>=20.19.0`, "likely the last 17.x") |

### Plugins needing the owner's OK

| Package | Pin | Released | Q6 | Why |
| -- | -- | -- | -- | -- |
| `stylelint-browser-compat` | `1.0.0-beta.200` | 2026-10-05 | meets | the browser check the issue asks for, against the declared targets; 2 findings today, both suppressed with reasons |
| `browserslist` | `4.29.5` | 2026-10-26 | meets (4.29.6 of 16 November does not) | the plugin's peer, pinned rather than left to auto-install; resolves "last 1 … version" |
| `tslib` (as `pnpm.packageExtensions` for `ts-results@3.3.0`, not a devDependency) | `2.8.1` | 2024-10-31 | meets (2.9.1 is newer) | the plugin's `ts-results` requires it without declaring it; without the entry the plugin fails to load under pnpm (verified) |

`caniuse-lite` (browserslist's data) and `@mdn/browser-compat-data` 7.1.22 come in transitively, pinned by
`pnpm-lock.yaml`. Nothing else: no shared config, no a11y, strict-value, baseline or logical plugin.

Removed: `@biomejs/biome` 2.6.3.

## 5. Commits (each whole, each passing `mise run check`, to `main`)

0. **(if card C is B) `mise.toml`: node 22.23.4** (2026-10-20, meets Q6) so stylelint 18's engine range holds. Its own
   commit: a tool upgrade.
1. **stylelint lints the stylesheet with Biome's CSS rules.** `stylelint` 18.0.0; `.stylelintrc.yaml` (card G) with
   the 27 mapped rules, each line its Biome rule's name, and the three report-disables settings; `package.json`
   `lint:stylelint: "stylelint 'public/css/**/*.css' --max-warnings 0"`; `tasks.toml` `lint:stylelint` in `check:fast`;
   `biome.jsonc`'s `files.includes` loses `public/css/**` and its three CSS `off`s; the `biome-ignore` at
   `site.css:277` becomes `/* stylelint-disable-next-line declaration-no-important -- the hidden attribute … */`.
   `tests/test_suppressions.py`: a `STYLELINT` pattern (`stylelint-disable-next-line <rules> -- <reason>`, only the
   next-line form), `SITE_SUPPRESSION` widened to `stylelint-(?:disable|enable)`, `stylelint_files()` read from
   `lint:stylelint`'s glob as `oxlint_files()` reads its script, the stray-comment test for each pair of tools;
   `SITE_ALLOWED`: `('public/css/site.css', 'lint/complexity/noImportantStyles')` → `('public/css/site.css',
   'declaration-no-important'): 1`. Docs: the CSS mapping table (section 2) in `docs/concepts/lint-rules.md`; a
   stylelint section in `docs/lint-false-positives.md`; `mise run generate` for `docs/reference/commands.md`. No
   stylesheet change but the comment.
2. **stylelint's stricter rules, with the stylesheet's seven fixes.** The on-rules of section 3 with their reasons;
   `site.css`: `#ffffff` → `#fff` (`color-hex-length`), three `-webkit-appearance` deleted (`property-no-vendor-prefix`),
   `flex-flow` (`declaration-block-no-redundant-longhand-properties`), two shorthands
   (`shorthand-property-no-redundant-values`), each named in the message with its rule;
   `/* stylelint-disable-next-line property-no-vendor-prefix -- iOS Safari reads the prefixed form alone */` at
   `site.css:34`; `SITE_ALLOWED` + `('public/css/site.css', 'property-no-vendor-prefix'): 1`. The proof (below):
   `tests/site/stylelint.test.ts` with `tests/site/stylelint/refused.css` and `good.css`. Docs: the stricter table.
3. **The supported browsers, declared once, and the browser check** (after the owner's OK). `package.json`
   `"browserslist": ["last 1 Chrome version", "last 1 Firefox version", "last 1 Safari version"]`,
   `stylelint-browser-compat` 1.0.0-beta.200, `browserslist` 4.29.5, `pnpm.packageExtensions` for `tslib`;
   `plugin/browser-compat: true`; line 34's comment names `plugin/browser-compat` too, and `site.css:3578`
   (`forced-color-adjust` inside `@media (forced-colors: active)`) gets
   `/* stylelint-disable-next-line plugin/browser-compat -- Safari has no forced colours mode, so it never matches this query */`;
   `SITE_ALLOWED` + `('public/css/site.css', 'plugin/browser-compat'): 2`; a refused line in the fixture. knip: check
   `browserslist` is seen as used (its stylelint plugin reads the config's `plugins`; `browserslist` is only a peer):
   else `ignoreDependencies` with its reason. Docs: CONTRIBUTING's Site paragraph names the targets and where they are.
4. **Biome is gone.** `@biomejs/biome`, `biome.jsonc`, `lint:biome` (package.json, tasks.toml, `check:fast`); the
   test of card D if chosen; `tests/test_suppressions.py` loses `BIOME`, `biome_files()`, the `biome=` flag, and the
   Biome-only tests; CONTRIBUTING (checks list, Site paragraph, Suppressions line naming stylelint), `docs/README.md`'s
   index row, `docs/concepts/lint-rules.md` ("Other languages", "Off in Biome" CSS rows point to the stylelint
   section), `mise run generate`. Biome's name stays where it records where a rule came from (card H).

**Suppression counts** (`SITE_ALLOWED`, the stylesheet's): today 1 (`noImportantStyles`); after, 4 rule findings on 3
lines: `declaration-no-important` 1, `property-no-vendor-prefix` 1, `plugin/browser-compat` 2. `ALLOWED` (Python)
unchanged.

**The planted proof.** `tests/site/stylelint.test.ts` (Node project) runs stylelint's Node API with the repository's
config on `tests/site/stylelint/refused.css`, where each line ends `/* refused: <rule> */`, and on `good.css`,
written the intended way, with no finding; it fails on a finding on an unmarked line, a marked line not found, or a
house-style rule of the config with no refused line (as `rules.test.ts` does for oxlint's house rules; not under
`lint/fixtures/`, whose test fails on a folder with no house rule). The browser line is `.a { field-sizing: content; }`
or `-webkit-box-reflect` (refused against Firefox 160 by the bundled and the current data alike; prefer
`-webkit-box-reflect`, whose answer won't move as browsers ship), so the declared targets are what refuse it. Measured
on a draft fixture: all 18 planted lines found by their rule (`pe/fx/`); three lines tripped a second rule
(`.g .h .i .j .k` is also five classes; `colr: red`; `10pixels`) and are written to trip one. Each line stands for one rule:
browser check, `color-named`, `font-weight-notation`, the three patterns, `max-nesting-depth`, the two selector caps,
`media-feature-range-notation`, `function-url-quotes`, `function-url-scheme-allowed-list`, `property-no-vendor-prefix`,
`color-hex-length`, `time-min-milliseconds`, `declaration-no-important`. A disable without a reason, planted in the
test, fails too.

**Invariant check:** `styles.test.ts` and the browser tests unchanged; the 7 fixes render the same (`#fff` =
`#ffffff`; `appearance` is unprefixed in all three targets; `flex-flow` and the shorthands are their longhands).

## 6. Decision cards for the owner

**A. The browser plugin: `stylelint-browser-compat` beta?** It is the only candidate that checks the declared targets
and knows today's CSS; but it is a perpetual beta from one maintainer, ships a year-old MDN snapshot that it breaks
on when forced newer, and needs a `packageExtensions` patch to load under pnpm. The alternatives miss the CSS the site
uses (doiuse) or ignore the targets and the 18 peer (use-baseline). Its stale data errs toward refusing, never toward
passing. *Recommended: add it, pinned; record the data date in lint-rules.md; revisit when it moves to BCD 8.*

**B. Which browsers?** "Latest Chrome, Firefox and Safari" as written (desktop), or with iOS Safari and Android's
Chrome and Firefox. Findings are the same today. *Recommended: add the three mobile entries: most visitors of a
festival site are on phones, and iOS Safari is a separate engine release line.*

**C. stylelint 18 needs node ≥ 22.22.2; the repo pins 22.22.0.** A: stylelint 17.16.0 now, 18 later (an upgrade
commit; YAML config works on both). B: node 22.23.4 first (own commit), then 18.0.0. C: 18.0.0 on 22.22.0 (measured:
it runs; pnpm warns of the engine; unsupported). *Recommended: B; it avoids an immediate major upgrade of the new
tool, and 18 is the line plugins are moving to (use-baseline and strict-value 1.12 already stop at 17).*

**D. Duplicate keys in the JSON configs.** After Biome nothing refuses a key written twice in `.oxlintrc.json` (600
lines of rule settings; the second setting silently wins) or `package.json`. A: accept the loss with
`noEmptyObjectKeys`, `noDuplicateDependencies`. B: a small test reading each root `.json`/`.jsonc` (comments skipped
by a string-aware scan) with a duplicate-and-empty-key check, no dependency. *Recommended: B.*

**E. The token test as a stylelint rule.** Core `declaration-property-value-disallowed-list` holds the
`styles.test.ts` token rule (0 today, 8 of 8 planted, with line and column in the editor) with no plugin. The issue
keeps `styles.test.ts` unchanged, so doing it now states the rule twice. *Recommended: not in #23; a follow-up that
moves it and deletes the test's copy.*

**F. Does Q6 apply to a new dependency?** Q6 speaks of an upgrade. *Recommended: yes, the same two weeks (every pin
above meets it; stylelint 18.1.0, browserslist 4.29.6 and strict-value 1.13.0 would not).*

**G. Config format.** stylelint cannot read comments in `.stylelintrc.json` (verified), and each rule's reason is a
comment in this repository. `.stylelintrc.yaml` (works on 17 and 18, no formatter or linter reads YAML here) or
`stylelint.config.ts` (18 only; typed by stylelint's `Config`, linted by oxlint like `vite.config.ts`, which needs it
added to `lint:oxlint` and an `import/no-default-export` exception). *Recommended: `.stylelintrc.yaml`.*

**H. Biome's name in history.** `lint/*.ts` headers, `.oxlintrc.json` comments, `lint-rules.md` and
`styles.test.ts`'s two comments say "Biome's X" to record a rule's origin. The acceptance says Biome is gone from the
docs. *Recommended: keep the provenance mentions (they are history, as lint-rules.md is), drop every operational one;
`styles.test.ts`'s header and its `noDuplicateSelectors` comment are reworded to stylelint's rule names, a comment-only
change.*

**I. PR vs commit.** The issue says to list plugins "in the PR"; the repository takes no pull requests (CLAUDE.md).
*Recommended: the owner's OK on section 4's plugin table before commit 3; the commits go to `main`.*

## Risks

- `browserslist`'s "last 1 version" moves only when `pnpm-lock.yaml` updates `caniuse-lite`; browserslist prints an
  "old data" warning after six months (stderr, does not fail the check).
- browser-compat's MDN data is from November 2025 (above).
- `pnpm install --frozen-lockfile` must resolve `packageExtensions` the same on CI; the lockfile records it.
- Nothing blocks: the network, the registry and the scratch installs all worked; GitHub repos of the plugins were not
  readable from this session (maintenance judged from npm's release history, maintainers and downloads).
