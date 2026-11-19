// What lint/tests.grit lets through (tests/site/lint.test.ts): a listed module's values, imported and loaded by
// import(), and a view's types with import type, which is erased.
import type { Festival } from '../../../site/festivals.ts';
import type Default from '../../../site/passes.ts';
import { festivalsHref } from '../../../site/routes.ts';

export type { Pass } from '../../../site/passes.ts';
export const used: readonly [typeof festivalsHref, Festival | Default | null] = [festivalsHref, null];
export const states = (): Promise<unknown> => import('../../../site/states.ts');
