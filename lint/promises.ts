// A promise's failure goes to its .catch (or report.ts's done), never to a second argument of .then, which misses a
// throw in the first: .then called with two arguments is refused, everywhere.
import { callRule, callsMethod } from './shapes.ts';

export const promises = callRule(
  'promises',
  "Handle the failure with .catch, or report.ts's done, not .then's second argument.",
  (call) => callsMethod(call, 'then') && call.arguments.length === 2,
);
