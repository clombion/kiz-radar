// What house/states refuses in the site's modules: a state's key in quotes where a state is compared (===, !==, ==, !=,
// a switch's case) or passed (a call's or a new's argument, plural()'s aside), whatever else the code calls by the same
// name, however the call is written (optional, with type arguments) and whatever wraps the key (as, satisfies, a type
// assertion; oxfmt takes parentheses away).
declare const e: { phase: string; kind: string };
declare function say(point: string, key: string): void;
export const compared = e.phase === 'ended'; // refused
export const reversed = 'ended' !== e.phase; // refused
export const loose = e.phase == `ended`; // refused
export const looser = e.phase != 'gone'; // refused
say('price', 'priced'); // refused
export const listed = ['x'].includes('teacher'); // refused
switch (e.kind) {
  case 'couple': // refused
    break;
  default:
}
say?.('price', 'priced'); // refused
declare function typed<T>(key: T): void;
typed<string>('priced'); // refused
declare class Point {
  constructor(key: string);
}
export const made = new Point('priced'); // refused
say('price', 'priced' as string); // refused
export const satisfied = e.phase === ('ended' satisfies string); // refused
say('price', <string>'priced'); // refused
