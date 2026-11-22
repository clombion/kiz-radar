// house/baseline, the stylesheet's browser check: a CSS feature site.css uses must have been in every browser
// package.json's browserslist declares for at least `months` months (.stylelintrc.yaml sets 12), by web-features
// (WebDX's Baseline data). The browsers are Baseline's core set, each at its latest version; the date a feature reached
// them all is the latest of the releases its support names in each, which is web-features' baseline_low_date for that
// set. One not in some declared browser, or in each but given no Baseline by web-features (baseline false: discouraged,
// or held back for some other reason), is refused whatever its date. Today is the clock's. The `allowed` option names
// BCD keys let through everywhere, each with its reason in .stylelintrc.yaml; one the data lacks, one nothing would
// refuse, and one that lets nothing of the stylesheet linted through are refused, so the list cannot outlive its
// reasons. lint:stylelint lints one stylesheet, so a key the run never met is unused.
//
// The CSS is read as @eslint/css's use-baseline reads it, each piece looked up by its BCD key, web-features' status of
// that key (status.by_compat_key), the key's case aside: a property (css.properties.<p>) and a keyword of its value
// (css.properties.<p>.<keyword>, or a longhand's for a shorthand's: font's ui-monospace is font-family's) or a global
// keyword (css.types.global_keywords.<k>); a value's shape where the data keys a shorthand by it (text-decoration with
// a style or colour, or a thickness); a function of a value (a property's own, css.properties.<p>.<f>_function, else
// css.types.<f>, or css.types.<type>.<f> for a type's functions: colours, gradients, images, filters, easings, shapes,
// transforms; a custom one, css.types.dashed-function) and a unit (css.types.length.<u>, the angles and resolutions,
// the viewport and container units by their group); an at-rule (css.at-rules.<a>), a descriptor of one that has them
// (css.at-rules.<a>.<d>), a media feature (css.at-rules.media.<f>) and the range syntax of a media query; a
// pseudo-class or pseudo-element (css.selectors.<s>) and the nesting selector. What an @supports around it tests for is
// not checked, as it applies only where the browser has it: a property, and the keywords, units and functions of the
// value tested for it; a selector(). A test under `not`, and what only one side of an `or` tests, guard nothing. What
// the data has no key for (a vendor prefix, an identifier of a value that names no keyword of its property, a custom
// property's name) is let through: other rules refuse the unknown, and this one refuses only what the data dates.
// docs/concepts/lint-rules.md says what it covers.
import { readFileSync } from 'node:fs';
import stylelint from 'stylelint';
import { browsers, features } from 'web-features';

const {
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

// stylelint takes a plugin's module for its rule where it has no default export: its ruleName and rule
export const ruleName = 'house/baseline';

type Root = Parameters<ReturnType<stylelint.RuleBase>>[0];
type Node = Parameters<Parameters<Root['walk']>[0]>[0];
type Browser = keyof typeof browsers;

// browserslist's name of each of Baseline's core browsers, by web-features' id
const BROWSERSLIST: ReadonlyMap<string, Browser> = new Map([
  ['chrome', 'chrome'],
  ['edge', 'edge'],
  ['firefox', 'firefox'],
  ['safari', 'safari'],
  ['ios_saf', 'safari_ios'],
  ['and_chr', 'chrome_android'],
  ['and_ff', 'firefox_android'],
]);
// as browserslist reads it: any case, the name too
const QUERY = /^last\s+1\s+(?<name>\w+)\s+versions?$/iu;

// the browsers package.json declares, each its latest version: `last 1 <browser> version`, a core browser of Baseline,
// each once
function declared(): readonly Browser[] {
  const text = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(text);
  const queries: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'browserslist') : undefined;
  if (!Array.isArray(queries) || queries.length === 0)
    throw new TypeError('package.json declares its browsers in browserslist');
  const out = queries.map((query: unknown) => {
    const name = typeof query === 'string' ? QUERY.exec(query.trim())?.groups?.['name'] : undefined;
    const browser = name === undefined ? undefined : BROWSERSLIST.get(name.toLowerCase());
    if (browser === undefined)
      throw new TypeError(`browserslist's ${String(query)} is no "last 1 <browser> version" of Baseline's core set`);
    return browser;
  });
  const twice = out.find((browser, i) => out.indexOf(browser) !== i);
  if (twice !== undefined) throw new TypeError(`browserslist declares ${twice} twice`);
  return out;
}

