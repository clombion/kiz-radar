// The stylesheets against the page and its modules: what stylelint's rules (.stylelintrc.yaml) don't see.
import { expect, test } from 'vitest';
import { MEDIA } from '../../site/media.ts';
import { code, css, pages } from './sources.ts';

const URLS = /url\([^)]*\)/gu;
const CLASS = /\.(?<name>-?[A-Za-z_][\w-]*)/gu;
// a view transition's class (::view-transition-group(.card)), which script sets on an element's
// view-transition-class, not its class
const TRANSITION = /::view-transition-[\w-]+\((?<names>[^)]*)\)/gu;
const TRANSITION_SET = /'view-transition-class',\s*'(?<name>[\w-]+)'/gu;

// Where code gives an element a class: JSX's class="…" or class={…}, an option or parameter named class or cls
// (choices(…, { class: 'plain' }), cls = 'blank'), or an argument where a function's parameter is typed ClassName or
// Classes (note('note-tab', …)), or a page's markup giving it to an element. A name quoted anywhere else (a type's
// member, readonly class: 'tabs' | 'subnav', among them), or in a comment, is not counted, which fails safe: the test
// calls the class unused.
const GIVEN = /(?<!readonly\s+)\b(?:class|cls)\s*[:=](?![=>])\s*/gu;
const PARAMETER = /^\s*\w+\s*:\s*(?:Classes|ClassName|Extract<ClassName)\b/u;
const DEFINED_FN = /(?:function\s+|const\s+)(?<fn>\w+)\s*(?:=\s*(?:<[^>]*>\s*)?)?\(/gu;
const CLASS_ATTRIBUTE = /\sclass="[^"]*"/gu;
// the class names an expression quotes: its strings, a double-quoted one's words, and the keys of its objects
const QUOTED = /'(?<name>[\w-]+)'|"(?<names>[^"]*)"|(?<=[{,]\s*)(?<key>[\w-]+)\s*:/gu;
// the expression that starts at i: a bracketed one to its closing bracket, a string to its end, else to the comma,
// semicolon or closing bracket that ends it
function expressionAt(src: string, i: number): string {
  const open = src[i] ?? '';
  if (open === '"' || open === "'") return src.slice(i, src.indexOf(open, i + 1) + 1);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j] ?? '';
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (depth === 0) return src.slice(i, j);
      depth--;
      if (depth === 0 && '([{'.includes(open)) return src.slice(i, j + 1);
    } else if ((ch === ',' || ch === ';') && depth === 0) return src.slice(i, j);
  }
  return src.slice(i);
}
// a bracketed list's items: split at its commas, not at those inside brackets
function itemsOf(list: string): string[] {
  const out = [''];
  let depth = 0;
  for (const ch of list.slice(1, -1)) {
    depth += '([{'.includes(ch) ? 1 : ')]}'.includes(ch) ? -1 : 0;
    if (ch === ',' && depth === 0) out.push('');
    else out[out.length - 1] += ch;
  }
  return out;
}
const namesIn = (expr: string) =>
  [...expr.matchAll(QUOTED)].flatMap(({ groups }) => [
    ...(groups?.['names']?.split(' ') ?? []),
    groups?.['name'] ?? groups?.['key'] ?? '',
  ]);
