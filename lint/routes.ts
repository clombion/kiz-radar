// Links are built by routes.ts, so a route has one spelling: a string or a template's text that starts with a route's
// hash (#finder, #map, #artist, #artists, #countries, #friends, #people, #sql, #sources) is refused, a chunk after a
// template's value too. routes.ts is exempt by .oxlintrc.json's override.
import { textRule } from './texts.ts';

export const routes = textRule(
  'routes',
  'Links are built by routes.ts, so a route has one spelling.',
  // a string in its quotes, a template's chunk without them
  /^['"]?#(?:finder|map|artists?|countries|friends|people|sql|sources)\b/u,
);
