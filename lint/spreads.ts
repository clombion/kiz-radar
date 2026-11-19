// Biome's noDuplicatedSpreadProps: an element spreading the same props twice, where whatever lies between the two is
// overridden, and the work done twice. A spread of a name, or of a member of names (props.a, props['a'], props?.a,
// props!.a), the same as one before it on the same element once TypeScript's wrappers (as, satisfies, !) and the
// spelling are set aside, is refused, each repeat; a call ({...f()}) may give another object each time: let through.
// Biome reads names alone. On everywhere oxlint lints: only JSX spreads props.
import type { Rule } from './plugin.ts';
import { keyName, type Node, unwrapped } from './shapes.ts';

// a name, or a member of names read by a name or a string key, as one spelling (props.a); undefined for any other
function spelled(node: Node): string | undefined {
  const inner = unwrapped(node.type === 'ChainExpression' ? node.expression : node);
  if (inner.type === 'Identifier') return inner.name;
  if (inner.type !== 'MemberExpression') return undefined;
  const object = spelled(inner.object);
  const key = keyName(inner.property, inner.computed);
  return object === undefined || key === undefined ? undefined : `${object}.${key}`;
}

export const spreads: Rule = {
  meta: {
    type: 'problem',
    messages: { spreads: 'These props are spread once already on this element: spread them once.' },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const seen = new Set<string>();
        for (const attribute of node.attributes) {
          const spread = attribute.type === 'JSXSpreadAttribute' ? spelled(attribute.argument) : undefined;
          if (spread === undefined) continue;
          if (seen.has(spread)) context.report({ node: attribute, messageId: 'spreads' });
          seen.add(spread);
        }
      },
    };
  },
};
