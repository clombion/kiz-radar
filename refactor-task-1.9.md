# Task 1.9: the Phase 1 report

Task 1.9 of [refactor-plan.md](refactor-plan.md). Status: done.

## Summary

The ledger is made whole, the after figures are measured by the baseline's own commands, and the Phase 1 report replaces
"In progress." in `refactor-plan.md`. One test is added: the review page's Forget button, the one behaviour whose
coverage fell (`kept.ts`), was tested by no file before or after the ports.

## Decisions

| # | Question | Decision | Why |
| -- | -- | -- | -- |
| 1 | The empty rows | The fourteen `main.browser.test.ts` rows, ported in place in task 1.1, are filled from the old and the new file; the `pages` and `recipes` rows were already filled ("stays") | Every row then says where its test is. |
| 2 | Checking the ledger | A script reads each row: the file it names exists under `tests/site/`, and the test's name (the old one for "same name", the quoted one for "as …") is found in it | Done by hand, 141 rows would be checked by eye only. |
| 3 | The after figures | The baseline's two commands of [refactor-task-1.1.md](refactor-task-1.1.md), "Tests", at `22cd0597`, after `mise run build:site` and `mise run build:data` | The same commands, so the figures compare. |
| 4 | Biome's count | Its infos sorted by file at both commits, so the change is said where it is | 38 to 43 needs an explanation, and Q2 counts them. |
| 5 | Coverage | Per file, from the baseline's saved summary, so a drop is named | The totals rose, but one file fell. |
| 7 | The fall in `kept.ts` | A test of Forget (`review-forget.browser.test.ts`); `tokenDialog()` closes its dialog at the test's end, for it and `review-token`. Storage refused stays a gap: the helper's storage cannot refuse, and no test refused it before | The brief's "coverage of user-visible behaviour no lower". |
| 6 | What the report holds | What the plan's "Phase reports" asks for, the decisions summarised with links to each task plan, not copied | The task plans hold the tables. |

## Done when

Every baseline browser test has a non-empty "Now" naming a file that exists and a test found in it; the after figures
are recorded; the Phase 1 report is in `refactor-plan.md`; `mise run format:md` passes.
