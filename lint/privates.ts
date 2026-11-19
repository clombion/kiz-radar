// Biome's noPrivateImports: an export whose JSDoc says @private (or @access private) is its module's alone, one that
// says @package its folder's. A file is a module, and so is a folder, its index file (index.ts, or Deno's mod.ts)
// speaking for it: an import of a name marked @private is refused unless the importing file is inside the module it
// names, which only an index file's folder can hold; of a name marked @package, unless it is inside that module's
// folder. Everywhere, every import declaration, a type's too; an export from, an import() and a module outside the
// checkout's relative paths (a package) are not read, as Biome reads none of them.
// oxlint shows a rule one file, so the module an import names is read from disk, relative to the importing file (the
// one use of its path: the two are compared, never matched against a folder's name), and read lightly: its top-level
// statements, each with the JSDoc comments before it, as Biome attaches them.
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Rule } from './plugin.ts';

type Visibility = 'public' | 'package' | 'private';

// --- reading a module ---------------------------------------------------------------------------------------------

interface Token {
  kind: 'word' | 'string' | 'punct' | 'doc' | 'opaque';
  text: string;
  // the brackets around it: a bracket stands at the depth of what holds it
  depth: number;
}

const WORD = /[\w$\u{80}-\u{FFFF}#]/u;
// after these, a / starts a regular expression rather than dividing
const BEFORE_REGEX = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
]);
const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

// the end of the quoted string starting at `at`
function stringEnd(text: string, at: number): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
  return i + 1;
}

// the end of the regular expression starting at `at`
function regexEnd(text: string, at: number): number {
  let i = at + 1;
  let inClass = false;
  while (i < text.length && text[i] !== '\n' && (inClass || text[i] !== '/')) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '[') inClass = true;
    else if (text[i] === ']') inClass = false;
    i += 1;
  }
  i += 1;
  while (i < text.length && /[a-z]/u.test(text[i] ?? '')) i += 1;
  return i;
}

// the end of the template starting at `at`, its ${} skipped with the code inside
function templateEnd(text: string, at: number): number {
  let i = at + 1;
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') i += 2;
    else if (text[i] === '$' && text[i + 1] === '{') i = tokens(text, i + 2, true).end;
    else i += 1;
  }
  return i + 1;
}

// where `end` next stands from `at`, else the text's end
const until = (text: string, end: string, at: number): number => {
  const found = text.indexOf(end, at);
  return found === -1 ? text.length : found;
};

// the source's tokens from `from`, or, inside a template's ${}, up to its closing brace
function tokens(text: string, from = 0, inside = false): { list: Token[]; end: number } {
  const list: Token[] = [];
  let depth = 0;
  let last = '';
  let i = from;
  const push = (kind: Token['kind'], end: number, value = text.slice(i, end)): void => {
    list.push({ kind, text: value, depth });
    if (kind !== 'doc') last = kind === 'opaque' ? 'x' : value;
    i = end;
  };
  while (i < text.length) {
    const c = text[i] ?? '';
    const next = text[i + 1];
    if (/\s/u.test(c)) i += 1;
    else if (c === '/' && next === '/') i = until(text, '\n', i);
    else if (c === '/' && next === '*') {
      const end = until(text, '*/', i + 2) + 2;
      if (text.startsWith('/**', i) && end - i > 4) push('doc', end);
      else i = end;
    } else if (c === "'" || c === '"') push('string', stringEnd(text, i), text.slice(i + 1, stringEnd(text, i) - 1));
    else if (c === '`') push('opaque', templateEnd(text, i));
    else if (c === '/' && BEFORE_REGEX.has(last)) push('opaque', regexEnd(text, i));
    else if (WORD.test(c)) {
      let end = i + 1;
      while (end < text.length && WORD.test(text[end] ?? '')) end += 1;
      push('word', end);
    } else if (CLOSE.has(c)) {
      if (depth === 0 && inside) return { list, end: i + 1 };
      depth = Math.max(0, depth - 1);
      push('punct', i + 1);
    } else {
      push('punct', i + 1);
      if (OPEN.has(c)) depth += 1;
    }
  }
  return { list, end: i };
}

