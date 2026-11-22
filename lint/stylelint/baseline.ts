// house/baseline, the stylesheet's browser check: a CSS feature site.css uses must have been in every browser
// package.json's browserslist declares for at least `months` months (.stylelintrc.yaml sets 12), by web-features
// (WebDX's Baseline data). The browsers are Baseline's core set, each at its latest version; the date a feature reached
// them all is the latest of the releases its support names in each, which is web-features' baseline_low_date for that
// set. One not in some declared browser, or that web-features gives no Baseline (baseline false: missing somewhere, or
// discouraged), is refused whatever its date. Today is the clock's. The `allowed` option names BCD keys let through
// everywhere, each with its reason in .stylelintrc.yaml; one the data lacks, or that nothing would refuse, is refused, so
// the list cannot outlive its reasons.
//
// The CSS is read as @eslint/css's use-baseline reads it, each piece looked up by its BCD key, web-features' status of
// that key (status.by_compat_key): a property (css.properties.<p>) and a keyword of its value
// (css.properties.<p>.<keyword>) or a global keyword (css.types.global_keywords.<k>); a function of a value
// (css.types.<f>, or css.types.<type>.<f> for a type's functions: colours, gradients, images, filters, easings, shapes,
// transforms) and a unit (css.types.length.<u>, the angles and resolutions, the viewport and container units by their
// group); an at-rule (css.at-rules.<a>), a descriptor of one (css.at-rules.<a>.<d>), a media feature
// (css.at-rules.media.<f>) and the range syntax of a media query; a pseudo-class or pseudo-element
// (css.selectors.<s>) and the nesting selector. What an @supports around it tests for (a property, a selector()) is
// not checked, as it applies only where the browser has it. What the data has no key for (a vendor prefix, an
// identifier of a value that names no keyword of its property, a custom property's name) is let through: other rules
// refuse the unknown, and this one refuses only what the data dates. docs/concepts/lint-rules.md says what it covers.
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
const BROWSERSLIST: Readonly<Record<string, Browser>> = {
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  safari: 'safari',
  ios_saf: 'safari_ios',
  and_chr: 'chrome_android',
  and_ff: 'firefox_android',
};
const QUERY = /^last 1 (?<name>\w+) version$/u;

// the browsers package.json declares, each its latest version: `last 1 <browser> version`, a core browser of Baseline
function declared(): readonly Browser[] {
  const text = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(text);
  const queries: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'browserslist') : undefined;
  if (!Array.isArray(queries) || queries.length === 0)
    throw new TypeError('package.json declares its browsers in browserslist');
  return queries.map((query: unknown) => {
    const name = typeof query === 'string' ? QUERY.exec(query)?.groups?.['name'] : undefined;
    const browser = name === undefined ? undefined : BROWSERSLIST[name];
    if (browser === undefined)
      throw new TypeError(`browserslist's ${String(query)} is no "last 1 <browser> version" of Baseline's core set`);
    return browser;
  });
}

// what web-features says of a BCD key: the feature it belongs to, the date it reached every declared browser (none
// while one lacks it), the browsers that lack it, and whether it is Baseline at all
type Support = {
  readonly feature: string;
  readonly key: string;
  readonly reached: string | undefined;
  readonly missing: readonly string[];
  readonly baseline: boolean;
  readonly discouraged: boolean;
};

// each CSS key of the data, by key
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
      const missing = declaredBrowsers.filter((_, i) => dates[i] === undefined).map((b) => browsers[b].name);
      const reached =
        missing.length > 0 ? undefined : dates.toSorted((a, b) => (a ?? '').localeCompare(b ?? '')).at(-1);
      out.set(key, {
        feature: data.name,
        key,
        reached,
        missing,
        baseline: status.baseline !== false,
        discouraged: data.discouraged !== undefined,
      });
    }
  }
  return out;
}

// the keys of the value functions: a type's own (css.types.calc), and one of a type that holds functions
// (css.types.color.oklch), which wins where a name is both (color(), shape())
const FUNCTION_TYPES = new Set([
  'basic-shape',
  'color',
  'easing-function',
  'filter-function',
  'gradient',
  'image',
  'transform-function',
]);
// the units BCD keys by a group of theirs
const UNIT_GROUPS: Readonly<Record<string, readonly string[]>> = {
  viewport_percentage_units_dynamic: ['dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax'],
  viewport_percentage_units_large: ['lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax'],
  viewport_percentage_units_small: ['svw', 'svh', 'svi', 'svb', 'svmin', 'svmax'],
  container_query_length_units: ['cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax'],
};
const UNIT_TYPES = new Set(['length', 'angle', 'resolution']);

