// The intended way: the home city from site.json's home (ui.ts's home()); a key, a type or a word that only holds the
// letters is no text the rule reads.
import { home } from '../../../../site/ui.ts';

export const leaving = `Flights from ${home().city}`;
export type Airport = 'BGO';
export const codes = { BGO: 'airport' };
export const other = 'BGOX';
