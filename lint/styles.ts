// A style is a class of the stylesheet, or, for a value known only at run time, set through a ref with
// style.setProperty, as dom.ts's h() does under the page's Content-Security-Policy (style-src 'self', no inline
// style). In JSX the style prop is refused, whatever it is given, and so is a style: prop (style:color): Solid's
// compiler (@solidjs/compiler 2.0.2) writes a string, and an object's constant values, into the template's HTML as a
// style attribute, which the policy refuses (Chromium reports the violation), and which values it sets at run time
// rests on its internals. On everywhere oxlint lints: only JSX has the prop.
import type { Rule } from './plugin.ts';
import { attributeName } from './shapes.ts';

export const styles: Rule = {
  meta: {
    type: 'problem',
    messages: {
      styles:
        "Style through a class, or through a ref and style.setProperty for a value known only at run time: the page's Content-Security-Policy refuses a style attribute.",
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const { name } = node;
        if (attributeName(node) === 'style' || (name.type === 'JSXNamespacedName' && name.namespace.name === 'style'))
          context.report({ node, messageId: 'styles' });
      },
    };
  },
};
