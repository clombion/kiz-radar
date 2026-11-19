// Biome's useNodeAssertStrict: assertions come from node:assert/strict, whose equal() and deepEqual() compare strictly,
// never from node:assert, whose legacy ones coerce. Wherever the code names node:assert as a module, everywhere: an
// import or a type's, an export from it, an import(), a require() or an import = require(). The bare 'assert' is
// unicorn/prefer-node-protocol's to refuse.
import type { Rule } from './plugin.ts';
import { type Node, callsName } from './shapes.ts';

export const asserts: Rule = {
  meta: {
    type: 'suggestion',
    messages: {
      asserts: "Assert with 'node:assert/strict', whose equal() and deepEqual() compare strictly, not 'node:assert'.",
    },
  },
  create(context) {
    const check = (source: Node): void => {
      if (source.type === 'Literal' && source.value === 'node:assert')
        context.report({ node: source, messageId: 'asserts' });
    };
    return {
      ImportDeclaration(node) {
        check(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) check(node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source);
      },
      ImportExpression(node) {
        check(node.source);
      },
      TSExternalModuleReference(node) {
        check(node.expression);
      },
      CallExpression(node) {
        const [only] = node.arguments;
        if (callsName(node, 'require') && node.arguments.length === 1 && only !== undefined) check(only);
      },
    };
  },
};
