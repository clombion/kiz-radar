// Markup is put in an element by icons.ts alone (Drawing.into), from the SVG written there, so no text from the data or
// the address ever becomes markup; everywhere else an element is built with dom.ts's h(), which puts text in as text.
// Refused: innerHTML or outerHTML read or assigned (=), by name or by a key in quotes, and a call of a method that
// parses or writes markup. .oxlintrc.json turns the rule on for site/** and off for icons.ts.
import type { Rule } from './plugin.ts';
import { type Call, callsMethod, type Member, namesProperty, readsProperty, written } from './shapes.ts';

const PROPERTIES: ReadonlySet<string> = new Set(['innerHTML', 'outerHTML']);
const METHODS = [
  'insertAdjacentHTML',
  'setHTMLUnsafe',
  'createContextualFragment',
  'parseFromString',
  'write',
  'writeln',
];
// el['innerHTML'], el[`outerHTML`]: the key's source, in its quotes
const QUOTED = /^['"`](?:inner|outer)HTML['"`]$/u;

export const markup: Rule = {
  meta: {
    type: 'problem',
    messages: {
      markup: "Markup comes from icons.ts's Drawing.into(), from its own SVG; build elements with dom.ts's h().",
    },
  },
  create(context) {
    const quoted = (member: Member): boolean =>
      member.computed && !member.optional && QUOTED.test(context.sourceCode.getText(member.property));
    const named = (member: Member): boolean => quoted(member) || namesProperty(member, PROPERTIES);
    const parses = (call: Call): boolean => METHODS.some((name) => callsMethod(call, name));
    return {
      // el.innerHTML = …: the left side not in parentheses, as Grit's `$el.innerHTML = $v` matched it
      AssignmentExpression(node) {
        const { left } = node;
        if (node.operator === '=' && left.type === 'MemberExpression' && node.start === left.start && named(left))
          context.report({ node, messageId: 'markup' });
      },
      MemberExpression(node) {
        if (readsProperty(node, PROPERTIES) || (quoted(node) && !written(node)))
          context.report({ node, messageId: 'markup' });
      },
      CallExpression(node) {
        if (parses(node)) context.report({ node, messageId: 'markup' });
      },
    };
  },
};
