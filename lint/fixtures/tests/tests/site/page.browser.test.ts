// Exempt: page.browser.test.ts imports the helpers it still tests, dom.ts's (.oxlintrc.json's override gives the rule
// their module, as the file names it), and nothing else: not an entry, which app.ts loads, nor a helper whose test went
// with it (tabs' pill, the dialog host's modal, dismiss.ts's dismissable).
import { dismissable } from '../../site/dismiss.ts'; // refused
import { h } from '../../site/dom.ts';
import { modal } from '../../site/dialog.tsx'; // refused
import { Row } from '../../site/tabs.tsx'; // refused

export const used = [dismissable, h, modal, Row];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
