// The intended way: dates worded and flight searches linked by ui.ts; a date's other methods, and an address that is no
// flight search, are no part of the rule.
import { dayMonth, flightsUrl } from '../../../../site/ui.ts';

declare const day: Date;
export const said = [dayMonth, flightsUrl];
export const stamp = day.toISOString();
export const maps = 'https://www.google.com/maps';
