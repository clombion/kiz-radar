// Outside the rule: an h() view, a .ts module until it is ported.
import { h } from '../../../../site/dom.ts';

declare const root: HTMLElement;
root.replaceChildren(h('p', {}, 'x'), document.createElement('p'));