// the classes each module gives: in its class positions, and as the arguments to its own functions', or those it
// imports', parameters typed a class
function given(): Set<string> {
  const named = new Set<string>();
  const taking = new Map<string, { readonly file: string; readonly at: readonly number[] }>();
  for (const [file, src] of code) {
    for (const m of src.matchAll(GIVEN))
      for (const n of namesIn(expressionAt(src, m.index + m[0].length))) named.add(n);
    for (const m of src.matchAll(DEFINED_FN)) {
      const at = itemsOf(expressionAt(src, m.index + m[0].length - 1)).flatMap((p, i) =>
        PARAMETER.test(p) ? [i] : [],
      );
      if (at.length > 0) taking.set(m.groups?.['fn'] ?? '', { file, at });
    }
  }
  for (const [fn, { file, at }] of taking)
    for (const [f, src] of code) {
      const imported = new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '\\./${file}'`, 'u');
      if (!(f === file || imported.test(src))) continue;
      for (const m of src.matchAll(new RegExp(`(?<![\\w.])${fn}\\(`, 'gu'))) {
        const args = itemsOf(expressionAt(src, m.index + m[0].length - 1));
        for (const i of at) for (const n of namesIn(args[i] ?? '')) named.add(n);
      }
    }
  for (const p of pages) for (const m of p.matchAll(CLASS_ATTRIBUTE)) for (const n of namesIn(m[0])) named.add(n);
  named.delete('');
  return named;
}

test('every CSS class is given to an element by the page or a module', () => {
  const named = given(),
    transitions = new Set(
      [...code.values()].flatMap((src) => [...src.matchAll(TRANSITION_SET)].map((m) => m.groups?.['name'] ?? '')),
    );
  const unused: string[] = [];
  for (const [file, text] of css) {
    const sheet = text.replace(URLS, '');
    for (const m of sheet.matchAll(TRANSITION))
      for (const t of [...(m.groups?.['names'] ?? '').matchAll(CLASS)].map((c) => c.groups?.['name'] ?? ''))
        if (!transitions.has(t)) unused.push(`${file}: the view transition's .${t}`);
    for (const cls of new Set([...sheet.replace(TRANSITION, '').matchAll(CLASS)].map((m) => m.groups?.['name'] ?? '')))
      if (!(cls.startsWith('leaflet-') || named.has(cls))) unused.push(`${file}: .${cls}`);
  }
  expect([...new Set(unused)]).toEqual([]);
});

// Rules keyed by their media context and selector; a second rule for the same key means one silently overrides the
// other. stylelint's no-duplicate-selectors sees a selector twice in one block; this also sees it in two blocks of the
// same media query, and inside a selector list.
interface Rule {
  readonly media: string;
  readonly selectors: readonly string[];
  readonly body: string;
}
const BLOCK = /(?<head>[^{}]*)\{|\}/gu;
const SPACES = /\s+/gu;
const TOKEN = /(?<name>--[\w-]+)\s*:/gu;
// a selector list's selectors: split at its commas, not at those inside :is() or :not()
function selectorsOf(head: string): string[] {
  const out = [''];
  let depth = 0;
  for (const ch of head) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (ch === ',' && depth === 0) out.push('');
    else out[out.length - 1] += ch;
  }
  return out.map((s) => s.trim().replace(SPACES, ' '));
}
function rules(text: string): Rule[] {
  const out: Rule[] = [];
  let media = '',
    depth = 0;
  for (const m of text.matchAll(BLOCK)) {
    if (m[0] === '}') {
      depth--;
      if (depth === 0) media = '';
      continue;
    }
    const head = (m.groups?.['head'] ?? '').trim();
    depth++;
    if (head.startsWith('@')) {
      media = head;
      continue;
    }
    const body = text.slice(m.index + m[0].length, text.indexOf('}', m.index));
    out.push({ media, selectors: selectorsOf(head), body });
  }
  return out;
}

// what is defined twice across the stylesheets: each definition as [what it is, the key it must be alone under], with
// the files of both
function twice(defined: (r: Rule) => (readonly [string, string])[]): string[] {
  const seen = new Map<string, string>(),
    dup: string[] = [];
  for (const [file, text] of css)
    for (const r of rules(text))
      for (const [what, key] of defined(r)) {
        const before = seen.get(key);
        if (before === undefined) seen.set(key, file);
        else dup.push(`${what} (${before} and ${file})`);
      }
  return dup;
}

test('no selector has two rules in the same media context', () => {
  expect(twice((r) => r.selectors.map((s) => [`${r.media} ${s}`.trim(), `${r.media} ${s}`]))).toEqual([]);
});

test('each design token is defined once in its context', () => {
  const tokens = (r: Rule) => [...r.body.matchAll(TOKEN)].map(({ groups }) => groups?.['name'] ?? '');
  expect(twice((r) => tokens(r).map((name) => [name, `${r.media} ${r.selectors.join(',')} ${name}`]))).toEqual([]);
});

