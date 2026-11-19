// What lint/tests.grit lets app.ts do (tests/site/lint.test.ts): start a page from its entry. The rule matches the
// file by the end of its path and the module by the string app.ts writes, which Biome does not resolve, so this file
// names the entries as tests/site/app.ts does.
export const site = (): Promise<unknown> => import('../../site/main.ts');
export const review = (): Promise<unknown> => import('../../site/review.ts');
