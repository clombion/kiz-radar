// Biome's noSuspiciousSemicolonInJsx: a semicolon left after an element or an expression inside JSX, which shows as
// text. JSX text that starts with a semicolon and the line's end is refused (<div />; then a line break), as Biome
// does; a semicolon on a line of its own, after spaces, or followed by more text on its line is let through. Biome
// reports the first such text of an element's children, this rule each. On everywhere oxlint lints: only JSX has text.
import type { Rule } from './plugin.ts';

const SUSPICIOUS = /^;\r?\n/u;

export const semicolons: Rule = {
  meta: {
    type: 'problem',
    messages: { semicolons: 'This semicolon is JSX text, shown on the page: take it away.' },
  },
  create(context) {
    return {
      JSXText(node) {
        if (SUSPICIOUS.test(node.value)) context.report({ node, messageId: 'semicolons' });
      },
    };
  },
};
