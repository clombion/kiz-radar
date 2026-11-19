// A Solid file renders with JSX alone: replaceChildren, createElement and createElementNS are refused wherever read (on
// any object, called, optionally, by a key in quotes, handed on with .call or .bind, destructured; replaceChildren
// called bare), and so is an import of dom.ts (h(), its helpers and its types), a re-export from it or an import() of
// it: a relative path to dom, dom.ts or dom.js, not a package's (@testing-library/dom). dom.ts's helpers that draw
// nothing move to modules of their own before a view is ported, so the rule needs no exception. Of the four migration
// rules (the brief's Phase 4): .oxlintrc.json turns it on for .tsx files alone, so h() views, which stay .ts until they
// are ported, keep dom.ts.
import type { Rule } from './plugin.ts';
import { keyName, type Node, stringOf } from './shapes.ts';

const DRAWING: ReadonlySet<string | undefined> = new Set(['replaceChildren', 'createElement', 'createElementNS']);
const DOM = /^\.\.?\/(?:[^/]+\/)*dom(?:\.[jt]s)?$/u;

export const legacy: Rule = {
  meta: {
    type: 'problem',
    messages: { legacy: "Render with JSX in a Solid file: not dom.ts's h(), replaceChildren or createElement." },
  },
  create(context) {
    const fromDom = (node: Node, source: Node): void => {
      if (DOM.test(stringOf(source) ?? '')) context.report({ node, messageId: 'legacy' });
    };
    return {
      MemberExpression(node) {
        if (DRAWING.has(keyName(node.property, node.computed))) context.report({ node, messageId: 'legacy' });
      },
      // const { createElement } = document
      Property(node) {
        if (node.parent.type === 'ObjectPattern' && DRAWING.has(keyName(node.key, node.computed)))
          context.report({ node, messageId: 'legacy' });
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'replaceChildren')
          context.report({ node, messageId: 'legacy' });
      },
      ImportDeclaration(node) {
        fromDom(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) fromDom(node, node.source);
      },
      ExportAllDeclaration(node) {
        fromDom(node, node.source);
      },
      ImportExpression(node) {
        fromDom(node, node.source);
      },
    };
  },
};
