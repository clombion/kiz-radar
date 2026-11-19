# Task 2.6: the house rules ported to oxlint

Task 2.6 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026, not pushed. The twelve Grit rules left
after task 2.5's `session` are rules of oxlint's plugin (`lint/plugin.ts`, run as `house/<rule>`), each with its
fixtures in `lint/fixtures/<rule>/`; `lint/*.grit` is gone and `biome.jsonc` has no `plugins`.

## Commits

| Commit | Subject |
| -- | -- |
| `f4ab2bb7` | Scope the house rules by .oxlintrc.json's overrides, the fixtures too |
| `6f4cf37b` | Port the storage rule to oxlint |
| `8998eec8` | Port the fetch rule to oxlint |
| `64115563` | Port the clicks rule to oxlint |
| `fa3cb23b` | Port the promises rule to oxlint |
| `4e63f6d7` | Port the buttons rule to oxlint |
| `bbd9dd31` | Port the classes rule to oxlint |
| `e7b4e9d3` | Port the markup rule to oxlint |
| `980d632b` | Port the home rule to oxlint |
| `47031ff1` | Port the formats rule to oxlint |
| `755fa361` | Port the routes rule to oxlint |
| `8f14a630` | Port the states rule to oxlint |
| `734db71b` | Port the tests rule to oxlint |

## Scoping

A rule never reads its file's path. Where it is on and the files it spares are `.oxlintrc.json`'s overrides, by globs
from the root ([Lint rules](docs/concepts/lint-rules.md), "Per-folder exceptions", has the table), so no folder above
the checkout changes what a rule sees. Grit matched a file by the end of its absolute path (`/kept.ts` anywhere,
`/tests/` anywhere); each such exemption is now the one file or folder the tree has (`site/kept.ts`, `tests/**`). The
rules on a folder alone: `buttons` and `states` on `site/*.ts`, `markup` on `site/**`, `tests` on `tests/**`. `tests`'
two exceptions spare some of a file's imports, so they are the rule's options (`loads`, `imports`) in the overrides on
`tests/site/app.ts` and `tests/site/page.browser.test.ts`. `tests/site/rules.test.ts` lints the fixtures with the house
rules as `.oxlintrc.json` sets them, each override's globs found in each rule's folder.

## Differences from Grit

Each rule was probed on a scratch file of forms under Grit (Biome 2.6.3) and oxlint 1.94 before its `.grit` went; the
commit names the forms. Same lines everywhere, and same columns but one: a template's chunk is reported one column
earlier (`home`, `formats`, `routes`), oxlint's span starting on the backtick or brace before it. Forms Grit's snippets
let through (an optional call, a computed key, a target in parentheses, type arguments) are let through still, not
widened. Otherwise:

- **Exemptions by path:** now from the root, as above; a checkout under a folder named `tests` no longer turns `states`,
  `markup`, `buttons`, `session` or `storage` off, and a `site/` folder below another no longer turns `states` or
  `markup` on.
- **`tests`' messages** name `lint/tests.ts`, where the list now is, instead of `lint/tests.grit`.
- **`states`' keys** are `lint/state-keys.ts`, which `pipeline/generate.py` writes and `generate:check` holds; the
  suppression in `site/artists.ts` is oxlint's (`house/states`).

## Shared helpers

`lint/shapes.ts` (a rule refusing the calls it picks, a call of a name or a method, a property read, the node type and
the quoted-name pattern of `states` and `tests`), `lint/names.ts` (a name refused wherever written: `session`,
`storage`), `lint/texts.ts` (the text Grit read, and a rule refusing the texts a pattern matches: `home`, `routes`;
`formats` reads it too).

## Removed

`lint/*.grit`, `biome.jsonc`'s `plugins` and its override for `tests`, `tests/site/lint.test.ts` and `tests/site/lint/`
with their exclusions, and `states.test.ts`'s Biome test of `states` (now its fixtures) and its check that Biome runs
every Grit rule.
