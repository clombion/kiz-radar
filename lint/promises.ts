// A promise's failure goes to its .catch (or report.ts's done), never to a second argument of .then, which misses a
// throw in the first: .then called with two arguments is refused, everywhere.
import { callRule, callsMethod } from './shapes.ts';

const THEN: ReadonlySet<string> = new Set(['then']);

export const promises = callRule(
  'promises',
  "Handle the failure with .catch, or report.ts's done, not .then's second argument.",
  (call) => callsMethod(call, THEN) && call.arguments.length === 2,
);
