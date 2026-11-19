// The intended way: dom.ts's h() and toggle(), which take only the stylesheet's classes.
import { h, toggle } from '../../../../site/dom.ts';

export const card = h('div', { class: 'card' });
toggle(card, 'open', true);
