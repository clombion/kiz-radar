// localStorage is what a visitor has seen (hints.ts) and the review dashboard's (kept.ts): any other file that names it
// is refused, a property, a binding or a type's query by that name too. hints.ts, kept.ts and the tests (which plant
// and read the page's storage) are exempt by .oxlintrc.json's override.
import { nameRule } from './names.ts';

export const storage = nameRule(
  'localStorage',
  "Only hints.ts (what a visitor has seen) and kept.ts (the review dashboard's) touch localStorage.",
);
