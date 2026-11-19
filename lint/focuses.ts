// Focus moves when the visitor moves it, never when a page or a dialog draws: autofocus is refused in JSX in any
// spelling, its name lowercased with its namespace left out (autofocus, Solid's; autoFocus, React's; prop:autofocus,
// attr:autofocus), and as a key of an object spread. jsx_a11y/no-autofocus reads React's autoFocus alone, and its
// attributes setting does not reach it. On .tsx files alone (.oxlintrc.json), where JSX is.
import type { Rule } from './plugin.ts';
import { attributeName, keyName } from './shapes.ts';

const isAutofocus = (name: string | undefined): boolean => name?.toLowerCase() === 'autofocus';

export const focuses: Rule = {
  meta: {
    type: 'problem',
    messages: { focuses: 'Move focus when the visitor acts, not with autofocus as the page draws.' },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (isAutofocus(attributeName(node))) context.report({ node, messageId: 'focuses' });
      },
      // <input {...{ autofocus: true }} />
      JSXSpreadAttribute(node) {
        if (node.argument.type !== 'ObjectExpression') return;
        for (const p of node.argument.properties)
          if (p.type === 'Property' && isAutofocus(keyName(p.key, p.computed)))
            context.report({ node: p, messageId: 'focuses' });
      },
    };
  },
};
