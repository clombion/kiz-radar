// A test reaches the site through the page, never through a view's code, so a view can be rewritten under its tests. A
// test imports values from the modules listed here alone: the pure ones, the ones that use a browser API but draw
// nothing (routes, hints, kept), the data module with one sink (icons) and media. A module not listed is refused, a new
// one too, until someone decides it draws nothing. A type comes from any module with import type, which is erased; a
// type named inside a value import is not, since the import still loads its module. An import() names its module in
// one literal, so the rule can check it.
// .oxlintrc.json turns the rule on for tests/**, and gives its two exceptions to the two files that make them, as the
// rule's options: tests/site/app.ts loads the entries (`loads`), the one place a test starts the page;
// tests/site/page.browser.test.ts imports four helpers (`imports`) and keeps its tests of them until they go with them:
// tabs' pill and modal in task 4.5, dismiss in 4.6, dom's in 4.10.
import type { Rule } from './plugin.ts';
import { type Node, quotedOneOf } from './shapes.ts';

const ALLOWED = [
  'calendar',
  'claims',
  'classes',
  'currency',
  'days',
  'db',
  'fares',
  'find',
  'finder',
  'fold',
  'github',
  'hints',
  'icons',
  'ink',
  'json',
  'kept',
  'media',
  'names',
  'net',
  'pending',
  'pricing',
  'roles',
  'roster',
  'routes',
  'rows',
  'schema',
  'states',
  'wording',
];

// a module of site/, its source in its quotes: `site//dom.ts` and `site/./dom.ts` load dom.ts too, so they are
// checked, and refused, since the list names each module by its plain path
const SITE = /^['"`](?:.*\/)?site\/(?:\.?\/)*[^/'"`]+['"`]$/u;
const LISTED = quotedOneOf(ALLOWED, '(?:.*/)?site/', String.raw`\.ts`);
// an import() of one literal: a string, or a template without values
const ONE_LITERAL = /^import\(\s*(?:'[^']*'|"[^"]*"|`[^`$]*`)\s*\)$/u;

export const tests: Rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          imports: { type: 'array', items: { type: 'string' } },
          loads: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tests:
        "A test imports values only from the site modules lint/tests.ts lists, and a view's types with import type: drive a view through the page (tests/site/app.ts). A new site module is refused until it is listed there.",
      literal: "A test's import() names its module in one literal, so lint/tests.ts can check it.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    // the file's exception, the modules it may import or re-export (imports) or load with import() (loads), by the
    // string it writes
    const [options] = context.options;
    const excepted = (key: 'imports' | 'loads'): readonly string[] => {
      if (typeof options !== 'object' || options === null || Array.isArray(options)) return [];
      const modules = options[key];
      return Array.isArray(modules) ? modules.filter((m): m is string => typeof m === 'string') : [];
    };
    const imports = excepted('imports');
    const loads = excepted('loads');
    // a module refused, unless the file's exception names it, in quotes (not a template's)
    const refused = (source: Node, spares: readonly string[]): boolean => {
      const text = sourceCode.getText(source);
      const spared = source.type === 'Literal' && typeof source.value === 'string' && spares.includes(source.value);
      return SITE.test(text) && !LISTED.test(text) && !spared;
    };
    const checked = (node: Node, source: Node): void => {
      if (refused(source, imports)) context.report({ node, messageId: 'tests' });
    };
    // the import()s that load a refused module
    const loading = new Set<Node>();
    const sourced = (node: Node): void => {
      for (let up = node.parent; up !== null; up = up.parent)
        if (up.type === 'ImportExpression') {
          if (refused(node, loads)) loading.add(up);
          return;
        }
    };
    return {
      // a value import: a type import (`import type`) is erased, a type named inside a value import is not
      ImportDeclaration(node) {
        if (node.importKind !== 'type') checked(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind !== 'type' && node.source !== null) checked(node, node.source);
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') checked(node, node.source);
      },
      // a string or a template anywhere in an import() that names a refused module: the import() is refused, once
      Literal(node) {
        sourced(node);
      },
      TemplateLiteral(node) {
        // a tagged template's text is no module's name
        if (node.parent.type !== 'TaggedTemplateExpression') sourced(node);
      },
      // refused for its module, else, once, for a module built at run time, which escapes the check above
      'ImportExpression:exit'(node) {
        if (loading.has(node)) context.report({ node, messageId: 'tests' });
        else if (!ONE_LITERAL.test(sourceCode.getText(node))) context.report({ node, messageId: 'literal' });
      },
    };
  },
};
