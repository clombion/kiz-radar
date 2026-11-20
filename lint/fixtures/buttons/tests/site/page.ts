// Outside the rule: a test is no module of the site, and builds no button (house/tests refuses its import of a module
// it does not list).
import { h } from '../../../../../site/dom.ts'; // refused: tests

export const submit = h('button', { type: 'submit' }, 'Send');
