// Dates are worded, and flight searches linked, by ui.ts alone, so every page says them the same way: Intl.DateTimeFormat
// named (as a value or a type), a date's toLocaleDateString() or toLocaleTimeString() called, and a string or a
// template's text holding google.com/travel are refused. ui.ts is exempt by .oxlintrc.json's override.
import type { Rule } from './plugin.ts';
import { callsMethod, named } from './shapes.ts';
import { texts } from './texts.ts';

const METHODS: ReadonlySet<string> = new Set(['toLocaleDateString', 'toLocaleTimeString']);
const FLIGHTS = /google\.com\/travel/u;

export const formats: Rule = {
  meta: {
    type: 'problem',
    messages: { formats: 'Dates are worded, and flight searches linked, by ui.ts.' },
  },
  create(context) {
    return {
      ...texts((node, text) => {
        if (FLIGHTS.test(text)) context.report({ node, messageId: 'formats' });
      }),
      // Intl.DateTimeFormat as Grit's snippet matched it: the names written, not optional, Intl not in parentheses
      MemberExpression(node) {
        const { object, property } = node;
        const plain = !node.computed && !node.optional && node.start === object.start;
        if (plain && named(object, 'Intl') && named(property, 'DateTimeFormat'))
          context.report({ node, messageId: 'formats' });
      },
      TSQualifiedName(node) {
        if (named(node.left, 'Intl') && named(node.right, 'DateTimeFormat'))
          context.report({ node, messageId: 'formats' });
      },
      CallExpression(node) {
        // with no type arguments, which Grit's `$_.toLocaleDateString($...)` did not match
        if (node.typeArguments == null && callsMethod(node, METHODS)) context.report({ node, messageId: 'formats' });
      },
    };
  },
};
