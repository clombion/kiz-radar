// Markup is put in an element by icons.ts alone (Drawing.into), from the SVG written there, so no text from the data or
// the address ever becomes markup; everywhere else an element is built with dom.ts's h(), which puts text in as text.
// Refused: any member access to innerHTML or outerHTML, read or written however (assigned, a compound assignment, an
// optional chain, a destructuring's target, a loop's variable), by name or by a key in quotes; a destructured key of
// that name; and a call of a method that parses or writes markup. .oxlintrc.json turns the rule on for site/** and off
// for icons.ts.
import type { Rule } from './plugin.ts';
import { callsMethod, keyName } from './shapes.ts';

const PROPERTIES: ReadonlySet<string | undefined> = new Set(['innerHTML', 'outerHTML']);
const METHODS: ReadonlySet<string> = new Set([
  'insertAdjacentHTML',
  'setHTMLUnsafe',
  'createContextualFragment',
  'parseFromString',
  'write',
  'writeln',
]);

export const markup: Rule = {
  meta: {
    type: 'problem',
    messages: {
      markup: "Markup comes from icons.ts's Drawing.into(), from its own SVG; build elements with dom.ts's h().",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (PROPERTIES.has(keyName(node.property, node.computed))) context.report({ node, messageId: 'markup' });
      },
      // const { innerHTML } = el, the property read by its key
      Property(node) {
        if (node.parent.type === 'ObjectPattern' && PROPERTIES.has(keyName(node.key, node.computed)))
          context.report({ node, messageId: 'markup' });
      },
      CallExpression(node) {
        if (callsMethod(node, METHODS)) context.report({ node, messageId: 'markup' });
      },
    };
  },
};
