// What house/states refuses in the site's modules: a state's key in quotes where a state is compared (===, !==, ==, !=,
// a switch's case) or passed (a call's argument, plural()'s aside), whatever else the code calls by the same name.
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
