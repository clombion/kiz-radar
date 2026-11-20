// Classes are set by JSX's class alone, which tsc holds to the stylesheet's (ClassName, site/jsx-runtime.d.ts): an
// element's classList or className read anywhere is refused, a test's too (a test reads what the page shows). No rule
// of oxlint's or Solid's refuses them, so the rule stays.
import type { Rule } from './plugin.ts';
import { readsProperty } from './shapes.ts';

const NAMES: ReadonlySet<string> = new Set(['classList', 'className']);

export const classes: Rule = {
  meta: {
    type: 'problem',
    messages: {
      classes:
        "Set classes with JSX's class, which takes only the stylesheet's (ClassName): a signal for one that changes.",
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
