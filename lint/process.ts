// Biome's noProcessGlobal: the code that runs in Node imports process from node:process rather than reading the global,
// which a tool cannot follow: a value read of the global process is refused (a type's typeof process is not, nor a
// binding of that name), and so is globalThis's, by name, by a key in quotes or destructured. .oxlintrc.json turns the
// rule on for the tests and their config; the site has no process (tsconfig.json's types).
import { globalRule } from './globals.ts';

export const process = globalRule(
  'process',
  "Import process from 'node:process' rather than reading the global.",
  new Set(['globalThis']),
  'suggestion',
);
