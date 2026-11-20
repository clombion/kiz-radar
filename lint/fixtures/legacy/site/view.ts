// Outside the rule: a .ts module, which the rule does not read (every view is a .tsx).
import { h } from '../../../../site/dom.ts';

declare const root: HTMLElement;
root.replaceChildren(h('p', {}, 'x'), document.createElement('p'));
