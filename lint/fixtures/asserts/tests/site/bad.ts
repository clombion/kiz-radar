// What house/asserts refuses, everywhere: node:assert named as a module, however the code loads it.
import assert from 'node:assert'; // refused
import { strictEqual } from 'node:assert'; // refused
import * as all from 'node:assert'; // refused
import type { AssertionError } from 'node:assert'; // refused
import legacy = require('node:assert'); // refused
import 'node:assert'; // refused

export { ok } from 'node:assert'; // refused
export * from 'node:assert'; // refused
export const later = import('node:assert'); // refused
export const required: unknown = require('node:assert'); // refused
export { all, assert, legacy, strictEqual };
export type { AssertionError };
