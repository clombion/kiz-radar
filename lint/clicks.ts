// A control inside a card keeps its click from the card with bits.ts's own(), and swipe.ts alone keeps a swipe from the
// map: a call of stopPropagation() anywhere else is refused. bits.ts and swipe.ts are exempt by .oxlintrc.json's
// override.
import { callRule, callsMethod } from './shapes.ts';

const STOP: ReadonlySet<string> = new Set(['stopPropagation']);

export const clicks = callRule(
  'clicks',
  'A control inside a card keeps its click with bits.ts own(); swipe.ts alone keeps a swipe from the map.',
  (call) => callsMethod(call, STOP) && call.arguments.length === 0,
);
