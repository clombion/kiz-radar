// The intended way: node:assert/strict; the module's name as a plain string is no import.
import assert from 'node:assert/strict';
import { strictEqual } from 'node:assert/strict';

export * from 'node:assert/strict';
export const later = import('node:assert/strict');
export const named = 'node:assert';
export { assert, strictEqual };
