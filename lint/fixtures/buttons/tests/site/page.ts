// Outside the rule: a test is no module of the site, and may build a button to drive one.
import { h } from '../../../../../site/dom.ts';

export const submit = h('button', { type: 'submit' }, 'Send');
