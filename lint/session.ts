// sessionStorage is the admin's token's, for the tab alone, and kept.ts keeps it: any other file that names it is
// refused, a property, a binding or a type's query by that name too. kept.ts and the tests (which plant and read the
// page's storage) are exempt by .oxlintrc.json's override.
import { nameRule } from './names.ts';

export const session = nameRule(
  'sessionStorage',
  "Only kept.ts touches sessionStorage: the admin's token, for the tab alone.",
);
