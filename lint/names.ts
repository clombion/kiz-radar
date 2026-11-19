// A rule that refuses one name of the platform wherever the code writes it: a reference, a property, a key, a binding
// or a type's query by that name, and a member or a key that spells it in quotes or a template without values
// (window['name'], { ['name']: x }). Which files may write it is .oxlintrc.json's, by an override turning the rule off.
import type { Rule } from './plugin.ts';
import { stringOf } from './shapes.ts';

export const nameRule = (name: string, message: string): Rule => ({
  meta: { type: 'problem', messages: { [name]: message } },
  create(context) {
    return {
      Identifier(node) {
        // a shorthand property ({ name }) is its key and its value, one name: reported once, by its value
        const { parent } = node;
        const shorthandKey = parent.type === 'Property' && parent.shorthand && parent.key === node;
        if (node.name === name && !shorthandKey) context.report({ node, messageId: name });
      },
      MemberExpression(node) {
        if (node.computed && stringOf(node.property) === name) context.report({ node, messageId: name });
      },
      Property(node) {
        if (node.computed && stringOf(node.key) === name) context.report({ node, messageId: name });
      },
    };
  },
});
