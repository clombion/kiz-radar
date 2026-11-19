# Task 2.6b: the unmapped rules the owner keeps

Task 2.6b of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026. The five Biome rules with no oxlint
equivalent that the owner keeps (19 November; [lint rules](docs/concepts/lint-rules.md), "Unmapped") are rules of
oxlint's plugin, each with its fixtures in `lint/fixtures/<rule>/`.

## Commits

| Commit | Biome rule | House rule | On |
| -- | -- | -- | -- |
| `32a72052` | `noThisInStatic` | `house/statics` | everywhere oxlint lints |
| `335aa59a` | `noProcessGlobal` | `house/process` | `tests/**`, `vitest.config.ts` |
| `3751c9fd` | `useNodeAssertStrict` | `house/asserts` | everywhere oxlint lints |
| `b7944323` | `useJsonImportAttributes` | `house/json` | everywhere oxlint lints |
| `41c96821` | `noPrivateImports` | `house/privates` | everywhere oxlint lints |

Each was probed under Biome 2.6.3 on a scratch file of forms before it was written; no shared helper was needed.

## Differences from Biome

- **`statics`:** the same reach (static methods, accessors and blocks, arrow functions and nested classes' fields in
  them; not a static field's initializer, nor a function with a `this` of its own). No fix.
- **`process`:** the same reach (a value read of the global, `globalThis.process`; not a type's `typeof process`).
  `vitest.config.ts` now imports `process`, so `node/no-process-env`, which reads the global alone, no longer sees its
  `process.env` and its suppression went (with its rows in [the suppressed findings](docs/lint-false-positives.md) and
  `tests/test_suppressions.py`); Biome's `noProcessEnv` reads an imported `process` too, which oxlint has no rule for.
  Since then `house/env` refuses it wherever `node/no-process-env` is on, and the suppression is back as its own.
- **`asserts`:** the same reach (`node:assert` as any module source, `require()` included); the bare `assert` is
  `unicorn/prefer-node-protocol`'s, as Biome leaves it to `useNodejsImportProtocol`.
- **`json`:** wider than Biome, which reads an import with a default binding alone, takes any value of `type` and misses
  a quoted key: every value import and export from, `type: 'json'` itself. Narrower in one place: a type's import is let
  through, being erased, and TypeScript allows no attribute on it. `import()` is read by neither.
- **`privates`:** the same findings as Biome on its fixtures, line and column. oxlint shows a rule one file, so the rule
  reads the module an import names from disk (resolved as TypeScript does) with a light tokenizer of its top-level
  statements; a generic's comma in a declarator list can add a stray name, which no import can name. The rule reads the
  importing file's path for that alone, to compare it with the module's (CONTRIBUTING, "House rules").

## Also changed

- `lint/tsconfig.json`: the type-aware rules read a file's nearest `tsconfig.json`, so `lint/` was typed in an inferred
  project (no Node types, `findLast` unknown); it extends `tests/site/tsconfig.json`, which tsc checks `lint/` with.
  `.oxlintrc.json` turns `import/no-nodejs-modules` off for `lint/privates.ts`, which reads files.
- No code was flagged but `vitest.config.ts` (`house/process`).
