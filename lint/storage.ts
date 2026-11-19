// localStorage is kept.ts's, which keeps what the site remembers on the device (the review dashboard's, and hints.ts's
// through its read and write), holding a value the storage refuses for the page: any other file that names it is
// refused, a property, a binding or a type's query by that name too, by name or by a key in quotes.
// kept.ts and the tests (which plant and read the page's storage) are exempt by .oxlintrc.json's override.
import { nameRule } from './names.ts';

export const storage = nameRule(
  'localStorage',
  'Only kept.ts touches localStorage: read and write what the site keeps on the device through it.',
);
