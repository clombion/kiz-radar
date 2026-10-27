// The stylesheets against the page and its modules: what Biome's CSS rules don't see.
import { expect, test } from 'vitest';
import { css, html, modules } from './sources.ts';

const URLS = /url\([^)]*\)/gu;
const CLASS = /\.(?<name>-?[A-Za-z_][\w-]*)/gu;
const word = (w: string) => new RegExp(`(?<![\\w-])${w.replace(/[$]/gu, '\\$&')}(?![\\w-])`, 'u');

test('every CSS class is used by the page or its scripts', () => {
  const source = [...modules.values()].join('\n') + html;
  const unused: string[] = [];
  for (const [file, text] of css)
    for (const cls of new Set([...text.replace(URLS, '').matchAll(CLASS)].map((m) => m.groups?.['name'] ?? '')))
      if (!(cls.startsWith('leaflet-') || /^\d/u.test(cls) || word(cls).test(source))) unused.push(`${file}: .${cls}`);
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
    out.push({ media, selectors: head.split(',').map((s) => s.trim().replace(SPACES, ' ')), body });
  }
  return out;
}

test('no selector has two rules in the same media context', () => {
  const seen = new Map<string, string>(),
    dup: string[] = [];
  for (const [file, text] of css)
    for (const r of rules(text))
      for (const s of r.selectors) {
        const key = `${r.media} ${s}`;
        const before = seen.get(key);
        if (before === undefined) seen.set(key, file);
        else dup.push(`${key.trim()} (${before} and ${file})`);
      }
  expect(dup).toEqual([]);
});

test('each design token is defined once per theme', () => {
  const seen = new Map<string, string>(),
    dup: string[] = [];
  for (const [file, text] of css)
    for (const r of rules(text))
      for (const { groups } of r.body.matchAll(TOKEN)) {
        const name = groups?.['name'] ?? '';
        const key = `${r.media} ${r.selectors.join(',')} ${name}`;
        const before = seen.get(key);
        if (before === undefined) seen.set(key, file);
        else dup.push(`${name} (${before} and ${file})`);
      }
  expect(dup).toEqual([]);
});

test('the rules see a selector repeated in a second block of one media query, and inside a selector list', () => {
  const r = rules('@media (x) { .a { color: red; } } @media (x) { .b, .a { color: blue; } }');
  expect(r.map((x) => `${x.media} ${x.selectors.join('|')}`)).toEqual(['@media (x) .a', '@media (x) .b|.a']);
});
