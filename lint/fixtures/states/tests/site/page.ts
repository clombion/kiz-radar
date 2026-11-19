// Outside the rule: a test reads the state the page shows.
declare const e: { phase: string };
export const ended = e.phase === 'ended';
