// Exempt: app.ts starts a page from its entry (.oxlintrc.json's override gives the rule the entries, as the file names
// them), and imports no helper the page browser test may.
import { h } from '../../site/dom.ts'; // refused

export const made = h;
export const site = (): Promise<unknown> => import('../../site/main.ts');
export const review = (): Promise<unknown> => import('../../site/review.ts');
