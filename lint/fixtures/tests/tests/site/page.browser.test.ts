// Exempt: page.browser.test.ts imports the three helpers it still tests (.oxlintrc.json's override gives the rule their
// modules, as the file names them), and nothing else: not an entry, which app.ts loads, nor a helper whose test went
// with it (tabs' pill).
import { dismissable } from '../../site/dismiss.ts';
import { h } from '../../site/dom.ts';
import { modal } from '../../site/modal.ts';
import { Row } from '../../site/tabs.tsx'; // refused

export const used = [dismissable, h, modal, Row];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
