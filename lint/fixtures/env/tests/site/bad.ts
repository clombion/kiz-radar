// What house/env refuses: process.env read through a process imported from node:process (or process), as
// node/no-process-env refuses the global's.
import process from 'node:process';
import * as node from 'process';
import { env } from 'node:process'; // refused
import { env as renamed } from 'process'; // refused

export const home = process.env['HOME']; // refused
export const path = node.env.PATH; // refused
export const keyed = process['env']; // refused
export const { env: whole } = node; // refused
export const both = [env, renamed];
