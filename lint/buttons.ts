// A button is of type button, so it never submits a form: written <button type="button"> in JSX. A JSX <button> whose
// type is not the string button (none, submit, reset, an expression), is given twice, or may be given again by a spread
// after it ({...props}, {...{ type: 'submit' }}) is refused; and so is a button built by a call of h() with the tag
// 'button', a hand-built element, however the call is written (optional, with type arguments)
// and however the tag is (a template without values, as const); h or the tag in parentheses is refused as well, a form
// with no fixture, since oxfmt, which lays the fixtures out, takes the parentheses off.
// react/button-has-type, even told to refuse submit and reset, lets a spread after the type through (measured on these
// fixtures), so the rule stays. .oxlintrc.json turns it on for site/*.ts and site/*.tsx.
import type { Rule } from './plugin.ts';
import { attributeOf, stringOf, tagOf, valueOf } from './shapes.ts';

export const buttons: Rule = {
  meta: {
    type: 'problem',
    messages: {
      buttons:
        'A button is of type button, so it never submits a form: <button type="button">, with no spread after the type.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const tag = node.arguments.at(0);
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'h' &&
          tag !== undefined &&
          stringOf(tag) === 'button'
        )
          context.report({ node, messageId: 'buttons' });
      },
      JSXOpeningElement(node) {
        if (tagOf(node) !== 'button') return;
        const type = attributeOf(node, 'type');
        const value = type === undefined ? undefined : valueOf(type);
        const at = type === undefined ? -1 : node.attributes.indexOf(type);
        const types = node.attributes.filter(
          (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'type',
        );
        const respread = node.attributes.some((a, i) => a.type === 'JSXSpreadAttribute' && i > at);
        if (value === undefined || stringOf(value) !== 'button' || types.length > 1 || respread)
          context.report({ node, messageId: 'buttons' });
      },
    };
  },
};
