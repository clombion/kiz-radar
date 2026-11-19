// Every request goes through net.ts's get(): a deadline, the view's signal, and a failure for an answer that is no
// success. A call of fetch anywhere else is refused; net.ts is exempt by .oxlintrc.json's override.
import { callRule, callsName } from './shapes.ts';

export const fetch = callRule(
  'fetch',
  "Requests go through net.ts's get(), with its deadline and the view's signal.",
  (call) => callsName(call, 'fetch'),
);
