# Task 2.8: tasks, docs and the Phase 2 report

Task 2.8 of [refactor-plan.md](refactor-plan.md). Status: done, 19 November 2026; the Phase 2 report is in
refactor-plan.md. Re-checked against the code before the first commit: two claims were corrected (the suppressions
before were 10, in 8 entries, not "8 entries" summing to 10; one doc named Grit and one said Biome's check enforces an
assist), the rest hold.

## Summary

Most of the split stands already: `lint:oxlint` (oxlint, type-aware), `format:site` (`oxfmt --check`) and `lint:site`
(Biome, on CSS and JSON since 2.7) are three tasks, all in `check:fast`. Left: `lint:site` no longer names what it runs,
and is renamed by its tool; the brief's constraint is recorded where someone building accounts reads; the Phase 2 report
is written.

## Design model

- **Measured at `a7894060`:** Biome checks 8 files, no finding; oxlint runs 354 rules on 155 files, no finding;
  `lint/plugin.ts` has 19 house rules (13 Grit rules ported, 5 kept Biome rules, `env`); 414 tests in 60 files pass; the
  site's suppressions went from 10 (5 Biome on TypeScript, 1 CSS, 4 `@ts-expect-error`; 8 entries of
  `tests/test_suppressions.py`'s list) to 20 (1 Biome CSS, 15 oxlint on 13 lines, 4 `@ts-expect-error`); the pipeline's
  27 are unchanged.
- **Stale mentions:** `lint:site` is named only in `tasks.toml`, `package.json` (`lint`) and the generated
  `commands.md`. Outside the `refactor-*` records, Grit is named only as the house rules' past
  (`docs/concepts/lint-rules.md`, "The 19 house rules"), which stays; the same page's "organizeImports" said
  `biome check` "enforces" it, now put in the past.
- **Where someone building accounts reads:** `docs/README.md`; `plans-and-promos.md`, "Communities" (a fixed prototype
  before a server exists); `the-site.md`, "A community's page" and "The share card and the icons" (pages generated from
  `communities.csv`), and Friends ("once there are accounts").

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | Task names | `lint:site` → `lint:biome`, its package script `lint` → `lint:biome`; `lint:oxlint`, `format:site` kept | Named by tool, paired with `lint:oxlint`; "site" fits neither linter alone now. |
| 2 | Biome's command | `biome lint --error-on-warnings` | The formatter is off and `organizeImports` acts only on JavaScript, so `check` adds nothing; both measured at 8 files, no finding. |
| 3 | `check:fast` | The same set, `lint:biome` in place of `lint:site`, after `lint:oxlint` | CI and the hooks call `check` only; `tests.yml` is not edited (brief). |
| 4 | Where the constraint goes | A new `docs/concepts/user-pages.md`, a row in `docs/README.md` ("build pages or memberships people create"), and a line linking it from `plans-and-promos.md`'s "Communities", `the-site.md`'s generated community pages and Friends' accounts sentence | A concept page holds the reason and the allowed shapes; the links are where someone changing communities starts. |
| 5 | Wording | The brief's sentence, bold, word for word; then the stopgap (`pipeline/communities.csv`, `community_members.csv`, `seeded.csv`, the committed `public/c/<key>/`) and the two allowed shapes (a Worker reading Durable Objects at request time, or a private build whose output goes only to hosting) | The brief asks for this record. |
| 6 | `CLAUDE.md` | Unchanged | The brief says `docs/`; `CLAUDE.md` points to `docs/README.md`. |
| 7 | `CONTRIBUTING.md` | The "Checks" block and the "Site:" bullet name the three tasks and what each runs | The brief lists them. |

## Commits (each passes `mise run check`)

1. **Lint the stylesheet and JSON configs as `lint:biome`:** decisions 1–3, `commands.md`, `CONTRIBUTING.md`, this plan.
2. **Record that pages people make are never generated from committed data:** decisions 4–5.
3. **Write the Phase 2 report:** `refactor-plan.md`'s "### Phase 2" (as Phase 1's: what changed by task with commits;
   counts before and after, the tests at `a1f2f60c` re-measured, coverage of `site/**` by Phase 1's command; decisions
   the brief did not settle, the owner's and mine, each linked; brief errors with evidence; site bugs found and fixed;
   open issues: the intermittent check failure seen again in 2.7's rebase, the card digest written by hand and now held
   by `stale_cards()`, `CHROMIUM`, `render.cjs` needing the pinned Chromium, `noExcessiveLinesPerFile` off on
   `site.css`; next: Phase 3, Q3 open), row 2.8 done, this plan done.

## Done when

`check:fast` names `lint:oxlint`, `lint:biome` and `format:site`; `commands.md` regenerated; no doc names `lint:site`;
`docs/concepts/user-pages.md` holds the brief's sentence, linked from `docs/README.md` and both guides; the Phase 2
report written; `mise run check` green at each commit.
