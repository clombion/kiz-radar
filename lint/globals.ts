// A rule that refuses one global of the platform wherever the code reads it: a value read of the name where the file
// does not declare it (a call, an optional call, the function passed as a value; a type's typeof reads nothing at run
// time, and a binding of that name is the file's own), and the same global read through one of `holders` (window,
// globalThis), by name or by a key in quotes, or destructured from it. Which files may read it is .oxlintrc.json's.
import type { Rule } from './plugin.ts';
import { keyName, type Node, type Scope, variableOf } from './shapes.ts';

type Reference = Scope['through'][number];

// a value read: a reference to a value (the scope manager's flag, which its types omit), outside a type's typeof, which
// the scope manager counts as a value's but reads nothing at run time
const read = (ref: Reference): boolean => {
  for (let up: Node | null = ref.identifier.parent; up !== null; up = up.parent)
    if (up.type === 'TSTypeQuery') return false;
  return 'isValueReference' in ref && ref.isValueReference === true;
};

export const globalRule = (
  name: string,
  message: string,
  holders: ReadonlySet<string>,
  type: 'problem' | 'suggestion' = 'problem',
): Rule => ({
  meta: { type, messages: { [name]: message } },
  create(context) {
    const { sourceCode } = context;
    // one of the holders, as the global of that name: the file declares none, so either the config does or none is
    const holder = (node: Node): boolean =>
      node.type === 'Identifier' &&
      holders.has(node.name) &&
      (variableOf(sourceCode.getScope(node), node.name)?.defs.length ?? 0) === 0;
    const refuse = (node: Node): void => context.report({ node, messageId: name });
    return {
      'Program:exit'(program) {
        const scope = sourceCode.getScope(program);
        const unresolved = scope.through.filter((ref) => ref.identifier.name === name);
        const declared = scope.set.get(name);
        const implicit = declared?.defs.length === 0 ? declared.references : [];
        for (const ref of [...unresolved, ...implicit]) if (read(ref)) refuse(ref.identifier);
      },
      MemberExpression(node) {
        if (keyName(node.property, node.computed) === name && holder(node.object)) refuse(node);
      },
      // const { name } = window
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || node.init === null || !holder(node.init)) return;
        for (const prop of node.id.properties)
          if (prop.type === 'Property' && keyName(prop.key, prop.computed) === name) refuse(prop);
      },
    };
  },
});
