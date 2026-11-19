// Classes are set by dom.ts alone (h()'s class, toggle()), where ClassName holds them to the stylesheet's: an
// element's classList or className read anywhere else is refused. dom.ts is exempt by .oxlintrc.json's override.
import type { Rule } from './plugin.ts';
import { readsProperty } from './shapes.ts';

const NAMES: ReadonlySet<string> = new Set(['classList', 'className']);

export const classes: Rule = {
  meta: {
    type: 'problem',
    messages: {
      classes: "Set classes with dom.ts's h() or toggle(), which take only the stylesheet's (ClassName).",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (readsProperty(node, NAMES)) context.report({ node, messageId: 'classes' });
      },
    };
  },
};