// what web-features says of a BCD key: the key as the data spells it, the feature it belongs to, the date it reached
// every declared browser (none while one lacks it, those it lacks named), and whether it is Baseline at all
type Support = {
  readonly feature: string;
  readonly key: string;
  readonly reached: string | undefined;
  readonly missing: readonly string[];
  readonly baseline: boolean;
  readonly discouraged: boolean;
};

// each CSS key of the data, by its lowercase: the CSS is matched in any case (currentColor, scaleX)
function supports(declaredBrowsers: readonly Browser[]): ReadonlyMap<string, Support> {
  const out = new Map<string, Support>();
  for (const data of Object.values(features)) {
    if (data.kind !== 'feature') continue;
    for (const [key, status] of Object.entries(data.status.by_compat_key ?? {})) {
      if (!key.startsWith('css.')) continue;
      const dates = declaredBrowsers.map((browser) => {
        const version = status.support[browser]?.replace('≤', '');
        return browsers[browser].releases.find((release) => release.version === version)?.date;
      });
      const dated = dates.filter((date) => date !== undefined);
      const missing = declaredBrowsers.filter((_, i) => dates[i] === undefined).map((b) => browsers[b].name);
      out.set(key.toLowerCase(), {
        feature: data.name,
        key,
        // ISO days, which sort as strings
        reached: missing.length > 0 ? undefined : dated.toSorted().at(-1),
        missing,
        baseline: status.baseline !== false,
        discouraged: data.discouraged !== undefined,
      });
    }
  }
  return out;
}

// the keys of the value functions: a type's own (css.types.calc), and one of a type that holds functions
// (css.types.color.oklch), which wins where a name is both (color(), shape()); a function's key that says it is one
// (css.types.easing-function.linear-function, attr()'s type_function) by the function's name
const FUNCTION_TYPES = new Set([
  'basic-shape',
  'color',
  'easing-function',
  'filter-function',
  'gradient',
  'image',
  'transform-function',
]);
const FUNCTION_SUFFIX = /[-_]function$/u;
// the units BCD keys by a group of theirs
const UNIT_GROUPS: Readonly<Record<string, readonly string[]>> = {
  viewport_percentage_units_dynamic: ['dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax'],
  viewport_percentage_units_large: ['lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax'],
  viewport_percentage_units_small: ['svw', 'svh', 'svi', 'svb', 'svmin', 'svmax'],
  container_query_length_units: ['cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax'],
};
const UNIT_TYPES = new Set(['length', 'angle', 'resolution']);

// the keys by the CSS that names them, in lowercase: functions and units, whose keys are not their names
function tables(data: ReadonlyMap<string, Support>): {
  functions: ReadonlyMap<string, string>;
  units: ReadonlyMap<string, string>;
} {
  const functions = new Map<string, string>();
  const units = new Map<string, string>();
  for (const key of data.keys()) {
    const [css, types, type, name, ...rest] = key.split('.');
    if (css !== 'css' || types !== 'types' || type === undefined || rest.length > 0) continue;
    if (name === undefined) {
      // a type's own key is read as a function of its name, which matches only where a function has it
      if (!functions.has(type)) functions.set(type, key);
    } else if (FUNCTION_TYPES.has(type) || name.endsWith('_function'))
      functions.set(name.replace(FUNCTION_SUFFIX, ''), key);
    else if (UNIT_TYPES.has(type)) for (const unit of UNIT_GROUPS[name] ?? [name]) units.set(unit, key);
  }
  return { functions, units };
}

