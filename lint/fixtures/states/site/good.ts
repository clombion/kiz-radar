// The intended way: a state named by KEY, held to the table; plural() takes words, and a string that is no state's key,
// or a key neither compared nor passed, is no part of the rule.
import { KEY } from '../../../../site/states.ts';
import { plural } from '../../../../site/wording.ts';

declare const e: { phase: string; kind: string };
export const named = e.phase === KEY.phase.ENDED;
export const word = plural(2, 'day');
export const other = e.kind === 'tag';
export const attribute = { role: 'group' };