// the words that start a statement after a block's closing brace, which else carries its expression on
const STARTS = new Set([
  'export',
  'import',
  'const',
  'let',
  'var',
  'using',
  'function',
  'async',
  'class',
  'abstract',
  'declare',
  'type',
  'interface',
  'enum',
  'namespace',
  'module',
  'if',
  'for',
  'while',
  'do',
  'try',
  'switch',
  'return',
  'throw',
]);

interface Statement {
  docs: string[];
  tokens: Token[];
}

// the top-level statements, each with the JSDoc comments between it and the one before
function statements(text: string): Statement[] {
  const all: Statement[] = [];
  let current: Statement | null = null;
  let docs: string[] = [];
  // a block closed the statement, unless what follows carries it on
  let closed = false;
  for (const token of tokens(text).list) {
    if (token.kind === 'doc') {
      if (current === null || closed) docs.push(token.text);
    } else {
      const starts =
        token.depth === 0 && token.kind === 'word' && (closed ? STARTS.has(token.text) : token.text === 'export');
      if (current === null || starts) {
        current = { docs, tokens: [] };
        all.push(current);
      }
      docs = [];
      closed = false;
      current.tokens.push(token);
      if (token.depth === 0 && token.text === ';' && token.kind === 'punct') current = null;
      else if (token.depth === 0 && token.text === '}' && token.kind === 'punct') closed = true;
    }
  }
  return all;
}

// a comment's visibility: its first line that starts with one of the tags
const TAG = /^\s*(?:\/\*\*)?\s*\*?\s*@(?:access\s+)?(?<tag>public|package|private)\b/u;
function tagOf(doc: string): Visibility | undefined {
  for (const line of doc.split('\n')) {
    const tag = TAG.exec(line)?.groups?.['tag'];
    if (tag === 'public' || tag === 'package' || tag === 'private') return tag;
  }
  return undefined;
}
// a statement's visibility: the last comment before it that has a tag decides
const visibilityOf = (docs: readonly string[]): Visibility =>
  docs.map(tagOf).findLast((tag) => tag !== undefined) ?? 'public';

// the names a binding pattern binds: { a, b: c, d = 1, ...e } binds a, c, d, e
function bound(pattern: readonly Token[]): string[] {
  const names: string[] = [];
  let skipping: number | null = null;
  for (const [i, token] of pattern.entries()) {
    if (skipping !== null) {
      const ends =
        token.kind === 'punct' && (token.depth < skipping || (token.depth === skipping && token.text === ','));
      if (!ends) continue;
      skipping = null;
    }
    if (token.kind === 'punct' && token.text === '=') skipping = token.depth;
    // a binding ends its entry (a key is followed by its colon), and is no member read in a default (...e is a binding)
    const after = pattern[i + 1];
    const target = after === undefined || [',', '}', ']', '='].includes(after.text);
    const member = pattern[i - 1]?.text === '.' && pattern[i - 2]?.text !== '.';
    if (token.kind === 'word' && target && !member) names.push(token.text);
  }
  return names;
}

// the tokens of the bracket opened at `at`, up to its closing one
function bracketed(list: readonly Token[], at: number): Token[] {
  const open = list[at];
  if (open === undefined) return [];
  const end = list.findIndex((t, i) => i > at && t.depth === open.depth && CLOSE.has(t.text) && t.kind === 'punct');
  return list.slice(at, end === -1 ? list.length : end + 1);
}

