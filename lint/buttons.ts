// A button is of type button, so it never submits a form: made by dom.ts's button(), which gives it the type, in an h()
// module; written <button type="button"> in JSX. h() called with the tag 'button' in the site's modules is refused,
// however the call is written (optional, with type arguments, h in parentheses) and however the tag is (a template
// without values, in parentheses, as const); and a JSX <button> whose type is not the string button (none, submit,
// reset, an expression), is given twice, or may be given again by a spread after it ({...props}, {...{ type: 'submit'
// }}). .oxlintrc.json turns the rule on for site/*.ts and site/*.tsx and off for dom.ts.
import type { Rule } from './plugin.ts';
import { attributeOf, stringOf, tagOf, valueOf } from './shapes.ts';

export const buttons: Rule = {
  meta: {
    type: 'problem',
    messages: {
      buttons:
        'A button is of type button, so it never submits a form: dom.ts button() in an h() module, <button type="button"> in JSX.',
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
