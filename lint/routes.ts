// Links are built by routes.ts, so a route has one spelling: a string or a template's text that starts with the hash
// of a route the site writes (routes.ts's HASH_ROUTES) is refused, a chunk after a template's value too. routes.ts is
// exempt by .oxlintrc.json's override.
import { HASH_ROUTES } from '../site/routes.ts';
import { textRule } from './texts.ts';

export const routes = textRule(
  'routes',
  'Links are built by routes.ts, so a route has one spelling.',
  // a string in its quotes, a template's chunk without them
  new RegExp(String.raw`^['"]?#(?:${HASH_ROUTES.join('|')})\b`, 'u'),
);
