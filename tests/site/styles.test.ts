// The stylesheets against the page and its modules: what Biome's CSS rules don't see.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { WIDE } from '../../site/dismiss.ts';
import { Drawing } from '../../site/icons.ts';
import { code, css, pages } from './sources.ts';

const URLS = /url\([^)]*\)/gu;
const CLASS = /\.(?<name>-?[A-Za-z_][\w-]*)/gu;
const CLASS_ATTRIBUTE = /\sclass="(?<names>[^"]*)"/gu;

// A class is used when a module names it, quoted, where ClassName (site/classes.ts, generated from these stylesheets)
// types it, or a page's markup gives it to an element: not when a comment or another word happens to contain it.
test('every CSS class is given to an element by the page or a module', () => {
  const named = new Set(
    [...code.values()].flatMap((src) => [...src.matchAll(/'(?<name>[\w-]+)'/gu)].map((m) => m.groups?.['name'] ?? '')),
  );
  for (const m of pages.flatMap((p) => [...p.matchAll(CLASS_ATTRIBUTE)]))
    for (const n of (m.groups?.['names'] ?? '').split(' ')) named.add(n);
  const unused: string[] = [];
  for (const [file, text] of css)
    for (const cls of new Set([...text.replace(URLS, '').matchAll(CLASS)].map((m) => m.groups?.['name'] ?? '')))
      if (!(cls.startsWith('leaflet-') || named.has(cls))) unused.push(`${file}: .${cls}`);
  expect(unused).toEqual([]);
});

// Rules keyed by their media context and selector; a second rule for the same key means one silently overrides the
// other. Biome's noDuplicateSelectors sees a selector twice in one block; this also sees it in two blocks of the same
// media query, and inside a selector list.
interface Rule {
  media: string;
  selectors: string[];
  body: string;
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

// The design tokens: each defined is read, by a rule or by the code (h()'s style object, css() in the map), and each
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
// script at ui.ts's WIDE, and laid out by the stylesheet at its own @media: one width, or a card floats unstyled.
test('the community page’s cards float at the one width the stylesheet lays them out by', () => {
  const floating = [...css.values()]
    .flatMap(rules)
    .filter((r) => r.media.includes('min-width') && r.selectors.some((s) => /^\.(?:gantt|day-pop)/u.test(s)));
  expect(floating.length).toBeGreaterThan(0);
  expect(new Set(floating.map((r) => r.media))).toEqual(new Set([`@media ${WIDE}`]));
});

// The share card draws the drawings it has in common with the site from site/icons.ts (design/render.cjs gives them
// to it), never from a copy of their paths that would drift; and the site draws each once.
test('the share card and the site draw their common icons from one source', () => {
  const card = readFileSync(new URL('../../design/share-card.html', import.meta.url), 'utf8');
  const paths = [Drawing.PEOPLE, Drawing.PLANE, Drawing.RING].flatMap((d) =>
    [...d.svg.matchAll(/ d="(?<d>[^"]+)"/gu)].map((m) => m.groups?.['d'] ?? ''),
  );
  expect(paths.length).toBeGreaterThan(3);
  expect(paths.filter((d) => card.includes(d))).toEqual([]);
  expect(Drawing.LUCIDE['users']).toBe(Drawing.PEOPLE);
});
