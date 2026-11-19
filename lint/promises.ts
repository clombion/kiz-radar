// A promise's failure goes to its .catch (or report.ts's done), never to a second argument of .then, which misses a
// throw in the first: .then called with two arguments is refused, everywhere, however the call is written (optional,
// on an optional chain, by a key in quotes, with type arguments, in parentheses).
import { callRule, keyName } from './shapes.ts';

export const promises = callRule(
  'promises',
  "Handle the failure with .catch, or report.ts's done, not .then's second argument.",
  (call) =>
    call.callee.type === 'MemberExpression' &&
    keyName(call.callee.property, call.callee.computed) === 'then' &&
    call.arguments.length === 2,
);
