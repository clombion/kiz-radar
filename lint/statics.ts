// Biome's noThisInStatic: a static method, accessor or block names its class (or the parent class), not this or super,
// which there are the class itself, not an instance. As Biome reads it: the code of a static method, accessor or block,
// arrow functions and nested classes' fields included, up to the nearest function of another kind (a function, an
// object's method, an instance method), which has a this of its own; a static field's initializer is not read.
import type { Rule } from './plugin.ts';
import type { Node } from './shapes.ts';

// the static method, accessor or block whose this the node's is, if any
const inStatic = (node: Node): boolean => {
  for (let up: Node | null = node.parent; up !== null; up = up.parent) {
    if (up.type === 'StaticBlock') return true;
    if (up.type === 'FunctionExpression' || up.type === 'FunctionDeclaration') {
      const owner = up.parent;
      return owner.type === 'MethodDefinition' && owner.static && owner.value === up;
    }
  }
  return false;
};

export const statics: Rule = {
  meta: {
    type: 'suggestion',
    messages: {
      this: 'A static member names its class, not this, which there is the class itself, not an instance.',
      super: 'A static member names the parent class, not super, which there is the parent class itself.',
    },
  },
  create(context) {
    return {
      ThisExpression(node) {
        if (inStatic(node)) context.report({ node, messageId: 'this' });
      },
      Super(node) {
        if (inStatic(node)) context.report({ node, messageId: 'super' });
      },
    };
  },
};