test('the rules see a selector repeated in a second block of one media query, and inside a selector list', () => {
  const r = rules('@media (x) { .a { color: red; } } @media (x) { .b, .a { color: blue; } }');
  expect(r.map((x) => `${x.media} ${x.selectors.join('|')}`)).toEqual(['@media (x) .a', '@media (x) .b|.a']);
  expect(selectorsOf('a:is(.b, .c), .d')).toEqual(['a:is(.b, .c)', '.d']);
});

// The design tokens: each defined is read, by a rule or by the code (bits.ts styled, css() in the map), and each
// read without a fallback is defined, by a rule or by the code.
const DEFINED = /(?<name>--[\w-]+)\s*:/gu;
const READ = /var\((?<name>--[\w-]+)(?<fallback>\s*,)?/gu;
const IN_CODE = /'(?<name>--[\w-]+)'/gu;
const names = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m.groups?.['name'] ?? '');
test('every design token is read, and every one read is defined', () => {
  const sheets = [...css.values()].join('\n'),
    inCode = new Set([...code.values()].flatMap((src) => names(src, IN_CODE)));
  const defined = new Set(names(sheets, DEFINED)),
    read = new Set(names(sheets, READ));
  const unread = [...defined].filter((t) => !(read.has(t) || inCode.has(t)));
  const undefinedRead = [...sheets.matchAll(READ)]
    .filter((m) => m.groups?.['fallback'] === undefined)
    .map((m) => m.groups?.['name'] ?? '')
    .filter((t) => !(defined.has(t) || inCode.has(t)));
  expect({ unread, undefinedRead: [...new Set(undefinedRead)] }).toEqual({ unread: [], undefinedRead: [] });
});

// Motion, stacking and colour come from the scales in :root (durations, curves, z-index, colours), so reduced motion
// zeroes every duration in one rule, no layer lands on another by accident, and dark mode recolours every rule.
const DECLARATION = /(?<prop>[\w-]+)\s*:\s*(?<value>[^;{}]*);/gu;
const DURATION = /(?<![\w.-])\d*\.?\d+m?s\b/u;
const COLOUR = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\((?!var\()/iu;
test('durations, curves, layers and colours are the tokens', () => {
  const literal: string[] = [];
  for (const [file, text] of css)
    for (const m of text.matchAll(DECLARATION)) {
      const prop = m.groups?.['prop'] ?? '',
        value = m.groups?.['value'] ?? '';
      if (prop.startsWith('--')) continue; // the scales themselves
      if (
        (/^(?:transition|animation)/u.test(prop) && DURATION.test(value)) ||
        value.includes('cubic-bezier') ||
        (prop === 'z-index' && value !== '0' && !value.startsWith('var(')) ||
        COLOUR.test(value)
      )
        literal.push(`${file}: ${prop}: ${value}`);
    }
  expect(literal).toEqual([]);
});

// The cards that float beside what opened them on a wide screen (a roster's names, a day's popover) are placed by
// script at media.ts's WIDE, and laid out by the stylesheet at its own @media: one width, or a card floats unstyled.
test('the community page’s cards float at the one width the stylesheet lays them out by', () => {
  const floating = [...css.values()]
    .flatMap(rules)
    .filter((r) => r.media.includes('min-width') && r.selectors.some((s) => /^\.(?:gantt|day-pop)/u.test(s)));
  expect(floating.length).toBeGreaterThan(0);
  expect(new Set(floating.map((r) => r.media))).toEqual(new Set([`@media ${MEDIA.WIDE}`]));
});

// Every media query the script reads (media.ts) is one of the stylesheet's own, spelled the same: one condition, or
// the script and the stylesheet lay the page out at two.
test('every media query the script reads is one the stylesheet lays the page out by', () => {
  const queries = new Set([...css.values()].flatMap(rules).map((r) => r.media));
  expect(Object.values(MEDIA).filter((q) => !queries.has(`@media ${q}`))).toEqual([]);
});
