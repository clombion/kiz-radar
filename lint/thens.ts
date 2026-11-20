// A component reads async data as Solid does: a promise returned from createMemo(() => get(…)), read under <Loading>,
// never followed with .then(). A promise's then is refused wherever it is read: called (optionally, by a key in
// quotes), handed on (p.then.call(…), p.then.bind(…), const t = p.then) or destructured (const { then } = p). Of the
// four migration rules of the move to Solid: .oxlintrc.json turns it on for .tsx files alone, so the network module
// (site/net.ts) and the other modules that draw nothing, which are .ts, are outside it.
import type { Rule } from './plugin.ts';
import { keyName } from './shapes.ts';

export const thens: Rule = {
  meta: {
    type: 'problem',
    messages: {
      thens: 'Read async data as a promise from createMemo(() => get(…)) under <Loading>, not with .then().',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (keyName(node.property, node.computed) === 'then') context.report({ node, messageId: 'thens' });
      },
      Property(node) {
        if (node.parent.type === 'ObjectPattern' && keyName(node.key, node.computed) === 'then')
          context.report({ node, messageId: 'thens' });
      },
    };
  },
};
