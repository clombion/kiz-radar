// The built scripts against the page's Content-Security-Policy, which refuses inline style (style-src 'self': a style
// attribute, a <style> element) and inline script (script-src 'self': an event handler's attribute, a javascript: URL,
// a <script> element), and lets no frame's document carry its own (srcdoc, which no view needs). Solid's compiler
// writes each JSX element's constant attributes and children into its template, markup the bundle carries as a string
// and the page parses (`<p class=empty>`), so whatever a .tsx says that the policy refuses lands there: a constant
// style object, which house/styles refuses; a handler given as a string (`onerror="…"`), which tsc refuses
// (Solid's JSX types have no lowercase on… attribute, and type a camelCase one as a function, as solid/event-handlers
// holds it); a javascript: URL, which three lint rules refuse. A spread of attributes from a record sets them at run
// time, never in a template, where the policy refuses an inline handler all the same. The frames of
// pages.browser.test.ts hear what the policy refuses on each route as drawn; this reads every template, drawn or not
// (a view's branch no fixture reaches). mise run test:site builds public/js/ first.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const JS = new URL('../../public/js/', import.meta.url);
const bundle = readdirSync(JS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => [f, readFileSync(new URL(f, JS), 'utf8')] as const);

// an element's start tag as markup writes it, its attributes quoted or not (a template's are unquoted where they can
// be); code such as `i<n&&o.style=…` has no space after its name, so it is no tag
const VALUE = String.raw`(?:"[^"]*"|'[^']*'|[^\s<>"'\x60=]+)`;
const TAG = new RegExp(String.raw`<[a-zA-Z][\w:-]*(?:\s+[^\s<>"'\x60=/]+(?:=${VALUE})?)+\s*/?>`, 'gu');
const ATTRIBUTE = new RegExp(String.raw`\s(?<name>[^\s<>"'\x60=/]+)(?:=(?<value>${VALUE}))?`, 'gu');
const QUOTES = /^["']|["']$/gu;
// what a browser strips from a URL before it reads its scheme (`java&#x09;script:`), the character or its reference
const STRIPPED = /[\t\n\r]|&#(?:x0*(?:9|a|d)|0*(?:9|10|13));?|&(?:Tab|NewLine);/giu;
// an element the policy refuses inline whatever its attributes
const INLINE = /<(?:style|script)[\s/>]/giu;
// what the policy refuses of an attribute, by its name and its value
const refused = (name: string, value: string): string | null =>
  name.toLowerCase() === 'style'
    ? 'a style attribute'
    : /^on/iu.test(name)
      ? 'an event handler'
      : name.toLowerCase() === 'srcdoc'
        ? "a frame's own document"
        : /^\s*javascript:/iu.test(value.replace(QUOTES, '').replace(STRIPPED, ''))
          ? 'a javascript: URL'
          : null;

test("no markup the built scripts carry has an attribute the page's policy refuses", () => {
  const tags = bundle.flatMap(([file, code]) => [...code.matchAll(TAG)].map((m) => [file, m[0]] as const));
  // the bundle holds This week's templates (site/week.tsx), so the check reads Solid's markup, not nothing
  expect(tags.map(([, tag]) => tag)).toContain('<header class=page-intro>');
  const found = tags.flatMap(([file, tag]) =>
    [...tag.matchAll(ATTRIBUTE)].flatMap((m) => {
      const why = refused(m.groups?.['name'] ?? '', m.groups?.['value'] ?? '');
      return why === null ? [] : [`${file}: ${why}: ${tag}`];
    }),
  );
  const inline = bundle.flatMap(([file, code]) => [...code.matchAll(INLINE)].map((m) => `${file}: ${m[0]}`));
  expect([...found, ...inline]).toEqual([]);
});
