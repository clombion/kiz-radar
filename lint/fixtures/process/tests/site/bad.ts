// What house/process refuses in the tests: the global process, read as a value, or as globalThis's.
export const home = process.env['HOME']; // refused
export const node = process; // refused
export const later = (): string => process.cwd(); // refused
export const own = globalThis.process; // refused
export const absent = typeof process === 'undefined'; // refused
