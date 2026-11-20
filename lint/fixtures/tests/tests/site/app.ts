// Exempt: app.ts starts a page from its entry (.oxlintrc.json's override gives the rule the entries, as the file names
// them), and imports nothing placed.browser.test.tsx may.
import { inPlaceOf } from '../../site/placed.tsx'; // refused

export const made = inPlaceOf;
export const site = (): Promise<unknown> => import('../../site/main.ts');
export const review = (): Promise<unknown> => import('../../site/review.ts');
