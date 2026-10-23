// Structural checks on the static site: things JavaScript and CSS can't enforce themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DOCS = new URL('../docs/', import.meta.url);
const read = p => readFileSync(new URL(p, DOCS), 'utf8');
const js = Object.fromEntries(readdirSync(new URL('js/', DOCS)).filter(f => f.endsWith('.js')).map(f => [f, read('js/' + f)]));
const css = Object.fromEntries(readdirSync(new URL('css/', DOCS)).filter(f => f.endsWith('.css')).map(f => [f, read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '')]));
const html = read('index.html');
const word = w => new RegExp(`(?<![\\w-])${w.replace(/[$]/g, '\\$&')}(?![\\w-])`);

test('every export is imported by another module', () => {
  const unused = [];
  for (const [file, src] of Object.entries(js))
    for (const [, name] of src.matchAll(/^export (?:const|function|let|class) ([A-Za-z_$][\w$]*)/gm))
      if (!Object.entries(js).some(([f, s]) => f !== file && new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./${file}'`).test(s)))
        unused.push(`${file}: ${name}`);
  assert.deepEqual(unused, []);
});

test('every CSS class is used by the page or its scripts', () => {
  const source = Object.values(js).join('\n') + html;
  const unused = [];
  for (const [file, text] of Object.entries(css))
    for (const cls of new Set([...text.replace(/url\([^)]*\)/g, '').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(m => m[1])))
      if (!/^leaflet-/.test(cls) && !/^\d/.test(cls) && !word(cls).test(source)) unused.push(`${file}: .${cls}`);
  assert.deepEqual(unused, []);
});

// Rules keyed by their media context and selector; a second rule for the same key means one silently overrides the other.
function rules(text) {
  const out = [];
  let media = '', depth = 0, i = 0;
  for (const m of text.matchAll(/([^{}]*)\{|\}/g)) {
    if (m[0] === '}') { depth--; if (depth === 0) media = ''; continue; }
    const head = m[1].trim();
    if (head.startsWith('@')) { media = head; depth++; continue; }
    const body = text.slice(m.index + m[0].length, text.indexOf('}', m.index));
    out.push({ media, selectors: head.split(',').map(s => s.trim().replace(/\s+/g, ' ')), body, at: i++ });
    depth++;
  }
  return out;
}

test('no selector has two rules in the same media context', () => {
  const seen = new Map(), dup = [];
  for (const [file, text] of Object.entries(css))
    for (const r of rules(text)) for (const s of r.selectors) {
      const key = `${r.media} ${s}`;
      if (seen.has(key)) dup.push(`${key.trim()} (${seen.get(key)} and ${file})`); else seen.set(key, file);
    }
  assert.deepEqual(dup, []);
});

test('each design token is defined once per theme', () => {
  const seen = new Map(), dup = [];
  for (const [file, text] of Object.entries(css))
    for (const r of rules(text)) for (const [, name] of r.body.matchAll(/(--[\w-]+)\s*:/g)) {
      const key = `${r.media} ${r.selectors.join(',')} ${name}`;
      if (seen.has(key)) dup.push(`${name} (${seen.get(key)} and ${file})`); else seen.set(key, file);
    }
  assert.deepEqual(dup, []);
});

test('links are built by routes.js', () => {
  const literal = /['"`]#(?:finder|map|artists?|countries|sql)\b/;
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'routes.js' && literal.test(s)).map(([f]) => f), []);
});

test('only hints.js touches localStorage', () => {
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'hints.js' && /localStorage/.test(s)).map(([f]) => f), []);
});

test('the home city comes from the data, not the code', () => {
  assert.deepEqual(Object.entries(js).filter(([, s]) => /Bergen|'BGO'/.test(s)).map(([f]) => f), []);
});

test('dates and flight links are formatted in ui.js', () => {
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'ui.js' && /Intl\.DateTimeFormat|toLocaleDateString|google\.com\/travel/.test(s)).map(([f]) => f), []);
});
