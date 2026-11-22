// A component shows loading and failure as Solid does: <Loading>, isPending(() => x()) and <Errored>, never a signal, a
// variable, a function or a field of its own. A name is refused when it is loading, pending, busy, fetching, error or
// failed, in any case, with or without is, and its setter's (setLoading, setIsLoading): bound by a variable declarator
// as a name (let loading = true), in an array or an object pattern (const [loading, setLoading] =
// createSignal<boolean>(false), const [, setLoading] = …), with a default or as a rest; a function declared by it; a
// class's field, private (#loading) or not. Read at the declaration, not in the text: an import (ui.ts's loading,
// anything of pending.ts), a parameter, a property, a store's key and a loop's variable (for (const failed of …)) hold
// no state of the component's. One of the four rules that hold the views to Solid's way: .oxlintrc.json turns it on
// for .tsx files alone.
import type { Rule } from './plugin.ts';
import type { Node } from './shapes.ts';

const FLAG = /^(?:set)?(?:is)?(?:loading|pending|busy|fetching|error|failed)$/iu;

// the names a declarator's pattern binds, however deep
function bound(pattern: Node): Node[] {
  if (pattern.type === 'Identifier') return [pattern];
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap((e) => (e === null ? [] : bound(e)));
  if (pattern.type === 'ObjectPattern')
    return pattern.properties.flatMap((p) => bound(p.type === 'RestElement' ? p : p.value));
  if (pattern.type === 'AssignmentPattern') return bound(pattern.left);
  if (pattern.type === 'RestElement') return bound(pattern.argument);
  return [];
}

export const flags: Rule = {
  meta: {
    type: 'problem',
    messages: {
      flags: 'Show loading and failure with <Loading>, isPending(() => x()) and <Errored>, not a state of your own.',
    },
  },
  create(context) {
    const refuse = (node: Node, name: string): void => {
      if (FLAG.test(name)) context.report({ node, messageId: 'flags' });
    };
    return {
      VariableDeclarator(node) {
        // a loop's variable, given each of what it walks, is no state
        const { parent } = node;
        const loop = parent.parent;
        if (loop !== null && (loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') && loop.left === parent)
          return;
        for (const name of bound(node.id)) if (name.type === 'Identifier') refuse(name, name.name);
      },
      FunctionDeclaration(node) {
        if (node.id !== null) refuse(node.id, node.id.name);
      },
      PropertyDefinition(node) {
        const { key } = node;
        if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') refuse(key, key.name);
      },
    };
  },
};
