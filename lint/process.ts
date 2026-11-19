// Biome's noProcessGlobal: the code that runs in Node imports process from node:process rather than reading the global,
// which a tool cannot follow: a value read of the global process, or globalThis.process, is refused (a type's
// typeof process is not, nor a binding of that name). .oxlintrc.json turns the rule on for the tests and their config;
// the site has no process (tsconfig.json's types).
import type { Rule } from './plugin.ts';
import { type Node, type Scope, variableOf } from './shapes.ts';

type Reference = Scope['through'][number];

export const process: Rule = {
  meta: {
    type: 'suggestion',
    messages: {
      process: "Import process from 'node:process' rather than reading the global.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    // a name of the global scope: no declaration in the file, so either a global the config declares or none at all
    const global = (name: string, node: Node): boolean =>
      (variableOf(sourceCode.getScope(node), name)?.defs.length ?? 0) === 0;
    // a value read: a reference to a value (the scope manager's flag, which its types omit), outside a type's
    // typeof, which the scope manager counts as a value's but reads nothing at run time
    const read = (ref: Reference): boolean => {
      for (let up: Node | null = ref.identifier.parent; up !== null; up = up.parent)
        if (up.type === 'TSTypeQuery') return false;
      return 'isValueReference' in ref && ref.isValueReference === true;
    };
    return {
      'Program:exit'(program) {
        const scope = sourceCode.getScope(program);
        const unresolved = scope.through.filter((ref) => ref.identifier.name === 'process');
        const declared = scope.set.get('process');
        const implicit = declared?.defs.length === 0 ? declared.references : [];
        for (const ref of [...unresolved, ...implicit])
          if (read(ref)) context.report({ node: ref.identifier, messageId: 'process' });
      },
      MemberExpression(node) {
        const { object, property } = node;
        if (
          object.type === 'Identifier' &&
          object.name === 'globalThis' &&
          !node.computed &&
          property.type === 'Identifier' &&
          property.name === 'process' &&
          global('globalThis', node)
        )
          context.report({ node, messageId: 'process' });
      },
    };
  },
};
