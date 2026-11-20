// An SVG is a drawing of pipeline/drawings.py's, put in by icons.ts's Drawing, which hides each from assistive
// technology: Biome's noSvgWithoutTitle held by construction (owner, 19 November). A JSX <svg> is refused, and so is
// one made by its tag's name: <Dynamic component="svg"> and dynamic(() => 'svg') (@solidjs/web), everywhere oxlint
// lints; icons.ts writes no JSX.
import type { Rule } from './plugin.ts';
import { attributeOf, stringOf, tagOf, valueOf } from './shapes.ts';

export const svgs: Rule = {
  meta: {
    type: 'problem',
    messages: { svgs: "Draw an SVG with icons.ts's Drawing, from pipeline/drawings.py, not with <svg> in JSX." },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const component = tagOf(node) === 'Dynamic' ? attributeOf(node, 'component') : undefined;
        const made = component === undefined ? undefined : valueOf(component);
        if (tagOf(node) === 'svg' || (made !== undefined && stringOf(made) === 'svg'))
          context.report({ node, messageId: 'svgs' });
      },
      CallExpression(node) {
        const source = node.arguments.at(0);
        const tag = source?.type === 'ArrowFunctionExpression' && source.expression ? source.body : undefined;
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'dynamic' &&
          tag !== undefined &&
          stringOf(tag) === 'svg'
        )
          context.report({ node, messageId: 'svgs' });
      },
    };
  },
};