// the names a declaration declares: its own, or each declarator's
function declared(list: readonly Token[]): string[] {
  let i = 0;
  while (['declare', 'abstract', 'async', 'default'].includes(list[i]?.text ?? '')) i += 1;
  if (list[i]?.text === 'const' && list[i + 1]?.text === 'enum') i += 1;
  const keyword = list[i]?.text ?? '';
  if (['function', 'class', 'interface', 'type', 'enum', 'namespace', 'module'].includes(keyword)) {
    const name = list[i + 1]?.text === '*' ? list[i + 2] : list[i + 1];
    return name?.kind === 'word' ? [name.text] : [];
  }
  if (!['const', 'let', 'var', 'using'].includes(keyword)) return [];
  const depth = list[i]?.depth ?? 0;
  const names: string[] = [];
  // each declarator: its pattern, then whatever follows up to a comma between declarators
  for (let at = i + 1; at < list.length;) {
    const head = list[at];
    if (head === undefined) break;
    const pattern = head.kind === 'word' ? [head] : bracketed(list, at);
    names.push(...bound(pattern));
    at += pattern.length;
    while (at < list.length && !(list[at]?.depth === depth && list[at]?.text === ',')) at += 1;
    at += 1;
  }
  return names;
}

interface Module {
  // a name's visibility where the module declares it
  own: Map<string, Visibility>;
  // a name the module exports from another: the other's name and the module it names
  forwarded: Map<string, { from: string; name: string }>;
  // the modules export * forwards every name of
  stars: string[];
}

// what export { a as b } and import { a as b } list: each entry's name in its module, and the name it takes here
function specifiers(list: readonly Token[]): { name: string; as: string }[] {
  const inner = list.slice(1, -1).filter((t) => t.text !== 'type' || t.kind !== 'word');
  const entries: { name: string; as: string }[] = [];
  let entry: Token[] = [];
  for (const token of [...inner, { kind: 'punct', text: ',', depth: 0 } satisfies Token]) {
    if (token.text === ',' && token.kind === 'punct') {
      const [name, as, alias] = entry;
      if (name !== undefined)
        entries.push({ name: name.text, as: as?.text === 'as' ? (alias?.text ?? '') : name.text });
      entry = [];
    } else entry.push(token);
  }
  return entries;
}

// the module source a statement names after `from`
function sourceOf(list: readonly Token[]): string | undefined {
  const at = list.findIndex((t) => t.depth === 0 && t.kind === 'word' && t.text === 'from');
  const source = list[at + 1];
  return at !== -1 && source?.kind === 'string' ? source.text : undefined;
}

function read(text: string): Module {
  const own = new Map<string, Visibility>();
  const forwarded = new Map<string, { from: string; name: string }>();
  const stars: string[] = [];
  // the declarations a list exports (export { a }), by their name here, and the names imported
  const locals = new Map<string, Visibility>();
  const imported = new Map<string, { from: string; name: string }>();
  const listed: { name: string; as: string }[] = [];
  for (const { docs, tokens: list } of statements(text)) {
    const [first, second] = list;
    const level = visibilityOf(docs);
    if (first?.text === 'import' && first.kind === 'word') {
      const from = sourceOf(list);
      const brace = list.findIndex((t) => t.text === '{' && t.kind === 'punct');
      const head = list[1]?.text === 'type' ? list[2] : list[1];
      if (from !== undefined && head?.kind === 'word' && head.text !== 'from' && head.text !== '{')
        imported.set(head.text, { from, name: 'default' });
      if (from !== undefined && brace !== -1)
        for (const { name, as } of specifiers(bracketed(list, brace))) imported.set(as, { from, name });
    } else if (first?.text !== 'export' || first.kind !== 'word') {
      for (const name of declared(list)) locals.set(name, level);
    } else if (second?.text === '*') {
      const from = sourceOf(list);
      if (from !== undefined && list[2]?.text !== 'as') stars.push(from);
    } else if (second?.text === '{' || (second?.text === 'type' && list[2]?.text === '{')) {
      const from = sourceOf(list);
      const entries = specifiers(bracketed(list, second.text === '{' ? 1 : 2));
      if (from === undefined) listed.push(...entries);
      else for (const { name, as } of entries) forwarded.set(as, { from, name });
    } else if (second?.text === 'default') {
      own.set('default', level);
    } else {
      for (const name of declared(list.slice(1))) own.set(name, level);
    }
  }
  // a listed name takes its declaration's visibility, or follows its import
  for (const { name, as } of listed) {
    const local = locals.get(name);
    const from = imported.get(name);
    if (local === undefined && from !== undefined) forwarded.set(as, from);
    else own.set(as, local ?? 'public');
  }
  return { own, forwarded, stars };
}

