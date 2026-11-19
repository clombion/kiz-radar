// The intended way: no read of the environment. process imported for anything else, a type's typeof process.env, a
// binding of that name or another module's env is let through.
import process from 'node:process';
import { argv, cwd } from 'node:process';
import { env as settings } from './settings.ts';

export const here = process.cwd();
export const args = [argv, cwd(), settings];
export type Env = typeof process.env;
export const shadowed = (process: { env: string }): string => process.env;
export const own = { env: 1 }.env;
