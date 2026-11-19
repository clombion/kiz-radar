// The intended way: process imported from node:process; a type's typeof process, a binding or a property of that name
// is no read of the global.
import process from 'node:process';

export const home = process.env['HOME'];
export type Process = typeof globalThis.process;
export const shadowed = (process: { cwd: () => string }): string => process.cwd();
export const keys = { process: 1 }.process;
export type Env = typeof process.env;
