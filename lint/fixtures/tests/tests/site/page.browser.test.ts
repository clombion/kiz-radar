// Exempt: page.browser.test.ts imports the four helpers it still tests (.oxlintrc.json's override gives the rule their
// modules, as the file names them), and nothing else: not an entry, which app.ts loads.
import { dismissable } from '../../site/dismiss.ts';
import { h } from '../../site/dom.ts';
import { modal } from '../../site/modal.ts';
import { pill } from '../../site/tabs.tsx';

export const used = [dismissable, h, modal, pill];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