// --- finding a module -----------------------------------------------------------------------------------------------

const CODE = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
// the TypeScript file an import of a script names
const SCRIPT: Readonly<Record<string, string>> = { '.js': '.ts', '.jsx': '.tsx', '.mjs': '.mts', '.cjs': '.cts' };
const INDEX = /^(?:index|mod)\.[cm]?[jt]sx?$/u;

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

// the file a relative import names, as TypeScript finds it; null for a package's, a resource's or none
function resolved(importer: string, source: string): string | null {
  if (!/^\.\.?(?:\/|$)/u.test(source)) return null;
  const base = resolve(dirname(importer), source);
  const ext = extname(base);
  const script = SCRIPT[ext];
  const candidates = CODE.includes(ext)
    ? [base, ...(script === undefined ? [] : [base.slice(0, -ext.length) + script])]
    : [...CODE.map((e) => base + e), ...CODE.flatMap((e) => [join(base, `index${e}`), join(base, `mod${e}`)])];
  return candidates.find(isFile) ?? null;
}

// each module read once a run, again when its file changes
const modules = new Map<string, { changed: number; module: Module }>();
function moduleAt(file: string): Module {
  const changed = statSync(file).mtimeMs;
  const known = modules.get(file);
  if (known?.changed === changed) return known.module;
  const module = read(readFileSync(file, 'utf8'));
  modules.set(file, { changed, module });
  return module;
}

// a name's visibility where it is declared, its exports from other modules followed; undefined if not found
function visibility(file: string, name: string, seen = new Set<string>()): Visibility | undefined {
  if (seen.has(file)) return undefined;
  seen.add(file);
  const { own, forwarded, stars } = moduleAt(file);
  const follow = (from: string, as: string): Visibility | undefined => {
    const next = resolved(file, from);
    // a package's names are public, and a module not found has none to check
    if (next === null) return /^\.\.?(?:\/|$)/u.test(from) ? undefined : 'public';
    return visibility(next, as, seen);
  };
  const mine = own.get(name);
  if (mine !== undefined) return mine;
  const ahead = forwarded.get(name);
  if (ahead !== undefined) return follow(ahead.from, ahead.name);
  if (name === 'default') return undefined;
  for (const from of stars) {
    const found = follow(from, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

// the module a file is: an index file's folder, else the file itself, as a folder of its own
const moduleOf = (file: string): string =>
  INDEX.test(basename(file)) ? dirname(file) : file.slice(0, -extname(file).length);
const inside = (file: string, folder: string): boolean => {
  const path = relative(folder, file);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
};
// whether the importer may import a name of that visibility from the file it names
function allowed(level: Visibility, importer: string, file: string): boolean {
  if (level === 'public' || importer === file) return true;
  const module = moduleOf(file);
  return inside(importer, level === 'private' ? module : dirname(module));
}

export const privates: Rule = {
  meta: {
    type: 'problem',
    messages: {
      private:
        "Only its module imports an export marked @private: the file's own, or, from an index file, its folder's.",
      package: 'Only the modules of its folder, or of a folder below it, import an export marked @package.',
    },
  },
  create(context) {
    const importer = resolve(context.cwd, context.filename);
    return {
      ImportDeclaration(node) {
        const { value } = node.source;
        const file = typeof value === 'string' ? resolved(importer, value) : null;
        if (file === null) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') continue;
          const { imported } = specifier.type === 'ImportSpecifier' ? specifier : { imported: null };
          const name = imported === null ? 'default' : imported.type === 'Identifier' ? imported.name : imported.value;
          const level = visibility(file, name);
          if (level !== undefined && !allowed(level, importer, file))
            context.report({ node: specifier, messageId: level === 'private' ? 'private' : 'package' });
        }
      },
    };
  },
};
