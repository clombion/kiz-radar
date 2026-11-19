// The home city and its airport are the data's (site.json's home), not the code's: a string or a template's text that
// names Bergen or BGO is refused, everywhere.
import { textRule } from './texts.ts';

export const home = textRule(
  'home',
  "The home city comes from site.json's home, not from the code.",
  /Bergen|\bBGO\b/u,
);
