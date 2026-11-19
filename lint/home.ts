// The home city and its airport are the data's (site.json's home), not the code's: a string or a template's text that
// names Bergen or BGO is refused, everywhere.
import type { Rule } from './plugin.ts';
import { texts } from './texts.ts';

const HOME = /Bergen|\bBGO\b/u;

export const home: Rule = {
  meta: { type: 'problem', messages: { home: "The home city comes from site.json's home, not from the code." } },
  create(context) {
    return texts((node, text) => {
      if (HOME.test(text)) context.report({ node, messageId: 'home' });
    });
  },
};
