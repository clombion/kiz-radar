// sessionStorage is kept.ts's, which keeps what the site remembers for the tab alone (the admin's token, and
// updating.tsx's clock through its read and write), holding a value the storage refuses for the page: any other file
// that names it is refused, a property, a binding or a type's query by that name too, by name or by a key in quotes.
// kept.ts and the tests (which plant and read the page's storage) are exempt by .oxlintrc.json's override.
import { nameRule } from './names.ts';

export const session = nameRule(
  'sessionStorage',
  'Only kept.ts touches sessionStorage: read and write what the site keeps for the tab through it.',
);
