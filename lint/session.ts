// sessionStorage is the admin's token's, for the tab alone, and kept.ts keeps it: any other file that names it is
// refused, a property, a binding or a type's query by that name too.
import type { Rule } from './plugin.ts';

// kept.ts, and the tests, which plant and read the page's storage
const EXEMPT = /\/kept\.ts$|\/tests\//u;

export const session: Rule = {
  meta: {
    type: 'problem',
    messages: { session: "Only kept.ts touches sessionStorage: the admin's token, for the tab alone." },
  },
  create(context) {
    if (EXEMPT.test(context.filename)) return {};
    return {
      Identifier(node) {
        // a shorthand property ({ sessionStorage }) is its key and its value, one name: reported once, by its value
        const { parent } = node;
        const shorthandKey = parent.type === 'Property' && parent.shorthand && parent.key === node;
        if (node.name === 'sessionStorage' && !shorthandKey) context.report({ node, messageId: 'session' });
      },
    };
  },
};
