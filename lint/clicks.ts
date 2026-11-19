// A control inside a card keeps its click from the card with dom.ts's own(), and swipe.ts alone keeps a swipe from the
// map: a call of stopPropagation() anywhere else is refused. dom.ts and swipe.ts are exempt by .oxlintrc.json's
// override.
import { callRule, callsMethod } from './shapes.ts';

const STOP: ReadonlySet<string> = new Set(['stopPropagation']);

export const clicks = callRule(
  'clicks',
  'A control inside a card keeps its click with dom.ts own(); swipe.ts alone keeps a swipe from the map.',
  (call) => callsMethod(call, STOP) && call.arguments.length === 0,
);
