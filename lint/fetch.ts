// Every request goes through net.ts's get(): a deadline, the view's signal, and a failure for an answer that is no
// success. The global fetch read anywhere else is refused, called or not, and so is window's, globalThis's or self's.
// net.ts, and tests/site/app.ts, which owns the page's fetch for the tests, are exempt by .oxlintrc.json's overrides.
import { globalRule } from './globals.ts';

export const fetch = globalRule(
  'fetch',
  "Requests go through net.ts's get(), with its deadline and the view's signal.",
  new Set(['window', 'globalThis', 'self']),
);