// the keys by the CSS that names them: functions and units, whose keys are not their names
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
      if (!functions.has(type)) functions.set(type, key);
    } else if (FUNCTION_TYPES.has(type)) functions.set(name, key);
    else if (UNIT_TYPES.has(type)) for (const unit of UNIT_GROUPS[name] ?? [name]) units.set(unit.toLowerCase(), key);
  }
  return { functions, units };
}

// each message names the CSS, its feature and key, and the date it reached the browsers and the latest allowed, or the
// browsers it is not in
const messages = ruleMessages(ruleName, {
  recent: (what: string, reached: string, threshold: string, months: number) =>
    `${what} reached every declared browser on ${reached}, after ${threshold}, ${months} months before today`,
  missing: (what: string, why: string) => `${what} is not in every declared browser: ${why}`,
  unknown: (key: string) => `allowed ${key} is no CSS key of web-features: take it out of the rule's allowed`,
  needless: (key: string, threshold: string) =>
    `allowed ${key} has been in every declared browser since ${threshold} or before: take it out of the rule's allowed`,
});

// the CSS read for its pieces, strings, comments and url()'s address left out
const blanked = (css: string): string =>
  css
    .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
    .replaceAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/gu, '""')
    .replaceAll(/url\([^)]*\)/giu, 'url()');