// each message names the CSS, its feature and key, and the date it reached the browsers and the latest allowed, or the
// browsers it is not in
const messages = ruleMessages(ruleName, {
  recent: (what: string, reached: string, threshold: string, months: number) =>
    `${what} reached every declared browser on ${reached}, after ${threshold}, ${months} months before today`,
  missing: (what: string, lacking: string) => `${what} is not in every declared browser: not in ${lacking}`,
  unbaselined: (what: string, discouraged: boolean) =>
    `${what} is in every declared browser, but web-features gives it no Baseline${discouraged ? ' (discouraged)' : ''}`,
  unknown: (key: string) => `allowed ${key} is no CSS key of web-features: take it out of the rule's allowed`,
  needless: (key: string, threshold: string) =>
    `allowed ${key} has been in every declared browser since ${threshold} or before: take it out of the rule's allowed`,
  unused: (key: string) => `allowed ${key} lets nothing of the stylesheet through: take it out of the rule's allowed`,
});

// the CSS read for its pieces, strings, comments and url()'s address left out
const blanked = (css: string): string =>
  css
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
    .replaceAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, '""')
    .replaceAll(/url\([^)]*\)/giu, 'url()');
const FUNCTION = /(?<![\w-])(?<name>[a-z][\w-]*)\(/giu;
const DASHED_FUNCTION = /(?<![\w-])(?<name>--[\w-]+)\(/gu;
const KEYWORD = /(?<![\w#.-])(?<name>-?[a-z_][\w-]*)(?![\w(-])/giu;
const UNIT = /(?<![\w#.-])[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?<name>[a-z]+)/giu;
const PSEUDO = /::?(?<name>[a-z][\w-]*)/giu;
const ATTRIBUTE = /\[[^\]]*\]/gu;
const MEDIA_FEATURE = /\(\s*(?:(?:min|max)-)?(?<name>[a-z-][\w-]*)\s*[:)]/giu;
const MEDIA_RANGE = /\([^():]*[<>=][^():]*\)/u;

// a value's own words, each function left out with what it takes, as @eslint/css reads a value's keywords
const CALL = /[\w-]*\([^()]*\)/gu;
function topLevel(css: string): string {
  let out = css;
  for (let before = ''; before !== out;) {
    before = out;
    out = out.replaceAll(CALL, ' ');
  }
  return out;
}

// a value's parts at its top level, split at its spaces and commas, a function whole
function parts(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let part = '';
  for (const c of css) {
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (depth === 0 && /[\s,]/u.test(c)) {
      if (part !== '') out.push(part);
      part = '';
    } else part += c;
  }
  if (part !== '') out.push(part);
  return out;
}

const names = (pattern: RegExp, text: string): string[] =>
  [...text.matchAll(pattern)].flatMap((m) => (m.groups?.['name'] === undefined ? [] : [m.groups['name']]));

// the selector keys a selector names, each with its spelling: its pseudo-classes and pseudo-elements, and nesting for
// an &
const selectorKeys = (selector: string): ReadonlyMap<string, string> => {
  const css = blanked(selector).replaceAll(ATTRIBUTE, '[]');
  const out = new Map<string, string>();
  for (const m of css.matchAll(PSEUDO)) out.set((m.groups?.['name'] ?? '').toLowerCase(), m[0]);
  if (css.includes('&')) out.set('nesting', '&');
  return out;
};

// the longhands a shorthand's keyword may be one of, where the data keys it under the longhand alone
const LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  font: ['font-family', 'font-style', 'font-weight', 'font-variant', 'font-stretch', 'font-size', 'line-height'],
  'text-decoration': [
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-color',
    'text-decoration-thickness',
  ],
  background: [
    'background-color',
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-attachment',
    'background-origin',
    'background-clip',
  ],
  transition: ['transition-timing-function', 'transition-behavior'],
  animation: [
    'animation-timing-function',
    'animation-direction',
    'animation-fill-mode',
    'animation-play-state',
    'animation-iteration-count',
  ],
  'list-style': ['list-style-type', 'list-style-position'],
  'text-wrap': ['text-wrap-mode', 'text-wrap-style'],
  'white-space': ['white-space-collapse', 'text-wrap-mode'],
};

// text-decoration's parts: a line, a thickness, or else a style or a colour, each of which the data keys the
// shorthand's taking by (includes_thickness, includes_color-and-style)
const LINES = new Set(['none', 'underline', 'overline', 'line-through', 'blink', 'spelling-error', 'grammar-error']);
const THICKNESS =
  /^(?:auto|from-font|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:[a-z]+|%)?|(?:calc|min|max|clamp)\(.*\))$/iu;
const UNKNOWN_PART = /^(?:var|env|attr)\(/iu;
const SHORTHAND = 'css.properties.text-decoration';

// a piece of the CSS the data has a key for: the key, and the CSS as the message says it
type Piece = { readonly key: string; readonly what: string };

// what an @supports tests for: by each property tested, the keys its tested value is read as (the property's own
// among them); and the selectors' keys
type Guard = { readonly properties: ReadonlyMap<string, ReadonlySet<string>>; readonly selectors: ReadonlySet<string> };
const NO_GUARD: Guard = { properties: new Map(), selectors: new Set() };

// both guards: what an `and` tests, and an @supports inside another
function union(guards: readonly Guard[]): Guard {
  const properties = new Map<string, Set<string>>();
  for (const guard of guards)
    for (const [property, keys] of guard.properties)
      properties.set(property, new Set([...(properties.get(property) ?? []), ...keys]));
  return { properties, selectors: new Set(guards.flatMap((guard) => [...guard.selectors])) };
}

// what each side tests: an `or`, which holds where the browser has one side only
function intersection([first, ...others]: readonly Guard[]): Guard {
  if (first === undefined) return NO_GUARD;
  const properties = new Map<string, Set<string>>();
  for (const [property, keys] of first.properties) {
    const each = others.map((guard) => guard.properties.get(property));
    if (each.every((other) => other !== undefined))
      properties.set(property, new Set([...keys].filter((key) => each.every((other) => other.has(key)))));
  }
  const selectors = [...first.selectors].filter((key) => others.every((guard) => guard.selectors.has(key)));
  return { properties, selectors: new Set(selectors) };
}

// the at-rules whose block holds descriptors, not properties: a declaration in @media, @supports, @container, @layer,
// @scope or @starting-style is a property's
const DESCRIPTORS = new Set([
  'font-face',
  'property',
  'counter-style',
  'page',
  'font-palette-values',
  'font-feature-values',
  'view-transition',
  'position-try',
]);

const DECLARATION = /^(?<property>-?-?[a-z][\w-]*)\s*:(?<value>[\s\S]*)$/iu;
const FEATURE_FUNCTION = /^(?<name>[a-z][\w-]*)\((?<inside>[\s\S]*)\)$/iu;

export const rule: stylelint.Rule<true, { readonly months?: unknown; readonly allowed?: unknown } | undefined> =
  (primary, secondary) => (root, result) => {
    const valid = validateOptions(
      result,
      ruleName,
      { actual: primary, possible: [true] },
      { actual: secondary, possible: { months: [isMonths], allowed: [isKey] } },
      // months is required, which the object's own possible cannot say
      { actual: secondary?.months, possible: isMonths },
      // allowed is a list: a string, which the object's possible checks as one key, would be read as its characters
      { actual: secondary?.allowed, possible: Array.isArray, optional: true },
    );
    const months = secondary?.months;
    const listed = secondary?.allowed ?? [];
    // validateOptions checks nothing where the config turns validation off
    if (!valid || !isMonths(months) || !isKeys(listed)) return;
    const allowed = new Map(listed.map((key) => [key.toLowerCase(), key]));
    const used = new Set<string>();
    const threshold = monthsAgo(months);
    const data = known();
    const has = (key: string): boolean => data.supports.has(key.toLowerCase());

    // the message for the key's feature where it is not in every declared browser, or reached them after the threshold
    const refusal = (key: string, what: string): string | undefined => {
      const support = data.supports.get(key.toLowerCase());
      if (support === undefined) return undefined;
      const said = `${what} (web-features' "${support.feature}", ${support.key})`;
      if (support.reached === undefined) return messages.missing(said, support.missing.join(', '));
      if (!support.baseline) return messages.unbaselined(said, support.discouraged);
      return support.reached > threshold ? messages.recent(said, support.reached, threshold, months) : undefined;
    };
    // reports the refusal at its node's start, the line a suppression on the line before covers however a value or a
    // list of selectors is laid out, but of an allowed key, which it records as used; saying whether there was one
    const check = (node: Node, { key, what }: Piece): boolean => {
      const message = refusal(key, what);
      if (message === undefined) return false;
      if (allowed.has(key.toLowerCase())) used.add(key.toLowerCase());
      else report({ ruleName, result, node, message });
      return true;
    };

    // a value's functions and units, which are what they are under any property but for a property's own function
    const calls = (property: string, css: string): Piece[] => {
      const out: Piece[] = [];
      for (const name of names(FUNCTION, css)) {
        const own = `css.properties.${property}.${name}_function`;
        const key = has(own) ? own : data.functions.get(name.toLowerCase());
        if (key !== undefined) out.push({ key, what: `function "${name}()"` });
      }
      for (const name of names(DASHED_FUNCTION, css))
        out.push({ key: 'css.types.dashed-function', what: `function "${name}()"` });
      for (const name of names(UNIT, css)) {
        const key = data.units.get(name.toLowerCase());
        if (key !== undefined) out.push({ key, what: `unit "${name}"` });
      }
      return out;
    };
    // a value's keywords, as its property, or a longhand of it, takes them, and its shape where the data keys one
    const words = (prop: string, property: string, css: string): Piece[] => {
      const out = names(KEYWORD, topLevel(css)).map((name): Piece => {
        const keyword = name.toLowerCase();
        const key =
          [property, ...(LONGHANDS[property] ?? [])].map((p) => `css.properties.${p}.${keyword}`).find(has) ??
          `css.types.global_keywords.${keyword}`;
        return { key, what: `keyword "${name}" of "${prop}"` };
      });
      const each = parts(css);
      if (property !== 'text-decoration' || each.some((part) => UNKNOWN_PART.test(part) || isGlobal(part))) return out;
      const styled = each.find((part) => !LINES.has(part.toLowerCase()) && !THICKNESS.test(part));
      const thick = each.find((part) => THICKNESS.test(part));
      if (styled !== undefined)
        out.push({
          key: `${SHORTHAND}.includes_color-and-style`,
          what: `"${prop}" with a style or colour`,
        });
      if (thick !== undefined) out.push({ key: `${SHORTHAND}.includes_thickness`, what: `"${prop}" with a thickness` });
      return out;
    };
    const isGlobal = (part: string): boolean => has(`css.types.global_keywords.${part}`);
    // each piece of a value, as its property takes it
    const pieces = (prop: string, value: string): Piece[] => {
      const property = prop.toLowerCase();
      const css = blanked(value);
      return property.startsWith('--')
        ? calls(property, css)
        : [...calls(property, css), ...words(prop, property, css)];
    };

    // what a condition of an @supports tests for, its parts at the top level: a test under `not` guards nothing, and
    // an `or` only what each side tests
    const tested = (condition: string): Guard => {
      const each = parts(condition.trim());
      if (each[0]?.toLowerCase() === 'not') return NO_GUARD;
      const terms = each.filter((_, i) => i % 2 === 0).map(test);
      const or = each.some((part, i) => i % 2 === 1 && part.toLowerCase() === 'or');
      return or ? intersection(terms) : union(terms);
    };
    // one test: a declaration in parentheses, a condition in them, a selector(), or a function guarding nothing here
    // (font-tech(), font-format(), at-rule())
    const test = (part: string): Guard => {
      if (part.startsWith('(') && part.endsWith(')')) {
        const inside = part.slice(1, -1).trim();
        const declaration = DECLARATION.exec(inside)?.groups;
        if (declaration?.['property'] === undefined) return tested(inside);
        const property = declaration['property'].toLowerCase();
        const keys = pieces(property, declaration['value'] ?? '').map((piece) => piece.key.toLowerCase());
        return { properties: new Map([[property, new Set(keys)]]), selectors: new Set() };
      }
      const feature = FEATURE_FUNCTION.exec(part)?.groups;
      if (feature?.['name']?.toLowerCase() !== 'selector') return NO_GUARD;
      return { properties: new Map(), selectors: new Set(selectorKeys(feature['inside'] ?? '').keys()) };
    };

    // what each @supports tests for, by each node under it, an outer one's with it
    const guards = new Map<unknown, Guard>();
    root.walkAtRules(/^supports$/iu, (at) => {
      const guard = union([guards.get(at) ?? NO_GUARD, tested(blanked(at.params))]);
      at.walk((node) => {
        guards.set(node, guard);
      });
    });

    // an allowed key the data does not have, or that nothing would refuse, is refused, as a needless suppression is
    for (const key of allowed.values())
      if (!has(key)) report({ ruleName, result, node: root, message: messages.unknown(key) });
      else if (refusal(key, key) === undefined)
        report({ ruleName, result, node: root, message: messages.needless(key, threshold) });

    root.walkDecls((decl) => {
      const property = decl.prop.toLowerCase();
      const guarded = (guards.get(decl) ?? NO_GUARD).properties.get(property);
      const { parent } = decl;
      if (parent?.type === 'atrule' && 'name' in parent && typeof parent.name === 'string') {
        const at = parent.name.toLowerCase();
        if (DESCRIPTORS.has(at)) {
          for (const piece of calls(property, blanked(decl.value))) check(decl, piece);
          const descriptor = `css.at-rules.${at}.${property}`;
          check(decl, { key: descriptor, what: `descriptor "${decl.prop}" of "@${parent.name}"` });
          return;
        }
      }
      const own = `css.properties.${property}`;
      // a property refused, its keywords are not: they would be refused with it
      if (guarded === undefined && check(decl, { key: own, what: `property "${decl.prop}"` })) {
        for (const piece of calls(property, blanked(decl.value))) check(decl, piece);
        return;
      }
      for (const piece of pieces(decl.prop, decl.value))
        if (guarded?.has(piece.key.toLowerCase()) !== true) check(decl, piece);
    });

    root.walkAtRules((at) => {
      const name = at.name.toLowerCase();
      check(at, { key: `css.at-rules.${name}`, what: `at-rule "@${at.name}"` });
      if (name !== 'media') return;
      const params = blanked(at.params);
      for (const feature of names(MEDIA_FEATURE, params))
        check(at, {
          key: `css.at-rules.media.${feature.toLowerCase()}`,
          what: `media feature "${feature}"`,
        });
      if (MEDIA_RANGE.test(params))
        check(at, { key: 'css.at-rules.media.range_syntax', what: "a media query's range syntax" });
    });

    root.walkRules((cssRule) => {
      const { selectors } = guards.get(cssRule) ?? NO_GUARD;
      for (const [key, written] of selectorKeys(cssRule.selector))
        if (!selectors.has(key)) check(cssRule, { key: `css.selectors.${key}`, what: `selector "${written}"` });
    });

    // an allowed key that let nothing through: the stylesheet no longer writes what it was for
    for (const [lower, key] of allowed)
      if (has(key) && refusal(key, key) !== undefined && !used.has(lower))
        report({ ruleName, result, node: root, message: messages.unused(key) });
  };
rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: 'https://github.com/clombion/kiz-radar/blob/main/docs/concepts/lint-rules.md' };

// ISO day `months` months before the clock's today, the day clamped to the month's last
function monthsAgo(months: number): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(now.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}

function isMonths(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('css.');
}
const isKeys = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(isKey);

// the data, read once: each CSS key's support in the declared browsers, and the keys of functions and units by name
type Known = {
  readonly supports: ReadonlyMap<string, Support>;
  readonly functions: ReadonlyMap<string, string>;
  readonly units: ReadonlyMap<string, string>;
};
let read: Known | undefined;
function known(): Known {
  if (read === undefined) {
    const all = supports(declared());
    read = { supports: all, ...tables(all) };
  }
  return read;
}
