// localStorage is kept.ts's, which keeps the review dashboard's and what a visitor has seen (hints.ts): any other file
// that names it is refused, a property, a binding or a type's query by that name too. kept.ts and the tests (which
// plant and read the page's storage) are exempt by .oxlintrc.json's override.
import { nameRule } from './names.ts';

export const storage = nameRule(
  'localStorage',
  "Only kept.ts touches localStorage: the review dashboard's, and what a visitor has seen (hints.ts).",
);