const FUNCTION = /(?<![\w-])(?<name>[a-z][\w-]*)\(/giu;
const KEYWORD = /(?<![\w#.!-])(?<name>-?[a-z_][\w-]*)(?![\w(-])/giu;
const UNIT = /(?<![\w#.-])[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?<name>[a-z]+)/giu;
const PSEUDO = /::?(?<name>[a-z][\w-]*)/giu;
const ATTRIBUTE = /\[[^\]]*\]/gu;
const MEDIA_FEATURE = /\(\s*(?:(?:min|max)-)?(?<name>[a-z-][\w-]*)\s*[:)]/giu;
const MEDIA_RANGE = /\([^():]*[<>=][^():]*\)/u;
const SUPPORTS_PROPERTY = /\(\s*(?<name>[a-z-][\w-]*)\s*:/giu;
const SUPPORTS_SELECTOR = /selector\((?<selector>(?:[^()]|\([^()]*\))*)\)/giu;
const SUPPORTS_NOT = /\bnot\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/giu;

// a value's own pieces, what its functions take left out, as @eslint/css reads a value's keywords
const PARENTHESES = /\([^()]*\)/gu;
const PARENTHESIS = /\([^()]*\)/u;
function topLevel(css: string): string {
  let out = css;
  while (PARENTHESIS.test(out)) out = out.replaceAll(PARENTHESES, '');
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

// what an @supports tests for, as property names and selector keys, what a not() tests left out
type Guard = { readonly properties: ReadonlySet<string>; readonly selectors: ReadonlySet<string> };
const NO_GUARD: Guard = { properties: new Set(), selectors: new Set() };
function tested(params: string, outer: Guard): Guard {
  const css = blanked(params).replaceAll(SUPPORTS_NOT, ' ');
  const selectors = [...css.matchAll(SUPPORTS_SELECTOR)].flatMap((m) => [
    ...selectorKeys(m.groups?.['selector'] ?? '').keys(),
  ]);
  const properties = names(SUPPORTS_PROPERTY, css.replaceAll(SUPPORTS_SELECTOR, ' ')).map((n) => n.toLowerCase());
  return {
    properties: new Set([...outer.properties, ...properties]),
    selectors: new Set([...outer.selectors, ...selectors]),
  };
}

// ISO day `months` months before the clock's today, the day clamped to the month's last
function monthsAgo(months: number): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(now.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}

const isMonths = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0;

// the data, read once: each CSS key's support in the declared browsers, and the keys of functions and units by name
type Known = {
  readonly supports: ReadonlyMap<string, Support>;
  readonly functions: ReadonlyMap<string, string>;
  readonly units: ReadonlyMap<string, string>;
};
let read: Known | undefined;
const known = (): Known => {
  if (read === undefined) {
    const all = supports(declared());
    read = { supports: all, ...tables(all) };
  }
  return read;
};

const isKey = (value: unknown): boolean => typeof value === 'string' && value.startsWith('css.');

// months: how long a feature must have been in every declared browser; allowed: the BCD keys let through though
// refused, each with its reason beside it in .stylelintrc.yaml, and each refused itself once nothing refuses its key
type Options = { readonly months: number; readonly allowed?: readonly string[] };

export const rule: stylelint.Rule<true, Options> = (primary, secondary) => (root, result) => {
  const valid = validateOptions(
    result,
    ruleName,
    { actual: primary, possible: [true] },
    { actual: secondary, possible: { months: [isMonths], allowed: [isKey] } },
  );
  if (!valid || !isMonths(secondary.months)) return;
  const { months } = secondary;
  const allowed = new Set(secondary.allowed ?? []);
  const threshold = monthsAgo(months);
  const data = known();

  // what each @supports tests for, by each node under it
  const guards = new Map<unknown, Guard>();
  root.walkAtRules(/^supports$/iu, (at) => {
    const guard = tested(at.params, guards.get(at) ?? NO_GUARD);
    at.walk((node) => {
      guards.set(node, guard);
    });
  });

  // the message for the key's feature where it is not in every declared browser, or reached them after the threshold
  const refusal = (key: string, what: string): string | undefined => {
    const support = data.supports.get(key);
    if (support === undefined) return undefined;
    const said = `${what} (web-features' "${support.feature}", ${support.key})`;
    const { missing, reached } = support;
    if (missing.length > 0) return messages.missing(said, `not in ${missing.join(', ')}`);
    if (!support.baseline || reached === undefined)
      return messages.missing(said, `web-features gives it no Baseline${support.discouraged ? ', discouraged' : ''}`);
    return reached > threshold ? messages.recent(said, reached, threshold, months) : undefined;
  };
  // reports the refusal, but of an allowed key, saying whether there was one
  const check = (node: Node, key: string, what: string, word: string): boolean => {
    const message = refusal(key, what);
    if (message !== undefined && !allowed.has(key)) report({ ruleName, result, node, word, message });
    return message !== undefined;
  };

  // an allowed key the data does not have, or that nothing would refuse, is refused, as a needless suppression is
  for (const key of allowed)
    if (!data.supports.has(key)) report({ ruleName, result, node: root, message: messages.unknown(key) });
    else if (refusal(key, key) === undefined)
      report({ ruleName, result, node: root, message: messages.needless(key, threshold) });

  root.walkDecls((decl) => {
    const property = decl.prop.toLowerCase();
    const css = blanked(decl.value);
    for (const name of names(FUNCTION, css)) {
      const key = data.functions.get(name.toLowerCase());
      if (key !== undefined) check(decl, key, `function "${name}()"`, `${name}(`);
    }
    for (const name of names(UNIT, css)) {
      const key = data.units.get(name.toLowerCase());
      if (key !== undefined) check(decl, key, `unit "${name}"`, name);
    }
    if (property.startsWith('--')) return;
    const { parent } = decl;
    if (parent?.type === 'atrule' && 'name' in parent && typeof parent.name === 'string') {
      const descriptor = `css.at-rules.${parent.name.toLowerCase()}.${property}`;
      if (data.supports.has(descriptor)) {
        check(decl, descriptor, `descriptor "${decl.prop}" of "@${parent.name}"`, decl.prop);
        return;
      }
    }
    if ((guards.get(decl) ?? NO_GUARD).properties.has(property)) return;
    // a property refused, its keywords are not: they would be refused with it
    if (check(decl, `css.properties.${property}`, `property "${decl.prop}"`, decl.prop)) return;
    for (const name of names(KEYWORD, topLevel(css))) {
      const keyword = name.toLowerCase();
      const own = `css.properties.${property}.${keyword}`;
      const key = data.supports.has(own) ? own : `css.types.global_keywords.${keyword}`;
      check(decl, key, `keyword "${name}" of "${decl.prop}"`, name);
    }
  });

  root.walkAtRules((at) => {
    const name = at.name.toLowerCase();
    check(at, `css.at-rules.${name}`, `at-rule "@${at.name}"`, `@${at.name}`);
    if (name !== 'media') return;
    const params = blanked(at.params);
    for (const feature of names(MEDIA_FEATURE, params))
      check(at, `css.at-rules.media.${feature.toLowerCase()}`, `media feature "${feature}"`, feature);
    if (MEDIA_RANGE.test(params)) check(at, 'css.at-rules.media.range_syntax', "a media query's range syntax", '(');
  });

  root.walkRules((cssRule) => {
    const { selectors } = guards.get(cssRule) ?? NO_GUARD;
    for (const [key, written] of selectorKeys(cssRule.selector))
      if (!selectors.has(key)) check(cssRule, `css.selectors.${key}`, `selector "${written}"`, written);
  });
};
rule.ruleName = ruleName;
rule.messages = messages;
rule.meta = { url: 'https://github.com/clombion/kiz-radar/blob/main/docs/concepts/lint-rules.md' };
