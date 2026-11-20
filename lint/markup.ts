// The site's own code puts markup in an element through icons.ts alone (Drawing.into), from a drawing's SVG in the
// generated drawings.ts, so no text from the data or the address ever becomes markup; everywhere else an element is
// written in JSX, which puts text in as text. Solid's runtime parses markup too, the compiler's constant templates
// (through a <template>'s innerHTML, @solidjs/web's template()), which hold no value of the data's or the address's:
// a Trusted Types policy would be given to @solidjs/web's setTrustedTypesPolicy before the first view, as well as
// covering Drawing.into.
// Refused: any member access to innerHTML or outerHTML, read or written however (assigned, a compound assignment, an
// optional chain, a destructuring's target, a loop's variable), by name or by a key in quotes; a destructured key of
// that name; a call of a method that parses or writes markup; and in JSX the innerHTML or outerHTML prop, bare or in a
// namespace (prop:innerHTML), which Solid sets as the property, or as a key of an object spread ({...{ innerHTML }}).
// solid/no-innerhtml refuses only the bare prop given an expression or nothing (measured on these fixtures: 2 of
// their 29 refused lines), so the rule stays. .oxlintrc.json turns it on for site/** and off for icons.ts.
import type { Rule } from './plugin.ts';
import { attributeName, callsMethod, keyName } from './shapes.ts';

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
      markup:
        "Markup comes from icons.ts's Drawing.into(), from its own SVG; write elements in JSX, which puts text in as text.",
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
      // <p innerHTML={said} />, the property set by Solid
      JSXAttribute(node) {
        if (PROPERTIES.has(attributeName(node))) context.report({ node, messageId: 'markup' });
      },
      // <p {...{ innerHTML: said }} />
      JSXSpreadAttribute(node) {
        if (node.argument.type !== 'ObjectExpression') return;
        for (const p of node.argument.properties)
          if (p.type === 'Property' && PROPERTIES.has(keyName(p.key, p.computed)))
            context.report({ node: p, messageId: 'markup' });
      },
    };
  },
};
